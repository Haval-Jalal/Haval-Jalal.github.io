using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;

namespace HavalApi.Functions;

public class HealthFunction(HavalApi.Data.IContentStore content)
{
    [Function("Health")]
    public IActionResult Run([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "health")] HttpRequest req)
        => new OkObjectResult(new
        {
            ok = true,
            utc = DateTime.UtcNow,
            runtime = Environment.Version.ToString(),
            store = content.GetType().Name.Replace("ContentStore", "").ToLowerInvariant(),
            ai = !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY")),
        });
}
