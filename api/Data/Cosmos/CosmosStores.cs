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

    // Translations live next to the master document as "site-en" etc.
    public async Task<SiteContent?> GetAsync(string lang, CancellationToken ct)
    {
        if (lang == "sv") return await GetAsync(ct);
        var key = $"content:site-{lang}";
        if (cache.TryGetValue(key, out SiteContent? cached) && cached is not null) return cached;
        var container = await db.ContainerAsync(CosmosDb.Content);
        try
        {
            var response = await container.ReadItemAsync<CosmosDoc<SiteContent>>($"site-{lang}", new PartitionKey(Id), cancellationToken: ct);
            cache.Set(key, response.Resource.Data, TimeSpan.FromSeconds(30));
            return response.Resource.Data;
        }
        catch (CosmosException e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task SaveAsync(SiteContent content, string lang, CancellationToken ct)
    {
        if (lang == "sv") { await SaveAsync(content, ct); return; }
        var container = await db.ContainerAsync(CosmosDb.Content);
        await container.UpsertItemAsync(new CosmosDoc<SiteContent>($"site-{lang}", Id, DateTime.UtcNow, content), new PartitionKey(Id), cancellationToken: ct);
        cache.Remove($"content:site-{lang}");
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

    public async Task<List<BuildAdminRow>> ListRecentAsync(int take, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Builds);
        var query = new QueryDefinition(
                "SELECT TOP @take c.id, c.ts, c.data.idea AS idea, c.data.title AS title, c.data.model AS model, c.data.truncated AS truncated, c.data.contact AS contact, c.data.featured AS featured FROM c ORDER BY c.ts DESC")
            .WithParameter("@take", take);
        var rows = await CosmosDb.QueryAsync<AdminRowDoc>(container, query, ct);
        return rows.Select(r => new BuildAdminRow(r.Id, r.Ts, r.Idea, r.Title, r.Model ?? "", r.Truncated, r.Contact is not null, r.Contact?.Name, r.Featured)).ToList();
    }

    public async Task<List<GalleryItem>> ListFeaturedAsync(int take, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Builds);
        var query = new QueryDefinition("SELECT TOP @take * FROM c WHERE c.data.featured = true ORDER BY c.ts DESC").WithParameter("@take", take);
        var rows = await CosmosDb.QueryAsync<CosmosDoc<BuildRecord>>(container, query, ct);
        return rows.Select(r => BuildRows.Item(r.Data)).ToList();
    }

    private sealed record AdminRowDoc(string Id, DateTime Ts, string Idea, string Title, string? Model, bool Truncated, BuildContact? Contact, bool Featured);
}

public sealed class CosmosSecurityStore(CosmosDb db) : ISecurityStore
{
    private const string AttemptPk = "attempt";
    private const string BanPk = "ban";

    public async Task AppendAsync(AuthAttempt attempt, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Security);
        await container.CreateItemAsync(new CosmosDoc<AuthAttempt>(attempt.Id, AttemptPk, attempt.Ts, attempt), new PartitionKey(AttemptPk), cancellationToken: ct);
    }

    public async Task<List<AuthAttempt>> AttemptsAsync(int take, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Security);
        var query = new QueryDefinition("SELECT TOP @take * FROM c ORDER BY c.ts DESC").WithParameter("@take", take);
        var rows = await CosmosDb.QueryAsync<CosmosDoc<AuthAttempt>>(container, query, ct, AttemptPk);
        return rows.Select(r => r.Data).ToList();
    }

    public async Task<List<Ban>> BansAsync(CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Security);
        var rows = await CosmosDb.QueryAsync<CosmosDoc<Ban>>(container, new QueryDefinition("SELECT * FROM c"), ct, BanPk);
        return rows.Select(r => r.Data).ToList();
    }

    public async Task BanAsync(Ban ban, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Security);
        await container.UpsertItemAsync(new CosmosDoc<Ban>(BanId(ban.UserId), BanPk, ban.Ts, ban), new PartitionKey(BanPk), cancellationToken: ct);
    }

    public async Task UnbanAsync(string userId, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Security);
        try
        {
            await container.DeleteItemAsync<CosmosDoc<Ban>>(BanId(userId), new PartitionKey(BanPk), cancellationToken: ct);
        }
        catch (CosmosException e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
        }
    }

    // Cosmos ids may not contain / \ ? #; identity provider ids are opaque strings, so hash them.
    private static string BanId(string userId) =>
        "ban-" + Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(userId)))[..24].ToLowerInvariant();
}

public sealed class CosmosPitchStore(CosmosDb db) : IPitchStore
{
    private const string Pk = "pitch";

    public async Task SaveAsync(Pitch pitch, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Pitches);
        await container.UpsertItemAsync(new CosmosDoc<Pitch>(pitch.Slug, Pk, pitch.UpdatedAt, pitch), new PartitionKey(Pk), cancellationToken: ct);
    }

    public async Task<Pitch?> GetAsync(string slug, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Pitches);
        try
        {
            var response = await container.ReadItemAsync<CosmosDoc<Pitch>>(slug, new PartitionKey(Pk), cancellationToken: ct);
            return response.Resource.Data;
        }
        catch (CosmosException e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task<List<Pitch>> ListAsync(CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Pitches);
        var rows = await CosmosDb.QueryAsync<CosmosDoc<Pitch>>(container, new QueryDefinition("SELECT * FROM c ORDER BY c.ts DESC"), ct, Pk);
        return rows.Select(r => r.Data).ToList();
    }

    public async Task<bool> DeleteAsync(string slug, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Pitches);
        try
        {
            await container.DeleteItemAsync<CosmosDoc<Pitch>>(slug, new PartitionKey(Pk), cancellationToken: ct);
            return true;
        }
        catch (CosmosException e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    public async Task RecordEventAsync(string slug, string kind, string visitor, CancellationToken ct)
    {
        var pitch = await GetAsync(slug, ct);
        if (pitch is null) return;
        await SaveAsync(pitch with { Stats = pitch.Stats.With(kind, visitor, DateTime.UtcNow) }, ct);
    }
}

public sealed class CosmosBookingStore(CosmosDb db) : IBookingStore
{
    private const string SettingsPk = "settings";
    private const string BookingPk = "booking";

    public async Task<BookingSettings> GetSettingsAsync(CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Bookings);
        try
        {
            var r = await container.ReadItemAsync<CosmosDoc<BookingSettings>>("settings", new PartitionKey(SettingsPk), cancellationToken: ct);
            return r.Resource.Data;
        }
        catch (CosmosException e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return BookingSettings.Default;
        }
    }

    public async Task SaveSettingsAsync(BookingSettings settings, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Bookings);
        await container.UpsertItemAsync(new CosmosDoc<BookingSettings>("settings", SettingsPk, DateTime.UtcNow, settings), new PartitionKey(SettingsPk), cancellationToken: ct);
    }

    public async Task<List<Booking>> ListAsync(DateTime fromUtc, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Bookings);
        var query = new QueryDefinition("SELECT * FROM c WHERE c.data.start >= @from ORDER BY c.data.start ASC").WithParameter("@from", fromUtc);
        var rows = await CosmosDb.QueryAsync<CosmosDoc<Booking>>(container, query, ct, BookingPk);
        return rows.Select(r => r.Data).ToList();
    }

    public async Task<Booking?> GetAsync(string id, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Bookings);
        try
        {
            var r = await container.ReadItemAsync<CosmosDoc<Booking>>(id, new PartitionKey(BookingPk), cancellationToken: ct);
            return r.Resource.Data;
        }
        catch (CosmosException e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task SaveAsync(Booking booking, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Bookings);
        await container.UpsertItemAsync(new CosmosDoc<Booking>(booking.Id, BookingPk, booking.Ts, booking), new PartitionKey(BookingPk), cancellationToken: ct);
    }
}

// Changelog entries (pk "changelog") and the Nu page per language (pk "now", id "now-{lang}").
public sealed class CosmosPostStore(CosmosDb db) : IPostStore
{
    private const string ChangelogPk = "changelog";
    private const string NowPk = "now";

    public async Task<List<ChangelogEntry>> ListChangelogAsync(bool publishedOnly, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Posts);
        var rows = await CosmosDb.QueryAsync<CosmosDoc<ChangelogEntry>>(container, new QueryDefinition("SELECT * FROM c ORDER BY c.ts DESC"), ct, ChangelogPk);
        return rows.Select(r => r.Data).Where(e => !publishedOnly || e.Published).OrderByDescending(e => e.Date).ThenByDescending(e => e.Ts).ToList();
    }

    public async Task SaveChangelogAsync(ChangelogEntry entry, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Posts);
        await container.UpsertItemAsync(new CosmosDoc<ChangelogEntry>(entry.Id, ChangelogPk, entry.Ts, entry), new PartitionKey(ChangelogPk), cancellationToken: ct);
    }

    public async Task<bool> DeleteChangelogAsync(string id, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Posts);
        try
        {
            await container.DeleteItemAsync<CosmosDoc<ChangelogEntry>>(id, new PartitionKey(ChangelogPk), cancellationToken: ct);
            return true;
        }
        catch (CosmosException e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    public async Task<NowPage?> GetNowAsync(string lang, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Posts);
        try
        {
            var response = await container.ReadItemAsync<CosmosDoc<NowPage>>($"now-{lang}", new PartitionKey(NowPk), cancellationToken: ct);
            return response.Resource.Data;
        }
        catch (CosmosException e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task SaveNowAsync(NowPage now, string lang, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Posts);
        await container.UpsertItemAsync(new CosmosDoc<NowPage>($"now-{lang}", NowPk, now.UpdatedAt, now), new PartitionKey(NowPk), cancellationToken: ct);
    }
}
