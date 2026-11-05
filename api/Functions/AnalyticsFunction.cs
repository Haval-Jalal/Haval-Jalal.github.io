using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using HavalApi.Auth;
using HavalApi.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;

namespace HavalApi.Functions;

public class AnalyticsFunction(IAnalyticsStore store)
{
    private static readonly string Salt = Environment.GetEnvironmentVariable("ANALYTICS_SALT") ?? "havaljalal-dev-salt";

    // Public: the site posts one small beacon per page view / interaction. Returns 204 fast.
    [Function("Beacon")]
    public async Task<IActionResult> Beacon(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "beacon")] HttpRequest req,
        CancellationToken ct)
    {
        BeaconDto? dto;
        try
        {
            dto = await JsonSerializer.DeserializeAsync<BeaconDto>(req.Body, cancellationToken: ct);
        }
        catch (JsonException)
        {
            return new BadRequestResult();
        }
        if (dto is null || string.IsNullOrWhiteSpace(dto.Path) || dto.Path.Length > 200)
            return new BadRequestResult();

        var ua = req.Headers.UserAgent.ToString();
        var hit = new Hit(
            DateTime.UtcNow,
            string.IsNullOrEmpty(dto.Event) ? "view" : "event",
            dto.Path,
            Truncate(dto.Event, 60),
            ReferrerHost(dto.Referrer),
            Device(dto.Width, ua),
            Truncate(dto.Lang, 12),
            VisitorHash(ClientIp(req), ua));

        await store.AppendAsync(hit, ct);
        return new NoContentResult();
    }

    // Admin: dashboard summary for the last N days (default 30, max 365).
    [Function("AnalyticsSummary")]
    public async Task<IActionResult> Summary(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "manage/analytics")] HttpRequest req,
        CancellationToken ct)
    {
        if (ClientPrincipal.From(req) is not { IsAdmin: true })
            return new UnauthorizedResult();

        var days = int.TryParse(req.Query["days"], out var d) ? Math.Clamp(d, 1, 365) : 30;
        return new OkObjectResult(await store.SummaryAsync(days, ct));
    }

    private static string VisitorHash(string ip, string ua)
    {
        var input = $"{ip}|{ua}|{DateTime.UtcNow:yyyy-MM-dd}|{Salt}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(input)))[..16];
    }

    private static string ClientIp(HttpRequest req)
    {
        var fwd = req.Headers["X-Forwarded-For"].ToString();
        if (!string.IsNullOrEmpty(fwd))
            return fwd.Split(',')[0].Trim();
        return req.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }

    private static string? ReferrerHost(string? referrer)
    {
        if (string.IsNullOrWhiteSpace(referrer)) return null;
        return Uri.TryCreate(referrer, UriKind.Absolute, out var uri) ? uri.Host : null;
    }

    private static string Device(int? width, string ua)
    {
        if (width is > 0 and < 768) return "mobile";
        if (width is >= 768 and < 1100) return "tablet";
        if (width is null && ua.Contains("Mobile", StringComparison.OrdinalIgnoreCase)) return "mobile";
        return "desktop";
    }

    private static string? Truncate(string? s, int max) =>
        string.IsNullOrEmpty(s) ? null : s.Length <= max ? s : s[..max];

    private sealed class BeaconDto
    {
        [JsonPropertyName("p")] public string? Path { get; set; }
        [JsonPropertyName("r")] public string? Referrer { get; set; }
        [JsonPropertyName("w")] public int? Width { get; set; }
        [JsonPropertyName("l")] public string? Lang { get; set; }
        [JsonPropertyName("e")] public string? Event { get; set; }
    }
}
