using Anthropic;
using HavalApi.Agent;
using HavalApi.Auth;
using HavalApi.Data;
using HavalApi.Data.Cosmos;
using HavalApi.Mail;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

// QuestPDF is free under the Community licence (revenue < 1M USD).
QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;

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

// Storage: Cosmos DB when COSMOS_CONNECTION is set (Azure), otherwise JSON files under api/.data
// for local development. Both implement the same store interfaces.
var cosmosConnection = Environment.GetEnvironmentVariable("COSMOS_CONNECTION");
if (!string.IsNullOrWhiteSpace(cosmosConnection))
{
    builder.Services.AddSingleton(new CosmosDb(cosmosConnection, Environment.GetEnvironmentVariable("COSMOS_DATABASE") ?? "haval"));
    builder.Services.AddSingleton<IContentStore, CosmosContentStore>();
    builder.Services.AddSingleton<IAnalyticsStore, CosmosAnalyticsStore>();
    builder.Services.AddSingleton<ILeadStore, CosmosLeadStore>();
    builder.Services.AddSingleton<IUsageStore, CosmosUsageStore>();
    builder.Services.AddSingleton<IBuildStore, CosmosBuildStore>();
    builder.Services.AddSingleton<ISecurityStore, CosmosSecurityStore>();
}
else
{
    var dataDir = Environment.GetEnvironmentVariable("DATA_DIR")
                  ?? Path.Combine(AppContext.BaseDirectory, "..", "..", ".data");
    builder.Services.AddSingleton<IContentStore>(new JsonFileContentStore(dataDir));
    builder.Services.AddSingleton<IAnalyticsStore>(new JsonFileAnalyticsStore(dataDir));
    builder.Services.AddSingleton<ILeadStore>(new JsonFileLeadStore(dataDir));
    builder.Services.AddSingleton<IUsageStore>(new JsonFileUsageStore(dataDir));
    builder.Services.AddSingleton<IBuildStore>(new JsonFileBuildStore(dataDir));
    builder.Services.AddSingleton<ISecurityStore>(new JsonFileSecurityStore(dataDir));
}

// Lead notifications by e-mail (Resend). Logs instead of sending until RESEND_API_KEY + LEAD_NOTIFY_EMAIL exist.
builder.Services.AddHttpClient("resend", client =>
{
    client.BaseAddress = new Uri("https://api.resend.com/");
    var key = Environment.GetEnvironmentVariable("RESEND_API_KEY");
    if (!string.IsNullOrWhiteSpace(key))
        client.DefaultRequestHeaders.Authorization = new("Bearer", key);
});
builder.Services.AddSingleton<IMailer, ResendMailer>();

// AI features. AnthropicClient reads ANTHROPIC_API_KEY from the environment (local.settings.json
// locally, app settings in Azure); AgentFunction answers 503 when it is missing.
builder.Services.AddSingleton(new AnthropicClient());
builder.Services.AddSingleton<AdminGate>();
builder.Services.AddSingleton<AgentGuard>();
builder.Services.AddSingleton<AgentService>();

builder.Build().Run();
