using HavalApi.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Caching.Memory;
using SkiaSharp;

namespace HavalApi.Functions;

// The preview image LinkedIn, Teams, Slack and friends show when someone shares a link to the
// site: 1200x630, the site's dark ember look, name + role + tagline from the content document.
// ?t=...&s=... overrides the title and subtitle (used for prototype and pitch links later).
public class OgFunction(IContentStore content, IMemoryCache cache)
{
    private const int W = 1200, H = 630;

    [Function("OgImage")]
    public async Task<IActionResult> Image(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "og.png")] HttpRequest req,
        CancellationToken ct)
    {
        var site = await content.GetAsync(ct);
        var title = Clip(req.Query["t"].ToString(), 80) ?? site.Profile.Name;
        var subtitle = Clip(req.Query["s"].ToString(), 120) ?? $"{site.Profile.Role} · {site.Profile.Location}";
        var tagline = req.Query.ContainsKey("t") ? "" : site.Profile.Tagline;

        var bytes = await cache.GetOrCreateAsync($"og:{title}|{subtitle}|{tagline}", entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(6);
            return Task.FromResult(Render(title, subtitle, tagline));
        });

        req.HttpContext.Response.Headers.CacheControl = "public, max-age=3600";
        return new FileContentResult(bytes!, "image/png");
    }

    private static byte[] Render(string title, string subtitle, string tagline)
    {
        using var surface = SKSurface.Create(new SKImageInfo(W, H, SKColorType.Rgba8888, SKAlphaType.Premul));
        var canvas = surface.Canvas;
        canvas.Clear(new SKColor(0x0b, 0x0b, 0x0f));

        // Ember glow bottom-left, like the hero.
        using (var glow = new SKPaint
        {
            Shader = SKShader.CreateRadialGradient(new SKPoint(260, 560), 620,
                [new SKColor(0xe8, 0x93, 0x3a, 0x66), new SKColor(0xe8, 0x93, 0x3a, 0x00)], SKShaderTileMode.Clamp),
        })
            canvas.DrawRect(0, 0, W, H, glow);

        // Wireframe terrain: perspective grid fading toward the horizon.
        using (var line = new SKPaint { Color = new SKColor(0xe8, 0x93, 0x3a, 0x2e), StrokeWidth = 1, IsAntialias = true, Style = SKPaintStyle.Stroke })
        {
            const float horizon = 330;
            for (var i = 0; i <= 24; i++)
            {
                var x = i * (W / 24f);
                canvas.DrawLine(600 + (x - 600) * 0.15f, horizon, x, H, line);
            }
            for (var k = 0; k < 10; k++)
            {
                var t = k / 9f;
                var y = horizon + (H - horizon) * t * t;
                line.Color = new SKColor(0xe8, 0x93, 0x3a, (byte)(0x10 + 0x40 * t));
                canvas.DrawLine(0, y, W, y, line);
            }
        }
        // Fade the grid under the text.
        using (var fade = new SKPaint
        {
            Shader = SKShader.CreateLinearGradient(new SKPoint(0, 0), new SKPoint(0, H),
                [new SKColor(0x0b, 0x0b, 0x0f, 0xff), new SKColor(0x0b, 0x0b, 0x0f, 0x99), new SKColor(0x0b, 0x0b, 0x0f, 0x00)],
                [0f, 0.55f, 1f], SKShaderTileMode.Clamp),
        })
            canvas.DrawRect(0, 0, W, H, fade);

        var bold = SKTypeface.FromFamilyName("Segoe UI", SKFontStyleWeight.Bold, SKFontStyleWidth.Normal, SKFontStyleSlant.Upright) ?? SKTypeface.Default;
        var regular = SKTypeface.FromFamilyName("Segoe UI") ?? SKTypeface.Default;
        var mono = SKTypeface.FromFamilyName("Consolas") ?? regular;

        // Brand mark.
        using (var mark = new SKPaint { Color = new SKColor(0xe8, 0x93, 0x3a), IsAntialias = true })
            canvas.DrawRoundRect(new SKRect(80, 80, 132, 132), 12, 12, mark);
        Draw(canvas, "H", 94, 120, new SKFont(bold, 34), new SKColor(0x0b, 0x0b, 0x0f));
        Draw(canvas, "havaljalal.se", 150, 116, new SKFont(mono, 24), new SKColor(0xff, 0xff, 0xff, 0x99));

        // Title (auto-shrinks to fit), subtitle, tagline.
        var size = 92f;
        var titleFont = new SKFont(bold, size) { Subpixel = true };
        while (titleFont.MeasureText(title) > W - 160 && size > 40)
            titleFont = new SKFont(bold, size -= 4) { Subpixel = true };
        Draw(canvas, title, 80, 330, titleFont, SKColors.White);
        Draw(canvas, subtitle, 82, 392, new SKFont(regular, 36), new SKColor(0xe8, 0x93, 0x3a));
        if (tagline.Length > 0)
        {
            foreach (var (line, i) in Wrap(tagline, new SKFont(regular, 28), W - 160).Take(2).Select((l, i) => (l, i)))
                Draw(canvas, line, 82, 460 + i * 40, new SKFont(regular, 28), new SKColor(0xff, 0xff, 0xff, 0xb3));
        }

        using var image = surface.Snapshot();
        using var data = image.Encode(SKEncodedImageFormat.Png, 100);
        return data.ToArray();
    }

    private static void Draw(SKCanvas canvas, string text, float x, float y, SKFont font, SKColor color)
    {
        using var paint = new SKPaint { Color = color, IsAntialias = true };
        font.Edging = SKFontEdging.SubpixelAntialias;
        canvas.DrawText(text, x, y, SKTextAlign.Left, font, paint);
    }

    private static IEnumerable<string> Wrap(string text, SKFont font, float maxWidth)
    {
        var line = "";
        foreach (var word in text.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            var candidate = line.Length == 0 ? word : line + " " + word;
            if (font.MeasureText(candidate) > maxWidth && line.Length > 0)
            {
                yield return line;
                line = word;
            }
            else line = candidate;
        }
        if (line.Length > 0) yield return line;
    }

    private static string? Clip(string? s, int max) => string.IsNullOrWhiteSpace(s) ? null : s.Trim()[..Math.Min(s.Trim().Length, max)];
}
