using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;

namespace HavalApi.Agent;

// The real, billed cost straight from Anthropic — the facit the token-estimate in AgentGuard/Pricing
// can only approximate. Read from the Admin Cost Report API (GET /v1/organizations/cost_report),
// which is curl-only: not exposed in the Anthropic SDK.
//
// Needs an Admin API key (sk-ant-admin...) in ANTHROPIC_ADMIN_KEY. That is a DIFFERENT credential
// from ANTHROPIC_API_KEY (which sends messages): admin keys are made in the Claude Console by an
// org admin and a plain/workspace key is rejected here. Without it, Configured is false and the
// admin simply keeps showing the estimate.
public sealed record ActualCost(
    bool Configured,
    decimal TotalUsd,
    decimal SpentMonthUsd,
    List<CostDay> PerDay,
    List<CostModel> ByModel,
    DateTime AsOf,
    string? Error = null);

public sealed record CostDay(string Day, decimal Usd);
public sealed record CostModel(string Model, decimal Usd);

public sealed class AnthropicCostService(IHttpClientFactory http, ILogger<AnthropicCostService> log)
{
    private static readonly string? AdminKey = Environment.GetEnvironmentVariable("ANTHROPIC_ADMIN_KEY");
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public bool Configured => !string.IsNullOrWhiteSpace(AdminKey);

    public async Task<ActualCost> GetAsync(int days, CancellationToken ct)
    {
        var today = DateTime.UtcNow.Date;
        var windowStart = today.AddDays(-(days - 1));
        var monthStart = new DateTime(today.Year, today.Month, 1, 0, 0, 0, DateTimeKind.Utc);

        if (!Configured)
            return new ActualCost(false, 0m, 0m, [], [], DateTime.UtcNow, "no_admin_key");

        // Cover whichever reaches further back — the requested window or this calendar month.
        var start = windowStart < monthStart ? windowStart : monthStart;
        var end = today.AddDays(1); // ending_at is exclusive; +1 day so today is included

        try
        {
            var buckets = await FetchBucketsAsync(start, end, ct);

            var windowKey = windowStart.ToString("yyyy-MM-dd");
            var monthKey = monthStart.ToString("yyyy-MM-dd");

            var perDay = Enumerable.Range(0, days)
                .Select(i => windowStart.AddDays(i).ToString("yyyy-MM-dd"))
                .Select(key => new CostDay(key, buckets.TryGetValue(key, out var b) ? b.Total : 0m))
                .ToList();

            var totalUsd = perDay.Sum(d => d.Usd);
            var spentMonthUsd = buckets
                .Where(kv => string.CompareOrdinal(kv.Key, monthKey) >= 0)
                .Sum(kv => kv.Value.Total);

            var byModel = buckets
                .Where(kv => string.CompareOrdinal(kv.Key, windowKey) >= 0)
                .SelectMany(kv => kv.Value.ByModel)
                .GroupBy(x => x.Key)
                .Select(g => new CostModel(g.Key, g.Sum(x => x.Value)))
                .Where(m => m.Usd > 0m)
                .OrderByDescending(m => m.Usd)
                .ToList();

            return new ActualCost(true, totalUsd, spentMonthUsd, perDay, byModel, DateTime.UtcNow);
        }
        catch (Exception ex)
        {
            log.LogWarning(ex, "Could not read the Anthropic cost report");
            return new ActualCost(true, 0m, 0m, [], [], DateTime.UtcNow, "fetch_failed");
        }
    }

    // One dollar amount per UTC day, plus a per-model split, aggregated across all pages.
    private async Task<Dictionary<string, Bucket>> FetchBucketsAsync(DateTime start, DateTime end, CancellationToken ct)
    {
        var client = http.CreateClient("anthropic-admin");
        var result = new Dictionary<string, Bucket>();
        string? page = null;

        // The cost report returns at most 31 daily buckets per page; page through for wider windows.
        for (var guard = 0; guard < 12; guard++)
        {
            var url = "v1/organizations/cost_report"
                + $"?starting_at={start:yyyy-MM-ddTHH:mm:ssZ}"
                + $"&ending_at={end:yyyy-MM-ddTHH:mm:ssZ}"
                + "&bucket_width=1d&limit=31&group_by[]=description";
            if (page is not null) url += $"&page={Uri.EscapeDataString(page)}";

            using var resp = await client.GetAsync(url, ct);
            if (!resp.IsSuccessStatusCode)
            {
                var body = await resp.Content.ReadAsStringAsync(ct);
                log.LogWarning("Cost report returned {Status}: {Body}", (int)resp.StatusCode, Trunc(body, 300));
                throw new HttpRequestException($"cost_report {(int)resp.StatusCode}");
            }

            var data = await resp.Content.ReadFromJsonAsync<CostReportResponse>(Json, ct);
            if (data?.Data is null) break;

            foreach (var bucket in data.Data)
            {
                var day = bucket.StartingAt is { Length: >= 10 } s ? s[..10] : bucket.StartingAt ?? "";
                if (day.Length == 0) continue;
                if (!result.TryGetValue(day, out var agg)) result[day] = agg = new Bucket();
                foreach (var r in bucket.Results ?? [])
                {
                    // amount is a decimal string in cents ("123.45" USD = $1.23).
                    if (!decimal.TryParse(r.Amount, NumberStyles.Float, CultureInfo.InvariantCulture, out var cents)) continue;
                    var usd = cents / 100m;
                    agg.Total += usd;
                    var model = string.IsNullOrEmpty(r.Model) ? "övrigt" : r.Model;
                    agg.ByModel[model] = agg.ByModel.GetValueOrDefault(model) + usd;
                }
            }

            if (!data.HasMore || string.IsNullOrEmpty(data.NextPage)) break;
            page = data.NextPage;
        }

        return result;
    }

    private static string Trunc(string s, int max) => s.Length <= max ? s : s[..max] + "…";

    private sealed class Bucket
    {
        public decimal Total;
        public Dictionary<string, decimal> ByModel { get; } = new();
    }

    private sealed record CostReportResponse(
        [property: JsonPropertyName("data")] List<CostBucket>? Data,
        [property: JsonPropertyName("has_more")] bool HasMore,
        [property: JsonPropertyName("next_page")] string? NextPage);

    private sealed record CostBucket(
        [property: JsonPropertyName("starting_at")] string? StartingAt,
        [property: JsonPropertyName("results")] List<CostResult>? Results);

    private sealed record CostResult(
        [property: JsonPropertyName("amount")] string? Amount,
        [property: JsonPropertyName("model")] string? Model);
}
