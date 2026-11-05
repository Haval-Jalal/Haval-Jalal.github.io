using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http;

namespace HavalApi.Auth;

// Azure Static Web Apps forwards the signed-in user as a base64 JSON header on every API request.
// Locally the SWA CLI emulator sets the same header, so admin functions work the same way in dev.
public sealed class ClientPrincipal
{
    [JsonPropertyName("identityProvider")] public string IdentityProvider { get; init; } = "";
    [JsonPropertyName("userId")] public string UserId { get; init; } = "";
    [JsonPropertyName("userDetails")] public string UserDetails { get; init; } = "";
    [JsonPropertyName("userRoles")] public List<string> UserRoles { get; init; } = [];

    public bool IsAdmin => UserRoles.Contains("admin", StringComparer.OrdinalIgnoreCase);

    public static ClientPrincipal? From(HttpRequest req)
    {
        if (!req.Headers.TryGetValue("x-ms-client-principal", out var header) || string.IsNullOrEmpty(header))
            return null;
        try
        {
            var json = Encoding.UTF8.GetString(Convert.FromBase64String(header!));
            return JsonSerializer.Deserialize<ClientPrincipal>(json);
        }
        catch (FormatException)
        {
            return null;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
