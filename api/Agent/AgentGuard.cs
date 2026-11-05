using System.Collections.Concurrent;

namespace HavalApi.Agent;

// Keeps the AI features from being abused or draining the credits: a per-IP sliding window per
// feature, and a daily spend cap computed from real token usage. In-memory for now (per instance);
// moves to Cosmos with the other stores.
public sealed class AgentGuard
{
    private readonly ConcurrentDictionary<string, List<DateTime>> _windows = new();
    private readonly object _spendLock = new();
    private DateOnly _spendDay = DateOnly.FromDateTime(DateTime.UtcNow);
    private decimal _spentUsd;

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

    public bool OverDailyCap()
    {
        lock (_spendLock)
        {
            RollDay();
            return _spentUsd >= DailyCapUsd;
        }
    }

    public decimal SpentTodayUsd
    {
        get { lock (_spendLock) { RollDay(); return _spentUsd; } }
    }

    // Prices per million tokens (Claude API list prices).
    public void Record(string model, long inputTokens, long outputTokens, long cacheReadTokens = 0)
    {
        var (inPrice, outPrice, cachePrice) = model switch
        {
            var m when m.StartsWith("claude-opus-5-5") => (4m, 20m, 0.20m),
            var m when m.StartsWith("claude-sonnet-5-5") => (2m, 10m, 0.20m),
            var m when m.StartsWith("claude-opus-4-8") => (5m, 25m, 0.50m),
            _ => (5m, 25m, 0.50m),
        };
        var usd = (inputTokens * inPrice + outputTokens * outPrice + cacheReadTokens * cachePrice) / 1_000_000m;
        lock (_spendLock)
        {
            RollDay();
            _spentUsd += usd;
        }
    }

    private void RollDay()
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        if (today != _spendDay)
        {
            _spendDay = today;
            _spentUsd = 0;
        }
    }

    private static int Env(string name, int fallback) =>
        int.TryParse(Environment.GetEnvironmentVariable(name), out var v) ? v : fallback;

    private static decimal Env(string name, decimal fallback) =>
        decimal.TryParse(Environment.GetEnvironmentVariable(name), System.Globalization.CultureInfo.InvariantCulture, out var v) ? v : fallback;
}
