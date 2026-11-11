using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using HavalApi.Agent;
using HavalApi.Auth;
using HavalApi.Data;
using HavalApi.Mail;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace HavalApi.Functions;

// Saved prototypes: a visitor's own list, a shareable page, and the gated download that doubles as
// the lead capture ("fill in your details to download, and Haval gets a copy").
public class LabFunction(IBuildStore builds, ILeadStore leads, IMailer mailer, AgentGuard guard, HavalApi.Auth.AdminGate gate, ILogger<LabFunction> log)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly string SiteUrl = Environment.GetEnvironmentVariable("SITE_URL") ?? "https://havaljalal.se";

    [Function("LabList")]
    public async Task<IActionResult> List(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "lab")] HttpRequest req,
        CancellationToken ct)
    {
        var visitor = req.Query["visitor"].ToString();
        if (!ValidVisitor(visitor)) return new BadRequestObjectResult(new { error = "invalid_visitor" });
        req.HttpContext.Response.Headers.CacheControl = "no-store";
        return new OkObjectResult(new { builds = await builds.ListByVisitorAsync(visitor, 12, ct) });
    }

    // Public gallery: prototypes Haval has starred in admin.
    [Function("LabGallery")]
    public async Task<IActionResult> Gallery(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "gallery")] HttpRequest req,
        CancellationToken ct)
    {
        req.HttpContext.Response.Headers.CacheControl = "public, max-age=120";
        return new OkObjectResult(new { builds = await builds.ListFeaturedAsync(9, ct) });
    }

    [Function("ManageBuilds")]
    public async Task<IActionResult> ManageList(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "manage/builds")] HttpRequest req,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        return new OkObjectResult(new { builds = await builds.ListRecentAsync(80, ct) });
    }

    [Function("ManageBuildFeature")]
    public async Task<IActionResult> Feature(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "manage/builds/{id}/feature")] HttpRequest req,
        string id,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        FeatureDto? dto;
        try { dto = await JsonSerializer.DeserializeAsync<FeatureDto>(req.Body, Json, ct); }
        catch (JsonException) { dto = null; }
        var b = await builds.GetAsync(id, ct);
        if (b is null) return new NotFoundResult();
        await builds.SaveAsync(b with { Featured = dto?.Featured ?? !b.Featured }, ct);
        return new OkObjectResult(new { id, featured = dto?.Featured ?? !b.Featured });
    }

    [Function("LabGet")]
    public async Task<IActionResult> Get(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "lab/{id}")] HttpRequest req,
        string id,
        CancellationToken ct)
    {
        var b = await builds.GetAsync(id, ct);
        if (b is null) return new NotFoundResult();
        var mine = req.Query["visitor"].ToString() == b.VisitorId;
        return new OkObjectResult(new
        {
            b.Id, b.Ts, b.Idea, b.Title, b.Html, b.Plan, b.Model, b.Truncated,
            unlocked = b.Contact is not null,
            mine,
        });
    }

    // Visitor leaves name + e-mail (+ optional phone/message): unlock the download, store the lead,
    // and e-mail Haval a copy.
    [Function("LabUnlock")]
    public async Task<IActionResult> Unlock(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "lab/{id}/unlock")] HttpRequest req,
        string id,
        CancellationToken ct)
    {
        if (!guard.TryTake("unlock", RequestIp.Of(req), 10, TimeSpan.FromHours(1)))
            return new ObjectResult(new { error = "rate_limited" }) { StatusCode = StatusCodes.Status429TooManyRequests };

        UnlockDto? dto;
        try { dto = await JsonSerializer.DeserializeAsync<UnlockDto>(req.Body, Json, ct); }
        catch (JsonException) { dto = null; }
        if (dto is null || string.IsNullOrWhiteSpace(dto.Name) || string.IsNullOrWhiteSpace(dto.Email) || !dto.Email.Contains('@') || dto.Email.Length > 200)
            return new BadRequestObjectResult(new { error = "invalid_contact" });
        if (!string.IsNullOrWhiteSpace(dto.Website)) return new OkObjectResult(new { ok = true }); // honeypot

        var b = await builds.GetAsync(id, ct);
        if (b is null) return new NotFoundResult();

        var contact = new BuildContact(Clip(dto.Name, 120)!, dto.Email.Trim(), Clip(dto.Phone, 40), Clip(dto.Message, 2000), DateTime.UtcNow);
        await builds.SaveAsync(b with { Contact = contact }, ct);

        var lead = new Lead(
            Guid.NewGuid().ToString("N"), DateTime.UtcNow, contact.Name, contact.Email, contact.Message ?? "",
            b.Idea, b.Plan, "build-lab-download", contact.Phone, b.Id);
        await leads.AddAsync(lead, ct);

        var text = $"""
            Ny lead från Build Lab

            Namn:     {contact.Name}
            E-post:   {contact.Email}
            Telefon:  {contact.Phone ?? "-"}
            Meddelande:
            {contact.Message ?? "-"}

            Idé: {b.Idea}
            Prototyp: {SiteUrl}/lab/{b.Id}
            Admin:    {SiteUrl}/admin

            Plan som agenten föreslog:
            {b.Plan}
            """;
        await mailer.SendAsync($"Build Lab: {contact.Name} laddade ner \"{b.Title}\"", text, ct);
        log.LogInformation("Build {Id} unlocked by {Email}", b.Id, contact.Email);
        return new OkObjectResult(new { ok = true, mailed = mailer.Enabled });
    }

    [Function("LabDownload")]
    public async Task<IActionResult> Download(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "lab/{id}/download")] HttpRequest req,
        string id,
        CancellationToken ct)
    {
        var b = await builds.GetAsync(id, ct);
        if (b is null) return new NotFoundResult();
        if (b.Contact is null) return new ObjectResult(new { error = "locked" }) { StatusCode = StatusCodes.Status403Forbidden };

        var credit = $"<!-- Byggd i AI Build Lab på {SiteUrl} · idé: {b.Idea.Replace("--", "- -")} -->\n";
        var bytes = Encoding.UTF8.GetBytes(credit + b.Html);
        var name = string.Concat(b.Title.Where(ch => char.IsLetterOrDigit(ch) || ch is ' ' or '-')).Trim().Replace(' ', '-');
        if (name.Length == 0) name = "prototyp";
        return new FileContentResult(bytes, "text/html; charset=utf-8") { FileDownloadName = $"{name}.html" };
    }

    private static bool ValidVisitor(string v) => v.Length is >= 16 and <= 64 && v.All(c => char.IsLetterOrDigit(c) || c == '-');

    private static string? Clip(string? s, int max) => string.IsNullOrWhiteSpace(s) ? null : s.Trim()[..Math.Min(s.Trim().Length, max)];

    private sealed class FeatureDto { [JsonPropertyName("featured")] public bool? Featured { get; set; } }

    private sealed class UnlockDto
    {
        [JsonPropertyName("name")] public string? Name { get; set; }
        [JsonPropertyName("email")] public string? Email { get; set; }
        [JsonPropertyName("phone")] public string? Phone { get; set; }
        [JsonPropertyName("message")] public string? Message { get; set; }
        [JsonPropertyName("website")] public string? Website { get; set; }
    }
}
