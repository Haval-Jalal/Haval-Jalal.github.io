using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using HavalApi.Agent;
using HavalApi.Auth;
using HavalApi.Data;
using HavalApi.Mail;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace HavalApi.Functions;

// Booking: free slots from Haval's weekly windows minus existing bookings; a booking stores the
// visitor, e-mails both parties (with an .ics invite) and shows up in admin.
public class BookingFunction(IBookingStore store, IMailer mailer, AgentGuard guard, AdminGate gate, ILogger<BookingFunction> log)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly TimeZoneInfo Zone = FindZone();
    private static readonly string SiteUrl = Environment.GetEnvironmentVariable("SITE_URL") ?? "https://havaljalal.se";
    private static readonly string OwnerEmail = Environment.GetEnvironmentVariable("LEAD_NOTIFY_EMAIL") ?? "";

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

    // Public: settings the page needs plus every free slot in the horizon (UTC instants).
    [Function("BookingSlots")]
    public async Task<IActionResult> Slots(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "booking")] HttpRequest req,
        CancellationToken ct)
    {
        var s = await store.GetSettingsAsync(ct);
        req.HttpContext.Response.Headers.CacheControl = "no-store";
        if (!s.Enabled) return new OkObjectResult(new { enabled = false, s.Title, s.Intro });
        var slots = await FreeSlotsAsync(s, ct);
        return new OkObjectResult(new
        {
            enabled = true, s.Title, s.Intro, s.Location, s.SlotMinutes, timeZone = Zone.Id,
            slots = slots.Select(x => x.ToString("o")),
        });
    }

    [Function("BookingCreate")]
    public async Task<IActionResult> Create(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "booking")] HttpRequest req,
        CancellationToken ct)
    {
        if (!guard.TryTake("booking", AnalyticsFunction.ClientIp(req), 5, TimeSpan.FromHours(1)))
            return new ObjectResult(new { error = "rate_limited" }) { StatusCode = StatusCodes.Status429TooManyRequests };
        var dto = await ReadAsync<BookDto>(req, ct);
        if (dto is null || string.IsNullOrWhiteSpace(dto.Name) || string.IsNullOrWhiteSpace(dto.Email) || !dto.Email.Contains('@') || dto.Email.Length > 200)
            return new BadRequestObjectResult(new { error = "invalid_contact" });
        if (!string.IsNullOrWhiteSpace(dto.Website)) return new OkObjectResult(new { ok = true, id = "" }); // honeypot
        if (!DateTime.TryParse(dto.Start, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var start))
            return new BadRequestObjectResult(new { error = "invalid_slot" });

        var s = await store.GetSettingsAsync(ct);
        if (!s.Enabled) return new BadRequestObjectResult(new { error = "closed" });
        var free = await FreeSlotsAsync(s, ct);
        if (!free.Contains(start)) return new ConflictObjectResult(new { error = "slot_taken" });

        var booking = new Booking(
            Guid.NewGuid().ToString("N")[..12], DateTime.UtcNow, start, start.AddMinutes(s.SlotMinutes),
            Clip(dto.Name, 120)!, dto.Email.Trim(), Clip(dto.Note, 2000) ?? "", "confirmed", dto.Lang == "en" ? "en" : "sv", Clip(dto.Phone, 40));
        await store.SaveAsync(booking, ct);
        await NotifyAsync(booking, s, cancelled: false, ct);
        log.LogInformation("Booking {Id} created for {Start:u} by {Email}", booking.Id, booking.Start, booking.Email);
        return new OkObjectResult(new { ok = true, id = booking.Id, start = booking.Start.ToString("o"), end = booking.End.ToString("o"), mailed = mailer.Enabled });
    }

    [Function("ManageBookingSettingsGet")]
    public async Task<IActionResult> SettingsGet(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "manage/booking/settings")] HttpRequest req,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        return new OkObjectResult(await store.GetSettingsAsync(ct));
    }

    [Function("ManageBookingSettingsPut")]
    public async Task<IActionResult> SettingsPut(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "manage/booking/settings")] HttpRequest req,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        BookingSettings? s;
        try { s = await JsonSerializer.DeserializeAsync<BookingSettings>(req.Body, Json, ct); }
        catch (JsonException) { s = null; }
        if (s is null) return new BadRequestObjectResult(new { error = "invalid_settings" });
        var clean = s with
        {
            SlotMinutes = Math.Clamp(s.SlotMinutes, 15, 120),
            HorizonDays = Math.Clamp(s.HorizonDays, 1, 90),
            LeadHours = Math.Clamp(s.LeadHours, 0, 168),
            Weekly = (s.Weekly ?? []).Where(w => w.Day is >= 1 and <= 7 && TimeOnly.TryParse(w.Start, out _) && TimeOnly.TryParse(w.End, out _)).ToList(),
            BlockedDates = (s.BlockedDates ?? []).Where(d => DateOnly.TryParse(d, out _)).ToList(),
            Title = Clip(s.Title, 80) ?? BookingSettings.Default.Title,
            Intro = Clip(s.Intro, 600) ?? "",
            Location = Clip(s.Location, 200) ?? "",
        };
        await store.SaveSettingsAsync(clean, ct);
        return new OkObjectResult(clean);
    }

    [Function("ManageBookingsList")]
    public async Task<IActionResult> List(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "manage/bookings")] HttpRequest req,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        var list = await store.ListAsync(DateTime.UtcNow.AddDays(-30), ct);
        return new OkObjectResult(new { bookings = list, timeZone = Zone.Id });
    }

    [Function("ManageBookingCancel")]
    public async Task<IActionResult> Cancel(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "manage/bookings/{id}/cancel")] HttpRequest req,
        string id,
        CancellationToken ct)
    {
        if (await gate.AdminAsync(req, ct) is null) return new UnauthorizedResult();
        var b = await store.GetAsync(id, ct);
        if (b is null) return new NotFoundResult();
        if (b.Status == "cancelled") return new OkObjectResult(b);
        var cancelled = b with { Status = "cancelled" };
        await store.SaveAsync(cancelled, ct);
        await NotifyAsync(cancelled, await store.GetSettingsAsync(ct), cancelled: true, ct);
        return new OkObjectResult(cancelled);
    }

    // Weekly windows → slots in Stockholm time → UTC, minus booked, past and blocked.
    private async Task<List<DateTime>> FreeSlotsAsync(BookingSettings s, CancellationToken ct)
    {
        var nowUtc = DateTime.UtcNow;
        var earliest = nowUtc.AddHours(s.LeadHours);
        var booked = (await store.ListAsync(nowUtc.AddDays(-1), ct)).Where(b => b.Status == "confirmed").Select(b => b.Start).ToHashSet();
        var blocked = s.BlockedDates.ToHashSet();
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(nowUtc, Zone));
        var result = new List<DateTime>();
        for (var d = 0; d <= s.HorizonDays; d++)
        {
            var date = today.AddDays(d);
            if (blocked.Contains(date.ToString("yyyy-MM-dd"))) continue;
            var dow = (int)date.DayOfWeek == 0 ? 7 : (int)date.DayOfWeek;
            foreach (var w in s.Weekly.Where(w => w.Day == dow))
            {
                if (!TimeOnly.TryParse(w.Start, out var from) || !TimeOnly.TryParse(w.End, out var to)) continue;
                for (var t = from; t.AddMinutes(s.SlotMinutes) <= to && t < to; t = t.AddMinutes(s.SlotMinutes))
                {
                    var local = DateTime.SpecifyKind(date.ToDateTime(t), DateTimeKind.Unspecified);
                    if (Zone.IsInvalidTime(local)) continue;
                    var utc = TimeZoneInfo.ConvertTimeToUtc(local, Zone);
                    if (utc < earliest || booked.Contains(utc)) continue;
                    result.Add(utc);
                    if (t.AddMinutes(s.SlotMinutes) < t) break; // midnight wrap
                }
            }
        }
        return result;
    }

    private async Task NotifyAsync(Booking b, BookingSettings s, bool cancelled, CancellationToken ct)
    {
        var local = TimeZoneInfo.ConvertTimeFromUtc(b.Start, Zone);
        var sv = b.Lang != "en";
        var when = sv
            ? local.ToString("dddd d MMMM yyyy 'kl.' HH:mm", new CultureInfo("sv-SE"))
            : local.ToString("dddd d MMMM yyyy 'at' HH:mm", new CultureInfo("en-GB"));
        var ics = cancelled ? null : Ics(b, s);

        // Haval
        await mailer.SendAsync(
            cancelled ? $"Avbokat: {b.Name} {local:yyyy-MM-dd HH:mm}" : $"Ny bokning: {b.Name} {local:yyyy-MM-dd HH:mm}",
            $"""
            {(cancelled ? "Bokningen är avbokad." : "Ny bokning via havaljalal.se")}

            Tid:     {local:dddd d MMMM yyyy HH:mm} ({s.SlotMinutes} min, {Zone.Id})
            Namn:    {b.Name}
            E-post:  {b.Email}
            Telefon: {b.Phone ?? "-"}
            Notering:
            {(string.IsNullOrWhiteSpace(b.Note) ? "-" : b.Note)}

            Admin: {SiteUrl}/admin
            """, ct, ics);

        // Visitor (delivers once the sending domain is verified at Resend)
        var subject = cancelled
            ? (sv ? "Ditt möte med Haval Jalal är avbokat" : "Your meeting with Haval Jalal is cancelled")
            : (sv ? $"Bekräftat: möte med Haval Jalal {when}" : $"Confirmed: meeting with Haval Jalal {when}");
        var body = cancelled
            ? (sv ? $"Hej {b.Name},\n\nmötet {when} har tyvärr avbokats. Boka gärna en ny tid: {SiteUrl}/boka\n\nHaval"
                  : $"Hi {b.Name},\n\nunfortunately the meeting {when} has been cancelled. Feel free to book a new time: {SiteUrl}/en/book\n\nHaval")
            : (sv ? $"Hej {b.Name},\n\ntack för bokningen! Vi ses {when} ({s.SlotMinutes} min).\nPlats: {s.Location}\n\nKalenderinbjudan är bifogad. Behöver du ändra tid, svara på det här mejlet.\n\nHaval Jalal\n{SiteUrl}"
                  : $"Hi {b.Name},\n\nthanks for booking! See you {when} ({s.SlotMinutes} min, {Zone.Id}).\nLocation: {s.Location}\n\nA calendar invite is attached. Reply to this e-mail if you need to reschedule.\n\nHaval Jalal\n{SiteUrl}");
        await mailer.SendToAsync(b.Email, subject, body, ct, ics);
    }

    private static MailAttachment Ics(Booking b, BookingSettings s)
    {
        static string Esc(string t) => t.Replace("\\", "\\\\").Replace(";", "\\;").Replace(",", "\\,").Replace("\n", "\\n");
        var text = $"""
            BEGIN:VCALENDAR
            VERSION:2.0
            PRODID:-//havaljalal.se//Booking//SV
            METHOD:REQUEST
            BEGIN:VEVENT
            UID:{b.Id}@havaljalal.se
            DTSTAMP:{DateTime.UtcNow:yyyyMMdd'T'HHmmss'Z'}
            DTSTART:{b.Start:yyyyMMdd'T'HHmmss'Z'}
            DTEND:{b.End:yyyyMMdd'T'HHmmss'Z'}
            SUMMARY:{Esc($"Haval Jalal · {b.Name}")}
            DESCRIPTION:{Esc($"{s.Title}. {(string.IsNullOrWhiteSpace(b.Note) ? "" : "Notering: " + b.Note)}")}
            LOCATION:{Esc(s.Location)}
            ORGANIZER;CN=Haval Jalal:mailto:{OwnerEmail}
            ATTENDEE;CN={Esc(b.Name)};RSVP=TRUE:mailto:{b.Email}
            END:VEVENT
            END:VCALENDAR
            """.Replace("\r\n", "\n").Replace("\n", "\r\n");
        return new MailAttachment("mote.ics", "text/calendar; method=REQUEST", Encoding.UTF8.GetBytes(text));
    }

    private static async Task<T?> ReadAsync<T>(HttpRequest req, CancellationToken ct) where T : class
    {
        try { return await JsonSerializer.DeserializeAsync<T>(req.Body, Json, ct); }
        catch (JsonException) { return null; }
    }

    private static string? Clip(string? s, int max) => string.IsNullOrWhiteSpace(s) ? null : s.Trim()[..Math.Min(s.Trim().Length, max)];

    private sealed class BookDto
    {
        [JsonPropertyName("start")] public string? Start { get; set; }
        [JsonPropertyName("name")] public string? Name { get; set; }
        [JsonPropertyName("email")] public string? Email { get; set; }
        [JsonPropertyName("phone")] public string? Phone { get; set; }
        [JsonPropertyName("note")] public string? Note { get; set; }
        [JsonPropertyName("lang")] public string? Lang { get; set; }
        [JsonPropertyName("website")] public string? Website { get; set; }
    }
}
