using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;

namespace HavalApi.Functions;

// Live GitHub data for the "Haval OS" panel: a contribution calendar (the green profile graph),
// the latest public repos and the latest public commit.
//
// With GITHUB_TOKEN set, the GraphQL API gives the same numbers as Haval's profile, private
// repos included as counts only (never names). Without a token the public REST API is used: it
// only sees public repos and roughly the last 90 days, so the numbers are marked "public".
// Cached in memory so a burst of visitors never hits GitHub's rate limit.
public class GitHubFunction(IHttpClientFactory httpFactory, IMemoryCache cache, ILogger<GitHubFunction> log)
{
    private const string CacheKey = "github-activity";
    private static readonly TimeSpan CacheFor = TimeSpan.FromMinutes(15);
    private const int CalendarWeeks = 52;

    [Function("GitHub")]
    public async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "github")] HttpRequest req,
        CancellationToken ct)
    {
        if (cache.TryGetValue(CacheKey, out GitHubActivity? cached) && cached is not null)
            return new OkObjectResult(cached);

        var user = Environment.GetEnvironmentVariable("GITHUB_USER") ?? "Haval-Jalal";
        var http = httpFactory.CreateClient("github");

        GitHubActivity? activity = null;
        if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("GITHUB_TOKEN")))
        {
            try { activity = await FromGraphQlAsync(http, user, ct); }
            catch (Exception e) when (e is HttpRequestException or JsonException or InvalidOperationException)
            {
                log.LogWarning(e, "GitHub GraphQL failed, falling back to public data");
            }
        }

        if (activity is null)
        {
            try { activity = await FromPublicAsync(http, user, ct); }
            catch (HttpRequestException ex)
            {
                log.LogWarning(ex, "GitHub request failed");
                return new ObjectResult(new { error = "github_unavailable" }) { StatusCode = StatusCodes.Status502BadGateway };
            }
        }

        cache.Set(CacheKey, activity, CacheFor);
        return new OkObjectResult(activity);
    }

    // ---- GraphQL: full calendar, private repos counted ----
    private const string Query =
        "query($login: String!) { user(login: $login) { " +
        "contributionsCollection { totalCommitContributions contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } } } " +
        "repositories(first: 12, orderBy: {field: PUSHED_AT, direction: DESC}, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) { nodes { " +
        "name description url pushedAt stargazerCount primaryLanguage { name } " +
        "defaultBranchRef { target { ... on Commit { history(first: 1) { nodes { messageHeadline committedDate url } } } } } " +
        "} } } }";

    private static async Task<GitHubActivity> FromGraphQlAsync(HttpClient http, string user, CancellationToken ct)
    {
        using var res = await http.PostAsJsonAsync("graphql", new { query = Query, variables = new { login = user } }, ct);
        res.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
        if (doc.RootElement.TryGetProperty("errors", out var errors))
        {
            var text = errors.ToString();
            throw new InvalidOperationException("GraphQL: " + text[..Math.Min(200, text.Length)]);
        }
        var u = doc.RootElement.GetProperty("data").GetProperty("user");
        var cc = u.GetProperty("contributionsCollection");
        var cal = cc.GetProperty("contributionCalendar");

        var days = new List<DayCount>();
        foreach (var week in cal.GetProperty("weeks").EnumerateArray())
            foreach (var d in week.GetProperty("contributionDays").EnumerateArray())
                days.Add(new DayCount(d.GetProperty("date").GetString() ?? "", d.GetProperty("contributionCount").GetInt32()));

        var repos = new List<RepoSummary>();
        LatestCommit? latest = null;
        foreach (var r in u.GetProperty("repositories").GetProperty("nodes").EnumerateArray())
        {
            var name = r.GetProperty("name").GetString() ?? "";
            repos.Add(new RepoSummary(
                name,
                r.GetProperty("description").GetString(),
                r.GetProperty("url").GetString() ?? "",
                r.TryGetProperty("primaryLanguage", out var pl) && pl.ValueKind == JsonValueKind.Object ? pl.GetProperty("name").GetString() : null,
                r.GetProperty("stargazerCount").GetInt32(),
                r.GetProperty("pushedAt").GetDateTime()));
            if (latest is null
                && r.TryGetProperty("defaultBranchRef", out var br) && br.ValueKind == JsonValueKind.Object
                && br.GetProperty("target").TryGetProperty("history", out var h))
            {
                foreach (var c in h.GetProperty("nodes").EnumerateArray())
                {
                    latest = new LatestCommit(name, c.GetProperty("messageHeadline").GetString() ?? "", c.GetProperty("url").GetString() ?? "", c.GetProperty("committedDate").GetDateTime());
                    break;
                }
            }
        }

        return new GitHubActivity(
            user,
            "graphql",
            repos,
            new Contributions(cal.GetProperty("totalContributions").GetInt32(), cc.GetProperty("totalCommitContributions").GetInt32(), days),
            latest,
            DateTime.UtcNow);
    }

    // ---- REST fallback: public repos; commits of the last 90 days read per repo ----
    // (The public event stream no longer carries commit lists, so it cannot be used for counts.)
    private static async Task<GitHubActivity> FromPublicAsync(HttpClient http, string user, CancellationToken ct)
    {
        var repoDtos = await http.GetFromJsonAsync<List<RepoDto>>($"users/{user}/repos?sort=pushed&per_page=12&type=owner", ct) ?? [];
        var repos = repoDtos
            .Where(r => !r.Fork)
            .Select(r => new RepoSummary(r.Name, r.Description, r.HtmlUrl, r.Language, r.StargazersCount, r.PushedAt))
            .ToList();

        var today = DateTime.UtcNow.Date;
        var since = today.AddDays(-90);
        var start = today.AddDays(-(CalendarWeeks * 7 - 1));
        var perDay = new Dictionary<DateTime, int>();
        LatestCommit? latest = null;

        var recent = repos.Where(r => r.PushedAt >= since).Take(6).ToList();
        var lists = await Task.WhenAll(recent.Select(r =>
            http.GetFromJsonAsync<List<CommitListDto>>($"repos/{user}/{r.Name}/commits?author={user}&since={since:yyyy-MM-dd}T00:00:00Z&per_page=100", ct)));
        foreach (var (repo, commits) in recent.Zip(lists))
        {
            foreach (var c in commits ?? [])
            {
                var at = c.Commit?.Author?.Date;
                if (at is null) continue;
                var day = at.Value.Date;
                perDay[day] = perDay.GetValueOrDefault(day) + 1;
                if (latest is null || at > latest.At)
                    latest = new LatestCommit(repo.Name, FirstLine(c.Commit?.Message), c.HtmlUrl, at.Value);
            }
        }

        var days = new List<DayCount>();
        for (var d = start; d <= today; d = d.AddDays(1))
            days.Add(new DayCount(d.ToString("yyyy-MM-dd"), perDay.GetValueOrDefault(d)));
        var total = perDay.Values.Sum();

        return new GitHubActivity(user, "public", repos, new Contributions(total, total, days), latest, DateTime.UtcNow);
    }

    private static string FirstLine(string? message)
    {
        var m = message ?? "";
        var i = m.IndexOfAny(['\r', '\n']);
        return i < 0 ? m : m[..i];
    }

    public record GitHubActivity(string User, string Source, List<RepoSummary> Repos, Contributions Contributions, LatestCommit? LatestCommit, DateTime UpdatedAt);
    public record Contributions(int Total, int Commits, List<DayCount> Calendar);
    public record DayCount(string Date, int Count);
    public record LatestCommit(string Repo, string Message, string Url, DateTime At);
    public record RepoSummary(string Name, string? Description, string Url, string? Language, int Stars, DateTime? PushedAt);

    private sealed class RepoDto
    {
        [JsonPropertyName("name")] public string Name { get; set; } = "";
        [JsonPropertyName("description")] public string? Description { get; set; }
        [JsonPropertyName("html_url")] public string HtmlUrl { get; set; } = "";
        [JsonPropertyName("language")] public string? Language { get; set; }
        [JsonPropertyName("stargazers_count")] public int StargazersCount { get; set; }
        [JsonPropertyName("pushed_at")] public DateTime? PushedAt { get; set; }
        [JsonPropertyName("fork")] public bool Fork { get; set; }
    }

    private sealed class CommitListDto
    {
        [JsonPropertyName("html_url")] public string HtmlUrl { get; set; } = "";
        [JsonPropertyName("commit")] public CommitDetailDto? Commit { get; set; }
    }

    private sealed class CommitDetailDto
    {
        [JsonPropertyName("message")] public string Message { get; set; } = "";
        [JsonPropertyName("author")] public CommitAuthorDto? Author { get; set; }
    }

    private sealed class CommitAuthorDto
    {
        [JsonPropertyName("date")] public DateTime? Date { get; set; }
    }
}
