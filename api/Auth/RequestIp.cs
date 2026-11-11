using Microsoft.AspNetCore.Http;

namespace HavalApi.Auth;

// The key used for per-caller rate limits.
//
// On Azure Static Web Apps managed functions the platform forwards NO client address: a request
// from the open internet arrives with X-Forwarded-For, X-Azure-ClientIP and X-Azure-SocketIP all
// empty and RemoteIpAddress set to the platform's own proxy (verified 2026-11-10 with an admin
// diagnostic). So X-Forwarded-For can only ever contain what the caller wrote, and reading it,
// first entry or last, would hand every visitor a fresh rate-limit bucket per request. It is
// ignored on purpose. The limits are therefore shared by all visitors; the hard guarantee for the
// AI features is the global daily/monthly USD cap in AgentGuard, and admin access and the ban list
// key on the authenticated account, never on this value.
//
// If the API ever moves behind a proxy that does append the client address, add a trusted-proxy
// check here rather than trusting the header blindly.
public static class RequestIp
{
    public static string Of(HttpRequest req) =>
        req.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
}
