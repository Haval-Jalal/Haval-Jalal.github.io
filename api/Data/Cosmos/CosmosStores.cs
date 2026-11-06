using System.Text.Json;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Caching.Memory;

namespace HavalApi.Data.Cosmos;

public sealed class CosmosContentStore(CosmosDb db, IMemoryCache cache) : IContentStore
{
    private const string Id = "site";
    private const string CacheKey = "content:site";
    private readonly string _seed = Path.Combine(AppContext.BaseDirectory, "Data", "seed.json");

    public async Task<SiteContent> GetAsync(CancellationToken ct)
    {
        if (cache.TryGetValue(CacheKey, out SiteContent? cached) && cached is not null) return cached;
        var container = await db.ContainerAsync(CosmosDb.Content);
        SiteContent content;
        try
        {
            var response = await container.ReadItemAsync<CosmosDoc<SiteContent>>(Id, new PartitionKey(Id), cancellationToken: ct);
            content = response.Resource.Data;
        }
        catch (CosmosException e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            // First run in a fresh account: seed from the bundled content so the site is never empty.
            await using var stream = File.OpenRead(_seed);
            content = await JsonSerializer.DeserializeAsync<SiteContent>(stream, JsonFileContentStore.Json, ct)
                      ?? throw new InvalidOperationException("Could not read seed.json");
            await SaveAsync(content, ct);
        }
        cache.Set(CacheKey, content, TimeSpan.FromSeconds(30));
        return content;
    }

    public async Task SaveAsync(SiteContent content, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Content);
        await container.UpsertItemAsync(new CosmosDoc<SiteContent>(Id, Id, DateTime.UtcNow, content), new PartitionKey(Id), cancellationToken: ct);
        cache.Remove(CacheKey);
    }
}

public sealed class CosmosAnalyticsStore(CosmosDb db) : IAnalyticsStore
{
    public async Task AppendAsync(Hit hit, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Hits);
        var doc = new CosmosDoc<Hit>(Guid.NewGuid().ToString("n"), CosmosDb.DayKey(hit.Ts), hit.Ts, hit);
        await container.CreateItemAsync(doc, new PartitionKey(doc.Pk), cancellationToken: ct);
    }

    public async Task<AnalyticsSummary> SummaryAsync(int days, CancellationToken ct)
    {
        var since = DateTime.UtcNow.Date.AddDays(-(days - 1));
        var container = await db.ContainerAsync(CosmosDb.Hits);
        var query = new QueryDefinition("SELECT * FROM c WHERE c.ts >= @since").WithParameter("@since", since);
        var rows = await CosmosDb.QueryAsync<CosmosDoc<Hit>>(container, query, ct);
        return JsonFileAnalyticsStore.Summarise(rows.Select(r => r.Data).ToList(), days, since);
    }
}

public sealed class CosmosLeadStore(CosmosDb db) : ILeadStore
{
    private const string Pk = "lead";

    public async Task AddAsync(Lead lead, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Leads);
        await container.UpsertItemAsync(new CosmosDoc<Lead>(lead.Id, Pk, lead.Ts, lead), new PartitionKey(Pk), cancellationToken: ct);
    }

    public async Task<List<Lead>> ListAsync(int take, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Leads);
        var query = new QueryDefinition("SELECT TOP @take * FROM c ORDER BY c.ts DESC").WithParameter("@take", take);
        var rows = await CosmosDb.QueryAsync<CosmosDoc<Lead>>(container, query, ct, Pk);
        return rows.Select(r => r.Data).ToList();
    }
}

public sealed class CosmosUsageStore(CosmosDb db) : IUsageStore
{
    public async Task AppendAsync(UsageRecord record, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Usage);
        var doc = new CosmosDoc<UsageRecord>(Guid.NewGuid().ToString("n"), CosmosDb.DayKey(record.Ts), record.Ts, record);
        await container.CreateItemAsync(doc, new PartitionKey(doc.Pk), cancellationToken: ct);
    }

    public async Task<decimal> SpentTodayUsdAsync(CancellationToken ct)
    {
        var rows = await ReadSinceAsync(DateTime.UtcNow.Date, ct, CosmosDb.DayKey(DateTime.UtcNow));
        return rows.Sum(r => r.Usd);
    }

    public async Task<decimal> SpentMonthUsdAsync(CancellationToken ct)
    {
        var rows = await ReadSinceAsync(FirstOfMonth(), ct);
        return rows.Sum(r => r.Usd);
    }

    public async Task<UsageSummary> SummaryAsync(int days, Budget budget, CancellationToken ct)
    {
        var since = DateTime.UtcNow.Date.AddDays(-(days - 1));
        var first = FirstOfMonth();
        var rows = await ReadSinceAsync(since < first ? since : first, ct);
        return JsonFileUsageStore.Summarise(rows, days, since, budget);
    }

    private static DateTime FirstOfMonth() =>
        new(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc);

    private async Task<List<UsageRecord>> ReadSinceAsync(DateTime since, CancellationToken ct, string? partitionKey = null)
    {
        var container = await db.ContainerAsync(CosmosDb.Usage);
        var query = new QueryDefinition("SELECT * FROM c WHERE c.ts >= @since").WithParameter("@since", since);
        var rows = await CosmosDb.QueryAsync<CosmosDoc<UsageRecord>>(container, query, ct, partitionKey);
        return rows.Select(r => r.Data).ToList();
    }
}

public sealed class CosmosBuildStore(CosmosDb db) : IBuildStore
{
    private sealed record Row(string Id, DateTime Ts, string Idea, string Title, BuildContact? Contact);

    public async Task SaveAsync(BuildRecord build, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Builds);
        await container.UpsertItemAsync(new CosmosDoc<BuildRecord>(build.Id, build.VisitorId, build.Ts, build), new PartitionKey(build.VisitorId), cancellationToken: ct);
    }

    public async Task<BuildRecord?> GetAsync(string id, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Builds);
        var query = new QueryDefinition("SELECT TOP 1 * FROM c WHERE c.id = @id").WithParameter("@id", id);
        var rows = await CosmosDb.QueryAsync<CosmosDoc<BuildRecord>>(container, query, ct);
        return rows.FirstOrDefault()?.Data;
    }

    public async Task<List<BuildSummary>> ListByVisitorAsync(string visitorId, int take, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Builds);
        var query = new QueryDefinition(
                "SELECT TOP @take c.id, c.ts, c.data.idea AS idea, c.data.title AS title, c.data.contact AS contact FROM c WHERE c.pk = @visitor ORDER BY c.ts DESC")
            .WithParameter("@take", take)
            .WithParameter("@visitor", visitorId);
        var rows = await CosmosDb.QueryAsync<Row>(container, query, ct, visitorId);
        return rows.Select(r => new BuildSummary(r.Id, r.Ts, r.Idea, r.Title, r.Contact is not null)).ToList();
    }
}
