using HavalApi.Cv;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Caching.Memory;

namespace HavalApi.Data.Cosmos;

// Container "cv": one document per language ("cv-sv", "cv-en"), partition "cv".
public sealed class CosmosCvStore(CosmosDb db, IMemoryCache cache) : ICvStore
{
    private const string Pk = "cv";
    private static string Id(string lang) => $"cv-{CvLabels.Normalise(lang)}";
    private static string Key(string lang) => $"cv:{CvLabels.Normalise(lang)}";

    public async Task<CvModel?> GetAsync(string lang, CancellationToken ct)
    {
        if (cache.TryGetValue(Key(lang), out CvModel? cached)) return cached;
        var container = await db.ContainerAsync(CosmosDb.Cv);
        CvModel? model;
        try
        {
            var response = await container.ReadItemAsync<CosmosDoc<CvModel>>(Id(lang), new PartitionKey(Pk), cancellationToken: ct);
            model = response.Resource.Data;
        }
        catch (CosmosException e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            model = null;
        }
        cache.Set(Key(lang), model, TimeSpan.FromSeconds(60));
        return model;
    }

    public async Task SaveAsync(CvModel model, string lang, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Cv);
        await container.UpsertItemAsync(new CosmosDoc<CvModel>(Id(lang), Pk, DateTime.UtcNow, model), new PartitionKey(Pk), cancellationToken: ct);
        cache.Remove(Key(lang));
    }

    public async Task<bool> DeleteAsync(string lang, CancellationToken ct)
    {
        var container = await db.ContainerAsync(CosmosDb.Cv);
        cache.Remove(Key(lang));
        try
        {
            await container.DeleteItemAsync<CosmosDoc<CvModel>>(Id(lang), new PartitionKey(Pk), cancellationToken: ct);
            return true;
        }
        catch (CosmosException e) when (e.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return false;
        }
    }
}
