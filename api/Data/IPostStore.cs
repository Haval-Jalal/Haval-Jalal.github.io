using System.Text.Json;

namespace HavalApi.Data;

// Editorial content that is not part of the main site document: the changelog ("what's new on
// the site") and the "Nu" page ("what I'm doing right now"). Both are written in admin; the
// changelog carries both languages in one entry, the Nu page is one document per language.
public sealed record ChangelogEntry(
    string Id,
    DateTime Ts,
    string Date,        // yyyy-MM-dd, the date shown to visitors
    string Title,
    string Text,
    string TitleEn,
    string TextEn,
    List<string> Tags,
    bool Published);

public sealed record NowSection(string Title, List<string> Items);

public sealed record NowPage(DateTime UpdatedAt, string Intro, List<NowSection> Sections)
{
    public static readonly NowPage Default = new(
        DateTime.UtcNow,
        "En sida om vad jag håller på med just nu. Uppdateras när något ändras.",
        [
            new("Fokus", ["Bygger om havaljalal.se på Azure med .NET 10 och React"]),
            new("Lär mig", ["Azure Static Web Apps, Cosmos DB och Functions"]),
            new("Läser", []),
        ]);
}

public interface IPostStore
{
    Task<List<ChangelogEntry>> ListChangelogAsync(bool publishedOnly, CancellationToken ct);
    Task SaveChangelogAsync(ChangelogEntry entry, CancellationToken ct);
    Task<bool> DeleteChangelogAsync(string id, CancellationToken ct);
    Task<NowPage?> GetNowAsync(string lang, CancellationToken ct);
    Task SaveNowAsync(NowPage now, string lang, CancellationToken ct);
}

public sealed class JsonFilePostStore(string dataDir) : IPostStore
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly string _changelog = Path.Combine(dataDir, "changelog.json");
    private readonly SemaphoreSlim _lock = new(1, 1);

    public async Task<List<ChangelogEntry>> ListChangelogAsync(bool publishedOnly, CancellationToken ct)
    {
        var all = await ReadAsync(ct);
        return all.Where(e => !publishedOnly || e.Published).OrderByDescending(e => e.Date).ThenByDescending(e => e.Ts).ToList();
    }

    public async Task SaveChangelogAsync(ChangelogEntry entry, CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            var all = await ReadAsync(ct);
            all.RemoveAll(e => e.Id == entry.Id);
            all.Add(entry);
            await WriteAsync(all, ct);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<bool> DeleteChangelogAsync(string id, CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            var all = await ReadAsync(ct);
            var removed = all.RemoveAll(e => e.Id == id) > 0;
            if (removed) await WriteAsync(all, ct);
            return removed;
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<NowPage?> GetNowAsync(string lang, CancellationToken ct)
    {
        var file = Path.Combine(dataDir, $"now-{lang}.json");
        if (!File.Exists(file)) return null;
        await using var stream = File.OpenRead(file);
        return await JsonSerializer.DeserializeAsync<NowPage>(stream, Json, ct);
    }

    public async Task SaveNowAsync(NowPage now, string lang, CancellationToken ct)
    {
        Directory.CreateDirectory(dataDir);
        await File.WriteAllTextAsync(Path.Combine(dataDir, $"now-{lang}.json"), JsonSerializer.Serialize(now, Json), ct);
    }

    private async Task<List<ChangelogEntry>> ReadAsync(CancellationToken ct)
    {
        if (!File.Exists(_changelog)) return [];
        await using var stream = File.OpenRead(_changelog);
        return await JsonSerializer.DeserializeAsync<List<ChangelogEntry>>(stream, Json, ct) ?? [];
    }

    private async Task WriteAsync(List<ChangelogEntry> all, CancellationToken ct)
    {
        Directory.CreateDirectory(dataDir);
        await File.WriteAllTextAsync(_changelog, JsonSerializer.Serialize(all, Json), ct);
    }
}
