using System.Text.Json;
using HavalApi.Agent;
using HavalApi.Auth;
using HavalApi.Cv;
using HavalApi.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace HavalApi.Functions;

public class ContentFunction(IContentStore store, AgentService agent, ILogger<ContentFunction> log, AdminGate gate)
{
    // Public: what the site renders.
    [Function("GetContent")]
    public async Task<IActionResult> Get(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "content")] HttpRequest req,
        CancellationToken ct)
    {
        var lang = CvLabels.Normalise(req.Query["lang"]);
        var content = lang == "sv" ? await store.GetAsync(ct) : (await store.GetAsync(lang, ct) ?? await store.GetAsync(ct));
        req.HttpContext.Response.Headers.CacheControl = "public, max-age=60";
        req.HttpContext.Response.Headers["X-Content-Lang"] = lang;
        return new OkObjectResult(content);
    }

    // Admin: a language's document and whether it exists at all (translations start empty).
    [Function("ManageGetContent")]
    public async Task<IActionResult> ManageGet(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "manage/content")] HttpRequest req,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        var lang = CvLabels.Normalise(req.Query["lang"]);
        var content = await store.GetAsync(lang, ct);
        req.HttpContext.Response.Headers.CacheControl = "no-store";
        return new OkObjectResult(new { lang, exists = content is not null, content });
    }

    // Admin: AI translation of the Swedish master into another language (returned, not saved).
    [Function("ManageTranslateContent")]
    public async Task<IActionResult> Translate(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "manage/content/translate")] HttpRequest req,
        CancellationToken ct)
    {
        var user = await gate.AdminAsync(req, ct);
        if (user is null) return new UnauthorizedResult();
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY")))
            return new ObjectResult(new { error = "not_configured" }) { StatusCode = StatusCodes.Status503ServiceUnavailable };
        var lang = CvLabels.Normalise(req.Query["lang"]);
        if (lang == "sv") return new BadRequestObjectResult(new { error = "same_language" });
        try
        {
            var translated = await agent.TranslateAsync(await store.GetAsync(ct), lang, ct);
            log.LogInformation("Content translated to {Lang} for {User}", lang, user.UserDetails);
            return new OkObjectResult(translated);
        }
        catch (Exception e) when (e is Anthropic.Exceptions.AnthropicException or InvalidOperationException or JsonException)
        {
            log.LogWarning(e, "Translation to {Lang} failed", lang);
            return new ObjectResult(new { error = "ai_failed" }) { StatusCode = StatusCodes.Status502BadGateway };
        }
    }

    // Admin: replace the whole document. SWA already blocks /api/manage/* for non-admins via
    // staticwebapp.config.json; this check is defence in depth (and what the local emulator relies on).
    // ("manage" rather than "admin": the Functions host reserves the admin route prefix.)
    [Function("PutContent")]
    public async Task<IActionResult> Put(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "manage/content")] HttpRequest req,
        CancellationToken ct)
    {
        var user = await gate.AdminAsync(req, ct);
        if (user is null)
            return new UnauthorizedResult();

        SiteContent? incoming;
        try
        {
            incoming = await JsonSerializer.DeserializeAsync<SiteContent>(req.Body, JsonFileContentStore.Json, ct);
        }
        catch (JsonException ex)
        {
            return new BadRequestObjectResult(new { error = "invalid_json", detail = ex.Message });
        }
        if (incoming is null)
            return new BadRequestObjectResult(new { error = "empty_body" });

        var lang = CvLabels.Normalise(req.Query["lang"]);
        var saved = incoming with { UpdatedAt = DateTime.UtcNow };
        await store.SaveAsync(saved, lang, ct);
        log.LogInformation("Content ({Lang}) updated by {User}", lang, user.UserDetails);
        return new OkObjectResult(saved);
    }
}
