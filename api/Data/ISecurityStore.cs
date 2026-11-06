using System.Text.Json;

namespace HavalApi.Data;

// Audit trail for the admin area. Every signed-in account that reaches /admin is logged with the
// outcome ("admin" = let in, "denied" = no admin role, "blocked" = banned) so Haval can see who
// is knocking and block accounts. The IP is stored as a short salted hash, never in clear text.
public sealed record AuthAttempt(
    string Id,
    DateTime Ts,
    string Provider,
    string UserId,
    string User,
    string Result,
    string Path,
    string IpHash);

public sealed record Ban(string UserId, string User, string Provider, DateTime Ts, string? Note);

public sealed record SecurityUser(
    string UserId,
    string User,
    string Provider,
    int Attempts,
    DateTime First,
    DateTime Last,
    string LastResult,
    bool Banned,
    string? Note);

public sealed record SecuritySummary(List<SecurityUser> Users, List<AuthAttempt> Recent, int Bans);

public interface ISecurityStore
{
    Task AppendAsync(AuthAttempt attempt, CancellationToken ct);
    Task<List<AuthAttempt>> AttemptsAsync(int take, CancellationToken ct);
    Task<List<Ban>> BansAsync(CancellationToken ct);
    Task BanAsync(Ban ban, CancellationToken ct);
    Task UnbanAsync(string userId, CancellationToken ct);
}

public sealed class JsonFileSecurityStore(string dataDir) : ISecurityStore
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly string _attempts = Path.Combine(dataDir, "auth-attempts.ndjson");
    private readonly string _bans = Path.Combine(dataDir, "bans.json");
    private readonly SemaphoreSlim _lock = new(1, 1);

    public async Task AppendAsync(AuthAttempt attempt, CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            Directory.CreateDirectory(dataDir);
            await File.AppendAllTextAsync(_attempts, JsonSerializer.Serialize(attempt, Json) + "\n", ct);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<List<AuthAttempt>> AttemptsAsync(int take, CancellationToken ct)
    {
        if (!File.Exists(_attempts)) return [];
        var lines = await File.ReadAllLinesAsync(_attempts, ct);
        return lines
            .Where(l => l.Length > 0)
            .Select(l => JsonSerializer.Deserialize<AuthAttempt>(l, Json)!)
            .OrderByDescending(a => a.Ts)
            .Take(take)
            .ToList();
    }

    public async Task<List<Ban>> BansAsync(CancellationToken ct)
    {
        if (!File.Exists(_bans)) return [];
        await using var s = File.OpenRead(_bans);
        return await JsonSerializer.DeserializeAsync<List<Ban>>(s, Json, ct) ?? [];
    }

    public async Task BanAsync(Ban ban, CancellationToken ct)
    {
        var bans = (await BansAsync(ct)).Where(b => b.UserId != ban.UserId).Append(ban).ToList();
        await WriteBansAsync(bans, ct);
    }

    public async Task UnbanAsync(string userId, CancellationToken ct)
    {
        var bans = (await BansAsync(ct)).Where(b => b.UserId != userId).ToList();
        await WriteBansAsync(bans, ct);
    }

    private async Task WriteBansAsync(List<Ban> bans, CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            Directory.CreateDirectory(dataDir);
            await using var s = File.Create(_bans);
            await JsonSerializer.SerializeAsync(s, bans, Json, ct);
        }
        finally
        {
            _lock.Release();
        }
    }

    // Shared by every store implementation: one row per account, newest first.
    public static SecuritySummary Summarise(IReadOnlyCollection<AuthAttempt> attempts, IReadOnlyCollection<Ban> bans)
    {
        var banned = bans.ToDictionary(b => b.UserId, b => b);
        var users = attempts
            .GroupBy(a => a.UserId)
            .Select(g =>
            {
                var last = g.OrderByDescending(a => a.Ts).First();
                banned.TryGetValue(g.Key, out var ban);
                return new SecurityUser(g.Key, last.User, last.Provider, g.Count(), g.Min(a => a.Ts), last.Ts, last.Result, ban is not null, ban?.Note);
            })
            .ToList();

        // Banned accounts that never showed up in the log still belong in the list.
        foreach (var b in bans.Where(b => users.All(u => u.UserId != b.UserId)))
            users.Add(new SecurityUser(b.UserId, b.User, b.Provider, 0, b.Ts, b.Ts, "blocked", true, b.Note));

        return new SecuritySummary(
            users.OrderByDescending(u => u.Last).ToList(),
            attempts.OrderByDescending(a => a.Ts).Take(30).ToList(),
            bans.Count);
    }
}
