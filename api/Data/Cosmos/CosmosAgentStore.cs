using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Caching.Memory;

namespace HavalApi.Data.Cosmos;

// Container "agent": one config document (pk "config") and one document per unanswered
// question (pk "question"). The config is cached briefly so every chat does not read Cosmos.
public sealed class CosmosAgentStore(CosmosDb db, IMemoryCache cache) : IAgentStore
{
    private const string ConfigId = "config";
    private const string ConfigPk = "config";
    private const string QuestionPk = "question";
    private const string CacheKey = "agent:config";

    public async Task<AgentConfig> GetConfigAsync(CancellationToken ct)
    {
        if (cache.TryGetValue(CacheKey, out AgentConfig? cached) && cached is not null) return cached;
        var container = await db.ContainerAsync(CosmosDb.Agent);
        AgentConfig config;
        try
        {
            var response = await container.ReadItemAsync<CosmosDoc<AgentConfig>>(ConfigId, new PartitionKey(ConfigPk), cancellationToken: ct);
            config = response.Resource.Data;
        }
        catch (CosmosException e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            config = AgentConfig.Empty;
        }
        cache.Set(CacheKey, config, TimeSpan.FromSeconds(30));
        return config;
    }

    public async Task SaveConfigAsync(AgentConfig config, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Agent);
        await container.UpsertItemAsync(new CosmosDoc<AgentConfig>(ConfigId, ConfigPk, DateTime.UtcNow, config), new PartitionKey(ConfigPk), cancellationToken: ct);
        cache.Remove(CacheKey);
    }

    public async Task AddQuestionAsync(UnansweredQuestion question, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Agent);
        await container.UpsertItemAsync(new CosmosDoc<UnansweredQuestion>(question.Id, QuestionPk, question.Ts, question), new PartitionKey(QuestionPk), cancellationToken: ct);
    }

    public async Task<List<UnansweredQuestion>> ListQuestionsAsync(int take, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Agent);
        var cutoff = DateTime.UtcNow - IAgentStore.Retention;
        var query = new QueryDefinition("SELECT TOP @take * FROM c WHERE c.ts >= @cutoff ORDER BY c.ts DESC")
            .WithParameter("@take", take)
            .WithParameter("@cutoff", cutoff);
        var rows = await CosmosDb.QueryAsync<CosmosDoc<UnansweredQuestion>>(container, query, ct, QuestionPk);
        return rows.Select(r => r.Data).ToList();
    }

    public async Task<bool> DeleteQuestionAsync(string id, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Agent);
        try
        {
            await container.DeleteItemAsync<CosmosDoc<UnansweredQuestion>>(id, new PartitionKey(QuestionPk), cancellationToken: ct);
            return true;
        }
        catch (CosmosException e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return false;
        }
    }
}
