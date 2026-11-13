using System.Text.Json;
using HavalApi.Cv;

namespace HavalApi.Data;

// Haval's own CV as an editable document (one per language), written in admin. When a document
// exists it is what /api/cv.pdf renders; otherwise the CV is derived from the site content.
public interface ICvStore
{
    Task<CvModel?> GetAsync(string lang, CancellationToken ct);
    Task SaveAsync(CvModel model, string lang, CancellationToken ct);
    Task<bool> DeleteAsync(string lang, CancellationToken ct);
}

public sealed class JsonFileCvStore(string dataDir) : ICvStore
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private string File(string lang) => Path.Combine(dataDir, $"cv-{CvLabels.Normalise(lang)}.json");

    public async Task<CvModel?> GetAsync(string lang, CancellationToken ct)
    {
        var path = File(lang);
        if (!System.IO.File.Exists(path)) return null;
        await using var stream = System.IO.File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<CvModel>(stream, Json, ct);
    }

    public async Task SaveAsync(CvModel model, string lang, CancellationToken ct)
    {
        Directory.CreateDirectory(dataDir);
        await System.IO.File.WriteAllTextAsync(File(lang), JsonSerializer.Serialize(model, Json), ct);
    }

    public Task<bool> DeleteAsync(string lang, CancellationToken ct)
    {
        var path = File(lang);
        if (!System.IO.File.Exists(path)) return Task.FromResult(false);
        System.IO.File.Delete(path);
        return Task.FromResult(true);
    }
}
