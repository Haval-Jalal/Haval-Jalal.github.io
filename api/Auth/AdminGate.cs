using HavalApi.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Caching.Memory;

namespace HavalApi.Auth;

// The one place that decides whether a request may use /api/manage/*: the account must carry the
// admin role (assigned in Static Web Apps) and must not be on the ban list. The ban list is cached
// for 30 s so the check costs nothing on the hot path.
public sealed class AdminGate(ISecurityStore security, IMemoryCache cache)
{
    private const string CacheKey = "security:bans";

    public async Task<ClientPrincipal?> AdminAsync(HttpRequest req, CancellationToken ct)
    {
        var user = ClientPrincipal.From(req);
        if (user is not { IsAdmin: true }) return null;
        return await IsBannedAsync(user.UserId, ct) ? null : user;
    }

    public async Task<bool> IsBannedAsync(string userId, CancellationToken ct)
    {
        var bans = await cache.GetOrCreateAsync(CacheKey, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(30);
            return (await security.BansAsync(ct)).Select(b => b.UserId).ToHashSet();
        });
        return bans is not null && bans.Contains(userId);
    }

    public void Invalidate() => cache.Remove(CacheKey);
}
