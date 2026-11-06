using System.Text.Json;

namespace HavalApi.Data;

public interface IContentStore
{
    // Swedish: the master document.
    Task<SiteContent> GetAsync(CancellationToken ct);
    Task SaveAsync(SiteContent content, CancellationToken ct);
    // Other languages ("en"): null until a translation has been saved.
    Task<SiteContent?> GetAsync(string lang, CancellationToken ct);
    Task SaveAsync(SiteContent content, string lang, CancellationToken ct);
}

// Local development store: a JSON file next to the API. Seeded from seed.json on first read.
// Production uses the Cosmos DB store (registered when COSMOS_CONNECTION is configured).
public sealed class JsonFileContentStore(string dataDir) : IContentStore
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    private readonly string _file = Path.Combine(dataDir, "content.json");
    private string FileFor(string lang) => Path.Combine(dataDir, $"content-{lang}.json");
    private readonly string _seed = Path.Combine(AppContext.BaseDirectory, "Data", "seed.json");
    private readonly SemaphoreSlim _lock = new(1, 1);

    public async Task<SiteContent> GetAsync(CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            var path = File.Exists(_file) ? _file : _seed;
            await using var stream = File.OpenRead(path);
            return await JsonSerializer.DeserializeAsync<SiteContent>(stream, Json, ct)
                   ?? throw new InvalidOperationException($"Could not read {path}");
        }
        finally
        {
            _lock.Release();
        }
    }

    public Task SaveAsync(SiteContent content, CancellationToken ct) => WriteAsync(_file, content, ct);

    public async Task<SiteContent?> GetAsync(string lang, CancellationToken ct)
    {
        if (lang == "sv") return await GetAsync(ct);
        var path = FileFor(lang);
        if (!File.Exists(path)) return null;
        await using var stream = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<SiteContent>(stream, Json, ct);
    }

    public Task SaveAsync(SiteContent content, string lang, CancellationToken ct) =>
        lang == "sv" ? SaveAsync(content, ct) : WriteAsync(FileFor(lang), content, ct);

    private async Task WriteAsync(string file, SiteContent content, CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(file)!);
            var tmp = file + ".tmp";
            await using (var stream = File.Create(tmp))
                await JsonSerializer.SerializeAsync(stream, content, Json, ct);
            File.Move(tmp, file, overwrite: true);
        }
        finally
        {
            _lock.Release();
        }
    }
}
