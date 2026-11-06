using System.Net;
using System.Text.RegularExpressions;
using HavalApi.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;

namespace HavalApi.Functions;

// Share links with a page-specific preview. The site is a SPA, so crawlers (LinkedIn, Slack,
// Teams, X) never see per-page meta tags. /api/share/lab/{id} and /api/share/for/{slug} answer
// with a tiny HTML page carrying the right Open Graph tags and send people straight on to the
// real page. The public "Share on LinkedIn" buttons use these URLs.
public partial class ShareFunction(IBuildStore builds, IPitchStore pitches, IContentStore content)
{
    private static readonly string SiteUrl = Environment.GetEnvironmentVariable("SITE_URL") ?? "https://havaljalal.se";

    [Function("ShareLab")]
    public async Task<IActionResult> Lab(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "share/lab/{id}")] HttpRequest req,
        string id,
        CancellationToken ct)
    {
        if (!IdRx().IsMatch(id)) return new NotFoundResult();
        var b = await builds.GetAsync(id, ct);
        if (b is null) return new NotFoundResult();
        var lang = req.Query["lang"] == "en" ? "en" : "sv";
        var target = lang == "en" ? $"{SiteUrl}/en/lab/{b.Id}" : $"{SiteUrl}/lab/{b.Id}";
        var title = string.IsNullOrWhiteSpace(b.Title) ? (lang == "en" ? "Prototype from AI Build Lab" : "Prototyp från AI Build Lab") : b.Title;
        var description = Clip(b.Idea, 180);
        var image = $"{SiteUrl}/api/og.png?t={Uri.EscapeDataString(Clip(title, 70))}&s={Uri.EscapeDataString(lang == "en" ? "Built by Haval's AI agent · havaljalal.se" : "Byggd av Havals AI-agent · havaljalal.se")}";
        return Html(Page(title, description, image, target, lang, index: true));
    }

    [Function("SharePitch")]
    public async Task<IActionResult> Pitch(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "share/for/{slug}")] HttpRequest req,
        string slug,
        CancellationToken ct)
    {
        if (!SlugRx().IsMatch(slug)) return new NotFoundResult();
        var p = await pitches.GetAsync(slug, ct);
        if (p is null || p.Status != "published") return new NotFoundResult();
        var site = await content.GetAsync(ct);
        var target = $"{SiteUrl}/for/{p.Slug}";
        var title = string.IsNullOrWhiteSpace(p.Greeting) ? $"{site.Profile.Name} för {p.Company}" : p.Greeting;
        var description = Clip(string.IsNullOrWhiteSpace(p.Intro) ? site.Profile.Tagline : p.Intro, 180);
        var image = $"{SiteUrl}/api/og.png?t={Uri.EscapeDataString(Clip(title, 70))}&s={Uri.EscapeDataString(Clip($"{site.Profile.Role} · {p.Company}", 100))}";
        return Html(Page(title, description, image, target, "sv", index: false));
    }

    private static string Page(string title, string description, string image, string target, string lang, bool index)
    {
        string E(string s) => WebUtility.HtmlEncode(s);
        return $"""
            <!doctype html>
            <html lang="{lang}">
            <head>
            <meta charset="utf-8">
            <title>{E(title)} · Haval Jalal</title>
            <meta name="description" content="{E(description)}">
            {(index ? "" : "<meta name=\"robots\" content=\"noindex\">")}
            <link rel="canonical" href="{E(target)}">
            <meta property="og:type" content="website">
            <meta property="og:site_name" content="Haval Jalal">
            <meta property="og:title" content="{E(title)}">
            <meta property="og:description" content="{E(description)}">
            <meta property="og:url" content="{E(target)}">
            <meta property="og:image" content="{E(image)}">
            <meta property="og:image:width" content="1200">
            <meta property="og:image:height" content="630">
            <meta name="twitter:card" content="summary_large_image">
            <meta name="twitter:title" content="{E(title)}">
            <meta name="twitter:description" content="{E(description)}">
            <meta name="twitter:image" content="{E(image)}">
            <meta http-equiv="refresh" content="0;url={E(target)}">
            <script>location.replace({System.Text.Json.JsonSerializer.Serialize(target)});</script>
            <style>{Css}</style>
            </head>
            <body><p><a href="{E(target)}">{E(title)}</a></p></body>
            </html>
            """;
    }

    private const string Css = "body{margin:0;background:#070810;color:#c9c4bd;font:15px system-ui;display:grid;place-items:center;min-height:100vh}a{color:#f0a24a}";

    private static ContentResult Html(string html) => new() { Content = html, ContentType = "text/html; charset=utf-8", StatusCode = 200 };

    private static string Clip(string s, int max)
    {
        s = (s ?? "").Replace('\n', ' ').Replace('\r', ' ').Trim();
        return s.Length <= max ? s : s[..(max - 1)] + "…";
    }

    [GeneratedRegex("^[a-z0-9]{6,40}$")]
    private static partial Regex IdRx();

    [GeneratedRegex("^[a-z0-9][a-z0-9-]{1,60}$")]
    private static partial Regex SlugRx();
}
