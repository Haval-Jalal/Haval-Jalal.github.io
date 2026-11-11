using Microsoft.AspNetCore.Http;

namespace HavalApi.Auth;

// The caller's IP, chosen so a visitor cannot forge it to escape the per-IP rate limits.
//
// X-Forwarded-For is a client-writable header: a visitor may send "X-Forwarded-For: 1.2.3.4" and the
// platform APPENDS the real client IP to the end of the chain ("1.2.3.4, <realIP>"). So the LAST
// entry is the one added by the trusted Azure edge and cannot be spoofed; the first entry is whatever
// the client claimed. Reading the first entry (the old behaviour) let anyone rotate the header to get
// a fresh rate-limit bucket on every request — this reads the last entry instead.
//
// This is best-effort identity for throttling only. The hard wallet guarantee for the AI features is
// the global daily/monthly USD cap in AgentGuard, which no amount of IP rotation can exceed. Admin
// access is gated on the authenticated Static Web Apps role and the ban list keys on the account id,
// not on the IP, so neither depends on this value.
public static class RequestIp
{
    public static string Of(HttpRequest req)
    {
        var fwd = req.Headers["X-Forwarded-For"].ToString();
        if (!string.IsNullOrWhiteSpace(fwd))
        {
            var parts = fwd.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (parts.Length > 0) return StripPort(parts[^1]);
        }
        return req.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
    }

    // An XFF entry may carry a port, and IPv6 may be bracketed ("[::1]:443"); keep just the address so
    // the same client always maps to the same rate-limit key.
    private static string StripPort(string ip)
    {
        ip = ip.Trim();
        if (ip.StartsWith('['))
        {
            var end = ip.IndexOf(']');
            return end > 0 ? ip[1..end] : ip;
        }
        var colon = ip.IndexOf(':');
        // Strip a trailing :port only for IPv4 (one colon). A bare IPv6 address has several colons.
        if (colon > 0 && ip.IndexOf(':', colon + 1) < 0) return ip[..colon];
        return ip;
    }
}
