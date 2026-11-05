using HavalApi.Data;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = FunctionsApplication.CreateBuilder(args);

builder.ConfigureFunctionsWebApplication();

builder.Services.AddMemoryCache();
builder.Services.AddHttpClient("github", client =>
{
    client.BaseAddress = new Uri("https://api.github.com/");
    client.DefaultRequestHeaders.UserAgent.ParseAdd("havaljalal.se (portfolio)");
    client.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
    client.DefaultRequestHeaders.Add("X-GitHub-Api-Version", "2022-11-28");

    // Optional token: raises the anonymous 60 req/h limit.
    var token = Environment.GetEnvironmentVariable("GITHUB_TOKEN");
    if (!string.IsNullOrWhiteSpace(token))
        client.DefaultRequestHeaders.Authorization = new("Bearer", token);
});

// Storage: JSON files under api/.data for local development. When COSMOS_CONNECTION is set
// (Azure), the Cosmos DB stores take over; they are added in the Azure step.
var dataDir = Environment.GetEnvironmentVariable("DATA_DIR")
              ?? Path.Combine(AppContext.BaseDirectory, "..", "..", ".data");
builder.Services.AddSingleton<IContentStore>(new JsonFileContentStore(dataDir));
builder.Services.AddSingleton<IAnalyticsStore>(new JsonFileAnalyticsStore(dataDir));

builder.Build().Run();
