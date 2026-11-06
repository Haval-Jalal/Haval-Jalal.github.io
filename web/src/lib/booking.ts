// Meeting booking: free slots from the API, one POST to book.
export type BookingInfo =
  | { enabled: false; title: string; intro: string }
  | { enabled: true; title: string; intro: string; location: string; slotMinutes: number; timeZone: string; slots: string[] };

export async function getBookingInfo(): Promise<BookingInfo | null> {
  try {
    const r = await fetch("/api/booking", { cache: "no-store" });
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

export async function book(input: { start: string; name: string; email: string; phone?: string; note?: string; lang: string; website?: string }) {
  const r = await fetch("/api/booking", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  if (!r.ok) {
    let code = String(r.status);
    try {
      code = ((await r.json()) as { error?: string }).error ?? code;
    } catch {
      /* ignore */
    }
    throw new Error(code);
  }
  return (await r.json()) as { ok: boolean; id: string; start: string; end: string; mailed: boolean };
}

/* ---- admin ---- */

export type WeeklyWindow = { day: number; start: string; end: string };
export type BookingSettings = {
  enabled: boolean;
  slotMinutes: number;
  weekly: WeeklyWindow[];
  horizonDays: number;
  leadHours: number;
  blockedDates: string[];
  title: string;
  intro: string;
  location: string;
};
export type Booking = {
  id: string;
  ts: string;
  start: string;
  end: string;
  name: string;
  email: string;
  note: string;
  status: "confirmed" | "cancelled";
  lang: string;
  phone: string | null;
};

export async function getBookingSettings(): Promise<BookingSettings> {
  const r = await fetch("/api/manage/booking/settings", { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function saveBookingSettings(s: BookingSettings): Promise<BookingSettings> {
  const r = await fetch("/api/manage/booking/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function listBookings(): Promise<Booking[]> {
  const r = await fetch("/api/manage/bookings", { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return ((await r.json()) as { bookings: Booking[] }).bookings;
}

export async function cancelBooking(id: string): Promise<void> {
  const r = await fetch(`/api/manage/bookings/${encodeURIComponent(id)}/cancel`, { method: "POST" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}
