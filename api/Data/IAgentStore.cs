using System.Text.Json;

namespace HavalApi.Data;

// What Javal (the site's AI assistant) knows beyond the public content, and what he could not
// answer. The briefing is private: it is never served by the public content API, only used
// inside the system prompt. Written by Haval in admin.
public sealed record AgentConfig(string Briefing, string Never, DateTime UpdatedAt)
{
    public static readonly AgentConfig Empty = new("", "", DateTime.MinValue);
}

// A visitor question Javal could not answer from his material. No visitor identity is stored,
// only the question, so the list is safe to keep and to read.
public sealed record UnansweredQuestion(string Id, DateTime Ts, string Lang, string Question, string Topic);

public interface IAgentStore
{
    Task<AgentConfig> GetConfigAsync(CancellationToken ct);
    Task SaveConfigAsync(AgentConfig config, CancellationToken ct);
    Task AddQuestionAsync(UnansweredQuestion question, CancellationToken ct);
    Task<List<UnansweredQuestion>> ListQuestionsAsync(int take, CancellationToken ct);
    Task<bool> DeleteQuestionAsync(string id, CancellationToken ct);

    // Questions older than this are dropped; the list is a to-do, not an archive.
    public static readonly TimeSpan Retention = TimeSpan.FromDays(90);
}

public sealed class JsonFileAgentStore(string dataDir) : IAgentStore
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly string _config = Path.Combine(dataDir, "agent.json");
    private readonly string _questions = Path.Combine(dataDir, "agent-questions.json");
    private readonly SemaphoreSlim _lock = new(1, 1);

    public async Task<AgentConfig> GetConfigAsync(CancellationToken ct)
    {
        if (!File.Exists(_config)) return AgentConfig.Empty;
        await using var stream = File.OpenRead(_config);
        return await JsonSerializer.DeserializeAsync<AgentConfig>(stream, Json, ct) ?? AgentConfig.Empty;
    }

    public async Task SaveConfigAsync(AgentConfig config, CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            Directory.CreateDirectory(dataDir);
            await File.WriteAllTextAsync(_config, JsonSerializer.Serialize(config, Json), ct);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task AddQuestionAsync(UnansweredQuestion question, CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            var all = await ReadQuestionsAsync(ct);
            all.Add(question);
            await WriteQuestionsAsync(all, ct);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<List<UnansweredQuestion>> ListQuestionsAsync(int take, CancellationToken ct)
    {
        var all = await ReadQuestionsAsync(ct);
        return all.OrderByDescending(q => q.Ts).Take(take).ToList();
    }

    public async Task<bool> DeleteQuestionAsync(string id, CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            var all = await ReadQuestionsAsync(ct);
            var removed = all.RemoveAll(q => q.Id == id) > 0;
            if (removed) await WriteQuestionsAsync(all, ct);
            return removed;
        }
        finally
        {
            _lock.Release();
        }
    }

    private async Task<List<UnansweredQuestion>> ReadQuestionsAsync(CancellationToken ct)
    {
        if (!File.Exists(_questions)) return [];
        await using var stream = File.OpenRead(_questions);
        var all = await JsonSerializer.DeserializeAsync<List<UnansweredQuestion>>(stream, Json, ct) ?? [];
        var cutoff = DateTime.UtcNow - IAgentStore.Retention;
        return all.Where(q => q.Ts >= cutoff).ToList();
    }

    private async Task WriteQuestionsAsync(List<UnansweredQuestion> all, CancellationToken ct)
    {
        Directory.CreateDirectory(dataDir);
        await File.WriteAllTextAsync(_questions, JsonSerializer.Serialize(all, Json), ct);
    }
}
