using System.Collections.Concurrent;
using HavalApi.Data;

namespace HavalApi.Agent;

// Keeps the AI features from being abused or draining the credits: a per-IP sliding window per
// feature (in memory) and a daily spend cap read from the persisted usage records.
public sealed class AgentGuard(IUsageStore usage)
{
    private readonly ConcurrentDictionary<string, List<DateTime>> _windows = new();

    public int BuildPerHour { get; } = Env("AGENT_BUILD_PER_HOUR", 3);
    public int ChatPerHour { get; } = Env("AGENT_CHAT_PER_HOUR", 20);
    public decimal DailyCapUsd { get; } = Env("AGENT_DAILY_CAP_USD", 3m);

    public bool TryTake(string feature, string ip, int perHour)
    {
        var key = $"{feature}:{ip}";
        var list = _windows.GetOrAdd(key, _ => []);
        lock (list)
        {
            var cutoff = DateTime.UtcNow.AddHours(-1);
            list.RemoveAll(t => t < cutoff);
            if (list.Count >= perHour) return false;
            list.Add(DateTime.UtcNow);
            return true;
        }
    }

    public async Task<bool> OverDailyCapAsync(CancellationToken ct) =>
        await usage.SpentTodayUsdAsync(ct) >= DailyCapUsd;

    // Records a finished call and returns what it cost.
    public async Task<decimal> RecordAsync(string feature, string model, long inputTokens, long outputTokens, long cacheReadTokens, CancellationToken ct)
    {
        var usd = Pricing.Usd(model, inputTokens, outputTokens, cacheReadTokens);
        await usage.AppendAsync(new UsageRecord(DateTime.UtcNow, feature, model, inputTokens, outputTokens, cacheReadTokens, usd), ct);
        return usd;
    }

    private static int Env(string name, int fallback) =>
        int.TryParse(Environment.GetEnvironmentVariable(name), out var v) ? v : fallback;

    private static decimal Env(string name, decimal fallback) =>
        decimal.TryParse(Environment.GetEnvironmentVariable(name), System.Globalization.CultureInfo.InvariantCulture, out var v) ? v : fallback;
}

// Claude API list prices per million tokens.
public static class Pricing
{
    public static decimal Usd(string model, long inputTokens, long outputTokens, long cacheReadTokens)
    {
        var (inPrice, outPrice, cachePrice) = model switch
        {
            var m when m.StartsWith("claude-opus-5-5") => (4m, 20m, 0.20m),
            var m when m.StartsWith("claude-sonnet-5-5") => (2m, 10m, 0.20m),
            var m when m.StartsWith("claude-opus-4-8") => (5m, 25m, 0.50m),
            _ => (5m, 25m, 0.50m),
        };
        return (inputTokens * inPrice + outputTokens * outPrice + cacheReadTokens * cachePrice) / 1_000_000m;
    }
}
