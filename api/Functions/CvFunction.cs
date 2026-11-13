using System.Text.Json;
using HavalApi.Auth;
using HavalApi.Cv;
using HavalApi.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using QuestPDF.Fluent;

namespace HavalApi.Functions;

// Haval's CV. Rendered from the CV document written in admin when there is one, otherwise derived
// from the same content document the site renders. Either way the PDF is built on request, so the
// download is always the latest version.
public class CvFunction(IContentStore content, ICvStore cvs, AdminGate gate, ILogger<CvFunction> log)
{
    [Function("CvPdf")]
    public async Task<IActionResult> Pdf(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "cv.pdf")] HttpRequest req,
        CancellationToken ct)
    {
        var lang = CvLabels.Normalise(req.Query["lang"]);
        var model = await ModelAsync(lang, ct);
        var bytes = new CvDocument(model).GeneratePdf();
        var inline = req.Query["download"].ToString() != "1";
        var name = $"{model.Name.Replace(' ', '-')}-CV.pdf";
        req.HttpContext.Response.Headers.ContentDisposition = $"{(inline ? "inline" : "attachment")}; filename=\"{name}\"";
        req.HttpContext.Response.Headers.CacheControl = "public, max-age=300";
        return new FileContentResult(bytes, "application/pdf");
    }

    // Machine-readable CV for recruiters' tooling and the AI agent.
    [Function("CvJson")]
    public async Task<IActionResult> Json(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "cv.json")] HttpRequest req,
        CancellationToken ct)
    {
        var lang = CvLabels.Normalise(req.Query["lang"]);
        req.HttpContext.Response.Headers.CacheControl = "public, max-age=300";
        return new OkObjectResult(await ModelAsync(lang, ct));
    }

    // Admin: the editable document. ?source=site returns the site-derived version to start from.
    [Function("ManageCvGet")]
    public async Task<IActionResult> ManageGet(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "manage/cv")] HttpRequest req,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        var lang = CvLabels.Normalise(req.Query["lang"]);
        var stored = req.Query["source"].ToString() == "site" ? null : await cvs.GetAsync(lang, ct);
        var model = stored ?? CvMapper.FromSite(await SiteAsync(lang, ct), lang);
        return new OkObjectResult(new { stored = stored is not null, cv = model with { Labels = null } });
    }

    [Function("ManageCvPut")]
    public async Task<IActionResult> ManagePut(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "manage/cv")] HttpRequest req,
        CancellationToken ct)
    {
        var user = await gate.AdminAsync(req, ct);
        if (user is null) return new UnauthorizedResult();
        var lang = CvLabels.Normalise(req.Query["lang"]);
        CvModel? model;
        try { model = await JsonSerializer.DeserializeAsync<CvModel>(req.Body, JsonFileContentStore.Json, ct); }
        catch (JsonException ex) { return new BadRequestObjectResult(new { error = "invalid_json", detail = ex.Message }); }
        if (model is null || string.IsNullOrWhiteSpace(model.Name)) return new BadRequestObjectResult(new { error = "empty" });
        await cvs.SaveAsync(model with { Labels = null, Footer = "" }, lang, ct);
        log.LogInformation("CV ({Lang}) updated by {User}", lang, user.UserDetails);
        return new OkObjectResult(new { ok = true });
    }

    // Admin: back to the site-derived CV.
    [Function("ManageCvDelete")]
    public async Task<IActionResult> ManageDelete(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "manage/cv")] HttpRequest req,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        var lang = CvLabels.Normalise(req.Query["lang"]);
        return new OkObjectResult(new { removed = await cvs.DeleteAsync(lang, ct) });
    }

    private async Task<CvModel> ModelAsync(string lang, CancellationToken ct)
    {
        var l = CvLabels.For(lang);
        var stored = await cvs.GetAsync(lang, ct);
        if (stored is not null && !string.IsNullOrWhiteSpace(stored.Name))
            return stored with { Labels = l, Footer = string.Format(l.Footer, DateTime.UtcNow.ToString("yyyy-MM-dd")) };
        return CvMapper.FromSite(await SiteAsync(lang, ct), lang);
    }

    private async Task<SiteContent> SiteAsync(string lang, CancellationToken ct) =>
        lang == "sv" ? await content.GetAsync(ct) : (await content.GetAsync(lang, ct) ?? await content.GetAsync(ct));
}
