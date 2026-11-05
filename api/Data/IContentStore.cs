using System.Text.Json;

namespace HavalApi.Data;

public interface IContentStore
{
    Task<SiteContent> GetAsync(CancellationToken ct);
    Task SaveAsync(SiteContent content, CancellationToken ct);
}

// Local development store: a JSON file next to the API. Seeded from seed.json on first read.
// Production uses the Cosmos DB store (registered when COSMOS_CONNECTION is configured).
public sealed class JsonFileContentStore(string dataDir) : IContentStore
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    private readonly string _file = Path.Combine(dataDir, "content.json");
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

    public async Task SaveAsync(SiteContent content, CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_file)!);
            var tmp = _file + ".tmp";
            await using (var stream = File.Create(tmp))
                await JsonSerializer.SerializeAsync(stream, content, Json, ct);
            File.Move(tmp, _file, overwrite: true);
        }
        finally
        {
            _lock.Release();
        }
    }
}
