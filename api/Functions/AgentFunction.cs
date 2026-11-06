using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Anthropic.Exceptions;
using HavalApi.Agent;
using HavalApi.Auth;
using HavalApi.Data;
using HavalApi.Mail;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace HavalApi.Functions;

public class AgentFunction(AgentService agent, AgentGuard guard, AdminGate gate, ILeadStore leads, IUsageStore usage, IBuildStore builds, IMailer mailer, ILogger<AgentFunction> log)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly TimeSpan Hour = TimeSpan.FromHours(1);
    private static readonly TimeSpan Day = TimeSpan.FromDays(1);

    // Public: lets the UI show "sparläge" / "budget slut" before the visitor starts typing.
    [Function("AgentStatus")]
    public async Task<IActionResult> Status(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "agent/status")] HttpRequest req,
        CancellationToken ct)
    {
        var mode = Configured() ? AgentGuard.ModeName(await guard.ModeAsync(ct)) : "off";
        req.HttpContext.Response.Headers.CacheControl = "no-store";
        return new OkObjectResult(new { mode });
    }

    // Digital Haval: small JSON round-trip, no streaming needed for short answers.
    [Function("AgentChat")]
    public async Task<IActionResult> Chat(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "agent/chat")] HttpRequest req,
        CancellationToken ct)
    {
        if (!Configured()) return Unavailable("not_configured");
        if (await guard.ModeAsync(ct) == BudgetMode.Stopped) return Unavailable("daily_cap");
        if (!guard.TryTake("chat", ClientIp(req), guard.ChatPerHour, Hour)) return TooMany();

        var dto = await ReadAsync<ChatDto>(req, ct);
        if (dto?.Messages is not { Count: > 0 } || dto.Messages.Any(m => string.IsNullOrWhiteSpace(m.Text) || m.Text.Length > 2000))
            return new BadRequestObjectResult(new { error = "invalid_messages" });

        using var _ = guard.TrackCall();
        try
        {
            var turns = dto.Messages.Select(m => new ChatTurn(m.Role == "assistant" ? "assistant" : "user", m.Text.Trim())).ToList();
            var reply = await agent.ChatAsync(turns, dto.Lang == "en" ? "en" : "sv", ct);
            return new OkObjectResult(new { reply = reply.Text, refused = reply.Refused });
        }
        catch (AnthropicApiException ex)
        {
            log.LogWarning(ex, "Chat failed");
            return Unavailable("upstream");
        }
    }

    // Build Lab: server-sent events so the prototype shows up while it is still being written.
    [Function("AgentBuild")]
    public async Task<IActionResult> Build(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "agent/build")] HttpRequest req,
        CancellationToken ct)
    {
        if (!Configured()) return Unavailable("not_configured");
        var mode = await guard.ModeAsync(ct);
        if (mode == BudgetMode.Stopped) return Unavailable("daily_cap");

        var dto = await ReadAsync<BuildDto>(req, ct);
        var idea = dto?.Idea?.Trim();
        if (string.IsNullOrEmpty(idea) || idea.Length < 8 || idea.Length > 800)
            return new BadRequestObjectResult(new { error = "invalid_idea" });
        var visitor = dto?.Visitor ?? "";
        if (visitor.Length is < 16 or > 64 || !visitor.All(c => char.IsLetterOrDigit(c) || c == '-'))
            return new BadRequestObjectResult(new { error = "invalid_visitor" });

        var ip = ClientIp(req);
        if (!guard.TryTake("build", ip, guard.BuildPerHour, Hour) || !guard.TryTake("build", ip, guard.BuildPerDay, Day))
            return TooMany();

        var res = req.HttpContext.Response;
        res.StatusCode = 200;
        res.ContentType = "text/event-stream";
        res.Headers.CacheControl = "no-cache";
        res.Headers["X-Accel-Buffering"] = "no";

        using var _ = guard.TrackCall();
        try
        {
            var eco = mode == BudgetMode.Eco;
            await WriteEvent(res, "mode", new { mode = AgentGuard.ModeName(mode) }, ct);
            Usage? usageInfo = null;
            var full = new StringBuilder();
            await foreach (var delta in agent.BuildStreamAsync(idea, eco, dto?.Lang == "en" ? "en" : "sv", u => usageInfo = u, ct))
            {
                full.Append(delta);
                await WriteEvent(res, "delta", new { t = delta }, ct);
            }

            // Persist the prototype so the visitor finds it again (and can share/download it).
            string? savedId = null;
            var text = full.ToString();
            var markerAt = text.IndexOf(Prompts.PlanMarker, StringComparison.Ordinal);
            var html = markerAt >= 0 ? text[..markerAt] : text;
            if (html.TrimStart().StartsWith("<!doctype", StringComparison.OrdinalIgnoreCase) || html.TrimStart().StartsWith("<html", StringComparison.OrdinalIgnoreCase))
            {
                var plan = markerAt >= 0 ? text[(markerAt + Prompts.PlanMarker.Length)..].Trim() : "";
                var record = new BuildRecord(
                    Guid.NewGuid().ToString("N")[..12], DateTime.UtcNow, visitor, idea,
                    JsonFileBuildStore.TitleOf(html, idea), html.Trim(), plan,
                    usageInfo?.Model ?? "", usageInfo?.Truncated ?? false);
                await builds.SaveAsync(record, CancellationToken.None);
                savedId = record.Id;
            }
            await WriteEvent(res, "done", new { usage = usageInfo, truncated = usageInfo?.Truncated ?? false, id = savedId }, ct);
        }
        catch (AnthropicApiException ex)
        {
            log.LogWarning(ex, "Build failed");
            await WriteEvent(res, "error", new { error = "upstream" }, CancellationToken.None);
        }
        catch (OperationCanceledException)
        {
            // Visitor navigated away; nothing to do.
        }
        return new EmptyResult();
    }

    [Function("AgentLead")]
    public async Task<IActionResult> Lead(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "agent/lead")] HttpRequest req,
        CancellationToken ct)
    {
        if (!guard.TryTake("lead", ClientIp(req), 5, Hour)) return TooMany();
        var dto = await ReadAsync<LeadDto>(req, ct);
        if (dto is null || string.IsNullOrWhiteSpace(dto.Email) || !dto.Email.Contains('@') || dto.Email.Length > 200)
            return new BadRequestObjectResult(new { error = "invalid_email" });

        // Honeypot: real visitors never see the "website" field; bots fill it. Pretend success.
        if (!string.IsNullOrWhiteSpace(dto.Website))
            return new OkObjectResult(new { ok = true });

        var lead = new Data.Lead(
            Guid.NewGuid().ToString("N"),
            DateTime.UtcNow,
            Clip(dto.Name, 120) ?? "",
            dto.Email.Trim(),
            Clip(dto.Message, 2000) ?? "",
            Clip(dto.Idea, 800),
            Clip(dto.Plan, 4000),
            Clip(dto.Source, 40) ?? "build-lab");
        await leads.AddAsync(lead, ct);
        log.LogInformation("New lead from {Source}", lead.Source);

        // Tell Haval right away (logs only until Resend is configured).
        var siteUrl = Environment.GetEnvironmentVariable("SITE_URL") ?? "https://havaljalal.se";
        var subject = lead.Source == "contact"
            ? $"Nytt meddelande från {(lead.Name.Length > 0 ? lead.Name : lead.Email)}"
            : $"Ny lead från Build Lab: {(lead.Name.Length > 0 ? lead.Name : lead.Email)}";
        await mailer.SendAsync(subject, $"""
            {(lead.Source == "contact" ? "Nytt meddelande via kontaktformuläret på havaljalal.se" : "Ny lead via Build Lab på havaljalal.se")}

            Namn:    {(lead.Name.Length > 0 ? lead.Name : "-")}
            E-post:  {lead.Email}
            {(lead.Idea is { Length: > 0 } ? $"Idé:     {lead.Idea}\n" : "")}
            Meddelande:
            {(lead.Message.Length > 0 ? lead.Message : "-")}

            Svara: mailto:{lead.Email}
            Admin: {siteUrl}/admin
            """, ct);
        return new OkObjectResult(new { ok = true, mailed = mailer.Enabled });
    }

    [Function("ManageLeads")]
    public async Task<IActionResult> ManageLeads(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "manage/leads")] HttpRequest req,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        return new OkObjectResult(new { leads = await leads.ListAsync(100, ct), spentTodayUsd = await usage.SpentTodayUsdAsync(ct), dailyCapUsd = guard.DailyCapUsd });
    }

    // Admin: token and cost history for the AI features.
    [Function("ManageAi")]
    public async Task<IActionResult> ManageAi(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "manage/ai")] HttpRequest req,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        var days = int.TryParse(req.Query["days"], out var d) ? Math.Clamp(d, 1, 365) : 30;
        return new OkObjectResult(await usage.SummaryAsync(days, await guard.BudgetAsync(ct), ct));
    }

    private static bool Configured() => !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY"));

    private static ObjectResult Unavailable(string reason) =>
        new(new { error = reason }) { StatusCode = StatusCodes.Status503ServiceUnavailable };

    private static ObjectResult TooMany() =>
        new(new { error = "rate_limited" }) { StatusCode = StatusCodes.Status429TooManyRequests };

    private static async Task<T?> ReadAsync<T>(HttpRequest req, CancellationToken ct) where T : class
    {
        try { return await JsonSerializer.DeserializeAsync<T>(req.Body, Json, ct); }
        catch (JsonException) { return null; }
    }

    private static async Task WriteEvent(HttpResponse res, string name, object data, CancellationToken ct)
    {
        var line = $"event: {name}\ndata: {JsonSerializer.Serialize(data, Json)}\n\n";
        await res.Body.WriteAsync(Encoding.UTF8.GetBytes(line), ct);
        await res.Body.FlushAsync(ct);
    }

    private static string ClientIp(HttpRequest req)
    {
        var fwd = req.Headers["X-Forwarded-For"].ToString();
        return !string.IsNullOrEmpty(fwd) ? fwd.Split(',')[0].Trim() : req.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }

    private static string? Clip(string? s, int max) => string.IsNullOrWhiteSpace(s) ? null : s.Trim()[..Math.Min(s.Trim().Length, max)];

    private sealed class ChatDto
    {
        [JsonPropertyName("messages")] public List<ChatMessageDto>? Messages { get; set; }
        [JsonPropertyName("lang")] public string? Lang { get; set; }
    }
    private sealed class ChatMessageDto
    {
        [JsonPropertyName("role")] public string Role { get; set; } = "user";
        [JsonPropertyName("text")] public string Text { get; set; } = "";
    }
    private sealed class BuildDto
    {
        [JsonPropertyName("idea")] public string? Idea { get; set; }
        [JsonPropertyName("visitor")] public string? Visitor { get; set; }
        [JsonPropertyName("lang")] public string? Lang { get; set; }
    }
    private sealed class LeadDto
    {
        [JsonPropertyName("name")] public string? Name { get; set; }
        [JsonPropertyName("email")] public string? Email { get; set; }
        [JsonPropertyName("message")] public string? Message { get; set; }
        [JsonPropertyName("idea")] public string? Idea { get; set; }
        [JsonPropertyName("plan")] public string? Plan { get; set; }
        [JsonPropertyName("source")] public string? Source { get; set; }
        [JsonPropertyName("website")] public string? Website { get; set; }
    }
}
