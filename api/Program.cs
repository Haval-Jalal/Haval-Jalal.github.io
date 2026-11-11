using Anthropic;
using HavalApi.Agent;
using HavalApi.Auth;
using HavalApi.Data;
using HavalApi.Data.Cosmos;
using HavalApi.Mail;
using HavalApi.Media;
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
    builder.Services.AddSingleton<IPitchStore, CosmosPitchStore>();
    builder.Services.AddSingleton<IBookingStore, CosmosBookingStore>();
    builder.Services.AddSingleton<IPostStore, CosmosPostStore>();
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
    builder.Services.AddSingleton<IPitchStore>(new JsonFilePitchStore(dataDir));
    builder.Services.AddSingleton<IBookingStore>(new JsonFileBookingStore(dataDir));
    builder.Services.AddSingleton<IPostStore>(new JsonFilePostStore(dataDir));
}

// Uploads: Blob Storage when MEDIA_CONNECTION is set (Azure), otherwise api/.data/media.
var mediaConnection = Environment.GetEnvironmentVariable("MEDIA_CONNECTION");
if (!string.IsNullOrWhiteSpace(mediaConnection))
    builder.Services.AddSingleton<IMediaStore>(new BlobMediaStore(mediaConnection));
else
    builder.Services.AddSingleton<IMediaStore>(new LocalMediaStore(
        Environment.GetEnvironmentVariable("DATA_DIR") ?? Path.Combine(AppContext.BaseDirectory, "..", "..", ".data")));

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

// Real billed cost from Anthropic's Admin Cost Report API (curl-only, not in the SDK). Needs an
// Admin API key (sk-ant-admin...) in ANTHROPIC_ADMIN_KEY — a different credential from the message
// key above. Without it, AnthropicCostService reports Configured=false and the admin keeps the estimate.
builder.Services.AddHttpClient("anthropic-admin", client =>
{
    client.BaseAddress = new Uri("https://api.anthropic.com/");
    client.DefaultRequestHeaders.Add("anthropic-version", "2026-10-21");
    client.DefaultRequestHeaders.UserAgent.ParseAdd("havaljalal.se-admin/1.0");
    var adminKey = Environment.GetEnvironmentVariable("ANTHROPIC_ADMIN_KEY");
    if (!string.IsNullOrWhiteSpace(adminKey))
        client.DefaultRequestHeaders.Add("x-api-key", adminKey);
});
builder.Services.AddSingleton<AnthropicCostService>();

builder.Build().Run();
