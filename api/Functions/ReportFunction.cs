using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using HavalApi.Agent;
using HavalApi.Auth;
using HavalApi.Data;
using HavalApi.Mail;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace HavalApi.Functions;

// Weekly e-mail to Haval with the week in numbers: visitors, leads, Build Lab, bookings, recruiter
// pages, security and AI spend. Triggered by a GitHub Actions cron (POST /api/report/weekly with
// the REPORT_KEY header) or by hand from the admin overview (POST /api/manage/report/weekly).
public class ReportFunction(
    IAnalyticsStore analytics,
    ILeadStore leads,
    IBuildStore builds,
    IBookingStore bookings,
    IPitchStore pitches,
    ISecurityStore security,
    IUsageStore usage,
    AgentGuard guard,
    IMailer mailer,
    AdminGate gate,
    ILogger<ReportFunction> log)
{
    private static readonly string? Key = Environment.GetEnvironmentVariable("REPORT_KEY");
    private static readonly string SiteUrl = Environment.GetEnvironmentVariable("SITE_URL") ?? "https://havaljalal.se";
    private static readonly CultureInfo Sv = CultureInfo.GetCultureInfo("sv-SE");

    [Function("WeeklyReport")]
    public async Task<IActionResult> Weekly(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "report/weekly")] HttpRequest req,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(Key)) return new ObjectResult(new { error = "not_configured" }) { StatusCode = StatusCodes.Status503ServiceUnavailable };
        var given = req.Headers["X-Report-Key"].ToString();
        if (given.Length == 0 || !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(given), Encoding.UTF8.GetBytes(Key)))
            return new UnauthorizedResult();
        return await SendAsync(ct);
    }

    [Function("ManageWeeklyReport")]
    public async Task<IActionResult> ManageWeekly(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "manage/report/weekly")] HttpRequest req,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        return await SendAsync(ct);
    }

    private async Task<IActionResult> SendAsync(CancellationToken ct)
    {
        var text = await BuildAsync(ct);
        var subject = $"Veckorapport havaljalal.se · v{ISOWeek.GetWeekOfYear(DateTime.UtcNow.AddDays(-1))}";
        await mailer.SendAsync(subject, text, ct);
        log.LogInformation("Weekly report sent (mail {Enabled})", mailer.Enabled);
        return new OkObjectResult(new { ok = true, mailed = mailer.Enabled, subject, text });
    }

    private async Task<string> BuildAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var since = now.AddDays(-7);
        var week = await analytics.SummaryAsync(7, ct);
        var prev = await analytics.SummaryAsync(14, ct);
        var prevViews = prev.Views - week.Views;
        var prevVisitors = prev.Visitors - week.Visitors;

        var leadRows = (await leads.ListAsync(200, ct)).Where(l => l.Ts >= since).ToList();
        var buildRows = (await builds.ListRecentAsync(200, ct)).Where(b => b.Ts >= since).ToList();
        var upcoming = (await bookings.ListAsync(now, ct)).Where(b => b.Status == "confirmed").OrderBy(b => b.Start).ToList();
        var pitchRows = (await pitches.ListAsync(ct)).Where(p => p.Status == "published").ToList();
        var attempts = (await security.AttemptsAsync(300, ct)).Where(a => a.Ts >= since).ToList();
        var ai = await usage.SummaryAsync(7, await guard.BudgetAsync(ct), ct);

        var sb = new StringBuilder();
        sb.AppendLine($"Veckan {since:d MMM}–{now:d MMM yyyy} på havaljalal.se");
        sb.AppendLine();
        sb.AppendLine("BESÖK");
        sb.AppendLine($"  Sidvisningar: {week.Views} ({Delta(week.Views, prevViews)})");
        sb.AppendLine($"  Besökare:     {week.Visitors} ({Delta(week.Visitors, prevVisitors)})");
        if (week.TopPaths.Count > 0) sb.AppendLine("  Mest besökt:  " + string.Join(", ", week.TopPaths.Take(5).Select(p => $"{p.Key} ({p.Count})")));
        if (week.TopReferrers.Count > 0) sb.AppendLine("  Kom från:     " + string.Join(", ", week.TopReferrers.Take(5).Select(p => $"{p.Key} ({p.Count})")));
        if (week.Devices.Count > 0) sb.AppendLine("  Enheter:      " + string.Join(", ", week.Devices.Select(p => $"{p.Key} {p.Count}")));
        if (week.Events.Count > 0) sb.AppendLine("  Händelser:    " + string.Join(", ", week.Events.Take(8).Select(p => $"{p.Key} {p.Count}")));
        sb.AppendLine();

        sb.AppendLine($"LEADS ({leadRows.Count})");
        if (leadRows.Count == 0) sb.AppendLine("  Inga nya.");
        foreach (var l in leadRows.Take(10))
            sb.AppendLine($"  {l.Ts:MM-dd} {Trunc(l.Name.Length > 0 ? l.Name : "(utan namn)", 24)} <{l.Email}> via {l.Source}{(l.Message.Length > 0 ? ": " + Trunc(l.Message, 80) : "")}");
        sb.AppendLine();

        sb.AppendLine($"BUILD LAB ({buildRows.Count} prototyper)");
        if (buildRows.Count > 0)
        {
            sb.AppendLine($"  Upplåsta med kontakt: {buildRows.Count(b => b.Unlocked)}, avbrutna av tidsgräns: {buildRows.Count(b => b.Truncated)}");
            foreach (var b in buildRows.Take(8)) sb.AppendLine($"  {b.Ts:MM-dd} {Trunc(b.Idea, 90)}");
        }
        sb.AppendLine();

        sb.AppendLine($"BOKNINGAR (kommande: {upcoming.Count})");
        foreach (var b in upcoming.Take(8))
            sb.AppendLine($"  {TimeZoneInfo.ConvertTimeFromUtc(b.Start, Zone):ddd d MMM HH:mm} {b.Name} <{b.Email}>");
        sb.AppendLine();

        if (pitchRows.Count > 0)
        {
            sb.AppendLine("REKRYTERARSIDOR");
            foreach (var p in pitchRows.OrderByDescending(p => p.Stats.LastViewedAt ?? DateTime.MinValue).Take(8))
            {
                var weekViews = p.Stats.Recent.Count(e => e.Kind == "view" && e.Ts >= since);
                sb.AppendLine($"  /for/{p.Slug} ({p.Company}): {weekViews} visningar denna vecka, {p.Stats.Views} totalt, {p.Stats.CvDownloads} CV, senast {(p.Stats.LastViewedAt is { } lv ? lv.ToString("MM-dd") : "aldrig")}");
            }
            sb.AppendLine();
        }

        sb.AppendLine("SÄKERHET");
        sb.AppendLine($"  Inloggningsförsök mot /admin: {attempts.Count} (släppta in: {attempts.Count(a => a.Result == "admin")}, nekade: {attempts.Count(a => a.Result == "denied")}, blockerade: {attempts.Count(a => a.Result == "blocked")})");
        foreach (var a in attempts.Where(a => a.Result != "admin").GroupBy(a => a.User).Take(8))
            sb.AppendLine($"  {a.Key} ({a.First().Provider}): {a.Count()} försök, senast {a.Max(x => x.Ts):MM-dd HH:mm} UTC");
        sb.AppendLine();

        sb.AppendLine("AI");
        sb.AppendLine($"  Kostnad 7 dagar: {ai.TotalUsd.ToString("0.00", Sv)} USD ({ai.ByFeature.Sum(f => f.Calls)} anrop) · denna månad: {ai.SpentMonthUsd.ToString("0.00", Sv)} av {ai.MonthlyCapUsd.ToString("0", Sv)} USD · läge: {ai.Mode}");
        foreach (var f in ai.ByFeature.OrderByDescending(f => f.Usd).Take(6))
            sb.AppendLine($"  {f.Feature}: {f.Calls} anrop, {f.Usd.ToString("0.000", Sv)} USD");
        sb.AppendLine();
        sb.AppendLine($"Admin: {SiteUrl}/admin");
        return sb.ToString();
    }

    private static readonly TimeZoneInfo Zone = FindZone();
    private static TimeZoneInfo FindZone()
    {
        foreach (var id in new[] { "Europe/Stockholm", "W. Europe Standard Time" })
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
            catch (TimeZoneNotFoundException) { }
            catch (InvalidTimeZoneException) { }
        }
        return TimeZoneInfo.Utc;
    }

    private static string Delta(int now, int before) =>
        before == 0 ? (now == 0 ? "±0" : "nytt") : $"{(now >= before ? "+" : "")}{Math.Round((now - before) * 100.0 / before)} % mot veckan innan";

    private static string Trunc(string s, int max) => s.Length <= max ? s : s[..(max - 1)] + "…";
}
