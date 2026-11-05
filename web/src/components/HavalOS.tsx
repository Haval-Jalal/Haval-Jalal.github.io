import {
  Activity,
  Bell,
  Briefcase,
  Code2,
  FolderGit2,
  GitCommitHorizontal,
  GraduationCap,
  LayoutDashboard,
  Mail,
  Search,
  Sparkles,
} from "lucide-react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { projects } from "../data/content";
import { relativeTime, useGitHub, type GitHubActivity } from "../lib/github";

type Props = {
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
};

// Shown while the API loads or if it is unreachable, so the panel always has a shape.
const DEMO: GitHubActivity = {
  user: "Haval-Jalal",
  repos: projects.map((p) => ({ name: p.title, description: p.summary, url: p.repo, language: null, stars: 0, pushedAt: null })),
  weeklyCommits: [3, 5, 2, 8, 6, 4, 9, 7, 11, 6, 10, 12],
  commits90d: 83,
  updatedAt: new Date().toISOString(),
};

// The floating "dashboard" from the hero. Looks like a SaaS admin, but the data is Haval's career.
export default function HavalOS({ mouseX, mouseY }: Props) {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 900], [0, 140]);
  const rotateX = useTransform(mouseY, [-1, 1], [3, -3]);
  const rotateY = useTransform(mouseX, [-1, 1], [-4, 4]);
  const gh = useGitHub();
  const data = gh.status === "ok" ? gh.data : DEMO;
  const live = gh.status === "ok";

  return (
    <motion.div
      initial={{ opacity: 0, y: 80 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.1, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
      style={{ y, perspective: 1600 }}
      className="relative mx-auto w-full max-w-5xl"
    >
      <motion.div
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="panel-glass overflow-hidden rounded-2xl text-fg"
      >
        <div className="grid grid-cols-[180px_1fr] max-md:grid-cols-1">
          <Sidebar repoCount={data.repos.length} />
          <Main data={data} live={live} />
        </div>
      </motion.div>
    </motion.div>
  );
}

function Sidebar({ repoCount }: { repoCount: number }) {
  const items = [
    { icon: LayoutDashboard, label: "Översikt", active: true },
    { icon: FolderGit2, label: "Projekt", badge: String(repoCount) },
    { icon: Code2, label: "Stack" },
    { icon: Briefcase, label: "Erfarenhet" },
    { icon: GraduationCap, label: "Utbildning" },
    { icon: Sparkles, label: "Build Lab", badge: "Ny" },
    { icon: Mail, label: "Kontakt" },
  ];
  return (
    <aside className="border-r border-white/5 p-4 max-md:hidden">
      <div className="mb-6 flex items-center gap-2 px-2">
        <span className="grid size-6 place-items-center rounded-md bg-ember-400 text-night-950">
          <span className="text-xs font-bold leading-none">H</span>
        </span>
        <span className="text-sm font-semibold tracking-tight">Haval OS</span>
      </div>
      <p className="mb-2 px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">Main</p>
      <ul className="space-y-0.5">
        {items.map(({ icon: Icon, label, active, badge }) => (
          <li
            key={label}
            className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] ${
              active ? "bg-white/[0.06] text-fg" : "text-fg-muted"
            }`}
          >
            <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
            <span>{label}</span>
            {badge && (
              <span className="ml-auto rounded bg-ember-500/25 px-1.5 py-px font-mono text-[10px] text-ember-300">
                {badge}
              </span>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function Main({ data, live }: { data: GitHubActivity; live: boolean }) {
  const latest = data.repos[0];
  return (
    <div className="min-w-0">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-white/5 px-5 py-3 text-xs text-fg-muted">
        <span>Haval OS</span>
        <span className="text-fg-faint">/</span>
        <span className="text-fg">Översikt</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-full bg-white/[0.05] px-3 py-1.5 max-sm:hidden">
            <Search className="size-3.5" />
            <span className="text-fg-faint">Sök projekt, teknik…</span>
            <kbd className="ml-4 font-mono text-[10px] text-fg-faint">⌘K</kbd>
          </div>
          <span className="grid size-7 place-items-center rounded-full bg-white/[0.05]">
            <Bell className="size-3.5" />
          </span>
          <span className="grid size-7 place-items-center rounded-full bg-ember-500 font-mono text-[11px] font-semibold text-night-950">
            HJ
          </span>
        </div>
      </div>

      <div className="p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-fg">Översikt</h3>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted">
              <span className={`size-1.5 rounded-full ${live ? "bg-emerald-400" : "bg-fg-faint"}`} />
              {live ? `Live från GitHub · ${relativeTime(data.updatedAt)}` : "Demo-data · väntar på API"}
            </p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="rounded-full border border-white/10 px-3 py-1.5 text-fg-muted">Senaste 90 dagarna</span>
            <a
              href={`https://github.com/${data.user}`}
              target="_blank"
              rel="noreferrer"
              className="pointer-events-auto rounded-full bg-ember-500 px-3 py-1.5 font-medium text-night-950"
            >
              Öppna GitHub
            </a>
          </div>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
          <Kpi icon={FolderGit2} label="Publika repos" value={String(data.repos.length)} delta={latest ? `senast: ${latest.name}` : "—"} />
          <Kpi icon={GitCommitHorizontal} label="Commits · 90 d" value={String(data.commits90d)} delta={latest?.pushedAt ? `push ${relativeTime(latest.pushedAt)}` : "publika events"} />
          <Kpi icon={Activity} label="År på Volvo Cars" value="10+" delta="teamledarskap" />
          <div className="rounded-xl bg-gradient-to-br from-ember-400 to-ember-600 p-4 text-night-950">
            <div className="flex items-center justify-between text-xs font-medium">
              <span>Status</span>
              <span className="rounded-full bg-night-950/15 px-2 py-0.5 font-mono text-[10px]">LIVE</span>
            </div>
            <p className="mt-3 text-xl font-semibold leading-tight tracking-tight">Öppen för uppdrag</p>
            <p className="mt-1 text-[11px] opacity-80">Göteborg · remote fungerar</p>
          </div>
        </div>

        {/* Chart + repos */}
        <div className="mt-3 grid grid-cols-[1.6fr_1fr] gap-3 max-md:grid-cols-1">
          <div className="panel-tile rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-fg">Commits per vecka</p>
                <p className="text-[11px] text-fg-faint">Senaste 12 veckorna, publika repos</p>
              </div>
              <div className="flex gap-1 text-[11px]">
                <span className="rounded-full bg-ember-500 px-2 py-0.5 text-night-950">.NET</span>
                <span className="px-2 py-0.5 text-fg-muted">React</span>
                <span className="px-2 py-0.5 text-fg-muted">Azure</span>
              </div>
            </div>
            <Bars values={data.weeklyCommits} />
          </div>
          <div className="panel-tile rounded-xl p-4">
            <p className="text-sm font-medium text-fg">Senast uppdaterade repos</p>
            <ul className="mt-3 space-y-2">
              {data.repos.slice(0, 4).map((r) => (
                <li key={r.name} className="flex items-center gap-2 text-xs">
                  <span className="size-1.5 shrink-0 rounded-full bg-ember-400" />
                  <span className="truncate text-fg">{r.name}</span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-fg-faint">
                    {r.language ?? (r.pushedAt ? relativeTime(r.pushedAt) : "")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  delta,
}: {
  icon: typeof FolderGit2;
  label: string;
  value: string;
  delta: string;
}) {
  return (
    <div className="panel-tile rounded-xl p-4">
      <div className="flex items-center gap-2 text-xs text-fg-muted">
        <span className="grid size-6 place-items-center rounded-md bg-ember-500/15 text-ember-300">
          <Icon className="size-3.5" strokeWidth={1.75} />
        </span>
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-fg">{value}</p>
      <p className="mt-1 truncate text-[11px] text-emerald-300/80">{delta}</p>
    </div>
  );
}

function Bars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="mt-5 flex h-28 items-end gap-1.5">
      {values.map((v, i) => (
        <motion.div
          key={i}
          className="flex-1 rounded-t-sm bg-gradient-to-t from-ember-600 to-ember-300"
          style={{ opacity: 0.45 + (v / max) * 0.55 }}
          initial={{ height: 0 }}
          animate={{ height: `${Math.max(4, (v / max) * 100)}%` }}
          transition={{ delay: 1.1 + i * 0.06, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          title={`${v} commits`}
        />
      ))}
    </div>
  );
}
