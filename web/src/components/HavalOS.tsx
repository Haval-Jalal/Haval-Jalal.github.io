import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Mark } from "./Mark";
import {
  ArrowUpRight,
  Briefcase,
  CalendarDays,
  Code2,
  FolderGit2,
  GitCommitHorizontal,
  GraduationCap,
  LayoutDashboard,
  Linkedin,
  Mail,
  MessageSquare,
  Newspaper,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { AnimatePresence, m, useScroll, useTransform, type MotionValue } from "motion/react";
import { useSiteContent } from "../lib/content";
import { recentTotal, relativeTime, useGitHub, type DayCount, type GitHubActivity } from "../lib/github";
import { L, numberLocale, t } from "../lib/i18n";
import { listGallery, type GalleryItem } from "../lib/lab";
import { getChangelog, type ChangelogEntry } from "../lib/posts";
import { openAgent } from "../lib/chat";
import type { Project } from "../data/content";

type Props = {
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
};

type View = "overview" | "projects" | "stack" | "journey" | "lab" | "contact";

const VIEWS: { key: View; icon: typeof FolderGit2; label: () => string; section: string }[] = [
  { key: "overview", icon: LayoutDashboard, label: () => t("os.overview"), section: "" },
  { key: "projects", icon: FolderGit2, label: () => t("os.projects"), section: "#projekt" },
  { key: "stack", icon: Code2, label: () => t("os.stack"), section: "#stack" },
  { key: "journey", icon: Briefcase, label: () => t("os.journey"), section: "#resan" },
  { key: "lab", icon: Sparkles, label: () => t("os.lab"), section: "#build-lab" },
  { key: "contact", icon: Mail, label: () => t("os.contact"), section: "#kontakt" },
];

const STATUS: Record<string, string> = {
  live: t("status.live"),
  delivered: t("status.delivered"),
  pilot: t("status.pilot"),
  wip: t("status.wip"),
  concept: t("status.concept"),
  school: t("status.school"),
};

// The floating "Haval OS" panel in the hero: a small app about Haval. The sidebar switches views
// (overview, projects, stack, experience, education, Build Lab, contact), the search box finds
// things across the site, and the overview shows live GitHub activity.
export default function HavalOS({ mouseX, mouseY }: Props) {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 900], [0, 140]);
  const rotateX = useTransform(mouseY, [-1, 1], [3, -3]);
  const rotateY = useTransform(mouseX, [-1, 1], [-4, 4]);
  const [view, setView] = useState<View>("overview");
  const [query, setQuery] = useState("");
  const projects = useSiteContent().content.projects.filter((p) => !p.hidden);

  const current = VIEWS.find((v) => v.key === view) ?? VIEWS[0];
  const go = (v: View) => {
    setView(v);
    setQuery("");
  };

  return (
    <m.div
      initial={{ opacity: 0, y: 80 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.1, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
      style={{ y, perspective: 1600 }}
      className="relative mx-auto w-full max-w-5xl"
    >
      <m.div
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="panel-glass overflow-hidden rounded-2xl text-fg"
      >
        <div className="grid grid-cols-[180px_1fr] max-md:grid-cols-1">
          <Sidebar view={view} onSelect={go} repoCount={projects.length} />
          <div className="min-w-0">
            <TopBar view={current} query={query} onQuery={setQuery} />
            <TabStrip view={view} onSelect={go} />
            <div className="min-h-[430px] p-5 max-md:min-h-0">
              <AnimatePresence mode="wait" initial={false}>
                <m.div
                  key={query.trim() ? "search" : view}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  {query.trim() ? (
                    <SearchView query={query} projects={projects} onPick={go} />
                  ) : view === "overview" ? (
                    <Overview projects={projects} onSelect={go} />
                  ) : view === "projects" ? (
                    <ProjectsView projects={projects} />
                  ) : view === "stack" ? (
                    <StackView />
                  ) : view === "journey" ? (
                    <JourneyView />
                  ) : view === "lab" ? (
                    <LabView />
                  ) : (
                    <ContactView />
                  )}
                </m.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </m.div>
    </m.div>
  );
}

/* ---------- chrome ---------- */

function Sidebar({ view, onSelect, repoCount }: { view: View; onSelect: (v: View) => void; repoCount: number }) {
  return (
    <aside className="border-r border-white/5 p-4 max-md:hidden">
      <div className="mb-6 flex items-center gap-2 px-2">
        <Mark size={9} />
        <span className="text-sm font-semibold tracking-tight">Haval OS</span>
      </div>
      <p className="mb-2 px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">Main</p>
      <ul className="space-y-0.5">
        {VIEWS.map(({ key, icon: Icon, label }) => {
          const badge = key === "projects" ? String(repoCount) : key === "lab" ? t("os.new") : null;
          const active = key === view;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onSelect(key)}
                aria-current={active ? "page" : undefined}
                className={`pointer-events-auto flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors ${
                  active ? "bg-white/[0.06] text-fg" : "text-fg-muted hover:bg-white/[0.04] hover:text-fg"
                }`}
              >
                <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
                <span>{label()}</span>
                {badge && (
                  <span className="ml-auto rounded bg-ember-500/25 px-1.5 py-px font-mono text-[10px] text-ember-300">{badge}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

// Phones have no sidebar: the views sit in a scrollable row instead.
function TabStrip({ view, onSelect }: { view: View; onSelect: (v: View) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-white/5 px-3 py-2 md:hidden [scrollbar-width:none]">
      {VIEWS.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          className={`pointer-events-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ${
            key === view ? "bg-white/[0.08] text-fg" : "text-fg-muted"
          }`}
        >
          <Icon className="size-3.5" strokeWidth={1.75} /> {label()}
        </button>
      ))}
    </div>
  );
}

function TopBar({ view, query, onQuery }: { view: (typeof VIEWS)[number]; query: string; onQuery: (q: string) => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-white/5 px-5 py-3 text-xs text-fg-muted">
      <span className="max-sm:hidden">Haval OS</span>
      <span className="text-fg-faint max-sm:hidden">/</span>
      <span className="text-fg max-sm:hidden">{view.label()}</span>
      <label className="pointer-events-auto ml-auto flex min-w-0 flex-1 items-center gap-2 rounded-full bg-white/[0.05] px-3 py-1.5 sm:max-w-[260px]">
        <Search className="size-3.5 shrink-0" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t("os.search")}
          aria-label={t("os.search")}
          className="min-w-0 flex-1 bg-transparent text-xs text-fg placeholder:text-fg-faint focus:outline-none"
        />
        {query ? (
          <button type="button" onClick={() => onQuery("")} aria-label={t("os.clear")} className="text-fg-faint hover:text-fg">
            <X className="size-3.5" />
          </button>
        ) : (
          <kbd className="font-mono text-[10px] text-fg-faint max-sm:hidden">/</kbd>
        )}
      </label>
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ember-500 font-mono text-[11px] font-semibold text-night-950">HJ</span>
    </div>
  );
}

function Heading({ title, sub, section }: { title: string; sub?: string; section?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-fg-muted">{sub}</p>}
      </div>
      {section && (
        <a href={section} className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-ember-500 px-3 py-1.5 text-xs font-medium text-night-950">
          {t("os.open_section")} <ArrowUpRight className="size-3.5" />
        </a>
      )}
    </div>
  );
}

/* ---------- overview ---------- */

function Overview({ projects, onSelect }: { projects: Project[]; onSelect: (v: View) => void }) {
  const gh = useGitHub();
  const { settings } = useSiteContent().content;
  const data = gh.status === "ok" ? gh.data : null;
  const latest = projects[0];
  const year = data ? data.contributions.total : null;
  const sub =
    gh.status === "loading" ? t("os.loading") : !data ? t("os.offline") : data.source === "graphql" ? t("os.contrib_private") : t("os.contrib_public");

  return (
    <>
      <Heading
        title={t("os.overview")}
        sub={data ? `${t("os.live")} · ${relativeTime(data.updatedAt)}` : gh.status === "loading" ? t("os.loading") : t("os.offline")}
      />
      <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
        <Kpi icon={FolderGit2} label={t("os.projects")} value={String(projects.length)} delta={latest ? `${t("os.latest")}: ${latest.title}` : "—"} onClick={() => onSelect("projects")} />
        <Kpi
          icon={GitCommitHorizontal}
          label={t("os.contrib_year")}
          value={year === null ? "…" : year.toLocaleString(numberLocale)}
          delta={sub}
        />
        <Kpi icon={Briefcase} label={t("os.years_volvo")} value="10+" delta={t("os.team_lead")} onClick={() => onSelect("journey")} />
        <button type="button" onClick={() => onSelect("contact")} className="pointer-events-auto rounded-xl bg-gradient-to-br from-ember-400 to-ember-600 p-4 text-left text-night-950">
          <div className="flex items-center justify-between text-xs font-medium">
            <span>{t("os.status")}</span>
            <span className="rounded-full bg-night-950/15 px-2 py-0.5 font-mono text-[10px]">LIVE</span>
          </div>
          <p className="mt-3 text-xl font-semibold leading-tight tracking-tight">{settings.openForWork ? t("os.open") : t("os.busy")}</p>
          <p className="mt-1 text-[11px] opacity-80">{t("os.open_sub")}</p>
        </button>
      </div>

      <div className="mt-3 grid grid-cols-[1.6fr_1fr] gap-3 max-md:grid-cols-1">
        <div className="panel-tile min-w-0 rounded-xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-fg">{t("os.heatmap")}</p>
              <p className="text-[11px] text-fg-faint">
                {data ? `${recentTotal(data.contributions.calendar, 90).toLocaleString(numberLocale)} ${t("os.last90_sub")}` : t("os.year_label")}
              </p>
            </div>
            {data && (
              <a href={`https://github.com/${data.user}`} target="_blank" rel="noreferrer" className="pointer-events-auto text-[11px] text-fg-muted hover:text-fg">
                github.com/{data.user}
              </a>
            )}
          </div>
          <Heatmap days={data?.contributions.calendar ?? null} />
        </div>
        <ActivityFeed data={data} />
      </div>
    </>
  );
}

function Kpi({ icon: Icon, label, value, delta, onClick }: { icon: typeof FolderGit2; label: string; value: string; delta: string; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} className={`panel-tile min-w-0 rounded-xl p-4 text-left ${onClick ? "pointer-events-auto transition-colors hover:border-ember-400/40" : ""}`}>
      <div className="flex items-center gap-2 text-xs text-fg-muted">
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-ember-500/15 text-ember-300">
          <Icon className="size-3.5" strokeWidth={1.75} />
        </span>
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-fg">{value}</p>
      <p className="mt-1 truncate text-[11px] text-emerald-300/80">{delta}</p>
    </Tag>
  );
}

// GitHub's contribution graph in ember. Columns are weeks (Monday at the top), the newest week
// on the right; narrow panels simply clip the oldest weeks on the left.
function Heatmap({ days }: { days: DayCount[] | null }) {
  const cells = useMemo(() => {
    const list = days ?? emptyYear();
    // Colour steps follow GitHub: quartiles of the active days, so an ordinary day stays visible
    // next to a few huge ones instead of being scaled down to the faintest shade.
    const active = list.map((d) => d.count).filter((c) => c > 0).sort((a, b) => a - b);
    const q = (p: number) => active[Math.min(active.length - 1, Math.floor(active.length * p))] ?? 0;
    const steps = [q(0.25), q(0.5), q(0.75)];
    const first = new Date(list[0].date + "T00:00:00");
    const pad = (first.getDay() + 6) % 7; // Monday = 0
    const out: { key: string; level: number; title: string }[] = [];
    for (let i = 0; i < pad; i++) out.push({ key: `pad${i}`, level: -1, title: "" });
    for (const d of list) {
      const level = d.count === 0 ? 0 : 1 + steps.filter((s) => d.count > s).length;
      const date = new Date(d.date + "T00:00:00").toLocaleDateString(numberLocale, { day: "numeric", month: "short" });
      out.push({ key: d.date, level, title: `${date}: ${d.count}` });
    }
    return out;
  }, [days]);

  const months = useMemo(() => {
    const list = days ?? emptyYear();
    const first = new Date(list[0].date + "T00:00:00");
    const pad = (first.getDay() + 6) % 7;
    const labels: { col: number; text: string }[] = [];
    list.forEach((d, i) => {
      const date = new Date(d.date + "T00:00:00");
      if (date.getDate() === 1) labels.push({ col: Math.floor((i + pad) / 7), text: date.toLocaleDateString(numberLocale, { month: "short" }) });
    });
    return labels;
  }, [days]);

  const LEVEL = ["bg-white/[0.05]", "bg-ember-700", "bg-ember-600", "bg-ember-500", "bg-ember-300"];
  const cols = Math.ceil(cells.length / 7);
  return (
    <div className="mt-4 flex justify-end overflow-hidden">
      <div className="shrink-0">
        <div className="relative mb-1 h-3 font-mono text-[9px] text-fg-faint" style={{ width: cols * 12 }}>
          {months.map((m) => (
            <span key={m.col + m.text} className="absolute" style={{ left: m.col * 12 }}>
              {m.text}
            </span>
          ))}
        </div>
        <div className="grid grid-flow-col gap-[2px]" style={{ gridTemplateRows: "repeat(7, 10px)", gridAutoColumns: "10px" }} aria-hidden>
          {cells.map((c) => (
            <span key={c.key} title={c.title} className={`rounded-[2px] ${c.level < 0 ? "" : LEVEL[c.level]} ${days ? "" : "animate-pulse"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

function emptyYear(): DayCount[] {
  const out: DayCount[] = [];
  const d = new Date();
  d.setDate(d.getDate() - 363);
  for (let i = 0; i < 364; i++) {
    out.push({ date: d.toISOString().slice(0, 10), count: 0 });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// Latest commit, prototype and changelog entry, so the panel reflects what is happening now.
function ActivityFeed({ data }: { data: GitHubActivity | null }) {
  const [gallery, setGallery] = useState<GalleryItem[] | null>(null);
  const [log, setLog] = useState<Omit<ChangelogEntry, "published">[] | null>(null);
  useEffect(() => {
    let alive = true;
    listGallery().then((g) => alive && setGallery(g));
    getChangelog().then((l) => alive && setLog(l)).catch(() => alive && setLog([]));
    return () => {
      alive = false;
    };
  }, []);
  const proto = gallery?.[0];
  const entry = log?.[0];
  const rows: { icon: typeof FolderGit2; label: string; text: string; when: string; href: string; external?: boolean }[] = [];
  if (data?.latestCommit) rows.push({ icon: GitCommitHorizontal, label: t("os.latest_commit"), text: `${data.latestCommit.repo}: ${data.latestCommit.message}`, when: relativeTime(data.latestCommit.at), href: data.latestCommit.url, external: true });
  if (proto) rows.push({ icon: Sparkles, label: t("os.latest_proto"), text: proto.title || proto.idea, when: relativeTime(proto.ts), href: L(`/lab/${proto.id}`) });
  if (entry) rows.push({ icon: Newspaper, label: t("os.latest_log"), text: entry.title, when: new Date(entry.date).toLocaleDateString(numberLocale, { day: "numeric", month: "short" }), href: L("/changelog") });
  const loading = data === null && gallery === null;
  return (
    <div className="panel-tile min-w-0 rounded-xl p-4">
      <p className="text-sm font-medium text-fg">{t("os.activity")}</p>
      <ul className="mt-3 space-y-2.5">
        {loading && [0, 1, 2].map((i) => <li key={i} className="h-9 animate-pulse rounded-md bg-white/[0.04]" />)}
        {rows.map((r) => (
          <li key={r.label}>
            <a href={r.href} target={r.external ? "_blank" : undefined} rel={r.external ? "noreferrer" : undefined} className="pointer-events-auto group flex items-start gap-2.5 text-xs">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded bg-ember-500/15 text-ember-300">
                <r.icon className="size-3" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-fg-muted">{r.label}</span>
                  <span className="shrink-0 font-mono text-[10px] text-fg-faint">{r.when}</span>
                </span>
                <span className="block truncate text-fg group-hover:text-ember-300">{r.text}</span>
              </span>
            </a>
          </li>
        ))}
        {!loading && rows.length === 0 && <li className="text-xs text-fg-faint">{t("os.no_activity")}</li>}
        <li>
          <a href={L("/nu")} className="pointer-events-auto inline-flex items-center gap-1 text-xs text-ember-300 hover:underline">
            {t("os.now_page")} <ArrowUpRight className="size-3" />
          </a>
        </li>
      </ul>
    </div>
  );
}

/* ---------- other views ---------- */

function ProjectsView({ projects }: { projects: Project[] }) {
  return (
    <>
      <Heading title={t("os.projects")} sub={t("os.projects_sub")} section="#projekt" />
      <ul className="grid gap-2 sm:grid-cols-2">
        {projects.map((p) => (
          <li key={p.slug}>
            <a href={`#projekt-${p.slug}`} className="pointer-events-auto panel-tile flex h-full flex-col rounded-xl p-3 transition-colors hover:border-ember-400/40">
              <span className="flex items-center gap-2">
                <span className={`size-1.5 shrink-0 rounded-full ${p.status === "live" || p.status === "delivered" ? "bg-emerald-400" : "bg-ember-400"}`} />
                <span className="truncate text-sm font-medium text-fg">{p.title}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-fg-faint">{p.status ? STATUS[p.status] ?? p.status : p.year}</span>
              </span>
              <span className="mt-1 line-clamp-2 text-xs text-fg-muted">{p.tagline || p.summary}</span>
              <span className="mt-2 flex flex-wrap gap-1">
                {p.tags.slice(0, 4).map((tag) => (
                  <span key={tag} className="rounded bg-white/[0.05] px-1.5 py-px font-mono text-[10px] text-fg-muted">{tag}</span>
                ))}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

function StackView() {
  const { skills } = useSiteContent().content;
  return (
    <>
      <Heading title={t("os.stack")} sub={t("os.stack_sub")} section="#stack" />
      <div className="grid gap-2 sm:grid-cols-2">
        {skills.map((g) => (
          <div key={g.title} className={`rounded-xl p-3 ${g.accent ? "bg-gradient-to-br from-ember-400 to-ember-600 text-night-950" : "panel-tile"}`}>
            <p className={`font-mono text-[10px] uppercase tracking-[0.18em] ${g.accent ? "text-night-950/70" : "text-ember-300"}`}>{g.title}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {g.items.map((s) => (
                <span key={s} className={`rounded px-1.5 py-0.5 text-[11px] ${g.accent ? "bg-night-950/15" : "bg-white/[0.05] text-fg"}`}>{s}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function JourneyView() {
  const { journey, education } = useSiteContent().content;
  return (
    <>
      <Heading title={t("os.journey")} sub={t("os.journey_sub")} section="#resan" />
      <ol className="space-y-2">
        {journey.map((s) => (
          <li key={s.title} className="panel-tile flex items-start gap-3 rounded-xl p-3">
            <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-wider text-ember-300">{s.period}</span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-fg">{s.title}</span>
              <span className="block text-xs text-fg-muted">{s.org}</span>
            </span>
          </li>
        ))}
      </ol>
      {education.length > 0 && (
        <>
          <p className="mt-5 mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-faint">{t("os.education")}</p>
          <ul className="space-y-2">
            {education.map((e) => (
              <li key={e.school + e.program} className="panel-tile flex items-start gap-3 rounded-xl p-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-ember-500/15 text-ember-300">
                  <GraduationCap className="size-3.5" strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fg">{e.program}</span>
                  <span className="block text-xs text-fg-muted">{e.school}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

// Type an idea here and it lands in the Build Lab form below, ready to run.
function LabView() {
  const [idea, setIdea] = useState("");
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  useEffect(() => {
    let alive = true;
    listGallery().then((g) => alive && setGallery(g.slice(0, 3)));
    return () => {
      alive = false;
    };
  }, []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("lab:prefill", { detail: idea.trim() }));
    document.getElementById("build-lab")?.scrollIntoView({ behavior: "smooth" });
  };
  return (
    <>
      <Heading title={t("os.lab")} sub={t("os.lab_hint")} section="#build-lab" />
      <form onSubmit={submit} className="panel-tile pointer-events-auto flex items-center gap-2 rounded-xl p-2 pl-3">
        <Sparkles className="size-4 shrink-0 text-ember-300" />
        <input
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder={t("os.lab_placeholder")}
          aria-label={t("os.lab_placeholder")}
          className="min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-faint focus:outline-none"
        />
        <button type="submit" className="shrink-0 rounded-lg bg-ember-500 px-3 py-1.5 text-xs font-medium text-night-950">
          {t("os.lab_cta")}
        </button>
      </form>
      {gallery.length > 0 && (
        <>
          <p className="mb-2 mt-4 text-xs text-fg-muted">{t("os.latest_protos")}</p>
          <ul className="grid gap-2 sm:grid-cols-3">
            {gallery.map((g) => (
              <li key={g.id}>
                <a href={L(`/lab/${g.id}`)} className="pointer-events-auto panel-tile block rounded-xl p-3 transition-colors hover:border-ember-400/40">
                  <span className="block truncate text-sm font-medium text-fg">{g.title || g.idea}</span>
                  <span className="mt-1 block font-mono text-[10px] text-fg-faint">{relativeTime(g.ts)}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function ContactView() {
  const { profile } = useSiteContent().content;
  const items: { icon: typeof Mail; label: string; sub: string; href?: string; onClick?: () => void; external?: boolean }[] = [
    { icon: MessageSquare, label: t("os.ask_agent"), sub: t("os.ask_agent_sub"), onClick: () => openAgent() },
    { icon: Mail, label: t("contact.email"), sub: profile.links.email || t("contact.coming"), href: profile.links.email ? `mailto:${profile.links.email}` : "#kontakt" },
    { icon: Linkedin, label: "LinkedIn", sub: profile.links.linkedin ? t("contact.linkedin_sub") : t("contact.coming"), href: profile.links.linkedin || "#kontakt", external: !!profile.links.linkedin },
    { icon: CalendarDays, label: t("os.book"), sub: t("contact.book_sub"), href: L("/boka") },
  ];
  return (
    <>
      <Heading title={t("os.contact")} sub={t("os.contact_sub")} section="#kontakt" />
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map(({ icon: Icon, label, sub, href, onClick, external }) => {
          const inner = (
            <>
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ember-500/15 text-ember-300">
                <Icon className="size-4" strokeWidth={1.75} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fg">{label}</span>
                <span className="block truncate text-xs text-fg-muted">{sub}</span>
              </span>
            </>
          );
          const cls = "pointer-events-auto panel-tile flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:border-ember-400/40";
          return (
            <li key={label}>
              {onClick ? (
                <button type="button" onClick={onClick} className={cls}>{inner}</button>
              ) : (
                <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className={cls}>{inner}</a>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/* ---------- search ---------- */

type Hit = { kind: string; title: string; sub: string; view: View };

function SearchView({ query, projects, onPick }: { query: string; projects: Project[]; onPick: (v: View) => void }) {
  const { skills, journey, education } = useSiteContent().content;
  const q = query.trim().toLowerCase();
  const hits: Hit[] = [];
  const has = (...parts: (string | undefined)[]) => parts.some((p) => p?.toLowerCase().includes(q));
  for (const p of projects) if (has(p.title, p.tagline, p.summary, ...p.tags)) hits.push({ kind: t("os.kind_project"), title: p.title, sub: p.tags.join(" · "), view: "projects" });
  for (const g of skills) for (const s of g.items) if (has(s, g.title)) hits.push({ kind: t("os.kind_skill"), title: s, sub: g.title, view: "stack" });
  for (const s of journey) if (has(s.title, s.org, s.text)) hits.push({ kind: t("os.kind_experience"), title: s.title, sub: `${s.org} · ${s.period}`, view: "journey" });
  for (const e of education) if (has(e.school, e.program)) hits.push({ kind: t("os.kind_education"), title: e.program, sub: e.school, view: "journey" });
  return (
    <>
      <Heading title={`${t("os.results")} "${query.trim()}"`} sub={`${hits.length} ${t("os.hits")}`} />
      {hits.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("os.no_results")}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {hits.slice(0, 12).map((h, i) => (
            <li key={i}>
              <button type="button" onClick={() => onPick(h.view)} className="pointer-events-auto panel-tile flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:border-ember-400/40">
                <span className="w-20 shrink-0 font-mono text-[10px] uppercase tracking-wider text-ember-300">{h.kind}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-fg">{h.title}</span>
                  <span className="block truncate text-xs text-fg-muted">{h.sub}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
