using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Azure.Cosmos;

namespace HavalApi.Data.Cosmos;

// Every document is stored in the same envelope so the stores stay tiny: id, partition key, a
// UTC timestamp for range queries and the payload as "data". Partition key per container:
//   content -> "site"        hits -> day (yyyy-MM-dd)    leads -> "lead"
//   usage   -> day           builds -> visitor id
public sealed record CosmosDoc<T>(string Id, string Pk, DateTime Ts, T Data);

// One client for the whole app. The database and containers are created on first use, so the
// only thing the Azure step must provide is the account (free tier, 1000 RU/s shared).
public sealed class CosmosDb : IDisposable
{
    public const string Content = "content";
    public const string Hits = "hits";
    public const string Leads = "leads";
    public const string Usage = "usage";
    public const string Builds = "builds";

    private readonly CosmosClient _client;
    private readonly string _databaseName;
    private readonly Lazy<Task<Database>> _database;
    private readonly ConcurrentDictionary<string, Lazy<Task<Container>>> _containers = new();

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public CosmosDb(string connectionString, string databaseName)
    {
        _databaseName = databaseName;
        _client = new CosmosClient(connectionString, new CosmosClientOptions
        {
            UseSystemTextJsonSerializerWithOptions = Json,
            ConnectionMode = ConnectionMode.Gateway, // outbound TCP port ranges are not open in managed functions
            ApplicationName = "havaljalal.se",
        });
        _database = new(CreateDatabaseAsync);
    }

    private async Task<Database> CreateDatabaseAsync()
    {
        // 1000 RU/s shared by all containers = exactly what the free tier covers.
        var response = await _client.CreateDatabaseIfNotExistsAsync(_databaseName, ThroughputProperties.CreateManualThroughput(1000));
        return response.Database;
    }

    public Task<Container> ContainerAsync(string name) =>
        _containers.GetOrAdd(name, n => new Lazy<Task<Container>>(() => CreateContainerAsync(n))).Value;

    private async Task<Container> CreateContainerAsync(string name)
    {
        var database = await _database.Value;
        var props = new ContainerProperties(name, "/pk");
        if (name == Hits) props.DefaultTimeToLive = 400 * 24 * 3600; // analytics rows expire after ~13 months
        var response = await database.CreateContainerIfNotExistsAsync(props);
        return response.Container;
    }

    public static string DayKey(DateTime ts) => ts.ToUniversalTime().ToString("yyyy-MM-dd");

    // Runs a query and returns every row; the stores only read bounded ranges (a month of rows at most).
    public static async Task<List<T>> QueryAsync<T>(Container container, QueryDefinition query, CancellationToken ct, string? partitionKey = null)
    {
        var options = partitionKey is null ? null : new QueryRequestOptions { PartitionKey = new PartitionKey(partitionKey) };
        var result = new List<T>();
        using var iterator = container.GetItemQueryIterator<T>(query, requestOptions: options);
        while (iterator.HasMoreResults)
        {
            foreach (var item in await iterator.ReadNextAsync(ct)) result.Add(item);
        }
        return result;
    }

    public void Dispose() => _client.Dispose();
}
