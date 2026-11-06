using System.Text.Json;

namespace HavalApi.Data;

// Recruiter mode: one personal landing page per company (/for/{slug}). Haval writes a few notes,
// the AI drafts the page from the site content, Haval edits and publishes. Stats show whether
// the recruiter opened it, downloaded the CV or tried Build Lab.
public sealed record Pitch(
    string Slug,
    string Company,
    string Role,
    string JobUrl,
    string Notes,
    string Greeting,
    string Intro,
    List<PitchProject> Projects,
    List<string> Highlights,
    string Closing,
    string CtaLabel,
    string CtaUrl,
    string Status,            // "draft" | "published" | "closed"
    DateTime CreatedAt,
    DateTime UpdatedAt,
    PitchStats Stats);

public sealed record PitchProject(string Slug, string Why);

public sealed record PitchStats(
    int Views,
    int CvDownloads,
    int LabClicks,
    DateTime? FirstViewedAt,
    DateTime? LastViewedAt,
    List<PitchEvent> Recent)
{
    public static readonly PitchStats Empty = new(0, 0, 0, null, null, []);
    public int Unique => Recent.Where(e => e.Kind == "view").Select(e => e.Visitor).Distinct().Count();

    public PitchStats With(string kind, string visitor, DateTime ts)
    {
        var recent = Recent.Append(new PitchEvent(ts, kind, visitor)).TakeLast(300).ToList();
        return this with
        {
            Views = Views + (kind == "view" ? 1 : 0),
            CvDownloads = CvDownloads + (kind == "cv" ? 1 : 0),
            LabClicks = LabClicks + (kind == "lab" ? 1 : 0),
            FirstViewedAt = FirstViewedAt ?? (kind == "view" ? ts : null),
            LastViewedAt = kind == "view" ? ts : LastViewedAt,
            Recent = recent,
        };
    }
}

public sealed record PitchEvent(DateTime Ts, string Kind, string Visitor);

public interface IPitchStore
{
    Task SaveAsync(Pitch pitch, CancellationToken ct);
    Task<Pitch?> GetAsync(string slug, CancellationToken ct);
    Task<List<Pitch>> ListAsync(CancellationToken ct);
    Task<bool> DeleteAsync(string slug, CancellationToken ct);
    Task RecordEventAsync(string slug, string kind, string visitor, CancellationToken ct);
}

public sealed class JsonFilePitchStore(string dataDir) : IPitchStore
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly string _dir = Path.Combine(dataDir, "pitches");
    private readonly SemaphoreSlim _lock = new(1, 1);

    private string PathFor(string slug) => Path.Combine(_dir, slug + ".json");

    public async Task SaveAsync(Pitch pitch, CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            Directory.CreateDirectory(_dir);
            var tmp = PathFor(pitch.Slug) + ".tmp";
            await using (var s = File.Create(tmp))
                await JsonSerializer.SerializeAsync(s, pitch, Json, ct);
            File.Move(tmp, PathFor(pitch.Slug), overwrite: true);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<Pitch?> GetAsync(string slug, CancellationToken ct)
    {
        var path = PathFor(slug);
        if (!File.Exists(path)) return null;
        await using var s = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<Pitch>(s, Json, ct);
    }

    public async Task<List<Pitch>> ListAsync(CancellationToken ct)
    {
        if (!Directory.Exists(_dir)) return [];
        var result = new List<Pitch>();
        foreach (var file in Directory.EnumerateFiles(_dir, "*.json"))
        {
            await using var s = File.OpenRead(file);
            var p = await JsonSerializer.DeserializeAsync<Pitch>(s, Json, ct);
            if (p is not null) result.Add(p);
        }
        return result.OrderByDescending(p => p.UpdatedAt).ToList();
    }

    public Task<bool> DeleteAsync(string slug, CancellationToken ct)
    {
        var path = PathFor(slug);
        if (!File.Exists(path)) return Task.FromResult(false);
        File.Delete(path);
        return Task.FromResult(true);
    }

    public async Task RecordEventAsync(string slug, string kind, string visitor, CancellationToken ct)
    {
        var pitch = await GetAsync(slug, ct);
        if (pitch is null) return;
        await SaveAsync(pitch with { Stats = pitch.Stats.With(kind, visitor, DateTime.UtcNow) }, ct);
    }
}
