using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using HavalApi.Agent;
using HavalApi.Auth;
using HavalApi.Cv;
using HavalApi.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace HavalApi.Functions;

// Changelog (/changelog) and the Nu page (/nu): public readers plus the admin editors, with AI
// help for drafting a changelog entry from GitHub commits and for translating the Nu page.
public class PostsFunction(IPostStore store, AgentService agent, AdminGate gate, IHttpClientFactory httpFactory, ILogger<PostsFunction> log)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /* ---------- public ---------- */

    [Function("Changelog")]
    public async Task<IActionResult> Changelog(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "changelog")] HttpRequest req,
        CancellationToken ct)
    {
        var entries = await store.ListChangelogAsync(publishedOnly: true, ct);
        req.HttpContext.Response.Headers.CacheControl = "public, max-age=120";
        return new OkObjectResult(new { entries = entries.Select(e => new { e.Id, e.Date, e.Title, e.Text, e.TitleEn, e.TextEn, e.Tags }) });
    }

    [Function("Now")]
    public async Task<IActionResult> Now(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "now")] HttpRequest req,
        CancellationToken ct)
    {
        var lang = CvLabels.Normalise(req.Query["lang"]);
        var now = await store.GetNowAsync(lang, ct);
        var served = lang;
        if (now is null && lang != "sv")
        {
            now = await store.GetNowAsync("sv", ct);
            served = "sv";
        }
        now ??= NowPage.Default;
        req.HttpContext.Response.Headers.CacheControl = "public, max-age=120";
        req.HttpContext.Response.Headers["X-Content-Lang"] = served;
        return new OkObjectResult(now);
    }

    /* ---------- admin: changelog ---------- */

    [Function("ManageChangelog")]
    public async Task<IActionResult> ManageChangelog(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "manage/changelog")] HttpRequest req,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        return new OkObjectResult(new { entries = await store.ListChangelogAsync(publishedOnly: false, ct) });
    }

    [Function("ManageChangelogSave")]
    public async Task<IActionResult> SaveChangelog(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "manage/changelog")] HttpRequest req,
        CancellationToken ct)
    {
        var user = await gate.AdminAsync(req, ct);
        if (user is null) return new UnauthorizedResult();
        var dto = await ReadAsync<ChangelogDto>(req, ct);
        if (dto is null || string.IsNullOrWhiteSpace(dto.Title)) return new BadRequestObjectResult(new { error = "missing_title" });
        if (!DateOnly.TryParseExact(dto.Date, "yyyy-MM-dd", out var date)) date = DateOnly.FromDateTime(DateTime.UtcNow);
        var entry = new ChangelogEntry(
            string.IsNullOrWhiteSpace(dto.Id) ? Guid.NewGuid().ToString("N")[..12] : dto.Id.Trim(),
            DateTime.UtcNow,
            date.ToString("yyyy-MM-dd"),
            dto.Title.Trim(),
            (dto.Text ?? "").Trim(),
            (dto.TitleEn ?? "").Trim(),
            (dto.TextEn ?? "").Trim(),
            (dto.Tags ?? []).Select(t => t.Trim().ToLowerInvariant()).Where(t => t.Length > 0).Distinct().Take(6).ToList(),
            dto.Published);
        await store.SaveChangelogAsync(entry, ct);
        log.LogInformation("Changelog entry {Id} saved by {User}", entry.Id, user.UserDetails);
        return new OkObjectResult(entry);
    }

    [Function("ManageChangelogDelete")]
    public async Task<IActionResult> DeleteChangelog(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "manage/changelog/{id}")] HttpRequest req,
        string id,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        return await store.DeleteChangelogAsync(id, ct) ? new OkObjectResult(new { ok = true }) : new NotFoundResult();
    }

    // Admin: fetch commits since a date from the public repo and let the AI draft one entry.
    [Function("ManageChangelogDraft")]
    public async Task<IActionResult> DraftChangelog(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "manage/changelog/draft")] HttpRequest req,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        if (!AiConfigured()) return NotConfigured();
        var dto = await ReadAsync<DraftDto>(req, ct) ?? new DraftDto();
        var since = DateTime.TryParse(dto.Since, out var s) ? s.ToUniversalTime() : DateTime.UtcNow.AddDays(-7);

        var repo = Environment.GetEnvironmentVariable("CHANGELOG_REPO") ?? "Haval-Jalal/Haval-Jalal.github.io";
        List<string> commits;
        try
        {
            var http = httpFactory.CreateClient("github");
            var rows = await http.GetFromJsonAsync<List<CommitDto>>($"repos/{repo}/commits?since={since:yyyy-MM-ddTHH:mm:ssZ}&per_page=60", ct) ?? [];
            commits = rows.Select(r => r.Commit?.Message?.Split('\n')[0].Trim() ?? "")
                .Where(m => m.Length > 0 && !m.StartsWith("Merge ", StringComparison.OrdinalIgnoreCase))
                .Distinct()
                .ToList();
        }
        catch (Exception e) when (e is HttpRequestException or JsonException or TaskCanceledException)
        {
            log.LogWarning(e, "Could not read commits from GitHub");
            return new ObjectResult(new { error = "github_failed" }) { StatusCode = StatusCodes.Status502BadGateway };
        }
        if (commits.Count == 0 && string.IsNullOrWhiteSpace(dto.Hint))
            return new BadRequestObjectResult(new { error = "no_commits" });

        try
        {
            var draft = await agent.ChangelogDraftAsync(commits, dto.Hint ?? "", ct);
            return new OkObjectResult(new { draft, commits });
        }
        catch (Exception e) when (e is Anthropic.Exceptions.AnthropicException or InvalidOperationException or JsonException)
        {
            log.LogWarning(e, "Changelog draft failed");
            return AiFailed();
        }
    }

    /* ---------- admin: Nu ---------- */

    [Function("ManageNow")]
    public async Task<IActionResult> ManageNow(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "manage/now")] HttpRequest req,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        var lang = CvLabels.Normalise(req.Query["lang"]);
        var now = await store.GetNowAsync(lang, ct);
        return new OkObjectResult(new { lang, exists = now is not null, now = now ?? (lang == "sv" ? NowPage.Default : null) });
    }

    [Function("ManageNowSave")]
    public async Task<IActionResult> SaveNow(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "manage/now")] HttpRequest req,
        CancellationToken ct)
    {
        var user = await gate.AdminAsync(req, ct);
        if (user is null) return new UnauthorizedResult();
        var lang = CvLabels.Normalise(req.Query["lang"]);
        var incoming = await ReadAsync<NowPage>(req, ct);
        if (incoming is null) return new BadRequestObjectResult(new { error = "empty_body" });
        var saved = incoming with
        {
            UpdatedAt = DateTime.UtcNow,
            Intro = (incoming.Intro ?? "").Trim(),
            Sections = (incoming.Sections ?? []).Select(s => new NowSection((s.Title ?? "").Trim(), (s.Items ?? []).Select(i => i.Trim()).Where(i => i.Length > 0).ToList())).Where(s => s.Title.Length > 0).ToList(),
        };
        await store.SaveNowAsync(saved, lang, ct);
        log.LogInformation("Now page ({Lang}) saved by {User}", lang, user.UserDetails);
        return new OkObjectResult(saved);
    }

    [Function("ManageNowTranslate")]
    public async Task<IActionResult> TranslateNow(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "manage/now/translate")] HttpRequest req,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        if (!AiConfigured()) return NotConfigured();
        var lang = CvLabels.Normalise(req.Query["lang"]);
        if (lang == "sv") return new BadRequestObjectResult(new { error = "same_language" });
        var source = await store.GetNowAsync("sv", ct) ?? NowPage.Default;
        try
        {
            return new OkObjectResult(await agent.TranslateJsonAsync(source, lang, ct));
        }
        catch (Exception e) when (e is Anthropic.Exceptions.AnthropicException or InvalidOperationException or JsonException)
        {
            log.LogWarning(e, "Now translation failed");
            return AiFailed();
        }
    }

    /* ---------- admin: writing help ---------- */

    [Function("ManageAiDraft")]
    public async Task<IActionResult> AiDraft(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "manage/ai/draft")] HttpRequest req,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        if (!AiConfigured()) return NotConfigured();
        var dto = await ReadAsync<AiDraftDto>(req, ct);
        if (dto is null || string.IsNullOrWhiteSpace(dto.Instruction)) return new BadRequestObjectResult(new { error = "missing_instruction" });
        try
        {
            var text = await agent.DraftTextAsync(dto.Instruction.Trim(), (dto.Text ?? "")[..Math.Min(dto.Text?.Length ?? 0, 6000)], dto.Context ?? "text", CvLabels.Normalise(dto.Lang), ct);
            return new OkObjectResult(new { text });
        }
        catch (Anthropic.Exceptions.AnthropicException e)
        {
            log.LogWarning(e, "AI draft failed");
            return AiFailed();
        }
    }

    /* ---------- helpers ---------- */

    private static bool AiConfigured() => !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY"));
    private static ObjectResult NotConfigured() => new(new { error = "not_configured" }) { StatusCode = StatusCodes.Status503ServiceUnavailable };
    private static ObjectResult AiFailed() => new(new { error = "ai_failed" }) { StatusCode = StatusCodes.Status502BadGateway };

    private static async Task<T?> ReadAsync<T>(HttpRequest req, CancellationToken ct) where T : class
    {
        try
        {
            return await JsonSerializer.DeserializeAsync<T>(req.Body, Json, ct);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private sealed class ChangelogDto
    {
        [JsonPropertyName("id")] public string? Id { get; set; }
        [JsonPropertyName("date")] public string? Date { get; set; }
        [JsonPropertyName("title")] public string? Title { get; set; }
        [JsonPropertyName("text")] public string? Text { get; set; }
        [JsonPropertyName("titleEn")] public string? TitleEn { get; set; }
        [JsonPropertyName("textEn")] public string? TextEn { get; set; }
        [JsonPropertyName("tags")] public List<string>? Tags { get; set; }
        [JsonPropertyName("published")] public bool Published { get; set; }
    }
    private sealed class DraftDto
    {
        [JsonPropertyName("since")] public string? Since { get; set; }
        [JsonPropertyName("hint")] public string? Hint { get; set; }
    }
    private sealed class AiDraftDto
    {
        [JsonPropertyName("instruction")] public string? Instruction { get; set; }
        [JsonPropertyName("text")] public string? Text { get; set; }
        [JsonPropertyName("context")] public string? Context { get; set; }
        [JsonPropertyName("lang")] public string? Lang { get; set; }
    }
    private sealed class CommitDto
    {
        [JsonPropertyName("commit")] public CommitInner? Commit { get; set; }
    }
    private sealed class CommitInner
    {
        [JsonPropertyName("message")] public string? Message { get; set; }
    }
}
