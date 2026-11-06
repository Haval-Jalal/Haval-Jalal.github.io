using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;
using HavalApi.Auth;
using HavalApi.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace HavalApi.Functions;

// Who is signed in (as seen by the API, not the browser) plus the admin security log and ban list.
public class AuthFunction(ISecurityStore security, AdminGate gate, ILogger<AuthFunction> log)
{
    private static readonly string Salt = Environment.GetEnvironmentVariable("ANALYTICS_SALT") ?? "havaljalal-dev-salt";
    private static readonly TimeSpan LogThrottle = TimeSpan.FromMinutes(5);
    private static readonly ConcurrentDictionary<string, DateTime> LastLogged = new();

    // Called by the admin page on load. Static Web Apps sets the identity header after a GitHub
    // login, so this is the ground truth for "who is this" and it logs every non-admin account.
    [Function("AuthMe")]
    public async Task<IActionResult> Me(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "auth/me")] HttpRequest req,
        CancellationToken ct)
    {
        req.HttpContext.Response.Headers.CacheControl = "no-store";
        var user = ClientPrincipal.From(req);
        if (user is null || string.IsNullOrEmpty(user.UserId))
            return new OkObjectResult(new { authenticated = false });

        var banned = await gate.IsBannedAsync(user.UserId, ct);
        var result = banned ? "blocked" : user.IsAdmin ? "admin" : "denied";
        await LogAsync(user, result, req, ct);

        return new OkObjectResult(new
        {
            authenticated = true,
            provider = user.IdentityProvider,
            user = user.UserDetails,
            userId = user.UserId,
            isAdmin = user.IsAdmin && !banned,
            banned,
        });
    }

    [Function("ManageSecurity")]
    public async Task<IActionResult> Security(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "manage/security")] HttpRequest req,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        var attempts = await security.AttemptsAsync(1000, ct);
        var bans = await security.BansAsync(ct);
        return new OkObjectResult(JsonFileSecurityStore.Summarise(attempts, bans));
    }

    [Function("ManageBan")]
    public async Task<IActionResult> Ban(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "manage/security/ban")] HttpRequest req,
        CancellationToken ct)
    {
        var admin = await gate.AdminAsync(req, ct);
        if (admin is null) return new UnauthorizedResult();
        var dto = await req.ReadFromJsonAsync<BanDto>(ct);
        if (dto is null || string.IsNullOrWhiteSpace(dto.UserId) || dto.UserId.Length > 100)
            return new BadRequestObjectResult(new { error = "invalid_user" });
        if (dto.UserId == admin.UserId)
            return new BadRequestObjectResult(new { error = "self" });

        await security.BanAsync(new Ban(dto.UserId, Clip(dto.User, 100) ?? "", Clip(dto.Provider, 40) ?? "github", DateTime.UtcNow, Clip(dto.Note, 200)), ct);
        gate.Invalidate();
        log.LogWarning("Admin {Admin} banned {User} ({UserId})", admin.UserDetails, dto.User, dto.UserId);
        return new OkObjectResult(new { ok = true });
    }

    [Function("ManageUnban")]
    public async Task<IActionResult> Unban(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "manage/security/unban")] HttpRequest req,
        CancellationToken ct)
    {
        var admin = await gate.AdminAsync(req, ct);
        if (admin is null) return new UnauthorizedResult();
        var dto = await req.ReadFromJsonAsync<BanDto>(ct);
        if (dto is null || string.IsNullOrWhiteSpace(dto.UserId))
            return new BadRequestObjectResult(new { error = "invalid_user" });

        await security.UnbanAsync(dto.UserId, ct);
        gate.Invalidate();
        log.LogInformation("Admin {Admin} unbanned {UserId}", admin.UserDetails, dto.UserId);
        return new OkObjectResult(new { ok = true });
    }

    // One row per account and outcome every five minutes, so a refresh-happy visitor does not flood the log.
    private async Task LogAsync(ClientPrincipal user, string result, HttpRequest req, CancellationToken ct)
    {
        var key = $"{user.UserId}:{result}";
        var now = DateTime.UtcNow;
        if (LastLogged.TryGetValue(key, out var last) && now - last < LogThrottle) return;
        LastLogged[key] = now;

        var fwd = req.Headers["X-Forwarded-For"].ToString();
        var ip = !string.IsNullOrEmpty(fwd) ? fwd.Split(',')[0].Trim() : req.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var ipHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Salt + ip)))[..12].ToLowerInvariant();

        await security.AppendAsync(new AuthAttempt(
            Guid.NewGuid().ToString("N")[..12], now, user.IdentityProvider, user.UserId, user.UserDetails, result,
            Clip(req.Headers.Referer.ToString(), 120) ?? "/admin", ipHash), ct);
        if (result != "admin")
            log.LogWarning("Admin access {Result} for {User} ({Provider})", result, user.UserDetails, user.IdentityProvider);
    }

    private static string? Clip(string? s, int max) => string.IsNullOrWhiteSpace(s) ? null : s.Trim()[..Math.Min(s.Trim().Length, max)];

    private sealed class BanDto
    {
        [JsonPropertyName("userId")] public string? UserId { get; set; }
        [JsonPropertyName("user")] public string? User { get; set; }
        [JsonPropertyName("provider")] public string? Provider { get; set; }
        [JsonPropertyName("note")] public string? Note { get; set; }
    }
}
