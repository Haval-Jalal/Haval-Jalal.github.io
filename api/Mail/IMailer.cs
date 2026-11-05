using System.Net.Http.Json;
using Microsoft.Extensions.Logging;

namespace HavalApi.Mail;

public interface IMailer
{
    bool Enabled { get; }
    Task SendAsync(string subject, string text, CancellationToken ct);
}

// Sends through Resend (https://resend.com, free tier). Needs RESEND_API_KEY and LEAD_NOTIFY_EMAIL.
// Until a domain is verified, Resend only delivers "onboarding@resend.dev" to the account owner's
// own address, which is exactly the use case here.
public sealed class ResendMailer(IHttpClientFactory http, ILogger<ResendMailer> log) : IMailer
{
    private static readonly string? ApiKey = Environment.GetEnvironmentVariable("RESEND_API_KEY");
    private static readonly string? To = Environment.GetEnvironmentVariable("LEAD_NOTIFY_EMAIL");
    private static readonly string From = Environment.GetEnvironmentVariable("MAIL_FROM") ?? "Build Lab <onboarding@resend.dev>";

    public bool Enabled => !string.IsNullOrWhiteSpace(ApiKey) && !string.IsNullOrWhiteSpace(To);

    public async Task SendAsync(string subject, string text, CancellationToken ct)
    {
        if (!Enabled)
        {
            log.LogInformation("Mail not configured; would have sent: {Subject}", subject);
            return;
        }
        var client = http.CreateClient("resend");
        var res = await client.PostAsJsonAsync("emails", new { from = From, to = new[] { To }, subject, text }, ct);
        if (!res.IsSuccessStatusCode)
            log.LogWarning("Resend returned {Status}: {Body}", res.StatusCode, await res.Content.ReadAsStringAsync(ct));
    }
}
