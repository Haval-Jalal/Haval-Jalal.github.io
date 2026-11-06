using System.Text.RegularExpressions;
using HavalApi.Auth;
using HavalApi.Media;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace HavalApi.Functions;

// Uploads from the admin panel (project images, PDFs). Images come back as WebP.
public partial class MediaFunction(IMediaStore media, AdminGate gate, ILogger<MediaFunction> log)
{
    [Function("ManageUpload")]
    public async Task<IActionResult> Upload(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "manage/upload")] HttpRequest req,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        if (!req.HasFormContentType) return new BadRequestObjectResult(new { error = "expected_multipart" });

        var form = await req.ReadFormAsync(ct);
        var files = form.Files.Where(f => f.Length > 0).ToList();
        if (files.Count == 0) return new BadRequestObjectResult(new { error = "no_file" });

        var saved = new List<MediaFile>();
        var errors = new List<object>();
        foreach (var file in files.Take(10))
        {
            var type = (file.ContentType ?? "").Split(';')[0].Trim().ToLowerInvariant();
            if (!MediaProcessing.IsAllowed(type)) { errors.Add(new { file = file.FileName, error = "unsupported_type" }); continue; }
            if (file.Length > MediaProcessing.MaxBytes) { errors.Add(new { file = file.FileName, error = "too_large" }); continue; }
            try
            {
                await using var input = file.OpenReadStream();
                var (bytes, contentType, extension) = await MediaProcessing.PrepareAsync(type, input, ct);
                var name = MediaProcessing.SafeName(file.FileName, extension, bytes);
                using var ms = new MemoryStream(bytes);
                saved.Add(await media.SaveAsync(name, contentType, ms, ct));
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                log.LogWarning(e, "Upload of {File} failed", file.FileName);
                errors.Add(new { file = file.FileName, error = "processing_failed" });
            }
        }
        return new OkObjectResult(new { files = saved, errors });
    }

    [Function("ManageMediaList")]
    public async Task<IActionResult> List(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "manage/media")] HttpRequest req,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        return new OkObjectResult(new { files = await media.ListAsync(ct) });
    }

    [Function("ManageMediaDelete")]
    public async Task<IActionResult> Delete(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "manage/media/{name}")] HttpRequest req,
        string name,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        if (!SafeName().IsMatch(name)) return new BadRequestResult();
        return new OkObjectResult(new { deleted = await media.DeleteAsync(name, ct) });
    }

    // Local development only: Azure serves blobs straight from storage.
    [Function("Media")]
    public async Task<IActionResult> Get(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "media/{name}")] HttpRequest req,
        string name,
        CancellationToken ct)
    {
        if (!SafeName().IsMatch(name)) return new NotFoundResult();
        var file = await media.OpenAsync(name, ct);
        if (file is null) return new NotFoundResult();
        req.HttpContext.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        return new FileStreamResult(file.Value.Stream, file.Value.ContentType);
    }

    [GeneratedRegex(@"^[a-z0-9][a-z0-9.-]{0,120}$")]
    private static partial Regex SafeName();
}
