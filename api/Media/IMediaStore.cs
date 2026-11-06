using System.Security.Cryptography;
using System.Text.Json;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using SkiaSharp;

namespace HavalApi.Media;

// Uploaded files for the site (project screenshots, PDFs). Images are normalised to WebP at
// most 1920 px wide before they are stored, so every upload is small and the same format.
public sealed record MediaFile(string Name, string Url, string ContentType, long Size, DateTime Ts);

public interface IMediaStore
{
    Task<MediaFile> SaveAsync(string name, string contentType, Stream data, CancellationToken ct);
    Task<List<MediaFile>> ListAsync(CancellationToken ct);
    Task<bool> DeleteAsync(string name, CancellationToken ct);
    // Local store only: streams a stored file (Azure serves blobs directly).
    Task<(Stream Stream, string ContentType)?> OpenAsync(string name, CancellationToken ct);
}

public static class MediaProcessing
{
    public const long MaxBytes = 15 * 1024 * 1024;
    public const int MaxWidth = 1920;
    private static readonly HashSet<string> ImageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/tiff", "image/bmp"];
    private static readonly HashSet<string> OtherTypes = ["application/pdf", "image/svg+xml"];

    public static bool IsImage(string contentType) => ImageTypes.Contains(contentType);
    public static bool IsAllowed(string contentType) => IsImage(contentType) || OtherTypes.Contains(contentType);

    // Returns the bytes to store plus the final content type and extension.
    public static async Task<(byte[] Bytes, string ContentType, string Extension)> PrepareAsync(string contentType, Stream data, CancellationToken ct)
    {
        if (!IsImage(contentType))
        {
            using var ms = new MemoryStream();
            await data.CopyToAsync(ms, ct);
            return (ms.ToArray(), contentType, contentType == "application/pdf" ? ".pdf" : ".svg");
        }

        using var buffer = new MemoryStream();
        await data.CopyToAsync(buffer, ct);
        buffer.Position = 0;
        using var codec = SKCodec.Create(buffer) ?? throw new InvalidOperationException("Unreadable image");
        using var decoded = SKBitmap.Decode(codec) ?? throw new InvalidOperationException("Unreadable image");
        using var upright = Upright(decoded, codec.EncodedOrigin);

        var scale = Math.Min(1.0, (double)MaxWidth / upright.Width);
        var size = new SKImageInfo((int)Math.Round(upright.Width * scale), (int)Math.Round(upright.Height * scale), SKColorType.Rgba8888, SKAlphaType.Premul);
        using var resized = scale < 1 ? upright.Resize(size, new SKSamplingOptions(SKCubicResampler.Mitchell)) : upright.Copy();
        using var image = SKImage.FromBitmap(resized);
        using var encoded = image.Encode(SKEncodedImageFormat.Webp, 82);
        return (encoded.ToArray(), "image/webp", ".webp");
    }

    // Phone photos carry an EXIF orientation; bake it in so the stored image is upright.
    private static SKBitmap Upright(SKBitmap bitmap, SKEncodedOrigin origin)
    {
        if (origin == SKEncodedOrigin.TopLeft) return bitmap.Copy();
        var swap = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
        var result = new SKBitmap(swap ? bitmap.Height : bitmap.Width, swap ? bitmap.Width : bitmap.Height);
        using var canvas = new SKCanvas(result);
        switch (origin)
        {
            case SKEncodedOrigin.TopRight: canvas.Scale(-1, 1, bitmap.Width / 2f, 0); break;
            case SKEncodedOrigin.BottomRight: canvas.RotateDegrees(180, bitmap.Width / 2f, bitmap.Height / 2f); break;
            case SKEncodedOrigin.BottomLeft: canvas.Scale(1, -1, 0, bitmap.Height / 2f); break;
            case SKEncodedOrigin.LeftTop: canvas.RotateDegrees(90); canvas.Scale(1, -1); break;
            case SKEncodedOrigin.RightTop: canvas.Translate(result.Width, 0); canvas.RotateDegrees(90); break;
            case SKEncodedOrigin.RightBottom: canvas.Translate(result.Width, 0); canvas.RotateDegrees(90); canvas.Scale(1, -1, 0, bitmap.Height / 2f); break;
            case SKEncodedOrigin.LeftBottom: canvas.Translate(0, result.Height); canvas.RotateDegrees(-90); break;
        }
        canvas.DrawBitmap(bitmap, 0, 0);
        return result;
    }

    // "Skärmbild 2026-11-06 185458.png" -> "skarmbild-2026-11-06-185458-3f9a1c.webp"
    public static string SafeName(string original, string extension, byte[] bytes)
    {
        var stem = Path.GetFileNameWithoutExtension(original).ToLowerInvariant()
            .Replace('å', 'a').Replace('ä', 'a').Replace('ö', 'o').Replace('é', 'e');
        var chars = stem.Select(c => char.IsAsciiLetterOrDigit(c) ? c : '-').ToArray();
        var slug = string.Join('-', new string(chars).Split('-', StringSplitOptions.RemoveEmptyEntries));
        if (slug.Length > 48) slug = slug[..48].TrimEnd('-');
        if (slug.Length == 0) slug = "fil";
        var hash = Convert.ToHexString(SHA256.HashData(bytes))[..6].ToLowerInvariant();
        return $"{slug}-{hash}{extension}";
    }
}

// Local development: files under api/.data/media, served by GET /api/media/{name}.
public sealed class LocalMediaStore(string dataDir) : IMediaStore
{
    private readonly string _dir = Path.Combine(dataDir, "media");
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<MediaFile> SaveAsync(string name, string contentType, Stream data, CancellationToken ct)
    {
        Directory.CreateDirectory(_dir);
        var path = Path.Combine(_dir, name);
        await using (var f = File.Create(path))
            await data.CopyToAsync(f, ct);
        await File.WriteAllTextAsync(path + ".meta", JsonSerializer.Serialize(new { contentType }, Json), ct);
        return new MediaFile(name, "/api/media/" + name, contentType, new FileInfo(path).Length, DateTime.UtcNow);
    }

    public Task<List<MediaFile>> ListAsync(CancellationToken ct)
    {
        if (!Directory.Exists(_dir)) return Task.FromResult(new List<MediaFile>());
        var files = Directory.EnumerateFiles(_dir).Where(f => !f.EndsWith(".meta"))
            .Select(f => new FileInfo(f))
            .Select(f => new MediaFile(f.Name, "/api/media/" + f.Name, ContentTypeOf(f.FullName), f.Length, f.LastWriteTimeUtc))
            .OrderByDescending(f => f.Ts)
            .ToList();
        return Task.FromResult(files);
    }

    public Task<bool> DeleteAsync(string name, CancellationToken ct)
    {
        var path = Path.Combine(_dir, name);
        if (!File.Exists(path)) return Task.FromResult(false);
        File.Delete(path);
        if (File.Exists(path + ".meta")) File.Delete(path + ".meta");
        return Task.FromResult(true);
    }

    public Task<(Stream Stream, string ContentType)?> OpenAsync(string name, CancellationToken ct)
    {
        var path = Path.Combine(_dir, name);
        if (!File.Exists(path)) return Task.FromResult<(Stream, string)?>(null);
        return Task.FromResult<(Stream, string)?>((File.OpenRead(path), ContentTypeOf(path)));
    }

    private static string ContentTypeOf(string path)
    {
        var meta = path + ".meta";
        if (File.Exists(meta))
        {
            try
            {
                var doc = JsonDocument.Parse(File.ReadAllText(meta));
                if (doc.RootElement.TryGetProperty("contentType", out var t) && t.GetString() is { } s) return s;
            }
            catch (JsonException) { }
        }
        return Path.GetExtension(path) switch { ".webp" => "image/webp", ".pdf" => "application/pdf", ".svg" => "image/svg+xml", _ => "application/octet-stream" };
    }
}

// Azure: a public "media" container in Blob Storage. The site links straight to the blob URLs.
public sealed class BlobMediaStore(string connectionString) : IMediaStore
{
    private readonly BlobContainerClient _container = new(connectionString, "media");
    private Task? _init;

    private Task InitAsync(CancellationToken ct) =>
        _init ??= _container.CreateIfNotExistsAsync(PublicAccessType.Blob, cancellationToken: ct);

    public async Task<MediaFile> SaveAsync(string name, string contentType, Stream data, CancellationToken ct)
    {
        await InitAsync(ct);
        var blob = _container.GetBlobClient(name);
        await blob.UploadAsync(data, new BlobUploadOptions
        {
            HttpHeaders = new BlobHttpHeaders { ContentType = contentType, CacheControl = "public, max-age=31536000, immutable" },
        }, ct);
        var props = await blob.GetPropertiesAsync(cancellationToken: ct);
        return new MediaFile(name, blob.Uri.ToString(), contentType, props.Value.ContentLength, DateTime.UtcNow);
    }

    public async Task<List<MediaFile>> ListAsync(CancellationToken ct)
    {
        await InitAsync(ct);
        var files = new List<MediaFile>();
        await foreach (var item in _container.GetBlobsAsync(cancellationToken: ct))
        {
            files.Add(new MediaFile(item.Name, _container.GetBlobClient(item.Name).Uri.ToString(),
                item.Properties.ContentType ?? "application/octet-stream", item.Properties.ContentLength ?? 0,
                item.Properties.LastModified?.UtcDateTime ?? DateTime.UtcNow));
        }
        return files.OrderByDescending(f => f.Ts).ToList();
    }

    public async Task<bool> DeleteAsync(string name, CancellationToken ct)
    {
        await InitAsync(ct);
        var response = await _container.DeleteBlobIfExistsAsync(name, cancellationToken: ct);
        return response.Value;
    }

    public Task<(Stream Stream, string ContentType)?> OpenAsync(string name, CancellationToken ct) =>
        Task.FromResult<(Stream, string)?>(null);
}
