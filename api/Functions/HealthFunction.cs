using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;

namespace HavalApi.Functions;

public class HealthFunction(HavalApi.Data.IContentStore content, HavalApi.Media.IMediaStore media)
{
    [Function("Health")]
    public IActionResult Run([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "health")] HttpRequest req)
        => new OkObjectResult(new
        {
            ok = true,
            utc = DateTime.UtcNow,
            runtime = Environment.Version.ToString(),
            store = content.GetType().Name.Replace("ContentStore", "").ToLowerInvariant(),
            media = media.GetType().Name.Replace("MediaStore", "").ToLowerInvariant(),
            ai = !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY")),
        });
}
