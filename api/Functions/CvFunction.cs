using HavalApi.Cv;
using HavalApi.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using QuestPDF.Fluent;

namespace HavalApi.Functions;

// Haval's CV, generated from the same content document the site renders: always up to date.
public class CvFunction(IContentStore content)
{
    [Function("CvPdf")]
    public async Task<IActionResult> Pdf(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "cv.pdf")] HttpRequest req,
        CancellationToken ct)
    {
        var site = await content.GetAsync(ct);
        var model = CvMapper.FromSite(site);
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
        var site = await content.GetAsync(ct);
        req.HttpContext.Response.Headers.CacheControl = "public, max-age=300";
        return new OkObjectResult(CvMapper.FromSite(site));
    }
}
