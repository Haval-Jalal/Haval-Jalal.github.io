import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, CalendarCheck, Check, Clock, Loader2, MapPin } from "lucide-react";
import { reveal, stagger } from "../components/Section";
import { book, getBookingInfo, type BookingInfo } from "../lib/booking";
import { trackEvent, trackView } from "../lib/beacon";
import { L, locale, numberLocale, t } from "../lib/i18n";

const field = "w-full rounded-xl border border-white/10 bg-night-900 px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-ember-400/60 focus:outline-none";

// /boka (/en/book): pick a day, pick a time, leave name + e-mail. Times shown in Stockholm time.
export default function BookingPage() {
  const [info, setInfo] = useState<BookingInfo | null | undefined>(undefined);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ start: string; mailed: boolean } | null>(null);

  useEffect(() => {
    trackView();
    document.title = `${t("book.title")} · Haval Jalal`;
    getBookingInfo().then(setInfo).catch(() => setInfo(null));
  }, []);

  const tz = info?.enabled ? info.timeZone : "Europe/Stockholm";
  const dayFmt = useMemo(() => new Intl.DateTimeFormat(numberLocale, { weekday: "short", day: "numeric", month: "short", timeZone: tz }), [tz]);
  const longFmt = useMemo(() => new Intl.DateTimeFormat(numberLocale, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: tz }), [tz]);
  const timeFmt = useMemo(() => new Intl.DateTimeFormat(numberLocale, { hour: "2-digit", minute: "2-digit", timeZone: tz }), [tz]);
  const keyFmt = useMemo(() => new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz }), [tz]);

  // Group slots by local day.
  const days = useMemo(() => {
    if (!info?.enabled) return [];
    const map = new Map<string, { label: string; slots: string[] }>();
    for (const s of info.slots) {
      const d = new Date(s);
      const key = keyFmt.format(d);
      if (!map.has(key)) map.set(key, { label: dayFmt.format(d), slots: [] });
      map.get(key)!.slots.push(s);
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
  }, [info, keyFmt, dayFmt]);

  useEffect(() => {
    if (!day && days.length > 0) setDay(days[0].key);
  }, [days, day]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slot) return;
    setStatus("sending");
    setError(null);
    try {
      const r = await book({ start: slot, name, email, phone, note, lang: locale, website });
      setConfirmed({ start: r.start, mailed: r.mailed });
      setStatus("done");
      trackEvent("booking_made");
    } catch (err) {
      const code = (err as Error).message;
      setError(code === "slot_taken" ? t("book.taken") : code === "rate_limited" ? t("err.rate_limited") : t("err.unknown"));
      setStatus("error");
      if (code === "slot_taken") getBookingInfo().then(setInfo);
    }
  };

  return (
    <div className="min-h-screen bg-night-950 text-fg">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
        <a href={L("/")} className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft className="size-4" /> havaljalal.se
        </a>
        <span className="font-mono text-xs text-fg-faint">{t("book.label")}</span>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-24">
        {info === undefined && <p className="pt-10 text-fg-muted">{t("pitch.loading")}</p>}
        {info === null && <p className="pt-10 text-fg-muted">{t("err.unknown")}</p>}
        {info && !info.enabled && (
          <div className="mx-auto max-w-xl pt-20 text-center">
            <h1 className="text-3xl font-semibold tracking-tight">{t("book.closed")}</h1>
            <p className="mt-3 text-fg-muted">{t("book.closed_sub")}</p>
            <a href={L("/#kontakt")} className="mt-8 inline-flex items-center gap-2 rounded-full bg-ember-500 px-5 py-2.5 text-sm font-medium text-night-950">
              {t("nav.cta")}
            </a>
          </div>
        )}
        {info?.enabled && status === "done" && confirmed && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-xl pt-20 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
              <CalendarCheck className="size-7" />
            </span>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight">{t("book.done")}</h1>
            <p className="mt-3 text-lg text-fg">{longFmt.format(new Date(confirmed.start))}</p>
            <p className="mt-2 text-sm text-fg-muted">
              {info.slotMinutes} min · {info.location}
            </p>
            <p className="mt-6 text-sm text-fg-muted">{confirmed.mailed ? t("book.done_mail") : t("book.done_nomail")}</p>
            <a href={L("/")} className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-sm text-fg hover:border-ember-400/50">
              {t("pitch.to_site")}
            </a>
          </motion.div>
        )}
        {info?.enabled && status !== "done" && (
          <motion.div initial="hidden" animate="show" variants={stagger}>
            <motion.p variants={reveal} className="pt-8 font-mono text-xs uppercase tracking-[0.2em] text-ember-300">
              {t("book.eyebrow")}
            </motion.p>
            <motion.h1 variants={reveal} className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">
              {info.title}
            </motion.h1>
            <motion.p variants={reveal} className="mt-3 max-w-2xl text-fg-muted">
              {info.intro}
            </motion.p>
            <motion.p variants={reveal} className="mt-3 flex flex-wrap gap-4 text-xs text-fg-faint">
              <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" /> {info.slotMinutes} min</span>
              <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" /> {info.location}</span>
              <span>{t("book.tz")}: {tz}</span>
            </motion.p>

            {days.length === 0 ? (
              <motion.p variants={reveal} className="mt-10 text-fg-muted">{t("book.none")}</motion.p>
            ) : (
              <motion.div variants={reveal} className="mt-10 grid gap-6 lg:grid-cols-[1fr_1fr]">
                <div className="min-w-0 space-y-5">
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-fg-faint">{t("book.pick_day")}</p>
                    <div className="flex flex-wrap gap-2">
                      {days.map((d) => (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => { setDay(d.key); setSlot(null); }}
                          className={`rounded-xl border px-3 py-2 text-sm transition-colors ${day === d.key ? "border-ember-400/60 bg-ember-500/15 text-fg" : "border-white/10 text-fg-muted hover:border-white/25 hover:text-fg"}`}
                        >
                          {d.label}
                          <span className="ml-1.5 font-mono text-[10px] text-fg-faint">{d.slots.length}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-fg-faint">{t("book.pick_time")}</p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {(days.find((d) => d.key === day)?.slots ?? []).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSlot(s)}
                          className={`rounded-xl border px-3 py-2 font-mono text-sm transition-colors ${slot === s ? "border-ember-400 bg-ember-500 text-night-950" : "border-white/10 text-fg hover:border-ember-400/50"}`}
                        >
                          {timeFmt.format(new Date(s))}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <form onSubmit={submit} className="panel-tile min-w-0 space-y-3 rounded-2xl p-5">
                  <p className="text-sm font-medium text-fg">
                    {slot ? longFmt.format(new Date(slot)) : t("book.choose_first")}
                  </p>
                  <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" aria-hidden="true" className="absolute -left-[9999px] h-px w-px opacity-0" />
                  <input required value={name} onChange={(e) => setName(e.target.value)} placeholder={t("viewer.name")} className={field} />
                  <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("viewer.email")} className={field} />
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("viewer.phone")} className={field} />
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={t("book.note")} className={field} />
                  {error && <p className="text-xs text-red-300">{error}</p>}
                  <button
                    type="submit"
                    disabled={!slot || status === "sending"}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ember-500 px-5 py-2.5 text-sm font-medium text-night-950 disabled:opacity-40"
                  >
                    {status === "sending" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} {t("book.confirm")}
                  </button>
                  <p className="text-xs text-fg-faint">{t("book.privacy")}</p>
                </form>
              </motion.div>
            )}
          </motion.div>
        )}
      </main>
    </div>
  );
}
