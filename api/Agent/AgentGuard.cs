using System.Collections.Concurrent;
using HavalApi.Data;

namespace HavalApi.Agent;

public enum BudgetMode
{
    Full,     // Opus builds
    Eco,      // past the eco threshold of the daily cap: Sonnet builds, shorter output
    Stopped,  // daily or monthly cap reached: no AI calls, lead form only
}

// Keeps the AI features from being abused or draining the credits: per-IP sliding windows
// (hourly and daily, in memory) and a two-layer spend budget read from the persisted usage records.
public sealed class AgentGuard(IUsageStore usage)
{
    private readonly ConcurrentDictionary<string, List<DateTime>> _windows = new();
    private int _active;

    // Calls in flight right now (for the live view in admin).
    public int ActiveCalls => Volatile.Read(ref _active);
    public IDisposable TrackCall()
    {
        Interlocked.Increment(ref _active);
        return new CallScope(() => Interlocked.Decrement(ref _active));
    }
    private sealed class CallScope(Action onDispose) : IDisposable { public void Dispose() => onDispose(); }

    // "low" | "medium" | "high": how hard Opus thinks before writing a prototype. Lower = cheaper.
    public string BuildEffort { get; } = (Environment.GetEnvironmentVariable("AGENT_BUILD_EFFORT") ?? "medium").ToLowerInvariant();

    public int BuildPerHour { get; } = Env("AGENT_BUILD_PER_HOUR", 3);
    public int BuildPerDay { get; } = Env("AGENT_BUILD_PER_DAY", 5);
    public int ChatPerHour { get; } = Env("AGENT_CHAT_PER_HOUR", 20);
    public decimal DailyCapUsd { get; } = Env("AGENT_DAILY_CAP_USD", 3.3m);
    public decimal MonthlyCapUsd { get; } = Env("AGENT_MONTHLY_CAP_USD", 90m);
    public decimal EcoThreshold { get; } = Env("AGENT_ECO_THRESHOLD", 0.7m);

    public bool TryTake(string feature, string ip, int limit, TimeSpan window)
    {
        var key = $"{feature}:{window.TotalMinutes}:{ip}";
        var list = _windows.GetOrAdd(key, _ => []);
        lock (list)
        {
            var cutoff = DateTime.UtcNow - window;
            list.RemoveAll(t => t < cutoff);
            if (list.Count >= limit) return false;
            list.Add(DateTime.UtcNow);
            return true;
        }
    }

    public async Task<BudgetMode> ModeAsync(CancellationToken ct)
    {
        var today = await usage.SpentTodayUsdAsync(ct);
        var month = await usage.SpentMonthUsdAsync(ct);
        if (today >= DailyCapUsd || month >= MonthlyCapUsd) return BudgetMode.Stopped;
        if (today >= DailyCapUsd * EcoThreshold) return BudgetMode.Eco;
        return BudgetMode.Full;
    }

    public async Task<Budget> BudgetAsync(CancellationToken ct) =>
        new(DailyCapUsd, MonthlyCapUsd, ModeName(await ModeAsync(ct)), ActiveCalls);

    public static string ModeName(BudgetMode m) => m switch
    {
        BudgetMode.Eco => "eco",
        BudgetMode.Stopped => "stopped",
        _ => "full",
    };

    // Records a finished call and returns what it cost.
    public async Task<decimal> RecordAsync(string feature, string model, long inputTokens, long outputTokens, long cacheReadTokens, long cacheWriteTokens, bool truncated, CancellationToken ct)
    {
        var usd = Pricing.Usd(model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);
        await usage.AppendAsync(new UsageRecord(DateTime.UtcNow, feature, model, inputTokens, outputTokens, cacheReadTokens, usd, cacheWriteTokens, truncated), ct);
        return usd;
    }

    private static int Env(string name, int fallback) =>
        int.TryParse(Environment.GetEnvironmentVariable(name), out var v) ? v : fallback;

    private static decimal Env(string name, decimal fallback) =>
        decimal.TryParse(Environment.GetEnvironmentVariable(name), System.Globalization.CultureInfo.InvariantCulture, out var v) ? v : fallback;
}

// Claude API list prices per million tokens. Cache writes (5-minute TTL) cost 1.25x input.
public static class Pricing
{
    public static decimal Usd(string model, long inputTokens, long outputTokens, long cacheReadTokens, long cacheWriteTokens = 0)
    {
        var (inPrice, outPrice, cachePrice) = model switch
        {
            var m when m.StartsWith("claude-opus-5-5") => (4m, 20m, 0.20m),
            var m when m.StartsWith("claude-sonnet-5-5") => (2m, 10m, 0.20m),
            var m when m.StartsWith("claude-opus-4-8") => (5m, 25m, 0.50m),
            _ => (5m, 25m, 0.50m),
        };
        return (inputTokens * inPrice + outputTokens * outPrice + cacheReadTokens * cachePrice + cacheWriteTokens * inPrice * 1.25m) / 1_000_000m;
    }
}
