using System.Text.Json;

namespace HavalApi.Data;

// "Skicka till Haval" from Build Lab (and later the contact form).
public sealed record Lead(
    string Id,
    DateTime Ts,
    string Name,
    string Email,
    string Message,
    string? Idea,
    string? Plan,
    string Source,
    string? Phone = null,
    string? BuildId = null);

public interface ILeadStore
{
    Task AddAsync(Lead lead, CancellationToken ct);
    Task<List<Lead>> ListAsync(int take, CancellationToken ct);
}

public sealed class JsonFileLeadStore(string dataDir) : ILeadStore
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly string _file = Path.Combine(dataDir, "leads.ndjson");
    private readonly SemaphoreSlim _lock = new(1, 1);

    public async Task AddAsync(Lead lead, CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            Directory.CreateDirectory(dataDir);
            await File.AppendAllTextAsync(_file, JsonSerializer.Serialize(lead, Json) + "\n", ct);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<List<Lead>> ListAsync(int take, CancellationToken ct)
    {
        if (!File.Exists(_file)) return [];
        var lines = await File.ReadAllLinesAsync(_file, ct);
        return lines
            .Where(l => l.Length > 0)
            .Select(l => JsonSerializer.Deserialize<Lead>(l, Json)!)
            .OrderByDescending(l => l.Ts)
            .Take(take)
            .ToList();
    }
}
