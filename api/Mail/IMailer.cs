using System.Net.Http.Json;
using Microsoft.Extensions.Logging;

namespace HavalApi.Mail;

public sealed record MailAttachment(string FileName, string ContentType, byte[] Content);

public interface IMailer
{
    bool Enabled { get; }
    // To Haval (LEAD_NOTIFY_EMAIL).
    Task SendAsync(string subject, string text, CancellationToken ct, MailAttachment? attachment = null);
    // To anyone else (booking confirmations). Needs a verified sending domain at Resend.
    Task SendToAsync(string to, string subject, string text, CancellationToken ct, MailAttachment? attachment = null);
}

// Sends through Resend (https://resend.com, free tier). Needs RESEND_API_KEY and LEAD_NOTIFY_EMAIL.
// MAIL_FROM is an address on the verified sending domain (havaljalal.se, verified 2026-11-12); nobody
// reads that mailbox, so every mail carries Haval's own address as reply-to.
public sealed class ResendMailer(IHttpClientFactory http, ILogger<ResendMailer> log) : IMailer
{
    private static readonly string? ApiKey = Environment.GetEnvironmentVariable("RESEND_API_KEY");
    private static readonly string? To = Environment.GetEnvironmentVariable("LEAD_NOTIFY_EMAIL");
    private static readonly string From = Environment.GetEnvironmentVariable("MAIL_FROM") ?? "Build Lab <onboarding@resend.dev>";
    private static readonly string[]? ReplyTo = string.IsNullOrWhiteSpace(To) ? null : [To!];

    public bool Enabled => !string.IsNullOrWhiteSpace(ApiKey) && !string.IsNullOrWhiteSpace(To);

    public Task SendAsync(string subject, string text, CancellationToken ct, MailAttachment? attachment = null) =>
        SendToAsync(To ?? "", subject, text, ct, attachment);

    public async Task SendToAsync(string to, string subject, string text, CancellationToken ct, MailAttachment? attachment = null)
    {
        if (!Enabled || string.IsNullOrWhiteSpace(to))
        {
            log.LogInformation("Mail not configured; would have sent to {To}: {Subject}", to, subject);
            return;
        }
        var client = http.CreateClient("resend");
        object payload = attachment is null
            ? new { from = From, to = new[] { to }, reply_to = ReplyTo, subject, text }
            : new
            {
                from = From, to = new[] { to }, reply_to = ReplyTo, subject, text,
                attachments = new[] { new { filename = attachment.FileName, content = Convert.ToBase64String(attachment.Content), content_type = attachment.ContentType } },
            };
        var res = await client.PostAsJsonAsync("emails", payload, ct);
        if (!res.IsSuccessStatusCode)
            log.LogWarning("Resend returned {Status} for {To}: {Body}", res.StatusCode, to, await res.Content.ReadAsStringAsync(ct));
    }
}
