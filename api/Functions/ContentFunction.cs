using System.Text.Json;
using HavalApi.Auth;
using HavalApi.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace HavalApi.Functions;

public class ContentFunction(IContentStore store, ILogger<ContentFunction> log)
{
    // Public: what the site renders.
    [Function("GetContent")]
    public async Task<IActionResult> Get(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "content")] HttpRequest req,
        CancellationToken ct)
    {
        var content = await store.GetAsync(ct);
        req.HttpContext.Response.Headers.CacheControl = "public, max-age=60";
        return new OkObjectResult(content);
    }

    // Admin: replace the whole document. SWA already blocks /api/manage/* for non-admins via
    // staticwebapp.config.json; this check is defence in depth (and what the local emulator relies on).
    // ("manage" rather than "admin": the Functions host reserves the admin route prefix.)
    [Function("PutContent")]
    public async Task<IActionResult> Put(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "manage/content")] HttpRequest req,
        CancellationToken ct)
    {
        var user = ClientPrincipal.From(req);
        if (user is not { IsAdmin: true })
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

        var saved = incoming with { UpdatedAt = DateTime.UtcNow };
        await store.SaveAsync(saved, ct);
        log.LogInformation("Content updated by {User}", user.UserDetails);
        return new OkObjectResult(saved);
    }
}
