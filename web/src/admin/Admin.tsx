import { useEffect, useState } from "react";
import { BarChart3, Cpu, FileText, Inbox, LogOut, Save, Settings as SettingsIcon, ExternalLink, Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { loginUrl, logoutUrl, useAuth } from "../lib/auth";
import { useSiteContent } from "../lib/content";
import type { JourneyStep, SiteContent } from "../data/content";

type Tab = "overview" | "content" | "leads" | "ai" | "settings";

export default function Admin() {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>("overview");

  if (auth.status === "loading") return <Shell><p className="text-fg-muted">Kontrollerar inloggning…</p></Shell>;
  if (auth.status === "anonymous" || !auth.isAdmin) {
    return (
      <Shell>
        <div className="mx-auto mt-24 max-w-md text-center">
          <h1 className="text-2xl font-semibold">Haval OS · Admin</h1>
          <p className="mt-3 text-fg-muted">
            {auth.status === "anonymous" ? "Du behöver logga in med GitHub." : "Ditt konto har inte admin-rollen."}
          </p>
          <a href={loginUrl} className="mt-6 inline-block rounded-full bg-ember-500 px-5 py-2.5 text-sm font-medium text-night-950">
            Logga in med GitHub
          </a>
        </div>
      </Shell>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
    { key: "overview", label: "Översikt", icon: BarChart3 },
    { key: "content", label: "Innehåll", icon: FileText },
    { key: "leads", label: "Leads", icon: Inbox },
    { key: "ai", label: "AI & kostnad", icon: Cpu },
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
          {tab === "leads" && <Leads />}
          {tab === "ai" && <AiUsage />}
          {tab === "settings" && <SettingsEditor />}
        </main>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-night-950 text-fg">{children}</div>;
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

const FEATURE_LABEL: Record<string, string> = { build: "Build Lab (Opus 5.5)", chat: "Digital Haval (Sonnet 5.5)" };
const usd = (n: number) => `${n.toFixed(n < 1 ? 3 : 2)} USD`;
const tok = (n: number) => n.toLocaleString("sv-SE");

function AiUsage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  // Live: refetch every 5 s while the tab is visible, so a running Build Lab shows up as it lands.
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/manage/ai?days=${days}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((d: UsageSummary) => {
          if (cancelled) return;
          setData(d);
          setUpdatedAt(new Date());
          setError(null);
        })
        .catch((e: Error) => !cancelled && setError(e.message));
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

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI & kostnad</h1>
          <p className="text-sm text-fg-muted">Räknat från faktiska tokens per anrop (listpris). Facit finns i Anthropic Console.</p>
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
                    {r.feature === "build" ? "Build Lab" : "Chatt"}
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
          <p className="text-sm text-fg-muted">Idéer som besökare skickat från Build Lab.</p>
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

/* ---------- Innehåll ---------- */

function useDraft() {
  const { content, refresh } = useSiteContent();
  const [draft, setDraft] = useState<SiteContent>(content);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Adopt the live document once it arrives (only if the user has not started editing).
  useEffect(() => {
    if (!dirty) setDraft(content);
  }, [content, dirty]);

  const update = (fn: (d: SiteContent) => SiteContent) => {
    setDraft((d) => fn(d));
    setDirty(true);
    setSaving("idle");
  };

  const save = async () => {
    setSaving("saving");
    const r = await fetch("/api/manage/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (r.ok) {
      setSaving("saved");
      setDirty(false);
      await refresh();
    } else {
      setSaving("error");
    }
  };

  return { draft, update, save, dirty, saving };
}

function SaveBar({ dirty, saving, onSave }: { dirty: boolean; saving: string; onSave: () => void }) {
  return (
    <div className="sticky bottom-4 z-10 mt-8 flex items-center justify-between rounded-full border border-white/10 bg-night-900/90 px-4 py-2 backdrop-blur">
      <span className="text-xs text-fg-muted">
        {saving === "saving" && "Sparar…"}
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
  const { draft, update, save, dirty, saving } = useDraft();
  const p = draft.profile;
  const setProfile = (patch: Partial<typeof p>) => update((d) => ({ ...d, profile: { ...d.profile, ...patch } }));

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Innehåll</h1>
      <p className="text-sm text-fg-muted">Allt som syns på sajten. Ändringar går live när du sparar.</p>

      <Group title="Profil">
        <Field label="Namn" value={p.name} onChange={(v) => setProfile({ name: v })} />
        <Field label="Roll" value={p.role} onChange={(v) => setProfile({ role: v })} />
        <Field label="Rubrik, inledning" value={p.headline.lead} onChange={(v) => setProfile({ headline: { ...p.headline, lead: v } })} />
        <Field label="Rubrik, accentord" value={p.headline.accent} onChange={(v) => setProfile({ headline: { ...p.headline, accent: v } })} />
        <Field label="Tillgänglighet (badge i hero)" value={p.availability} onChange={(v) => setProfile({ availability: v })} />
        <Area label="Intro (under rubriken)" value={p.intro} onChange={(v) => setProfile({ intro: v })} />
        <Area label="Om mig (Resan)" value={p.about} onChange={(v) => setProfile({ about: v })} />
        <Area label="Tagline (Kontakt)" value={p.tagline} onChange={(v) => setProfile({ tagline: v })} />
        <Field label="GitHub" value={p.links.github} onChange={(v) => setProfile({ links: { ...p.links, github: v } })} />
        <Field label="LinkedIn" value={p.links.linkedin} onChange={(v) => setProfile({ links: { ...p.links, linkedin: v } })} />
        <Field label="E-post (publik)" value={p.links.email} onChange={(v) => setProfile({ links: { ...p.links, email: v } })} />
      </Group>

      <Group title="Projekt">
        <ListEditor
          items={draft.projects}
          onChange={(projects) => update((d) => ({ ...d, projects }))}
          create={() => ({ slug: `projekt-${Date.now()}`, title: "Nytt projekt", summary: "", tags: [], repo: "", year: String(new Date().getFullYear()) })}
          label={(x) => x.title}
          render={(x, set) => (
            <>
              <Field label="Titel" value={x.title} onChange={(v) => set({ ...x, title: v })} />
              <Area label="Beskrivning" value={x.summary} onChange={(v) => set({ ...x, summary: v })} />
              <Field label="Taggar (kommaseparerade)" value={x.tags.join(", ")} onChange={(v) => set({ ...x, tags: v.split(",").map((t) => t.trim()).filter(Boolean) })} />
              <div className="grid grid-cols-[1fr_100px] gap-3">
                <Field label="Repo-URL" value={x.repo} onChange={(v) => set({ ...x, repo: v })} />
                <Field label="År" value={x.year} onChange={(v) => set({ ...x, year: v })} />
              </div>
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
  );
}

/* ---------- Inställningar ---------- */

function SettingsEditor() {
  const { draft, update, save, dirty, saving } = useDraft();
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
      {label}
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
