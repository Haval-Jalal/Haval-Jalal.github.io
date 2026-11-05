using System.Text.Json;

namespace HavalApi.Data;

// One row per AI call: what it cost in tokens and dollars. Drives the daily cap and the admin AI tab.
public sealed record UsageRecord(
    DateTime Ts,
    string Feature,       // "build" | "chat"
    string Model,
    long InputTokens,
    long OutputTokens,
    long CacheReadTokens,
    decimal Usd);

public sealed record UsageSummary(
    int Days,
    decimal SpentTodayUsd,
    decimal DailyCapUsd,
    decimal SpentMonthUsd,
    decimal MonthlyCapUsd,
    string Mode,          // "full" | "eco" | "stopped"
    decimal TotalUsd,
    long InputTokens,
    long OutputTokens,
    long CacheReadTokens,
    List<UsageDay> PerDay,
    List<UsageFeature> ByFeature);

public sealed record UsageDay(string Day, decimal Usd, long InputTokens, long OutputTokens, int Calls);
public sealed record UsageFeature(string Feature, int Calls, decimal Usd, long InputTokens, long OutputTokens, decimal AvgUsd);

public interface IUsageStore
{
    Task AppendAsync(UsageRecord record, CancellationToken ct);
    Task<decimal> SpentTodayUsdAsync(CancellationToken ct);
    Task<decimal> SpentMonthUsdAsync(CancellationToken ct);
    Task<UsageSummary> SummaryAsync(int days, Budget budget, CancellationToken ct);
}

// Caps and the current mode, computed by AgentGuard and passed into the summary.
public sealed record Budget(decimal DailyCapUsd, decimal MonthlyCapUsd, string Mode);

public sealed class JsonFileUsageStore(string dataDir) : IUsageStore
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly SemaphoreSlim _lock = new(1, 1);

    private string FileFor(DateTime ts) => Path.Combine(dataDir, $"ai-usage-{ts:yyyy-MM}.ndjson");

    public async Task AppendAsync(UsageRecord record, CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            Directory.CreateDirectory(dataDir);
            await File.AppendAllTextAsync(FileFor(record.Ts), JsonSerializer.Serialize(record, Json) + "\n", ct);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<decimal> SpentTodayUsdAsync(CancellationToken ct)
    {
        var today = DateTime.UtcNow.Date;
        return (await ReadSinceAsync(today, ct)).Sum(r => r.Usd);
    }

    public async Task<decimal> SpentMonthUsdAsync(CancellationToken ct)
    {
        var first = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        return (await ReadSinceAsync(first, ct)).Sum(r => r.Usd);
    }

    public async Task<UsageSummary> SummaryAsync(int days, Budget budget, CancellationToken ct)
    {
        var since = DateTime.UtcNow.Date.AddDays(-(days - 1));
        var first = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var rows = await ReadSinceAsync(since < first ? since : first, ct);
        return Summarise(rows, days, since, budget);
    }

    private async Task<List<UsageRecord>> ReadSinceAsync(DateTime since, CancellationToken ct)
    {
        var rows = new List<UsageRecord>();
        if (!Directory.Exists(dataDir)) return rows;
        foreach (var file in Directory.EnumerateFiles(dataDir, "ai-usage-*.ndjson"))
        {
            foreach (var line in await File.ReadAllLinesAsync(file, ct))
            {
                if (line.Length == 0) continue;
                var r = JsonSerializer.Deserialize<UsageRecord>(line, Json);
                if (r is not null && r.Ts >= since) rows.Add(r);
            }
        }
        return rows;
    }

    // Shared by every store implementation.
    public static UsageSummary Summarise(IReadOnlyCollection<UsageRecord> allRows, int days, DateTime since, Budget budget)
    {
        var today = DateTime.UtcNow.Date;
        var first = new DateTime(today.Year, today.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var rows = allRows.Where(r => r.Ts >= since).ToList();
        var perDay = Enumerable.Range(0, days)
            .Select(i => since.AddDays(i))
            .Select(d =>
            {
                var on = rows.Where(r => r.Ts.Date == d).ToList();
                return new UsageDay(d.ToString("yyyy-MM-dd"), on.Sum(r => r.Usd), on.Sum(r => r.InputTokens), on.Sum(r => r.OutputTokens), on.Count);
            })
            .ToList();
        var byFeature = rows
            .GroupBy(r => r.Feature)
            .Select(g => new UsageFeature(g.Key, g.Count(), g.Sum(r => r.Usd), g.Sum(r => r.InputTokens), g.Sum(r => r.OutputTokens), g.Count() == 0 ? 0 : g.Sum(r => r.Usd) / g.Count()))
            .OrderByDescending(f => f.Usd)
            .ToList();
        return new UsageSummary(
            days,
            allRows.Where(r => r.Ts.Date == today).Sum(r => r.Usd),
            budget.DailyCapUsd,
            allRows.Where(r => r.Ts >= first).Sum(r => r.Usd),
            budget.MonthlyCapUsd,
            budget.Mode,
            rows.Sum(r => r.Usd),
            rows.Sum(r => r.InputTokens),
            rows.Sum(r => r.OutputTokens),
            rows.Sum(r => r.CacheReadTokens),
            perDay,
            byFeature);
    }
}
