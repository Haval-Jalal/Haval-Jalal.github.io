using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;

namespace HavalApi.Functions;

// Live GitHub data for the "Haval OS" panel: latest repos + commits per week (last 12 weeks).
// Cached in memory so a burst of visitors never hits GitHub's rate limit.
public class GitHubFunction(IHttpClientFactory httpFactory, IMemoryCache cache, ILogger<GitHubFunction> log)
{
    private const string CacheKey = "github-activity";
    private static readonly TimeSpan CacheFor = TimeSpan.FromMinutes(15);

    [Function("GitHub")]
    public async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "github")] HttpRequest req,
        CancellationToken ct)
    {
        if (cache.TryGetValue(CacheKey, out GitHubActivity? cached) && cached is not null)
            return Ok(cached);

        var user = Environment.GetEnvironmentVariable("GITHUB_USER") ?? "Haval-Jalal";
        var http = httpFactory.CreateClient("github");

        try
        {
            var reposTask = http.GetFromJsonAsync<List<RepoDto>>($"users/{user}/repos?sort=pushed&per_page=12&type=owner", ct);
            var eventsTask = http.GetFromJsonAsync<List<EventDto>>($"users/{user}/events/public?per_page=100", ct);
            await Task.WhenAll(reposTask, eventsTask);

            var repos = (reposTask.Result ?? [])
                .Where(r => !r.Fork)
                .Select(r => new RepoSummary(r.Name, r.Description, r.HtmlUrl, r.Language, r.StargazersCount, r.PushedAt))
                .ToList();

            var activity = new GitHubActivity(
                user,
                repos,
                WeeklyCommits(eventsTask.Result ?? [], weeks: 12),
                DateTime.UtcNow);

            cache.Set(CacheKey, activity, CacheFor);
            return Ok(activity);
        }
        catch (HttpRequestException ex)
        {
            log.LogWarning(ex, "GitHub request failed");
            return new ObjectResult(new { error = "github_unavailable" }) { StatusCode = StatusCodes.Status502BadGateway };
        }
    }

    private static OkObjectResult Ok(GitHubActivity a) => new(a);

    // Public events cover ~90 days. Each PushEvent carries the number of commits in its payload.
    private static int[] WeeklyCommits(IEnumerable<EventDto> events, int weeks)
    {
        var counts = new int[weeks];
        var now = DateTime.UtcNow;
        foreach (var e in events)
        {
            if (e.Type != "PushEvent" || e.CreatedAt is null) continue;
            var age = now - e.CreatedAt.Value;
            var week = (int)Math.Floor(age.TotalDays / 7);
            if (week < 0 || week >= weeks) continue;
            counts[weeks - 1 - week] += e.Payload?.Size ?? 1;
        }
        return counts;
    }

    public record GitHubActivity(string User, List<RepoSummary> Repos, int[] WeeklyCommits, DateTime UpdatedAt)
    {
        public int Commits90d => WeeklyCommits.Sum();
    }

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

    private sealed class EventDto
    {
        [JsonPropertyName("type")] public string Type { get; set; } = "";
        [JsonPropertyName("created_at")] public DateTime? CreatedAt { get; set; }
        [JsonPropertyName("payload")] public PayloadDto? Payload { get; set; }
    }

    private sealed class PayloadDto
    {
        [JsonPropertyName("size")] public int? Size { get; set; }
    }
}
