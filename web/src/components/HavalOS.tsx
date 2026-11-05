import {
  Activity,
  Bell,
  Boxes,
  Briefcase,
  Code2,
  FolderGit2,
  GraduationCap,
  LayoutDashboard,
  Mail,
  Search,
  Sparkles,
} from "lucide-react";
import { motion, useScroll, useTransform, type MotionValue } from "motion/react";
import { projects, skills } from "../data/content";

const projectCount = String(projects.length);
const techCount = String(skills.reduce((n, g) => n + g.items.length, 0));

type Props = {
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
};

// The floating "dashboard" from the hero. Looks like a SaaS admin, but the data is Haval's career.
export default function HavalOS({ mouseX, mouseY }: Props) {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 900], [0, 140]);
  const rotateX = useTransform(mouseY, [-1, 1], [3, -3]);
  const rotateY = useTransform(mouseX, [-1, 1], [-4, 4]);

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
        className="panel-glass overflow-hidden rounded-2xl text-sand-100"
      >
        <div className="grid grid-cols-[180px_1fr] max-md:grid-cols-1">
          <Sidebar />
          <Main />
        </div>
      </motion.div>
    </motion.div>
  );
}

function Sidebar() {
  const items = [
    { icon: LayoutDashboard, label: "Översikt", active: true },
    { icon: FolderGit2, label: "Projekt", badge: projectCount },
    { icon: Code2, label: "Stack" },
    { icon: Briefcase, label: "Erfarenhet" },
    { icon: GraduationCap, label: "Utbildning" },
    { icon: Sparkles, label: "Build Lab", badge: "Ny" },
    { icon: Mail, label: "Kontakt" },
  ];
  return (
    <aside className="border-r border-white/5 p-4 max-md:hidden">
      <div className="mb-6 flex items-center gap-2 px-2">
        <span className="grid size-6 place-items-center rounded-md bg-ember-400 text-obsidian-900">
          <span className="text-xs font-bold leading-none">H</span>
        </span>
        <span className="text-sm font-semibold tracking-tight">Haval OS</span>
      </div>
      <p className="mb-2 px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-sand-300/50">Main</p>
      <ul className="space-y-0.5">
        {items.map(({ icon: Icon, label, active, badge }) => (
          <li
            key={label}
            className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] ${
              active ? "bg-white/[0.06] text-sand-50" : "text-sand-200/70"
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

function Main() {
  return (
    <div className="min-w-0">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-white/5 px-5 py-3 text-xs text-sand-200/60">
        <span>Haval OS</span>
        <span className="text-sand-200/30">/</span>
        <span className="text-sand-50">Översikt</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-full bg-white/[0.05] px-3 py-1.5 max-sm:hidden">
            <Search className="size-3.5" />
            <span className="text-sand-200/50">Sök projekt, teknik…</span>
            <kbd className="ml-4 font-mono text-[10px] text-sand-200/40">⌘K</kbd>
          </div>
          <span className="grid size-7 place-items-center rounded-full bg-white/[0.05]">
            <Bell className="size-3.5" />
          </span>
          <span className="grid size-7 place-items-center rounded-full bg-ember-500 font-mono text-[11px] font-semibold text-obsidian-900">
            HJ
          </span>
        </div>
      </div>

      <div className="p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-sand-50">Översikt</h3>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-sand-200/60">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              Live · uppdaterad nyss
            </p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="rounded-full border border-white/10 px-3 py-1.5 text-sand-200/80">2015 — 2026</span>
            <span className="rounded-full bg-ember-500 px-3 py-1.5 font-medium text-obsidian-900">+ Nytt projekt</span>
          </div>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
          <Kpi icon={FolderGit2} label="Projekt" value={projectCount} delta="+2 senaste kvartalet" />
          <Kpi icon={Boxes} label="Teknologier" value={techCount} delta="+3 i år" />
          <Kpi icon={Activity} label="År på Volvo Cars" value="10+" delta="teamledarskap" />
          <div className="rounded-xl bg-gradient-to-br from-ember-400 to-ember-600 p-4 text-obsidian-900">
            <div className="flex items-center justify-between text-xs font-medium">
              <span>Status</span>
              <span className="rounded-full bg-obsidian-900/15 px-2 py-0.5 font-mono text-[10px]">LIVE</span>
            </div>
            <p className="mt-3 text-xl font-semibold leading-tight tracking-tight">Öppen för uppdrag</p>
            <p className="mt-1 text-[11px] opacity-80">Göteborg · remote fungerar</p>
          </div>
        </div>

        {/* Chart + heat grid */}
        <div className="mt-3 grid grid-cols-[1.6fr_1fr] gap-3 max-md:grid-cols-1">
          <div className="panel-tile rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-sand-50">Utvecklingskurva</p>
                <p className="text-[11px] text-sand-200/50">Från produktion till produktion-klar kod</p>
              </div>
              <div className="flex gap-1 text-[11px]">
                <span className="rounded-full bg-ember-500 px-2 py-0.5 text-obsidian-900">.NET</span>
                <span className="px-2 py-0.5 text-sand-200/60">React</span>
                <span className="px-2 py-0.5 text-sand-200/60">Azure</span>
              </div>
            </div>
            <Curve />
          </div>
          <div className="panel-tile rounded-xl p-4">
            <p className="text-sm font-medium text-sand-50">Aktivitet</p>
            <p className="text-[11px] text-sand-200/50">Commits per vecka, senaste 12</p>
            <HeatGrid />
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
      <div className="flex items-center gap-2 text-xs text-sand-200/70">
        <span className="grid size-6 place-items-center rounded-md bg-ember-500/15 text-ember-300">
          <Icon className="size-3.5" strokeWidth={1.75} />
        </span>
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-sand-50">{value}</p>
      <p className="mt-1 text-[11px] text-emerald-300/80">{delta}</p>
    </div>
  );
}

function Curve() {
  const pts = [8, 10, 11, 14, 18, 22, 30, 38, 52, 60, 74, 90];
  const w = 520;
  const h = 120;
  const step = w / (pts.length - 1);
  const path = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${i * step} ${h - (p / 100) * h}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h + 8}`} className="mt-4 h-32 w-full">
      <defs>
        <linearGradient id="curve-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e8933a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#e8933a" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1="0" x2={w} y1={h * g} y2={h * g} stroke="white" strokeOpacity="0.05" />
      ))}
      <motion.path
        d={`${path} L ${w} ${h} L 0 ${h} Z`}
        fill="url(#curve-fill)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6, duration: 0.8 }}
      />
      <motion.path
        d={path}
        fill="none"
        stroke="#f2b26b"
        strokeWidth="2"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 1.1, duration: 1.4, ease: "easeInOut" }}
      />
      <motion.circle
        cx={w}
        cy={h - 0.9 * h}
        r="4"
        fill="#f2b26b"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 2.4 }}
      />
    </svg>
  );
}

function HeatGrid() {
  // Deterministic pseudo-activity so the grid is identical on every render.
  const cells = Array.from({ length: 7 * 12 }, (_, i) => ((i * 37) % 11) / 10);
  return (
    <div className="mt-4 grid grid-cols-12 gap-1">
      {cells.map((v, i) => (
        <motion.span
          key={i}
          className="aspect-square rounded-[3px]"
          style={{ background: `rgba(232,147,58,${0.08 + v * 0.85})` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 + (i % 12) * 0.05, duration: 0.3 }}
        />
      ))}
    </div>
  );
}
