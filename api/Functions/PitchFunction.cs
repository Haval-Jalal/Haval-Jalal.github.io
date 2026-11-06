using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using HavalApi.Agent;
using HavalApi.Auth;
using HavalApi.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace HavalApi.Functions;

// Recruiter mode: /api/pitch/{slug} (public, published only) and the admin CRUD + AI draft.
public partial class PitchFunction(IPitchStore pitches, IContentStore content, AgentService agent, AgentGuard guard, AdminGate gate, ILogger<PitchFunction> log)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<string> Kinds = ["view", "cv", "lab"];
    private static readonly HashSet<string> Statuses = ["draft", "published", "closed"];

    [Function("PitchGet")]
    public async Task<IActionResult> Get(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "pitch/{slug}")] HttpRequest req,
        string slug,
        CancellationToken ct)
    {
        req.HttpContext.Response.Headers.CacheControl = "no-store";
        if (!SlugRx().IsMatch(slug)) return new NotFoundResult();
        var pitch = await pitches.GetAsync(slug, ct);
        if (pitch is null || pitch.Status != "published") return new NotFoundResult();
        return new OkObjectResult(new
        {
            pitch.Slug, pitch.Company, pitch.Role, pitch.Greeting, pitch.Intro, pitch.Projects, pitch.Highlights,
            pitch.Closing, pitch.CtaLabel, pitch.CtaUrl,
        });
    }

    // The page reports "opened", "CV downloaded" and "tried Build Lab". Visitor = same daily hash as analytics.
    [Function("PitchEvent")]
    public async Task<IActionResult> Event(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "pitch/{slug}/event")] HttpRequest req,
        string slug,
        CancellationToken ct)
    {
        if (!SlugRx().IsMatch(slug)) return new NotFoundResult();
        var dto = await ReadAsync<EventDto>(req, ct);
        if (dto?.Kind is null || !Kinds.Contains(dto.Kind)) return new BadRequestResult();
        if (!guard.TryTake("pitch-event", AnalyticsFunction.ClientIp(req), 60, TimeSpan.FromHours(1))) return new NoContentResult();
        var visitor = AnalyticsFunction.VisitorHash(AnalyticsFunction.ClientIp(req), req.Headers.UserAgent.ToString());
        await pitches.RecordEventAsync(slug, dto.Kind, visitor, ct);
        return new NoContentResult();
    }

    [Function("ManagePitchList")]
    public async Task<IActionResult> List(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "manage/pitches")] HttpRequest req,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        var all = await pitches.ListAsync(ct);
        return new OkObjectResult(new { pitches = all.Select(Admin) });
    }

    [Function("ManagePitchPut")]
    public async Task<IActionResult> Put(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "manage/pitches/{slug}")] HttpRequest req,
        string slug,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        if (!SlugRx().IsMatch(slug)) return new BadRequestObjectResult(new { error = "invalid_slug" });
        var dto = await ReadAsync<PitchDto>(req, ct);
        if (dto is null || string.IsNullOrWhiteSpace(dto.Company)) return new BadRequestObjectResult(new { error = "invalid_pitch" });

        var existing = await pitches.GetAsync(slug, ct);
        var now = DateTime.UtcNow;
        var site = await content.GetAsync(ct);
        var known = site.Projects.Select(p => p.Slug).ToHashSet();
        var pitch = new Pitch(
            slug,
            Clip(dto.Company, 80)!, Clip(dto.Role, 120) ?? "", Clip(dto.JobUrl, 400) ?? "", Clip(dto.Notes, 4000) ?? "",
            Clip(dto.Greeting, 200) ?? "", Clip(dto.Intro, 4000) ?? "",
            (dto.Projects ?? []).Where(p => p.Slug is not null && known.Contains(p.Slug)).Select(p => new PitchProject(p.Slug!, Clip(p.Why, 600) ?? "")).Take(6).ToList(),
            (dto.Highlights ?? []).Select(h => Clip(h, 200)).Where(h => h is not null).Select(h => h!).Take(8).ToList(),
            Clip(dto.Closing, 600) ?? "", Clip(dto.CtaLabel, 40) ?? "", Clip(dto.CtaUrl, 400) ?? "",
            Statuses.Contains(dto.Status ?? "") ? dto.Status! : "draft",
            existing?.CreatedAt ?? now, now,
            existing?.Stats ?? PitchStats.Empty);
        await pitches.SaveAsync(pitch, ct);
        return new OkObjectResult(Admin(pitch));
    }

    [Function("ManagePitchDelete")]
    public async Task<IActionResult> Delete(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "manage/pitches/{slug}")] HttpRequest req,
        string slug,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        if (!SlugRx().IsMatch(slug)) return new BadRequestResult();
        return new OkObjectResult(new { deleted = await pitches.DeleteAsync(slug, ct) });
    }

    // AI draft from Haval's notes: greeting, intro, which projects and why, highlights, closing.
    [Function("ManagePitchDraft")]
    public async Task<IActionResult> Draft(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "manage/pitches/draft")] HttpRequest req,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY")))
            return new ObjectResult(new { error = "not_configured" }) { StatusCode = StatusCodes.Status503ServiceUnavailable };
        var dto = await ReadAsync<PitchDto>(req, ct);
        if (dto is null || string.IsNullOrWhiteSpace(dto.Company)) return new BadRequestObjectResult(new { error = "invalid_pitch" });
        try
        {
            var draft = await agent.PitchDraftAsync(Clip(dto.Company, 80)!, Clip(dto.Role, 120) ?? "", Clip(dto.Notes, 4000) ?? "", ct);
            return new OkObjectResult(draft);
        }
        catch (Anthropic.Exceptions.AnthropicException e)
        {
            log.LogWarning(e, "Pitch draft failed");
            return new ObjectResult(new { error = "ai_failed" }) { StatusCode = StatusCodes.Status502BadGateway };
        }
    }

    private static object Admin(Pitch p) => new
    {
        p.Slug, p.Company, p.Role, p.JobUrl, p.Notes, p.Greeting, p.Intro, p.Projects, p.Highlights, p.Closing, p.CtaLabel, p.CtaUrl,
        p.Status, p.CreatedAt, p.UpdatedAt,
        stats = new { p.Stats.Views, p.Stats.Unique, p.Stats.CvDownloads, p.Stats.LabClicks, p.Stats.FirstViewedAt, p.Stats.LastViewedAt },
    };

    private static async Task<T?> ReadAsync<T>(HttpRequest req, CancellationToken ct) where T : class
    {
        try { return await JsonSerializer.DeserializeAsync<T>(req.Body, Json, ct); }
        catch (JsonException) { return null; }
    }

    private static string? Clip(string? s, int max) => string.IsNullOrWhiteSpace(s) ? null : s.Trim()[..Math.Min(s.Trim().Length, max)];

    [GeneratedRegex("^[a-z0-9][a-z0-9-]{1,60}$")]
    private static partial Regex SlugRx();

    private sealed class EventDto { [JsonPropertyName("kind")] public string? Kind { get; set; } }

    private sealed class PitchDto
    {
        [JsonPropertyName("company")] public string? Company { get; set; }
        [JsonPropertyName("role")] public string? Role { get; set; }
        [JsonPropertyName("jobUrl")] public string? JobUrl { get; set; }
        [JsonPropertyName("notes")] public string? Notes { get; set; }
        [JsonPropertyName("greeting")] public string? Greeting { get; set; }
        [JsonPropertyName("intro")] public string? Intro { get; set; }
        [JsonPropertyName("projects")] public List<PitchProjectDto>? Projects { get; set; }
        [JsonPropertyName("highlights")] public List<string>? Highlights { get; set; }
        [JsonPropertyName("closing")] public string? Closing { get; set; }
        [JsonPropertyName("ctaLabel")] public string? CtaLabel { get; set; }
        [JsonPropertyName("ctaUrl")] public string? CtaUrl { get; set; }
        [JsonPropertyName("status")] public string? Status { get; set; }
    }

    private sealed class PitchProjectDto
    {
        [JsonPropertyName("slug")] public string? Slug { get; set; }
        [JsonPropertyName("why")] public string? Why { get; set; }
    }
}
