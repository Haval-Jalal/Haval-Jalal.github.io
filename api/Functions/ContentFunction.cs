using System.Text.Json;
using HavalApi.Agent;
using HavalApi.Auth;
using HavalApi.Cv;
using HavalApi.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;

namespace HavalApi.Functions;

public class ContentFunction(IContentStore store, AgentService agent, ILogger<ContentFunction> log, AdminGate gate, IMemoryCache cache)
{
    // Public: what the site renders.
    [Function("GetContent")]
    public async Task<IActionResult> Get(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "content")] HttpRequest req,
        CancellationToken ct)
    {
        var lang = CvLabels.Normalise(req.Query["lang"]);
        var translated = lang == "sv" ? null : await store.GetAsync(lang, ct);
        if (translated is null && lang != "sv") translated = await AutoTranslateAsync(lang, ct);
        var content = translated ?? await store.GetAsync(ct);
        req.HttpContext.Response.Headers.CacheControl = "public, max-age=60";
        req.HttpContext.Response.Headers["X-Content-Lang"] = translated is null ? "sv" : lang;
        return new OkObjectResult(content);
    }

    // The first visitor of a language gets it translated on the spot (about 15 s, once), so /en
    // never shows Swedish content. One attempt at a time; a failure is not retried for 10 minutes.
    private static readonly SemaphoreSlim TranslateLock = new(1, 1);
    private async Task<SiteContent?> AutoTranslateAsync(string lang, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY"))) return null;
        if (cache.TryGetValue($"content:autotranslate-failed:{lang}", out _)) return null;
        await TranslateLock.WaitAsync(ct);
        try
        {
            var existing = await store.GetAsync(lang, ct);
            if (existing is not null) return existing;
            var translated = (await agent.TranslateAsync(await store.GetAsync(ct), lang, ct)) with { UpdatedAt = DateTime.UtcNow };
            await store.SaveAsync(translated, lang, ct);
            log.LogInformation("Content auto-translated to {Lang}", lang);
            return translated;
        }
        catch (Exception e) when (e is Anthropic.Exceptions.AnthropicException or InvalidOperationException or JsonException)
        {
            log.LogWarning(e, "Auto-translation to {Lang} failed", lang);
            cache.Set($"content:autotranslate-failed:{lang}", true, TimeSpan.FromMinutes(10));
            return null;
        }
        finally
        {
            TranslateLock.Release();
        }
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
