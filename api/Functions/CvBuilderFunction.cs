using System.Text.Json;
using Anthropic;
using Anthropic.Exceptions;
using Anthropic.Models.Messages;
using HavalApi.Agent;
using HavalApi.Cv;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using QuestPDF.Fluent;

namespace HavalApi.Functions;

// Visitor CV builder: the same PDF design as Haval's own CV, filled from a form. Optional AI pass
// (Sonnet) tightens the wording. No account, nothing stored server-side.
public class CvBuilderFunction(AnthropicClient client, AgentGuard guard, ILogger<CvBuilderFunction> log)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    [Function("CvBuild")]
    public async Task<IActionResult> Build(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "cv/build")] HttpRequest req,
        CancellationToken ct)
    {
        if (!guard.TryTake("cvbuild", ClientIp(req), 30, TimeSpan.FromHours(1)))
            return new ObjectResult(new { error = "rate_limited" }) { StatusCode = StatusCodes.Status429TooManyRequests };

        var model = await ReadModelAsync(req, ct);
        if (model is null) return new BadRequestObjectResult(new { error = "invalid_cv" });
        model = model with { Labels = CvLabels.For(req.Query["lang"]) };

        var bytes = new CvDocument(model).GeneratePdf();
        var inline = req.Query["download"].ToString() != "1";
        var name = $"{model.Name.Replace(' ', '-')}-CV.pdf";
        req.HttpContext.Response.Headers.ContentDisposition = $"{(inline ? "inline" : "attachment")}; filename=\"{name}\"";
        req.HttpContext.Response.Headers.CacheControl = "no-store";
        return new FileContentResult(bytes, "application/pdf");
    }

    // Rewrites summary, experience texts/bullets and project summaries: tighter, concrete, same facts.
    [Function("CvPolish")]
    public async Task<IActionResult> Polish(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "cv/polish")] HttpRequest req,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY")))
            return new ObjectResult(new { error = "not_configured" }) { StatusCode = StatusCodes.Status503ServiceUnavailable };
        if (await guard.ModeAsync(ct) == BudgetMode.Stopped)
            return new ObjectResult(new { error = "daily_cap" }) { StatusCode = StatusCodes.Status503ServiceUnavailable };
        if (!guard.TryTake("cvpolish", ClientIp(req), 5, TimeSpan.FromHours(1)))
            return new ObjectResult(new { error = "rate_limited" }) { StatusCode = StatusCodes.Status429TooManyRequests };

        var model = await ReadModelAsync(req, ct);
        if (model is null) return new BadRequestObjectResult(new { error = "invalid_cv" });

        var input = JsonSerializer.Serialize(new { model.Summary, model.Experience, model.Projects }, Json);
        const string system = """
            Du är en erfaren svensk rekryterare och skribent. Du får delar av ett CV som JSON (summary, experience,
            projects). Skriv om texterna så de blir tydliga, konkreta och professionella: aktiva verb, mätbara
            resultat där de redan finns, inga floskler, inga påhittade fakta, inga nya arbetsgivare eller siffror.
            Behåll språket (svenska om texten är på svenska). Behåll exakt samma struktur, fältnamn, antal poster
            och ordning. Svara ENBART med JSON i samma form som indata, inget annat.
            """;

        using var _ = guard.TrackCall();
        try
        {
            var response = await client.Messages.Create(new MessageCreateParams
            {
                Model = AgentService.ChatModel,
                MaxTokens = 4000,
                OutputConfig = new OutputConfig { Effort = Effort.Low },
                System = new List<TextBlockParam> { new() { Text = system, CacheControl = new CacheControlEphemeral() } },
                Messages = [new UserMessageParam { Content = input }],
            }, cancellationToken: ct);

            await guard.RecordAsync("cvpolish", AgentService.ChatModel, response.Usage.InputTokens, response.Usage.OutputTokens,
                response.Usage.CacheReadInputTokens ?? 0, response.Usage.CacheCreationInputTokens ?? 0, response.StopReason == "max_tokens", ct);

            if (response.StopReason == "refusal")
                return new ObjectResult(new { error = "refused" }) { StatusCode = StatusCodes.Status422UnprocessableEntity };

            var text = string.Concat(response.Content.Select(b => b.Value).OfType<TextBlock>().Select(t => t.Text)).Trim();
            if (text.StartsWith("```")) text = text.Trim('`').Replace("json\n", "", StringComparison.OrdinalIgnoreCase).Trim();
            var polished = JsonSerializer.Deserialize<PolishedDto>(text, Json);
            if (polished is null) return new ObjectResult(new { error = "bad_output" }) { StatusCode = StatusCodes.Status502BadGateway };

            var merged = model with
            {
                Summary = polished.Summary ?? model.Summary,
                Experience = polished.Experience is { Count: > 0 } && polished.Experience.Count == model.Experience.Count ? polished.Experience : model.Experience,
                Projects = polished.Projects is { Count: > 0 } && polished.Projects.Count == model.Projects.Count ? polished.Projects : model.Projects,
            };
            return new OkObjectResult(merged);
        }
        catch (JsonException ex)
        {
            log.LogWarning(ex, "Polish returned invalid JSON");
            return new ObjectResult(new { error = "bad_output" }) { StatusCode = StatusCodes.Status502BadGateway };
        }
        catch (AnthropicApiException ex)
        {
            log.LogWarning(ex, "Polish failed");
            return new ObjectResult(new { error = "upstream" }) { StatusCode = StatusCodes.Status503ServiceUnavailable };
        }
    }

    private static async Task<CvModel?> ReadModelAsync(HttpRequest req, CancellationToken ct)
    {
        CvModel? m;
        try { m = await JsonSerializer.DeserializeAsync<CvModel>(req.Body, Json, ct); }
        catch (JsonException) { return null; }
        if (m is null || string.IsNullOrWhiteSpace(m.Name) || m.Name.Length > 120) return null;

        // Keep sizes sane: this is a one-page-ish CV, not a document store.
        static string C(string? s, int max) => string.IsNullOrWhiteSpace(s) ? "" : s.Trim()[..Math.Min(s.Trim().Length, max)];
        static List<string> L(IEnumerable<string>? xs, int maxItems, int maxLen) => (xs ?? []).Select(x => C(x, maxLen)).Where(x => x.Length > 0).Take(maxItems).ToList();

        return new CvModel(
            C(m.Name, 120),
            C(m.Role, 120),
            C(m.Location, 80),
            C(m.Summary, 1200),
            (m.Contacts ?? []).Take(6).Select(k => new CvContact(C(k.Label, 30), C(k.Value, 120), string.IsNullOrWhiteSpace(k.Url) ? null : C(k.Url, 200))).ToList(),
            (m.Experience ?? []).Take(10).Select(e => new CvExperience(C(e.Period, 40), C(e.Title, 120), C(e.Org, 120), C(e.Text, 800), L(e.Bullets, 6, 200))).ToList(),
            (m.Projects ?? []).Take(8).Select(p => new CvProject(C(p.Title, 120), C(p.Summary, 500), L(p.Tags, 8, 30), string.IsNullOrWhiteSpace(p.Url) ? null : C(p.Url, 200), C(p.Year, 12))).ToList(),
            (m.Skills ?? []).Take(8).Select(s => new CvSkillGroup(C(s.Title, 60), L(s.Items, 12, 40))).ToList(),
            (m.Education ?? []).Take(6).Select(e => new CvEducation(C(e.School, 120), C(e.Program, 120))).ToList(),
            "Skapat med CV-byggaren på havaljalal.se",
            "#d9772a");
    }

    private static string ClientIp(HttpRequest req)
    {
        var fwd = req.Headers["X-Forwarded-For"].ToString();
        return !string.IsNullOrEmpty(fwd) ? fwd.Split(',')[0].Trim() : req.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }

    private sealed record PolishedDto(string? Summary, List<CvExperience>? Experience, List<CvProject>? Projects);
}
