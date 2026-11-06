using System.Text.Json;
using System.Text.RegularExpressions;

namespace HavalApi.Data;

// A saved Build Lab prototype. VisitorId is a random id the browser keeps in localStorage, so a
// visitor finds their own prototypes again without any account. Contact is filled in when the
// visitor unlocks the download (name + e-mail), which is also what creates the lead.
public sealed record BuildRecord(
    string Id,
    DateTime Ts,
    string VisitorId,
    string Idea,
    string Title,
    string Html,
    string Plan,
    string Model,
    bool Truncated,
    BuildContact? Contact = null,
    bool Featured = false);

public sealed record BuildContact(string Name, string Email, string? Phone, string? Message, DateTime UnlockedAt);

// What lists and share pages need; never includes VisitorId.
public sealed record BuildSummary(string Id, DateTime Ts, string Idea, string Title, bool Unlocked);

// Admin list row and the public gallery card (the gallery needs the HTML for the live preview).
public sealed record BuildAdminRow(string Id, DateTime Ts, string Idea, string Title, string Model, bool Truncated, bool Unlocked, string? ContactName, bool Featured);
public sealed record GalleryItem(string Id, DateTime Ts, string Idea, string Title, string Html);

public interface IBuildStore
{
    Task SaveAsync(BuildRecord build, CancellationToken ct);
    Task<BuildRecord?> GetAsync(string id, CancellationToken ct);
    Task<List<BuildSummary>> ListByVisitorAsync(string visitorId, int take, CancellationToken ct);
    Task<List<BuildAdminRow>> ListRecentAsync(int take, CancellationToken ct);
    Task<List<GalleryItem>> ListFeaturedAsync(int take, CancellationToken ct);
}

public static class BuildRows
{
    public static BuildAdminRow Row(BuildRecord b) => new(b.Id, b.Ts, b.Idea, b.Title, b.Model, b.Truncated, b.Contact is not null, b.Contact?.Name, b.Featured);
    public static GalleryItem Item(BuildRecord b) => new(b.Id, b.Ts, b.Idea, b.Title, b.Html);
}

public sealed partial class JsonFileBuildStore(string dataDir) : IBuildStore
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly string _dir = Path.Combine(dataDir, "builds");

    public async Task SaveAsync(BuildRecord build, CancellationToken ct)
    {
        Directory.CreateDirectory(_dir);
        var path = Path.Combine(_dir, build.Id + ".json");
        var tmp = path + ".tmp";
        await using (var s = File.Create(tmp))
            await JsonSerializer.SerializeAsync(s, build, Json, ct);
        File.Move(tmp, path, overwrite: true);
    }

    public async Task<BuildRecord?> GetAsync(string id, CancellationToken ct)
    {
        if (!SafeId().IsMatch(id)) return null;
        var path = Path.Combine(_dir, id + ".json");
        if (!File.Exists(path)) return null;
        await using var s = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<BuildRecord>(s, Json, ct);
    }

    public async Task<List<BuildSummary>> ListByVisitorAsync(string visitorId, int take, CancellationToken ct)
    {
        if (!Directory.Exists(_dir)) return [];
        var result = new List<BuildSummary>();
        foreach (var file in Directory.EnumerateFiles(_dir, "*.json"))
        {
            await using var s = File.OpenRead(file);
            var b = await JsonSerializer.DeserializeAsync<BuildRecord>(s, Json, ct);
            if (b is not null && b.VisitorId == visitorId)
                result.Add(new BuildSummary(b.Id, b.Ts, b.Idea, b.Title, b.Contact is not null));
        }
        return result.OrderByDescending(b => b.Ts).Take(take).ToList();
    }

    public async Task<List<BuildAdminRow>> ListRecentAsync(int take, CancellationToken ct) =>
        (await AllAsync(ct)).OrderByDescending(b => b.Ts).Take(take).Select(BuildRows.Row).ToList();

    public async Task<List<GalleryItem>> ListFeaturedAsync(int take, CancellationToken ct) =>
        (await AllAsync(ct)).Where(b => b.Featured).OrderByDescending(b => b.Ts).Take(take).Select(BuildRows.Item).ToList();

    private async Task<List<BuildRecord>> AllAsync(CancellationToken ct)
    {
        var result = new List<BuildRecord>();
        if (!Directory.Exists(_dir)) return result;
        foreach (var file in Directory.EnumerateFiles(_dir, "*.json"))
        {
            await using var s = File.OpenRead(file);
            var b = await JsonSerializer.DeserializeAsync<BuildRecord>(s, Json, ct);
            if (b is not null) result.Add(b);
        }
        return result;
    }

    public static string TitleOf(string html, string idea)
    {
        var m = TitleTag().Match(html);
        var t = m.Success ? System.Net.WebUtility.HtmlDecode(m.Groups[1].Value.Trim()) : "";
        return string.IsNullOrWhiteSpace(t) ? (idea.Length > 60 ? idea[..60] + "…" : idea) : t;
    }

    [GeneratedRegex("^[a-z0-9]{8,32}$")]
    private static partial Regex SafeId();

    [GeneratedRegex("<title>(.*?)</title>", RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex TitleTag();
}
