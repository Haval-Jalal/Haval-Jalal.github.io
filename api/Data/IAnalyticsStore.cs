using System.Text.Json;

namespace HavalApi.Data;

// One row per page view or custom event. No cookies, no IP stored: the visitor id is a daily
// rotating hash, so "unique visitors" means unique per day and nobody can be tracked across days.
public sealed record Hit(
    DateTime Ts,
    string Kind,          // "view" | "event"
    string Path,
    string? Name,         // event name, null for views
    string? Referrer,     // host only
    string Device,        // "mobile" | "tablet" | "desktop"
    string? Lang,
    string Visitor);      // daily hash

public sealed record AnalyticsSummary(
    int Days,
    int Views,
    int Visitors,
    List<DayCount> PerDay,
    List<KeyCount> TopPaths,
    List<KeyCount> TopReferrers,
    List<KeyCount> Devices,
    List<KeyCount> Events);

public sealed record DayCount(string Day, int Views, int Visitors);
public sealed record KeyCount(string Key, int Count);

public interface IAnalyticsStore
{
    Task AppendAsync(Hit hit, CancellationToken ct);
    Task<AnalyticsSummary> SummaryAsync(int days, CancellationToken ct);
}

// Local development store: newline-delimited JSON, one file per month.
public sealed class JsonFileAnalyticsStore(string dataDir) : IAnalyticsStore
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly SemaphoreSlim _lock = new(1, 1);

    private string FileFor(DateTime ts) => Path.Combine(dataDir, $"analytics-{ts:yyyy-MM}.ndjson");

    public async Task AppendAsync(Hit hit, CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            Directory.CreateDirectory(dataDir);
            await File.AppendAllTextAsync(FileFor(hit.Ts), JsonSerializer.Serialize(hit, Json) + "\n", ct);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<AnalyticsSummary> SummaryAsync(int days, CancellationToken ct)
    {
        var since = DateTime.UtcNow.Date.AddDays(-(days - 1));
        var hits = new List<Hit>();
        if (Directory.Exists(dataDir))
        {
            foreach (var file in Directory.EnumerateFiles(dataDir, "analytics-*.ndjson"))
            {
                foreach (var line in await File.ReadAllLinesAsync(file, ct))
                {
                    if (line.Length == 0) continue;
                    var hit = JsonSerializer.Deserialize<Hit>(line, Json);
                    if (hit is not null && hit.Ts >= since) hits.Add(hit);
                }
            }
        }
        return Summarise(hits, days, since);
    }

    // Shared by every store implementation.
    public static AnalyticsSummary Summarise(IReadOnlyCollection<Hit> hits, int days, DateTime since)
    {
        var views = hits.Where(h => h.Kind == "view").ToList();
        var perDay = Enumerable.Range(0, days)
            .Select(i => since.AddDays(i))
            .Select(d =>
            {
                var onDay = views.Where(v => v.Ts.Date == d).ToList();
                return new DayCount(d.ToString("yyyy-MM-dd"), onDay.Count, onDay.Select(v => v.Visitor).Distinct().Count());
            })
            .ToList();

        static List<KeyCount> Top(IEnumerable<string?> keys, int take = 10) =>
            keys.Where(k => !string.IsNullOrEmpty(k))
                .GroupBy(k => k!)
                .Select(g => new KeyCount(g.Key, g.Count()))
                .OrderByDescending(k => k.Count)
                .Take(take)
                .ToList();

        return new AnalyticsSummary(
            days,
            views.Count,
            views.Select(v => v.Visitor).Distinct().Count(),
            perDay,
            Top(views.Select(v => v.Path)),
            Top(views.Select(v => v.Referrer)),
            Top(views.Select(v => v.Device), 3),
            Top(hits.Where(h => h.Kind == "event").Select(h => h.Name)));
    }
}
