import { useEffect, useState } from "react";
import { CalendarX, ExternalLink, Plus, Save, Trash2 } from "lucide-react";
import { cancelBooking, getBookingSettings, listBookings, saveBookingSettings, type Booking, type BookingSettings } from "../lib/booking";

const DAYS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];
const field = "w-full rounded-lg border border-white/10 bg-night-950/60 px-3 py-2 text-sm text-fg";
const inline = "rounded-lg border border-white/10 bg-night-950/60 px-3 py-2 text-sm text-fg";

// Availability (weekly windows, slot length, horizon, blocked dates) and the booking list.
export default function Bookings() {
  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    getBookingSettings().then(setSettings).catch((e: Error) => setError(e.message));
    listBookings().then(setBookings).catch((e: Error) => setError(e.message));
  };
  useEffect(() => {
    load();
  }, []);

  const set = (patch: Partial<BookingSettings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    setDirty(true);
    setSaving("idle");
  };

  const save = async () => {
    if (!settings) return;
    setSaving("saving");
    try {
      setSettings(await saveBookingSettings(settings));
      setDirty(false);
      setSaving("saved");
    } catch {
      setSaving("error");
    }
  };

  const cancel = async (b: Booking) => {
    if (!window.confirm(`Avboka ${b.name} ${new Date(b.start).toLocaleString("sv-SE")}? Besökaren får ett mejl.`)) return;
    await cancelBooking(b.id);
    load();
  };

  if (error) return <p className="text-red-300">{error}</p>;
  if (!settings || !bookings) return <p className="text-fg-muted">Hämtar…</p>;

  const upcoming = bookings.filter((b) => b.status === "confirmed" && new Date(b.end) > new Date());
  const past = bookings.filter((b) => !(b.status === "confirmed" && new Date(b.end) > new Date()));

  return (
    <div className="max-w-4xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bokning</h1>
          <p className="text-sm text-fg-muted">Besökare bokar lediga tider på havaljalal.se/boka. Du och besökaren får mejl med kalenderinbjudan.</p>
        </div>
        <label className="panel-tile flex items-center gap-3 rounded-xl px-4 py-2 text-sm">
          <input type="checkbox" checked={settings.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          {settings.enabled ? <span className="text-emerald-300">Bokning öppen</span> : <span className="text-fg-muted">Bokning stängd</span>}
          <a href="/boka" target="_blank" rel="noreferrer" className="text-fg-faint hover:text-fg" title="Öppna bokningssidan"><ExternalLink className="size-4" /></a>
        </label>
      </header>

      <section className="rounded-2xl border border-white/8 bg-night-900/50 p-5">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-ember-300">Tillgänglighet</h2>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block"><span className="mb-1 block text-xs text-fg-muted">Möteslängd (min)</span>
              <input type="number" min={15} max={120} step={5} value={settings.slotMinutes} onChange={(e) => set({ slotMinutes: Number(e.target.value) })} className={field} /></label>
            <label className="block"><span className="mb-1 block text-xs text-fg-muted">Hur långt fram (dagar)</span>
              <input type="number" min={1} max={90} value={settings.horizonDays} onChange={(e) => set({ horizonDays: Number(e.target.value) })} className={field} /></label>
            <label className="block"><span className="mb-1 block text-xs text-fg-muted">Tidigast (timmar från nu)</span>
              <input type="number" min={0} max={168} value={settings.leadHours} onChange={(e) => set({ leadHours: Number(e.target.value) })} className={field} /></label>
          </div>
          <div>
            <span className="mb-1 block text-xs text-fg-muted">Veckoschema (Stockholm-tid)</span>
            <ul className="space-y-2">
              {settings.weekly.map((w, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <select value={w.day} onChange={(e) => set({ weekly: settings.weekly.map((x, k) => (k === i ? { ...x, day: Number(e.target.value) } : x)) })} className={`${inline} w-24`}>
                    {DAYS.map((d, k) => <option key={d} value={k + 1}>{d}</option>)}
                  </select>
                  <input type="time" value={w.start} onChange={(e) => set({ weekly: settings.weekly.map((x, k) => (k === i ? { ...x, start: e.target.value } : x)) })} className={`${inline} w-32`} />
                  <span className="text-fg-faint">–</span>
                  <input type="time" value={w.end} onChange={(e) => set({ weekly: settings.weekly.map((x, k) => (k === i ? { ...x, end: e.target.value } : x)) })} className={`${inline} w-32`} />
                  <button onClick={() => set({ weekly: settings.weekly.filter((_, k) => k !== i) })} className="text-fg-faint hover:text-red-300" aria-label="Ta bort"><Trash2 className="size-4" /></button>
                </li>
              ))}
            </ul>
            <button onClick={() => set({ weekly: [...settings.weekly, { day: 1, start: "09:00", end: "11:00" }] })} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-fg-muted hover:text-fg">
              <Plus className="size-3.5" /> Lägg till fönster
            </button>
          </div>
          <label className="block"><span className="mb-1 block text-xs text-fg-muted">Blockerade datum (yyyy-mm-dd, kommaseparerade: semester, kursdagar)</span>
            <input value={settings.blockedDates.join(", ")} onChange={(e) => set({ blockedDates: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} className={field} /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-xs text-fg-muted">Rubrik på bokningssidan</span>
              <input value={settings.title} onChange={(e) => set({ title: e.target.value })} className={field} /></label>
            <label className="block"><span className="mb-1 block text-xs text-fg-muted">Plats (visas i bekräftelsen)</span>
              <input value={settings.location} onChange={(e) => set({ location: e.target.value })} className={field} /></label>
          </div>
          <label className="block"><span className="mb-1 block text-xs text-fg-muted">Intro</span>
            <textarea rows={2} value={settings.intro} onChange={(e) => set({ intro: e.target.value })} className={field} /></label>
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-fg-muted">
              {saving === "saving" && "Sparar…"}
              {saving === "saved" && "Sparat."}
              {saving === "error" && <span className="text-red-300">Kunde inte spara.</span>}
              {saving === "idle" && (dirty ? "Osparade ändringar" : "Allt sparat")}
            </span>
            <button onClick={save} disabled={!dirty || saving === "saving"} className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-medium text-night-950 disabled:opacity-40">
              <Save className="size-4" /> Spara
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-fg-faint">Kommande ({upcoming.length})</h2>
        {upcoming.length === 0 ? <p className="text-sm text-fg-faint">Inga bokningar.</p> : (
          <ul className="space-y-2">
            {upcoming.map((b) => (
              <li key={b.id} className="panel-tile flex flex-wrap items-center gap-3 rounded-xl px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-fg">{new Date(b.start).toLocaleString("sv-SE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="ml-2 text-sm text-fg">{b.name}</span>
                  <span className="ml-2 text-xs text-fg-muted">{b.email}{b.phone ? ` · ${b.phone}` : ""}</span>
                  {b.note && <span className="mt-1 block text-xs text-fg-muted">{b.note}</span>}
                </span>
                <a href={`mailto:${b.email}`} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-fg hover:border-ember-400/50">Mejla</a>
                <button onClick={() => cancel(b)} className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/25"><CalendarX className="size-3.5" /> Avboka</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-fg-faint">Tidigare / avbokade</h2>
          <ul className="space-y-1">
            {past.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 px-1 text-xs text-fg-muted">
                <span className="font-mono">{new Date(b.start).toLocaleString("sv-SE")}</span>
                <span>{b.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${b.status === "cancelled" ? "bg-red-500/15 text-red-300" : "bg-white/[0.06]"}`}>{b.status === "cancelled" ? "avbokad" : "genomförd"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
