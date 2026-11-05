using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Anthropic.Exceptions;
using HavalApi.Agent;
using HavalApi.Auth;
using HavalApi.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace HavalApi.Functions;

public class AgentFunction(AgentService agent, AgentGuard guard, ILeadStore leads, IUsageStore usage, ILogger<AgentFunction> log)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    // Digital Haval: small JSON round-trip, no streaming needed for short answers.
    [Function("AgentChat")]
    public async Task<IActionResult> Chat(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "agent/chat")] HttpRequest req,
        CancellationToken ct)
    {
        if (!Configured()) return Unavailable("not_configured");
        if (await guard.OverDailyCapAsync(ct)) return Unavailable("daily_cap");
        if (!guard.TryTake("chat", ClientIp(req), guard.ChatPerHour)) return TooMany();

        var dto = await ReadAsync<ChatDto>(req, ct);
        if (dto?.Messages is not { Count: > 0 } || dto.Messages.Any(m => string.IsNullOrWhiteSpace(m.Text) || m.Text.Length > 2000))
            return new BadRequestObjectResult(new { error = "invalid_messages" });

        try
        {
            var turns = dto.Messages.Select(m => new ChatTurn(m.Role == "assistant" ? "assistant" : "user", m.Text.Trim())).ToList();
            var reply = await agent.ChatAsync(turns, ct);
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
        if (await guard.OverDailyCapAsync(ct)) return Unavailable("daily_cap");

        var dto = await ReadAsync<BuildDto>(req, ct);
        var idea = dto?.Idea?.Trim();
        if (string.IsNullOrEmpty(idea) || idea.Length < 8 || idea.Length > 800)
            return new BadRequestObjectResult(new { error = "invalid_idea" });

        if (!guard.TryTake("build", ClientIp(req), guard.BuildPerHour)) return TooMany();

        var res = req.HttpContext.Response;
        res.StatusCode = 200;
        res.ContentType = "text/event-stream";
        res.Headers.CacheControl = "no-cache";
        res.Headers["X-Accel-Buffering"] = "no";

        try
        {
            Usage? usage = null;
            await foreach (var delta in agent.BuildStreamAsync(idea, u => usage = u, ct))
                await WriteEvent(res, "delta", new { t = delta }, ct);
            await WriteEvent(res, "done", new { usage }, ct);
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
        if (!guard.TryTake("lead", ClientIp(req), 5)) return TooMany();
        var dto = await ReadAsync<LeadDto>(req, ct);
        if (dto is null || string.IsNullOrWhiteSpace(dto.Email) || !dto.Email.Contains('@') || dto.Email.Length > 200)
            return new BadRequestObjectResult(new { error = "invalid_email" });

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
        return new OkObjectResult(new { ok = true });
    }

    [Function("ManageLeads")]
    public async Task<IActionResult> ManageLeads(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "manage/leads")] HttpRequest req,
        CancellationToken ct)
    {
        if (ClientPrincipal.From(req) is not { IsAdmin: true }) return new UnauthorizedResult();
        return new OkObjectResult(new { leads = await leads.ListAsync(100, ct), spentTodayUsd = await usage.SpentTodayUsdAsync(ct), dailyCapUsd = guard.DailyCapUsd });
    }

    // Admin: token and cost history for the AI features.
    [Function("ManageAi")]
    public async Task<IActionResult> ManageAi(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "manage/ai")] HttpRequest req,
        CancellationToken ct)
    {
        if (ClientPrincipal.From(req) is not { IsAdmin: true }) return new UnauthorizedResult();
        var days = int.TryParse(req.Query["days"], out var d) ? Math.Clamp(d, 1, 365) : 30;
        return new OkObjectResult(await usage.SummaryAsync(days, guard.DailyCapUsd, ct));
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

    private sealed class ChatDto { [JsonPropertyName("messages")] public List<ChatMessageDto>? Messages { get; set; } }
    private sealed class ChatMessageDto
    {
        [JsonPropertyName("role")] public string Role { get; set; } = "user";
        [JsonPropertyName("text")] public string Text { get; set; } = "";
    }
    private sealed class BuildDto { [JsonPropertyName("idea")] public string? Idea { get; set; } }
    private sealed class LeadDto
    {
        [JsonPropertyName("name")] public string? Name { get; set; }
        [JsonPropertyName("email")] public string? Email { get; set; }
        [JsonPropertyName("message")] public string? Message { get; set; }
        [JsonPropertyName("idea")] public string? Idea { get; set; }
        [JsonPropertyName("plan")] public string? Plan { get; set; }
        [JsonPropertyName("source")] public string? Source { get; set; }
    }
}
