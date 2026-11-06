using System.Text.Json;

namespace HavalApi.Data;

// Meeting booking: Haval sets weekly windows in admin; visitors pick a free slot. Times are kept
// as UTC instants and presented in Europe/Stockholm.
public sealed record WeeklyWindow(int Day, string Start, string End); // Day: 1 = Monday … 7 = Sunday, "HH:mm"

public sealed record BookingSettings(
    bool Enabled,
    int SlotMinutes,
    List<WeeklyWindow> Weekly,
    int HorizonDays,
    int LeadHours,
    List<string> BlockedDates,   // "yyyy-MM-dd"
    string Title,
    string Intro,
    string Location)
{
    public static readonly BookingSettings Default = new(
        false, 30,
        [new(1, "09:00", "11:00"), new(2, "09:00", "11:00"), new(3, "09:00", "11:00"), new(4, "09:00", "11:00"), new(5, "09:00", "11:00")],
        21, 24, [],
        "Boka ett samtal",
        "30 minuter om ett uppdrag, en idé eller bara teknik. Välj en tid som passar, så får du en bekräftelse med kalenderinbjudan.",
        "Video (länk skickas i bekräftelsen)");
}

public sealed record Booking(
    string Id,
    DateTime Ts,
    DateTime Start,     // UTC
    DateTime End,       // UTC
    string Name,
    string Email,
    string Note,
    string Status,      // "confirmed" | "cancelled"
    string Lang,
    string? Phone = null);

public interface IBookingStore
{
    Task<BookingSettings> GetSettingsAsync(CancellationToken ct);
    Task SaveSettingsAsync(BookingSettings settings, CancellationToken ct);
    Task<List<Booking>> ListAsync(DateTime fromUtc, CancellationToken ct);
    Task<Booking?> GetAsync(string id, CancellationToken ct);
    Task SaveAsync(Booking booking, CancellationToken ct);
}

public sealed class JsonFileBookingStore(string dataDir) : IBookingStore
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly string _settings = Path.Combine(dataDir, "booking-settings.json");
    private readonly string _dir = Path.Combine(dataDir, "bookings");
    private readonly SemaphoreSlim _lock = new(1, 1);

    public async Task<BookingSettings> GetSettingsAsync(CancellationToken ct)
    {
        if (!File.Exists(_settings)) return BookingSettings.Default;
        await using var s = File.OpenRead(_settings);
        return await JsonSerializer.DeserializeAsync<BookingSettings>(s, Json, ct) ?? BookingSettings.Default;
    }

    public async Task SaveSettingsAsync(BookingSettings settings, CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            Directory.CreateDirectory(dataDir);
            await using var s = File.Create(_settings);
            await JsonSerializer.SerializeAsync(s, settings, Json, ct);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<List<Booking>> ListAsync(DateTime fromUtc, CancellationToken ct)
    {
        if (!Directory.Exists(_dir)) return [];
        var result = new List<Booking>();
        foreach (var file in Directory.EnumerateFiles(_dir, "*.json"))
        {
            await using var s = File.OpenRead(file);
            var b = await JsonSerializer.DeserializeAsync<Booking>(s, Json, ct);
            if (b is not null && b.Start >= fromUtc) result.Add(b);
        }
        return result.OrderBy(b => b.Start).ToList();
    }

    public async Task<Booking?> GetAsync(string id, CancellationToken ct)
    {
        var path = Path.Combine(_dir, id + ".json");
        if (!File.Exists(path)) return null;
        await using var s = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<Booking>(s, Json, ct);
    }

    public async Task SaveAsync(Booking booking, CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            Directory.CreateDirectory(_dir);
            var path = Path.Combine(_dir, booking.Id + ".json");
            await using (var s = File.Create(path + ".tmp"))
                await JsonSerializer.SerializeAsync(s, booking, Json, ct);
            File.Move(path + ".tmp", path, overwrite: true);
        }
        finally
        {
            _lock.Release();
        }
    }
}
