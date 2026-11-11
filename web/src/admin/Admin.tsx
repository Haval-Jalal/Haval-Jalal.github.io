import { useEffect, useState } from "react";
import { BarChart3, Cpu, FileText, Inbox, LogOut, Save, Settings as SettingsIcon, ExternalLink, Plus, Trash2, ChevronUp, ChevronDown, ShieldAlert, ShieldCheck, ShieldOff, Upload, X, Star, Target, Sparkles, FlaskConical, CalendarDays, Newspaper, Mail, Loader2 } from "lucide-react";
import { loginUrl, logoutUrl, useAuth } from "../lib/auth";
import { useSiteContent } from "../lib/content";
import type { JourneyStep, Project, SiteContent } from "../data/content";
import { STATUS_LABEL } from "../components/Projects";
import Pitches from "./Pitches";
import Builds from "./Builds";
import Bookings from "./Bookings";
import Posts from "./Posts";
import { AdminLangContext, AiButton } from "./AiHelp";
import { sendWeeklyReport } from "../lib/posts";

type Tab = "overview" | "content" | "posts" | "pitches" | "lab" | "bookings" | "leads" | "ai" | "security" | "settings";

export default function Admin() {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>("overview");

  if (auth.status === "loading") return <Shell><p className="text-fg-muted">Kontrollerar inloggning…</p></Shell>;
  if (auth.status === "anonymous") {
    return (
      <Gate title="Haval OS · Admin" text="Den här delen är privat. Logga in med GitHub för att fortsätta.">
        <a href={loginUrl} className="mt-6 inline-block rounded-full bg-ember-500 px-5 py-2.5 text-sm font-medium text-night-950">
          Logga in med GitHub
        </a>
      </Gate>
    );
  }
  if (auth.banned) {
    return (
      <Gate title="Åtkomst blockerad" text={`Kontot ${auth.user.userDetails} är blockerat från den här sajten.`}>
        <a href={logoutUrl} className="mt-6 inline-block rounded-full border border-white/10 px-5 py-2.5 text-sm text-fg">Logga ut</a>
      </Gate>
    );
  }
  if (!auth.isAdmin) {
    return (
      <Gate title="Ingen åtkomst" text={`${auth.user.userDetails} har inte behörighet till admin. Försöket har loggats.`}>
        <a href={logoutUrl} className="mt-6 inline-block rounded-full border border-white/10 px-5 py-2.5 text-sm text-fg">Logga ut</a>
      </Gate>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
    { key: "overview", label: "Översikt", icon: BarChart3 },
    { key: "content", label: "Innehåll", icon: FileText },
    { key: "posts", label: "Nu & changelog", icon: Newspaper },
    { key: "pitches", label: "Rekryterare", icon: Target },
    { key: "lab", label: "Build Lab", icon: FlaskConical },
    { key: "bookings", label: "Bokning", icon: CalendarDays },
    { key: "leads", label: "Leads", icon: Inbox },
    { key: "ai", label: "AI & kostnad", icon: Cpu },
    { key: "security", label: "Säkerhet", icon: ShieldAlert },
    { key: "settings", label: "Inställningar", icon: SettingsIcon },
  ];

  return (
    <Shell>
      <div className="grid min-h-screen grid-cols-[220px_1fr] max-md:grid-cols-1">
        <aside className="border-r border-white/5 p-5 max-md:border-b max-md:border-r-0">
          <div className="mb-8 flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-ember-400 text-xs font-bold text-night-950">H</span>
            <span className="text-sm font-semibold">Haval OS · Admin</span>
          </div>
          <nav className="space-y-1">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm ${
                  tab === key ? "bg-white/[0.07] text-fg" : "text-fg-muted hover:text-fg"
                }`}
              >
                <Icon className="size-4" strokeWidth={1.75} />
                {label}
              </button>
            ))}
          </nav>
          <div className="mt-10 space-y-2 text-xs text-fg-faint">
            <p>Inloggad som {auth.user.userDetails}</p>
            <a href="/" target="_blank" className="flex items-center gap-1 hover:text-fg">
              <ExternalLink className="size-3" /> Öppna sajten
            </a>
            <a href={logoutUrl} className="flex items-center gap-1 hover:text-fg">
              <LogOut className="size-3" /> Logga ut
            </a>
          </div>
        </aside>
        <main className="p-6 md:p-10">
          {tab === "overview" && <Overview />}
          {tab === "content" && <ContentEditor />}
          {tab === "posts" && <Posts />}
          {tab === "pitches" && <Pitches />}
          {tab === "lab" && <Builds />}
          {tab === "bookings" && <Bookings />}
          {tab === "leads" && <Leads />}
          {tab === "ai" && <AiUsage />}
          {tab === "security" && <Security me={auth.user.userId} />}
          {tab === "settings" && <SettingsEditor />}
        </main>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-night-950 text-fg">{children}</div>;
}

function Gate({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <Shell>
      <div className="mx-auto mt-24 max-w-md px-5 text-center">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-3 text-fg-muted">{text}</p>
        {children}
      </div>
    </Shell>
  );
}

/* ---------- Översikt (analytics) ---------- */

type Summary = {
  days: number;
  views: number;
  visitors: number;
  perDay: { day: string; views: number; visitors: number }[];
  topPaths: { key: string; count: number }[];
  topReferrers: { key: string; count: number }[];
  devices: { key: string; count: number }[];
  events: { key: string; count: number }[];
};

function Overview() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    fetch(`/api/manage/analytics?days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [days]);

  if (error) return <p className="text-red-300">Kunde inte hämta statistik: {error}</p>;
  if (!data) return <p className="text-fg-muted">Hämtar statistik…</p>;

  const max = Math.max(1, ...data.perDay.map((d) => d.views));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Trafik</h1>
          <p className="text-sm text-fg-muted">Cookie-fri mätning, besökare räknas unikt per dag.</p>
        </div>
        <div className="flex items-center gap-2">
        <WeeklyReportButton />
        <div className="flex gap-1 rounded-full border border-white/10 p-1 text-xs">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-full px-3 py-1.5 ${days === d ? "bg-white text-night-950" : "text-fg-muted hover:text-fg"}`}
            >
              {d} dagar
            </button>
          ))}
        </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Sidvisningar" value={data.views} />
        <Stat label="Besökare" value={data.visitors} />
        <Stat label="Interaktioner" value={data.events.reduce((n, e) => n + e.count, 0)} />
      </div>

      {/* Single series: one hue, no legend needed; the title names the series. */}
      <section className="panel-tile rounded-2xl p-5">
        <h2 className="text-sm font-medium">Sidvisningar per dag</h2>
        <div className="mt-5 flex h-40 gap-[3px]" role="img" aria-label="Sidvisningar per dag">
          {data.perDay.map((d) => (
            <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end" title={`${d.day}: ${d.views} visningar, ${d.visitors} besökare`}>
              <div
                className="rounded-t-[3px] bg-ember-400 transition-opacity group-hover:opacity-80"
                style={{ height: `${Math.max(d.views > 0 ? 3 : 1, (d.views / max) * 100)}%`, opacity: d.views > 0 ? 1 : 0.25 }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-fg-faint">
          <span>{data.perDay[0]?.day}</span>
          <span>{data.perDay.at(-1)?.day}</span>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <TopList title="Sidor" items={data.topPaths} />
        <TopList title="Trafikkällor" items={data.topReferrers} empty="Direkt / inga referrers ännu" />
        <TopList title="Enheter" items={data.devices} />
        <TopList title="Händelser" items={data.events} empty="Inga händelser ännu" />
      </div>
    </div>
  );
}

// Sends the same e-mail the Monday cron sends, right now, and shows the text.
function WeeklyReportButton() {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [result, setResult] = useState<{ mailed: boolean; text: string } | null>(null);
  const run = async () => {
    setState("sending");
    try {
      const r = await sendWeeklyReport();
      setResult({ mailed: r.mailed, text: r.text });
      setState("done");
    } catch {
      setState("error");
    }
  };
  return (
    <>
      <button onClick={() => void run()} disabled={state === "sending"} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-fg-muted hover:text-fg disabled:opacity-50" title="Skickar veckorapporten till din e-post nu">
        {state === "sending" ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />} Veckorapport
      </button>
      {state === "error" && <span className="text-xs text-red-300">Kunde inte skicka.</span>}
      {state === "done" && result && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setState("idle")}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-2xl border border-white/10 bg-night-900 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">{result.mailed ? "Veckorapporten är skickad till din e-post." : "E-post är inte konfigurerad; här är rapporten."}</h2>
              <button onClick={() => setState("idle")} className="text-fg-faint hover:text-fg" aria-label="Stäng"><X className="size-4" /></button>
            </div>
            <pre className="mt-4 whitespace-pre-wrap font-mono text-xs leading-relaxed text-fg-muted">{result.text}</pre>
            <p className="mt-4 text-[11px] text-fg-faint">Skickas automatiskt varje måndag kl 07 via GitHub Actions.</p>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, format }: { label: string; value: number; format?: (n: number) => string }) {
  return (
    <div className="panel-tile rounded-2xl p-5">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{format ? format(value) : value.toLocaleString("sv-SE")}</p>
    </div>
  );
}

function TopList({ title, items, empty = "Inget ännu" }: { title: string; items: { key: string; count: number }[]; empty?: string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <section className="panel-tile rounded-2xl p-5">
      <h2 className="text-sm font-medium">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-xs text-fg-faint">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((i) => (
            <li key={i.key} className="text-xs">
              <div className="flex justify-between gap-2">
                <span className="truncate text-fg">{i.key}</span>
                <span className="font-mono text-fg-muted">{i.count}</span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-white/5">
                <div className="h-1 rounded-full bg-ember-400" style={{ width: `${(i.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- AI & kostnad ---------- */

type UsageSummary = {
  days: number;
  spentTodayUsd: number;
  dailyCapUsd: number;
  spentMonthUsd: number;
  monthlyCapUsd: number;
  mode: "full" | "eco" | "stopped";
  activeCalls: number;
  todayInputTokens: number;
  todayOutputTokens: number;
  todayCalls: number;
  totalUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  perDay: { day: string; usd: number; inputTokens: number; outputTokens: number; calls: number }[];
  byFeature: { feature: string; calls: number; usd: number; inputTokens: number; outputTokens: number; avgUsd: number }[];
  recent: { ts: string; feature: string; model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; usd: number; truncated: boolean }[];
};

// The real billed cost from Anthropic's Admin Cost Report API (facit), when an Admin key is set.
type ActualCost = {
  configured: boolean;
  totalUsd: number;
  spentMonthUsd: number;
  perDay: { day: string; usd: number }[];
  byModel: { model: string; usd: number }[];
  asOf: string;
  error?: string | null;
};

const FEATURE_LABEL: Record<string, string> = { build: "Build Lab (Opus 5.5)", chat: "Digital Haval (Sonnet 5.5)", cvpolish: "CV-byggaren, AI-text (Sonnet 5.5)", pitch: "Rekryterarläge, utkast (Sonnet 5.5)", translate: "Översättning av innehåll (Sonnet 5.5)", draft: "Skrivhjälp i admin (Sonnet 5.5)" };
const MODEL_LABEL = (m: string) => (m === "övrigt" ? "Övrigt" : m.replace("claude-", "").replace(/-/g, " "));
const usd = (n: number) => `${n.toFixed(n < 1 ? 3 : 2)} USD`;
const tok = (n: number) => n.toLocaleString("sv-SE");

function AiUsage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<UsageSummary | null>(null);
  const [actual, setActual] = useState<ActualCost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  // Live: refetch every 5 s while the tab is visible, so a running Build Lab shows up as it lands.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(`/api/manage/ai?days=${days}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d: UsageSummary) => {
          if (cancelled) return;
          setData(d);
          setUpdatedAt(new Date());
          setError(null);
        })
        .catch((e: Error) => !cancelled && setError(e.message));
      // Facit from Anthropic: only up to 90 days, and it never blocks the estimate above.
      fetch(`/api/manage/ai/cost?days=${Math.min(days, 90)}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d: ActualCost) => !cancelled && setActual(d))
        .catch(() => !cancelled && setActual(null));
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [days]);

  if (error && !data) return <p className="text-red-300">Kunde inte hämta AI-statistik: {error}</p>;
  if (!data) return <p className="text-fg-muted">Hämtar…</p>;

  const share = data.dailyCapUsd > 0 ? data.spentTodayUsd / data.dailyCapUsd : 0;
  const monthShare = data.monthlyCapUsd > 0 ? data.spentMonthUsd / data.monthlyCapUsd : 0;
  const warn = share >= 0.7;
  const monthWarn = monthShare >= 0.8;
  const max = Math.max(0.001, ...data.perDay.map((d) => d.usd));
  const modeLabel = { full: "Fullt läge: Opus bygger", eco: "Sparläge: Sonnet bygger", stopped: "Stoppat: endast lead-formulär" }[data.mode];
  const actualMax = Math.max(0.001, ...(actual?.perDay ?? []).map((d) => d.usd));
  // Flag a real gap between facit and the token-estimate over the same period — a likely sign of a
  // stale price in Pricing.Usd or calls that were billed but never logged. Ignore tiny amounts.
  const divergence = actual?.configured && !actual.error && actual.totalUsd > 0.5
    ? Math.abs(actual.totalUsd - data.totalUsd) / actual.totalUsd
    : 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI & kostnad</h1>
          <p className="text-sm text-fg-muted">
            {actual?.configured
              ? "Faktisk kostnad hämtad direkt från Anthropic (facit). Uppskattningen nedan räknas från tokens per anrop och styr taken."
              : "Räknat från faktiska tokens per anrop (listpris). Lägg in ANTHROPIC_ADMIN_KEY för att visa facit från Anthropic här."}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full border px-3 py-1 ${data.mode === "full" ? "border-emerald-400/30 text-emerald-200" : "border-amber-400/40 text-amber-200"}`}>
              ● {modeLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-fg-muted">
              <span className={`size-1.5 rounded-full ${data.activeCalls > 0 ? "animate-pulse bg-ember-400" : "bg-emerald-400"}`} />
              Live · {data.activeCalls > 0 ? `${data.activeCalls} anrop pågår` : "inget pågår"} · uppdaterad {updatedAt?.toLocaleTimeString("sv-SE") ?? "…"}
            </span>
          </div>
        </div>
        <div className="flex gap-1 rounded-full border border-white/10 p-1 text-xs">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)} className={`rounded-full px-3 py-1.5 ${days === d ? "bg-white text-night-950" : "text-fg-muted hover:text-fg"}`}>
              {d} dagar
            </button>
          ))}
        </div>
      </header>

      {/* Facit: the real billed cost from Anthropic, when an Admin key is configured. */}
      {actual?.configured && !actual.error ? (
        <section className="rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-emerald-100">Faktisk kostnad · facit från Anthropic</h2>
            <span className="text-[11px] text-fg-faint">uppdaterad {new Date(actual.asOf).toLocaleTimeString("sv-SE")} · data kan släpa ~5 min</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div><p className="text-[11px] text-fg-faint">Faktiskt, {days} dagar</p><p className="font-mono text-2xl text-emerald-200">{usd(actual.totalUsd)}</p></div>
            <div><p className="text-[11px] text-fg-faint">Faktiskt denna månad</p><p className="font-mono text-2xl text-emerald-200">{usd(actual.spentMonthUsd)}</p></div>
            <div><p className="text-[11px] text-fg-faint">Uppskattat, samma period</p><p className="font-mono text-2xl text-fg-muted">{usd(data.totalUsd)}</p></div>
          </div>
          {divergence > 0.2 && (
            <p className="mt-3 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
              ⚠ Uppskattningen skiljer sig {Math.round(divergence * 100)} % från facit ({usd(data.totalUsd)} mot {usd(actual.totalUsd)}). Kan bero på ett inaktuellt listpris i <code className="rounded bg-white/10 px-1">Pricing.Usd</code>, omförsök eller anrop som debiterats men inte loggats.
            </p>
          )}
          {actual.perDay.length > 0 && (
            <>
              <div className="mt-5 flex h-28 gap-[3px]" role="img" aria-label="Faktisk kostnad per dag">
                {actual.perDay.map((d) => (
                  <div key={d.day} className="group flex h-full flex-1 flex-col justify-end" title={`${d.day}: ${usd(d.usd)} (facit)`}>
                    <div className="rounded-t-[3px] bg-emerald-400 transition-opacity group-hover:opacity-80" style={{ height: `${Math.max(d.usd > 0 ? 3 : 1, (d.usd / actualMax) * 100)}%`, opacity: d.usd > 0 ? 1 : 0.25 }} />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between font-mono text-[10px] text-fg-faint">
                <span>{actual.perDay[0]?.day}</span>
                <span>{actual.perDay.at(-1)?.day}</span>
              </div>
            </>
          )}
          {actual.byModel.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-muted">
              {actual.byModel.map((m) => (
                <span key={m.model}>{MODEL_LABEL(m.model)}: <span className="font-mono text-fg">{usd(m.usd)}</span></span>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-fg-faint">Inkluderar all användning av Admin-nyckelns organisation, inte bara den här sajten. Taken nedan styrs av uppskattningen, som uppdateras direkt per anrop.</p>
        </section>
      ) : actual?.configured && actual.error ? (
        <section className="panel-tile rounded-2xl p-5">
          <h2 className="text-sm font-medium">Faktisk kostnad</h2>
          <p className="mt-1 text-xs text-amber-200">Kunde inte hämta facit från Anthropic just nu ({actual.error}). Kontrollera att ANTHROPIC_ADMIN_KEY är en giltig Admin-nyckel (sk-ant-admin…). Uppskattningen nedan gäller tills vidare.</p>
        </section>
      ) : actual && !actual.configured ? (
        <section className="panel-tile rounded-2xl p-5">
          <h2 className="text-sm font-medium">Visa faktisk kostnad (facit)</h2>
          <p className="mt-1 text-xs text-fg-faint">Siffrorna nedan är en uppskattning från tokens × listpris. För Anthropics verkliga belopp: skapa en <strong>Admin API-nyckel</strong> (sk-ant-admin…) i Claude Console och lägg den i miljövariabeln <code className="rounded bg-white/10 px-1">ANTHROPIC_ADMIN_KEY</code>. Det är en annan nyckel än ANTHROPIC_API_KEY.</p>
        </section>
      ) : null}

      {/* Today vs cap: a meter, with the warning in words and an icon, never colour alone. */}
      <section className={`rounded-2xl border p-5 ${warn ? "border-amber-400/40 bg-amber-400/10" : "panel-tile"}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium">Idag</p>
          <p className="text-xs text-fg-muted">
            {usd(data.spentTodayUsd)} av {data.dailyCapUsd} USD ({Math.round(share * 100)} %)
            {warn && <span className="ml-2 font-medium text-amber-200">⚠ Nära dagstaket</span>}
          </p>
        </div>
        <div className="mt-3 h-2 rounded-full bg-white/5">
          <div className={`h-2 rounded-full ${warn ? "bg-amber-400" : "bg-ember-400"}`} style={{ width: `${Math.min(100, share * 100)}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><p className="text-[11px] text-fg-faint">Kostnad idag</p><p className="font-mono text-lg text-fg">{usd(data.spentTodayUsd)}</p></div>
          <div><p className="text-[11px] text-fg-faint">Tokens in (inkl. cache)</p><p className="font-mono text-lg text-fg">{tok(data.todayInputTokens)}</p></div>
          <div><p className="text-[11px] text-fg-faint">Tokens ut</p><p className="font-mono text-lg text-fg">{tok(data.todayOutputTokens)}</p></div>
          <div><p className="text-[11px] text-fg-faint">Anrop idag</p><p className="font-mono text-lg text-fg">{data.todayCalls}</p></div>
        </div>
        <p className="mt-3 text-xs text-fg-faint">Från 70 % går Build Lab i sparläge (Sonnet). Vid 100 % stoppas AI:t till midnatt UTC och besökare får skicka idén till dig i stället. Ändra med AGENT_DAILY_CAP_USD / AGENT_ECO_THRESHOLD.</p>
      </section>

      <section className={`rounded-2xl border p-5 ${monthWarn ? "border-amber-400/40 bg-amber-400/10" : "panel-tile"}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium">Den här månaden</p>
          <p className="text-xs text-fg-muted">
            {usd(data.spentMonthUsd)} av {data.monthlyCapUsd} USD ({Math.round(monthShare * 100)} %)
            {monthWarn && <span className="ml-2 font-medium text-amber-200">⚠ Nära månadstaket</span>}
          </p>
        </div>
        <div className="mt-3 h-2 rounded-full bg-white/5">
          <div className={`h-2 rounded-full ${monthWarn ? "bg-amber-400" : "bg-ember-400"}`} style={{ width: `${Math.min(100, monthShare * 100)}%` }} />
        </div>
        <p className="mt-2 text-xs text-fg-faint">Hård gräns: när månadstaket nås stoppas alla AI-anrop till den 1:a. Ändra med AGENT_MONTHLY_CAP_USD (Max-planen ger 100 USD/mån).</p>
      </section>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label={`Kostnad, ${days} dagar`} value={data.totalUsd} format={usd} />
        <Stat label="Anrop" value={data.perDay.reduce((n, d) => n + d.calls, 0)} />
        <Stat label="Input-tokens" value={data.inputTokens} />
        <Stat label="Output-tokens" value={data.outputTokens} />
      </div>

      <section className="panel-tile rounded-2xl p-5">
        <h2 className="text-sm font-medium">Kostnad per dag</h2>
        <div className="mt-5 flex h-40 gap-[3px]" role="img" aria-label="Kostnad per dag">
          {data.perDay.map((d) => (
            <div key={d.day} className="group flex h-full flex-1 flex-col justify-end" title={`${d.day}: ${usd(d.usd)}, ${d.calls} anrop, ${tok(d.inputTokens)} in / ${tok(d.outputTokens)} ut`}>
              <div
                className="rounded-t-[3px] bg-ember-400 transition-opacity group-hover:opacity-80"
                style={{ height: `${Math.max(d.usd > 0 ? 3 : 1, (d.usd / max) * 100)}%`, opacity: d.usd > 0 ? 1 : 0.25 }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-fg-faint">
          <span>{data.perDay[0]?.day}</span>
          <span>{data.perDay.at(-1)?.day}</span>
        </div>
      </section>

      <section className="panel-tile rounded-2xl p-5">
        <h2 className="text-sm font-medium">Per funktion</h2>
        {data.byFeature.length === 0 ? (
          <p className="mt-3 text-xs text-fg-faint">Inga AI-anrop under perioden.</p>
        ) : (
          <table className="mt-3 w-full text-left text-xs">
            <thead className="text-fg-faint">
              <tr>
                <th className="py-1 font-medium">Funktion</th>
                <th className="py-1 text-right font-medium">Anrop</th>
                <th className="py-1 text-right font-medium">Tokens in</th>
                <th className="py-1 text-right font-medium">Tokens ut</th>
                <th className="py-1 text-right font-medium">Snitt/anrop</th>
                <th className="py-1 text-right font-medium">Kostnad</th>
              </tr>
            </thead>
            <tbody>
              {data.byFeature.map((f) => (
                <tr key={f.feature} className="border-t border-white/5">
                  <td className="py-2 text-fg">{FEATURE_LABEL[f.feature] ?? f.feature}</td>
                  <td className="py-2 text-right font-mono">{f.calls}</td>
                  <td className="py-2 text-right font-mono">{tok(f.inputTokens)}</td>
                  <td className="py-2 text-right font-mono">{tok(f.outputTokens)}</td>
                  <td className="py-2 text-right font-mono">{usd(f.avgUsd)}</td>
                  <td className="py-2 text-right font-mono text-fg">{usd(f.usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-fg-faint">Cache-lästa tokens under perioden: {tok(data.cacheReadTokens)} (systemprompten cachas, så upprepade anrop blir billigare).</p>
      </section>

      <section className="panel-tile rounded-2xl p-5">
        <h2 className="text-sm font-medium">Senaste anrop</h2>
        <p className="text-xs text-fg-faint">Exakta räknare från API-svaret, samma som Anthropic Console använder. Cache-skrivningar räknas till 1,25× inputpris.</p>
        {data.recent.length === 0 ? (
          <p className="mt-3 text-xs text-fg-faint">Inga anrop under perioden.</p>
        ) : (
          <table className="mt-3 w-full text-left text-xs">
            <thead className="text-fg-faint">
              <tr>
                <th className="py-1 font-medium">Tid</th>
                <th className="py-1 font-medium">Funktion</th>
                <th className="py-1 font-medium">Modell</th>
                <th className="py-1 text-right font-medium">In</th>
                <th className="py-1 text-right font-medium">Ut</th>
                <th className="py-1 text-right font-medium">Cache läs/skriv</th>
                <th className="py-1 text-right font-medium">Kostnad</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((r, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="py-2 font-mono text-fg-muted">{new Date(r.ts).toLocaleString("sv-SE", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="py-2 text-fg">
                    {r.feature === "build" ? "Build Lab" : r.feature === "cvpolish" ? "CV-text" : "Chatt"}
                    {r.truncated && <span className="ml-2 rounded bg-amber-400/15 px-1.5 py-px text-[10px] text-amber-200">avklippt</span>}
                  </td>
                  <td className="py-2 font-mono text-fg-muted">{r.model.replace("claude-", "")}</td>
                  <td className="py-2 text-right font-mono">{tok(r.inputTokens)}</td>
                  <td className="py-2 text-right font-mono">{tok(r.outputTokens)}</td>
                  <td className="py-2 text-right font-mono text-fg-muted">{tok(r.cacheReadTokens)} / {tok(r.cacheWriteTokens)}</td>
                  <td className="py-2 text-right font-mono text-fg">{usd(r.usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

/* ---------- Leads ---------- */

type Lead = { id: string; ts: string; name: string; email: string; message: string; idea?: string; plan?: string; source: string };

function Leads() {
  const [data, setData] = useState<{ leads: Lead[]; spentTodayUsd: number; dailyCapUsd: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/manage/leads")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ leads: [], spentTodayUsd: 0, dailyCapUsd: 0 }));
  }, []);
  if (!data) return <p className="text-fg-muted">Hämtar…</p>;
  return (
    <div className="max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-fg-muted">Meddelanden från kontaktformuläret och idéer från Build Lab. Du får också ett mejl per lead.</p>
        </div>
        <div className="panel-tile rounded-xl px-4 py-2 text-xs text-fg-muted">
          AI-kostnad idag: <span className="font-mono text-fg">{data.spentTodayUsd.toFixed(3)} USD</span> av {data.dailyCapUsd} USD
        </div>
      </header>
      {data.leads.length === 0 ? (
        <p className="text-sm text-fg-faint">Inga leads ännu.</p>
      ) : (
        <ul className="space-y-2">
          {data.leads.map((l) => (
            <li key={l.id} className="panel-tile rounded-xl">
              <button onClick={() => setOpen(open === l.id ? null : l.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                <span>
                  <span className="text-sm font-medium text-fg">{l.name || "(utan namn)"}</span>
                  <span className="ml-2 text-xs text-fg-muted">{l.email}</span>
                  <span className="ml-2 rounded-full border border-white/10 px-1.5 font-mono text-[10px] text-fg-faint">{l.source === "contact" ? "kontakt" : l.source}</span>
                </span>
                <span className="font-mono text-[11px] text-fg-faint">{new Date(l.ts).toLocaleString("sv-SE")}</span>
              </button>
              {open === l.id && (
                <div className="space-y-3 border-t border-white/5 px-4 py-3 text-sm">
                  {l.message && <p className="text-fg">{l.message}</p>}
                  {l.idea && <p className="text-fg-muted"><span className="text-fg-faint">Idé:</span> {l.idea}</p>}
                  {l.plan && <pre className="whitespace-pre-wrap font-sans text-xs text-fg-muted">{l.plan}</pre>}
                  <a href={`mailto:${l.email}`} className="inline-block rounded-full border border-white/10 px-3 py-1.5 text-xs text-fg hover:border-ember-400/50">Svara via e-post</a>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Säkerhet ---------- */

type SecurityUser = {
  userId: string;
  user: string;
  provider: string;
  attempts: number;
  first: string;
  last: string;
  lastResult: "admin" | "denied" | "blocked";
  banned: boolean;
  note: string | null;
};
type AuthAttempt = { id: string; ts: string; provider: string; userId: string; user: string; result: string; path: string; ipHash: string };
type SecurityData = { users: SecurityUser[]; recent: AuthAttempt[]; bans: number };

const RESULT_LABEL: Record<string, { text: string; cls: string }> = {
  admin: { text: "Admin", cls: "bg-emerald-500/15 text-emerald-300" },
  denied: { text: "Nekad", cls: "bg-amber-500/15 text-amber-200" },
  blocked: { text: "Blockerad", cls: "bg-red-500/15 text-red-300" },
};

function Security({ me }: { me: string }) {
  const [data, setData] = useState<SecurityData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    fetch("/api/manage/security", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const toggle = async (u: SecurityUser) => {
    const action = u.banned ? "unban" : "ban";
    if (!u.banned && !window.confirm(`Blockera ${u.user}? Kontot nekas allt i admin tills du häver blockeringen.`)) return;
    setBusy(u.userId);
    const r = await fetch(`/api/manage/security/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: u.userId, user: u.user, provider: u.provider }),
    });
    setBusy(null);
    if (!r.ok) setError(`Kunde inte ${u.banned ? "häva blockeringen" : "blockera"} (HTTP ${r.status})`);
    await load();
  };

  if (error) return <p className="text-red-300">{error}</p>;
  if (!data) return <p className="text-fg-muted">Hämtar…</p>;

  const others = data.users.filter((u) => u.userId !== me);
  const denied = others.filter((u) => !u.banned && u.lastResult !== "admin").length;

  return (
    <div className="max-w-4xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Säkerhet</h1>
          <p className="text-sm text-fg-muted">
            Varje GitHub-konto som loggar in och försöker nå admin hamnar här. Blockerade konton stoppas i API:et även om de skulle få en roll.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="panel-tile rounded-xl px-3 py-2 text-fg-muted">Nekade: <span className="font-mono text-amber-200">{denied}</span></span>
          <span className="panel-tile rounded-xl px-3 py-2 text-fg-muted">Blockerade: <span className="font-mono text-red-300">{data.bans}</span></span>
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-fg-faint">Konton</h2>
        {data.users.length === 0 ? (
          <p className="text-sm text-fg-faint">Inga inloggningar loggade ännu.</p>
        ) : (
          <ul className="space-y-2">
            {data.users.map((u) => {
              const r = RESULT_LABEL[u.lastResult] ?? RESULT_LABEL.denied;
              const self = u.userId === me;
              return (
                <li key={u.userId} className="panel-tile flex flex-wrap items-center gap-3 rounded-xl px-4 py-3">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${u.banned ? "bg-red-500/15 text-red-300" : u.lastResult === "admin" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-200"}`}>
                    {u.banned ? <ShieldOff className="size-4" /> : u.lastResult === "admin" ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-fg">{u.user || "(okänt namn)"}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${r.cls}`}>{u.banned ? "Blockerad" : r.text}</span>
                      {self && <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-fg-muted">du</span>}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-fg-faint">
                      {u.provider} · id {u.userId} · {u.attempts} {u.attempts === 1 ? "försök" : "försök"} · senast {new Date(u.last).toLocaleString("sv-SE")}
                    </span>
                  </span>
                  {!self && (
                    <button
                      onClick={() => toggle(u)}
                      disabled={busy === u.userId}
                      className={`rounded-full px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${
                        u.banned ? "border border-white/10 text-fg hover:border-ember-400/50" : "bg-red-500/15 text-red-200 hover:bg-red-500/25"
                      }`}
                    >
                      {busy === u.userId ? "…" : u.banned ? "Häv blockering" : "Blockera"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-fg-faint">Senaste händelser</h2>
        {data.recent.length === 0 ? (
          <p className="text-sm text-fg-faint">Inget loggat ännu.</p>
        ) : (
          <div className="panel-tile overflow-hidden rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="text-fg-faint">
                <tr className="border-b border-white/5">
                  <th className="px-4 py-2 font-medium">Tid</th>
                  <th className="px-4 py-2 font-medium">Konto</th>
                  <th className="px-4 py-2 font-medium">Resultat</th>
                  <th className="px-4 py-2 font-medium max-sm:hidden">IP-hash</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((a) => {
                  const r = RESULT_LABEL[a.result] ?? RESULT_LABEL.denied;
                  return (
                    <tr key={a.id} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-2 font-mono text-fg-muted">{new Date(a.ts).toLocaleString("sv-SE")}</td>
                      <td className="px-4 py-2 text-fg">{a.user}</td>
                      <td className="px-4 py-2"><span className={`rounded-full px-2 py-0.5 ${r.cls}`}>{r.text}</span></td>
                      <td className="px-4 py-2 font-mono text-fg-faint max-sm:hidden">{a.ipHash}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------- Bilder (uppladdning) ---------- */

type UploadResult = { files: { name: string; url: string; contentType: string; size: number }[]; errors: { file: string; error: string }[] };

async function uploadFiles(files: FileList | File[]): Promise<UploadResult> {
  const body = new FormData();
  for (const f of Array.from(files)) body.append("file", f, f.name);
  const r = await fetch("/api/manage/upload", { method: "POST", body });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Thumbnails for a project: the first image is the cover. Drop files or pick them; images are
// converted to WebP on the server, so phone screenshots are fine.
function ImagesEditor({ images, onChange }: { images: string[]; onChange: (images: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const add = async (files: FileList | File[]) => {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      const result = await uploadFiles(files);
      onChange([...images, ...result.files.map((f) => f.url)]);
      if (result.errors.length) setError(result.errors.map((e) => `${e.file}: ${e.error}`).join(", "));
    } catch (e) {
      setError(`Uppladdningen misslyckades (${(e as Error).message})`);
    } finally {
      setBusy(false);
    }
  };
  const move = (i: number, j: number) => {
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div>
      <span className="mb-1 block text-xs text-fg-muted">Bilder (första är omslag)</span>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images.map((url, i) => (
          <div key={url} className="group relative aspect-[16/10] overflow-hidden rounded-lg border border-white/10 bg-night-950/60">
            <img src={url} alt="" className="size-full object-cover" />
            {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-full bg-ember-500 px-1.5 py-0.5 text-[10px] font-medium text-night-950">Omslag</span>}
            <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-night-950/90 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
              {i > 0 && (
                <button type="button" onClick={() => move(i, 0)} title="Gör till omslag" className="grid size-6 place-items-center rounded-md bg-white/10 text-fg hover:bg-white/20">
                  <Star className="size-3" />
                </button>
              )}
              <button type="button" onClick={() => move(i, i - 1)} title="Flytta vänster" className="grid size-6 place-items-center rounded-md bg-white/10 text-fg hover:bg-white/20"><ChevronUp className="size-3 -rotate-90" /></button>
              <button type="button" onClick={() => move(i, i + 1)} title="Flytta höger" className="grid size-6 place-items-center rounded-md bg-white/10 text-fg hover:bg-white/20"><ChevronDown className="size-3 -rotate-90" /></button>
              <button type="button" onClick={() => onChange(images.filter((_, k) => k !== i))} title="Ta bort" className="grid size-6 place-items-center rounded-md bg-red-500/30 text-fg hover:bg-red-500/50"><X className="size-3" /></button>
            </div>
          </div>
        ))}
        <label
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void add(e.dataTransfer.files); }}
          className={`flex aspect-[16/10] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-center text-[11px] transition-colors ${
            over ? "border-ember-400 bg-ember-500/10 text-fg" : "border-white/15 text-fg-muted hover:border-ember-400/50 hover:text-fg"
          }`}
        >
          <Upload className="size-4" />
          {busy ? "Laddar upp…" : "Släpp bilder här eller klicka"}
          <input type="file" accept="image/*,.pdf" multiple className="hidden" disabled={busy} onChange={(e) => { if (e.target.files) void add(e.target.files); e.target.value = ""; }} />
        </label>
      </div>
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}

/* ---------- Innehåll ---------- */

type Lang = "sv" | "en";

// Swedish is the master document (served to the provider); English is a separate document
// that starts empty and is usually created with the AI translation button.
function useDraft(lang: Lang) {
  const { content, refresh } = useSiteContent();
  const [draft, setDraft] = useState<SiteContent | null>(lang === "sv" ? content : null);
  const [exists, setExists] = useState(lang === "sv");
  const [loaded, setLoaded] = useState(lang === "sv");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error" | "translating">("idle");

  // Adopt the live Swedish document once it arrives (only if the user has not started editing).
  useEffect(() => {
    if (lang === "sv" && !dirty) setDraft(content);
  }, [content, dirty, lang]);

  useEffect(() => {
    if (lang === "sv") return;
    setLoaded(false);
    fetch(`/api/manage/content?lang=${lang}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { exists: boolean; content: SiteContent | null }) => {
        setExists(d.exists);
        setDraft(d.content);
        setDirty(false);
      })
      .finally(() => setLoaded(true));
  }, [lang]);

  const update = (fn: (d: SiteContent) => SiteContent) => {
    setDraft((d) => (d ? fn(d) : d));
    setDirty(true);
    setSaving("idle");
  };

  const save = async () => {
    if (!draft) return;
    setSaving("saving");
    const r = await fetch(`/api/manage/content?lang=${lang}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (r.ok) {
      setSaving("saved");
      setDirty(false);
      setExists(true);
      if (lang === "sv") await refresh();
    } else {
      setSaving("error");
    }
  };

  const translate = async () => {
    setSaving("translating");
    const r = await fetch(`/api/manage/content/translate?lang=${lang}`, { method: "POST" });
    if (r.ok) {
      setDraft((await r.json()) as SiteContent);
      setDirty(true);
      setSaving("idle");
    } else {
      setSaving("error");
    }
  };

  return { draft, update, save, translate, dirty, saving, exists, loaded };
}

function SaveBar({ dirty, saving, onSave }: { dirty: boolean; saving: string; onSave: () => void }) {
  return (
    <div className="sticky bottom-4 z-10 mt-8 flex items-center justify-between rounded-full border border-white/10 bg-night-900/90 px-4 py-2 backdrop-blur">
      <span className="text-xs text-fg-muted">
        {saving === "saving" && "Sparar…"}
        {saving === "translating" && "Översätter med AI, tar cirka en minut…"}
        {saving === "saved" && "Sparat. Sajten uppdateras direkt."}
        {saving === "error" && <span className="text-red-300">Kunde inte spara.</span>}
        {saving === "idle" && (dirty ? "Osparade ändringar" : "Allt sparat")}
      </span>
      <button
        onClick={onSave}
        disabled={!dirty || saving === "saving"}
        className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-medium text-night-950 disabled:opacity-40"
      >
        <Save className="size-4" /> Spara
      </button>
    </div>
  );
}

function ContentEditor() {
  const [lang, setLang] = useState<Lang>("sv");
  const { draft, update, save, translate, dirty, saving, exists, loaded } = useDraft(lang);

  const tabs = (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {(["sv", "en"] as Lang[]).map((l) => (
        <button
          key={l}
          onClick={() => {
            if (dirty && !window.confirm("Du har osparade ändringar. Byta språk ändå?")) return;
            setLang(l);
          }}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${lang === l ? "bg-ember-500 text-night-950" : "border border-white/10 text-fg-muted hover:text-fg"}`}
        >
          {l === "sv" ? "Svenska" : "English"}
        </button>
      ))}
      {lang === "en" && (
        <button
          onClick={() => {
            if (!exists || window.confirm("Skriva över den engelska versionen med en ny AI-översättning av den svenska?")) void translate();
          }}
          disabled={saving === "translating"}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-ember-400/40 bg-ember-500/10 px-3 py-1.5 text-xs text-ember-200 disabled:opacity-50"
        >
          <Sparkles className="size-3.5" /> {saving === "translating" ? "Översätter…" : exists ? "Översätt om från svenska" : "Översätt från svenska med AI"}
        </button>
      )}
    </div>
  );

  if (!draft) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight">Innehåll</h1>
        <p className="text-sm text-fg-muted">Allt som syns på sajten. Ändringar går live när du sparar.</p>
        {tabs}
        <p className="mt-8 text-sm text-fg-muted">
          {!loaded ? "Hämtar…" : "Ingen engelsk version ännu. Sajten visar den svenska texten på /en tills du översätter och sparar."}
        </p>
      </div>
    );
  }

  const p = draft.profile;
  const setProfile = (patch: Partial<typeof p>) => update((d) => ({ ...d, profile: { ...d.profile, ...patch } }));

  return (
    <AdminLangContext.Provider value={lang}>
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Innehåll</h1>
      <p className="text-sm text-fg-muted">
        {lang === "sv" ? "Allt som syns på sajten. Ändringar går live när du sparar." : "Den engelska versionen (havaljalal.se/en). Slugs, länkar och taggar är gemensamma med svenskan."}
      </p>
      {tabs}

      <Group title="Profil">
        <Field label="Namn" value={p.name} onChange={(v) => setProfile({ name: v })} />
        <Field label="Roll" value={p.role} onChange={(v) => setProfile({ role: v })} />
        <Field label="Rubrik, inledning" value={p.headline.lead} onChange={(v) => setProfile({ headline: { ...p.headline, lead: v } })} />
        <Field label="Rubrik, accentord" value={p.headline.accent} onChange={(v) => setProfile({ headline: { ...p.headline, accent: v } })} />
        <Field label="Tillgänglighet (badge i hero)" value={p.availability} onChange={(v) => setProfile({ availability: v })} />
        <Area label="Intro (under rubriken)" value={p.intro} onChange={(v) => setProfile({ intro: v })} />
        <Area label="Om mig (Resan)" value={p.about} onChange={(v) => setProfile({ about: v })} />
        <Area label="Tagline (Kontakt)" value={p.tagline} onChange={(v) => setProfile({ tagline: v })} />
        <Field label="GitHub (visas inte publikt, bara för CV-länkar)" value={p.links.github} onChange={(v) => setProfile({ links: { ...p.links, github: v } })} />
        <Field label="LinkedIn" value={p.links.linkedin} onChange={(v) => setProfile({ links: { ...p.links, linkedin: v } })} />
        <Field label="E-post (publik)" value={p.links.email} onChange={(v) => setProfile({ links: { ...p.links, email: v } })} />
      </Group>

      <Group title="Projekt">
        <p className="mb-3 text-xs text-fg-muted">Visas som produkter: bild, status, en rad om vad det är, berättelsen, vad det gör och var man hittar det.</p>
        <ListEditor<Project>
          items={draft.projects}
          onChange={(projects) => update((d) => ({ ...d, projects }))}
          create={() => ({ slug: `projekt-${Date.now()}`, title: "Nytt projekt", status: "", tagline: "", summary: "", highlights: [], tags: [], images: [], links: [], repo: "", year: String(new Date().getFullYear()) })}
          label={(x) => x.title}
          render={(x, set) => (
            <>
              <ImagesEditor images={x.images ?? []} onChange={(images) => set({ ...x, images })} />
              <div className="grid grid-cols-[1fr_160px_90px] gap-3 max-sm:grid-cols-1">
                <Field label="Titel" value={x.title} onChange={(v) => set({ ...x, title: v })} />
                <label className="block">
                  <span className="mb-1 block text-xs text-fg-muted">Status</span>
                  <select
                    value={x.status ?? ""}
                    onChange={(e) => set({ ...x, status: e.target.value as Project["status"] })}
                    className="w-full rounded-lg border border-white/10 bg-night-950/60 px-3 py-2 text-sm text-fg"
                  >
                    <option value="">(ingen)</option>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </label>
                <Field label="År" value={x.year} onChange={(v) => set({ ...x, year: v })} />
              </div>
              <Field label="Tagline (en rad, visas i fetstil)" value={x.tagline ?? ""} onChange={(v) => set({ ...x, tagline: v })} />
              <Area label="Berättelsen (vad det är, för vem, vilket problem det löser)" value={x.summary} onChange={(v) => set({ ...x, summary: v })} />
              <Area label="Vad det gör (en punkt per rad, visas med bock)" value={(x.highlights ?? []).join("\n")} onChange={(v) => set({ ...x, highlights: v.split("\n").map((t) => t.trim()).filter(Boolean) })} />
              <Field label="Taggar (kommaseparerade)" value={x.tags.join(", ")} onChange={(v) => set({ ...x, tags: v.split(",").map((t) => t.trim()).filter(Boolean) })} />
              <Area
                label="Länkar (en per rad: Etikett | https://…)"
                value={(x.links ?? []).map((l) => `${l.label} | ${l.url}`).join("\n")}
                onChange={(v) =>
                  set({
                    ...x,
                    links: v
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .map((line) => {
                        const [label, url] = line.includes("|") ? line.split("|").map((t) => t.trim()) : ["Besök", line];
                        return { label: label || "Besök", url: url || "" };
                      }),
                  })
                }
              />
              <Field label="Repo-URL (valfri, används bara som länk i CV:t)" value={x.repo} onChange={(v) => set({ ...x, repo: v })} />
              <label className="flex items-center gap-2 text-xs text-fg-muted">
                <input type="checkbox" checked={!!x.hidden} onChange={(e) => set({ ...x, hidden: e.target.checked })} /> Dölj på sajten
              </label>
            </>
          )}
        />
      </Group>

      <Group title="Resan">
        <ListEditor<JourneyStep>
          items={draft.journey}
          onChange={(journey) => update((d) => ({ ...d, journey }))}
          create={() => ({ period: "", title: "Nytt steg", org: "", text: "" })}
          label={(x) => `${x.period} · ${x.title}`}
          render={(x, set) => (
            <>
              <div className="grid grid-cols-[120px_1fr] gap-3">
                <Field label="Period" value={x.period} onChange={(v) => set({ ...x, period: v })} />
                <Field label="Titel" value={x.title} onChange={(v) => set({ ...x, title: v })} />
              </div>
              <Field label="Organisation" value={x.org} onChange={(v) => set({ ...x, org: v })} />
              <Area label="Text" value={x.text} onChange={(v) => set({ ...x, text: v })} />
              <Area label="Punkter (en per rad)" value={(x.bullets ?? []).join("\n")} onChange={(v) => set({ ...x, bullets: v.split("\n").map((b) => b.trim()).filter(Boolean) })} />
            </>
          )}
        />
      </Group>

      <Group title="Utbildning">
        <ListEditor
          items={draft.education}
          onChange={(education) => update((d) => ({ ...d, education }))}
          create={() => ({ school: "", program: "" })}
          label={(x) => x.program || "Ny utbildning"}
          render={(x, set) => (
            <>
              <Field label="Program" value={x.program} onChange={(v) => set({ ...x, program: v })} />
              <Field label="Skola" value={x.school} onChange={(v) => set({ ...x, school: v })} />
            </>
          )}
        />
      </Group>

      <Group title="Stack">
        <ListEditor
          items={draft.skills}
          onChange={(skills) => update((d) => ({ ...d, skills }))}
          create={() => ({ title: "Ny kategori", items: [] })}
          label={(x) => x.title}
          render={(x, set) => (
            <>
              <Field label="Kategori" value={x.title} onChange={(v) => set({ ...x, title: v })} />
              <Field label="Tekniker (kommaseparerade)" value={x.items.join(", ")} onChange={(v) => set({ ...x, items: v.split(",").map((t) => t.trim()).filter(Boolean) })} />
              <label className="flex items-center gap-2 text-xs text-fg-muted">
                <input type="checkbox" checked={!!x.accent} onChange={(e) => set({ ...x, accent: e.target.checked })} /> Framhäv (orange kort)
              </label>
            </>
          )}
        />
      </Group>

      <SaveBar dirty={dirty} saving={saving} onSave={save} />
    </div>
    </AdminLangContext.Provider>
  );
}

/* ---------- Inställningar ---------- */

function SettingsEditor() {
  const { draft, update, save, dirty, saving } = useDraft("sv");
  if (!draft) return null;
  const s = draft.settings;
  const set = (patch: Partial<typeof s>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight">Inställningar</h1>
      <Group title="Utseende">
        <label className="block text-xs text-fg-muted">
          Bakgrund i hero
          <select
            value={s.background}
            onChange={(e) => set({ background: e.target.value as typeof s.background })}
            className="mt-1 w-full rounded-md border border-white/10 bg-night-900 px-3 py-2 text-sm text-fg"
          >
            <option value="terrain">Terräng (glödande wireframe)</option>
            <option value="network">Nätverk (noder)</option>
            <option value="aurora">Aurora (ljusfält)</option>
            <option value="dunes">Dyner (sand)</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.soundDefault} onChange={(e) => set({ soundDefault: e.target.checked })} /> Ljud på som standard
        </label>
      </Group>
      <Group title="Status">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.openForWork} onChange={(e) => set({ openForWork: e.target.checked })} /> Öppen för uppdrag
        </label>
      </Group>
      <SaveBar dirty={dirty} saving={saving} onSave={save} />
    </div>
  );
}

/* ---------- Form primitives ---------- */

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-ember-300">{title}</h2>
      <div className="panel-tile space-y-4 rounded-2xl p-5">{children}</div>
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs text-fg-muted">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-white/10 bg-night-900 px-3 py-2 text-sm text-fg focus:border-ember-400/60 focus:outline-none"
      />
    </label>
  );
}

function Area({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs text-fg-muted">
      <span className="flex items-center justify-between gap-2">
        {label}
        <AiButton value={value} onChange={onChange} context={label} />
      </span>
      <textarea
        value={value}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full resize-y rounded-md border border-white/10 bg-night-900 px-3 py-2 text-sm leading-relaxed text-fg focus:border-ember-400/60 focus:outline-none"
      />
    </label>
  );
}

function ListEditor<T>({
  items,
  onChange,
  create,
  label,
  render,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  create: () => T;
  label: (item: T) => string;
  render: (item: T, set: (item: T) => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    setOpen(j);
  };
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="rounded-xl border border-white/8 bg-night-950/50">
          <div className="flex items-center gap-2 px-3 py-2">
            <button onClick={() => setOpen(open === i ? null : i)} className="flex-1 text-left text-sm text-fg">
              {label(item)}
            </button>
            <button onClick={() => move(i, -1)} className="text-fg-faint hover:text-fg" aria-label="Flytta upp"><ChevronUp className="size-4" /></button>
            <button onClick={() => move(i, 1)} className="text-fg-faint hover:text-fg" aria-label="Flytta ner"><ChevronDown className="size-4" /></button>
            <button onClick={() => onChange(items.filter((_, k) => k !== i))} className="text-fg-faint hover:text-red-300" aria-label="Ta bort"><Trash2 className="size-4" /></button>
          </div>
          {open === i && (
            <div className="space-y-3 border-t border-white/5 p-3">
              {render(item, (next) => onChange(items.map((x, k) => (k === i ? next : x))))}
            </div>
          )}
        </div>
      ))}
      <button
        onClick={() => {
          onChange([...items, create()]);
          setOpen(items.length);
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-fg-muted hover:text-fg"
      >
        <Plus className="size-3.5" /> Lägg till
      </button>
    </div>
  );
}
