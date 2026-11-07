import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Send, Trash2, X } from "lucide-react";
import { onAgentOpen, openAgent, useDigitalHaval } from "../lib/chat";
import type { Agent3DProps, IntroPhase } from "./Agent3D";

// three.js is 600 kB, so the 3D character arrives after the page; the SVG face stands in until then.
const Agent3DLazy = lazy(() => import("./Agent3D"));
function Agent3D(props: Agent3DProps) {
  return (
    <Suspense fallback={<AgentFace mood={props.mood ?? "idle"} size={props.size ?? 84} className={props.className} />}>
      <Agent3DLazy {...props} />
    </Suspense>
  );
}
import { t } from "../lib/i18n";

/* ---------- The face ---------- */

type Mood = "idle" | "thinking" | "speaking" | "happy";

// An animated face in the site's ember palette: eyes follow the pointer, it blinks, and the mouth
// changes with what the agent is doing. Pure SVG + motion, so it stays crisp at any size.
export function AgentFace({ mood = "idle", size = 56, className = "" }: { mood?: Mood; size?: number; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);

  // Eyes follow the pointer (max ~3 units of travel), relax to centre when it leaves.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, dist / 240) * 3;
      setLook({ x: (dx / dist) * k, y: (dy / dist) * k });
    };
    const onLeave = () => setLook({ x: 0, y: 0 });
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  // Blink every 3–6 s, double blink sometimes.
  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setBlink(true);
        window.setTimeout(() => setBlink(false), 110);
        if (Math.random() < 0.25) window.setTimeout(() => { setBlink(true); window.setTimeout(() => setBlink(false), 100); }, 260);
        schedule();
      }, 3000 + Math.random() * 3000);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  const eyeY = mood === "thinking" ? look.y - 2 : look.y;
  const eyeX = mood === "thinking" ? look.x + 2 : look.x;
  const eyeH = blink ? 0.7 : 9.5;
  const eyeRadius = Math.min(3.5, eyeH / 2);
  const ids = {
    sphere: `hj-sphere-${uid}`, rim: `hj-rim-${uid}`, eye: `hj-eye-${uid}`, glow: `hj-glow-${uid}`, soft: `hj-soft-${uid}`, clip: `hj-clip-${uid}`,
  };

  return (
    <svg ref={ref} viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true" style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id={ids.sphere} cx="32%" cy="26%" r="78%">
          <stop offset="0%" stopColor="#3b2416" />
          <stop offset="45%" stopColor="#17120f" />
          <stop offset="100%" stopColor="#09090c" />
        </radialGradient>
        <linearGradient id={ids.rim} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffc98a" />
          <stop offset="50%" stopColor="#e8933a" />
          <stop offset="100%" stopColor="#7a3f14" />
        </linearGradient>
        <linearGradient id={ids.eye} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff1dc" />
          <stop offset="60%" stopColor="#ffc27a" />
          <stop offset="100%" stopColor="#e8933a" />
        </linearGradient>
        <filter id={ids.glow} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        <filter id={ids.soft} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <clipPath id={ids.clip}>
          <circle cx="32" cy="32" r="29" />
        </clipPath>
      </defs>

      {/* halo */}
      <motion.circle
        cx="32" cy="32" r="30" fill="#e8933a" filter={`url(#${ids.soft})`}
        animate={mood === "thinking" ? { opacity: [0.25, 0.6, 0.25] } : { opacity: [0.18, 0.32, 0.18] }}
        transition={{ duration: mood === "thinking" ? 1.2 : 4, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* sphere */}
      <circle cx="32" cy="32" r="29" fill={`url(#${ids.sphere})`} />
      {/* ember plasma drifting inside */}
      <g clipPath={`url(#${ids.clip})`} opacity={0.9}>
        <motion.ellipse cx="22" cy="48" rx="22" ry="13" fill="#b4500f" filter={`url(#${ids.soft})`} opacity={0.75}
          animate={{ x: [0, 7, -5, 0], y: [0, -6, 3, 0] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }} />
        <motion.ellipse cx="46" cy="42" rx="17" ry="11" fill="#e8933a" filter={`url(#${ids.soft})`} opacity={0.5}
          animate={{ x: [0, -8, 4, 0], y: [0, 5, -4, 0] }} transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }} />
        <motion.ellipse cx="32" cy="58" rx="20" ry="8" fill="#ff9f43" filter={`url(#${ids.soft})`} opacity={0.35}
          animate={{ x: [0, 5, -5, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }} />
        <motion.ellipse cx="30" cy="18" rx="14" ry="8" fill="#ffb86b" filter={`url(#${ids.soft})`} opacity={0.16}
          animate={{ x: [0, 4, -6, 0], y: [0, 3, -2, 0] }} transition={{ duration: 13, repeat: Infinity, ease: "easeInOut" }} />
      </g>
      {/* glass highlight */}
      <ellipse cx="23" cy="15" rx="9" ry="4" fill="#ffffff" opacity={0.045} />
      {/* rim + slowly rotating light */}
      <circle cx="32" cy="32" r="29" fill="none" stroke={`url(#${ids.rim})`} strokeWidth="1.4" opacity={0.9} />
      <motion.circle
        cx="32" cy="32" r="29" fill="none" stroke="#ffd2a1" strokeWidth="1.6" strokeLinecap="round"
        strokeDasharray="22 160" opacity={0.75}
        animate={{ rotate: 360 }} transition={{ duration: mood === "thinking" ? 2.5 : 9, repeat: Infinity, ease: "linear" }}
        style={{ transformOrigin: "32px 32px" }}
      />

      {/* eyes: soft glow behind, bright shape in front; hover/open turns them into happy arcs */}
      {[21, 43].map((cx) => (
        <motion.g key={cx} animate={{ x: eyeX, y: eyeY }} transition={{ type: "spring", stiffness: 180, damping: 18 }}>
          {mood === "happy" && !blink ? (
            <>
              <path d={`M${cx - 4.5} 32 Q${cx} 24.5 ${cx + 4.5} 32`} fill="none" stroke="#ffb86b" strokeWidth={4} strokeLinecap="round" opacity={0.6} filter={`url(#${ids.glow})`} />
              <path d={`M${cx - 4.5} 32 Q${cx} 24.5 ${cx + 4.5} 32`} fill="none" stroke={`url(#${ids.eye})`} strokeWidth={3.2} strokeLinecap="round" />
            </>
          ) : (
            <>
              <rect x={cx - 3.6} y={30 - eyeH / 2} width={7.2} height={eyeH} rx={eyeRadius} fill="#ffb86b" opacity={0.75} filter={`url(#${ids.glow})`} />
              <rect x={cx - 3.6} y={30 - eyeH / 2} width={7.2} height={eyeH} rx={eyeRadius} fill={`url(#${ids.eye})`} />
              {!blink && <rect x={cx - 2.2} y={27} width={2.4} height={2.4} rx={1.2} fill="#ffffff" opacity={0.9} />}
            </>
          )}
        </motion.g>
      ))}

      {/* voice / thought indicator below the eyes */}
      {mood === "speaking" && (
        <g fill="#ffc27a">
          {[26, 30, 34, 38].map((x, i) => (
            <motion.rect key={x} x={x - 1.1} width={2.2} rx={1.1}
              animate={{ height: [3, 8 - i * 1.2, 3, 7, 3], y: [43.5, 41 + i * 0.6, 43.5, 41.5, 43.5] }}
              transition={{ duration: 0.8 + i * 0.1, repeat: Infinity, ease: "easeInOut" }} />
          ))}
        </g>
      )}
      {mood === "thinking" && (
        <g fill="#ffc27a">
          {[27, 32, 37].map((cx, i) => (
            <motion.circle key={cx} cx={cx} cy={44} r={1.5} animate={{ opacity: [0.2, 1, 0.2], y: [0, -1.2, 0] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }} />
          ))}
        </g>
      )}
    </svg>
  );
}

/* ---------- The floating agent ---------- */

export default function AgentWidget() {
  const { messages, busy, error, speaking, send, clear } = useDigitalHaval();
  const [open, setOpen] = useState(false);
  const [bubble, setBubble] = useState(false);
  const [draft, setDraft] = useState("");
  const [hover, setHover] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // Other parts of the site can open the panel and hand over a question.
  useEffect(
    () =>
      onAgentOpen((q) => {
        setOpen(true);
        setBubble(false);
        if (q) void send(q);
      }),
    [send],
  );

  // A gentle "hi" after a few seconds, once per session, only if the chat is untouched.
  useEffect(() => {
    if (messages.length > 0 || intro) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem("hj_agent_hi") === "1";
    } catch {
      /* ignore */
    }
    if (seen) return;
    const show = window.setTimeout(() => {
      setBubble(true);
      try {
        sessionStorage.setItem("hj_agent_hi", "1");
      } catch {
        /* ignore */
      }
    }, 6000);
    const hide = window.setTimeout(() => setBubble(false), 16000);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open) {
      bottom.current?.scrollIntoView({ block: "end" });
      window.setTimeout(() => input.current?.focus(), 250);
    }
  }, [open, messages.length, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const mood: Mood = busy ? "thinking" : speaking ? "speaking" : hover || open ? "happy" : "idle";
  const [pop, setPop] = useState(0);
  // Entrance: once per session (or ?intro=1) the character jumps out of the terrain and shakes it off.
  const [intro] = useState(() => {
    try {
      if (new URLSearchParams(window.location.search).get("intro") === "1") return true;
      if (sessionStorage.getItem("hj_intro") === "1") return false;
      sessionStorage.setItem("hj_intro", "1");
      return true;
    } catch {
      return true;
    }
  });
  const [phase, setPhase] = useState<IntroPhase>(intro ? "buried" : "done");
  useEffect(() => {
    if (phase === "present") {
      setBubble(true);
      const hide = window.setTimeout(() => setBubble(false), 9000);
      return () => window.clearTimeout(hide);
    }
  }, [phase]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] sm:inset-x-auto sm:bottom-5 sm:right-5">
      <AnimatePresence>
        {open && (
          <motion.section
            key="panel"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-label="Digital Haval"
            className="panel-glass pointer-events-auto mx-3 mb-3 flex max-h-[min(70vh,560px)] flex-col overflow-hidden rounded-3xl text-fg shadow-2xl shadow-black/60 sm:mx-0 sm:mb-4 sm:w-[380px]"
          >
            <header className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
              <span className="relative grid place-items-center"><span className="absolute inset-[5px] rounded-full bg-[#0b0908]" aria-hidden="true" /><Agent3D mood={mood} size={44} className="relative" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Digital Haval</p>
                <p className="truncate text-[11px] text-fg-muted">{busy ? t("chat.thinking") : t("agent.sub")}</p>
              </div>
              {messages.length > 0 && (
                <button onClick={clear} className="grid size-8 place-items-center rounded-lg text-fg-faint hover:bg-white/[0.06] hover:text-fg" aria-label={t("chat.clear")} title={t("chat.clear")}>
                  <Trash2 className="size-4" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-lg text-fg-faint hover:bg-white/[0.06] hover:text-fg" aria-label={t("agent.close")}>
                <X className="size-4" />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
              {messages.length === 0 && (
                <>
                  <p className="w-fit max-w-[90%] rounded-2xl rounded-bl-sm border border-white/10 bg-white/[0.04] px-4 py-2.5 text-fg">{t("agent.greeting")}</p>
                  <div className="flex flex-wrap gap-2">
                    {[t("chat.q1"), t("chat.q2"), t("chat.q3")].map((q) => (
                      <button key={q} onClick={() => void send(q)} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-fg-muted hover:border-ember-400/50 hover:text-fg">
                        {q}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <p key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-ember-500 px-4 py-2.5 text-night-950">{m.text}</p>
                ) : (
                  <p key={i} className="w-fit max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-white/10 bg-white/[0.04] px-4 py-2.5 text-fg">{m.text}</p>
                ),
              )}
              {busy && (
                <p className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-sm border border-white/10 bg-white/[0.04] px-4 py-2.5 text-fg-muted">
                  <Loader2 className="size-3.5 animate-spin" /> {t("chat.thinking")}
                </p>
              )}
              {error && <p className="text-xs text-red-300">{error}</p>}
              <div ref={bottom} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(draft);
                setDraft("");
              }}
              className="flex gap-2 border-t border-white/5 p-3"
            >
              <input
                ref={input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t("chat.placeholder")}
                aria-label={t("chat.aria")}
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-night-900 px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-ember-400/60 focus:outline-none"
              />
              <button type="submit" disabled={busy || !draft.trim()} className="grid size-10 shrink-0 place-items-center rounded-xl bg-ember-500 text-night-950 disabled:opacity-40" aria-label={t("chat.send")}>
                <Send className="size-4" />
              </button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      <div className="pointer-events-auto flex items-end justify-end gap-3 px-4 pb-4 sm:p-0">
        <AnimatePresence>
          {bubble && !open && (
            <motion.button
              key="bubble"
              initial={{ opacity: 0, y: 8, x: 8 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, y: 6 }}
              onClick={() => { setBubble(false); setOpen(true); }}
              className="panel-tile mb-1 max-w-[240px] rounded-2xl rounded-br-sm px-4 py-2.5 text-left text-sm text-fg shadow-xl shadow-black/40"
            >
              {t("agent.hi")}
            </motion.button>
          )}
        </AnimatePresence>
        <motion.button
          onClick={() => { setOpen((o) => !o); setBubble(false); setPop((n) => n + 1); }}
          onMouseEnter={() => { setHover(true); setPop((n) => n + 1); }}
          onMouseLeave={() => setHover(false)}
          whileTap={{ scale: 0.96 }}
          initial={intro ? { y: 190, opacity: 1 } : false}
          animate={
            phase === "buried" ? { y: 190 }
            : phase === "jump" ? { y: [190, -44, 0, -10, 0], scaleY: [1, 1.08, 0.86, 1.04, 1], scaleX: [1, 0.94, 1.12, 0.98, 1] }
            : open ? { y: 0 }
            : { y: [0, -3, 0] }
          }
          transition={
            phase === "jump" ? { duration: 1.0, times: [0, 0.45, 0.7, 0.85, 1], ease: "easeOut" }
            : open || phase !== "done" ? { duration: 0.2 }
            : { duration: 5, repeat: Infinity, ease: "easeInOut" }
          }
          aria-label={open ? t("agent.close") : t("agent.open")}
          aria-expanded={open}
          className="group relative flex items-center rounded-full"
        >
          <AnimatePresence>
            {hover && !open && (
              <motion.span
                key="label"
                initial={{ opacity: 0, x: 10, width: 0 }}
                animate={{ opacity: 1, x: 0, width: "auto" }}
                exit={{ opacity: 0, x: 10, width: 0 }}
                transition={{ duration: 0.2 }}
                className="mr-3 hidden overflow-hidden whitespace-nowrap rounded-full border border-white/10 bg-night-900/90 px-3.5 py-2 text-sm text-fg backdrop-blur sm:block"
              >
                Digital Haval
              </motion.span>
            )}
          </AnimatePresence>
          <span className="relative grid size-[84px] place-items-center rounded-full">
            <span className="absolute inset-3 rounded-full bg-ember-500/40 blur-xl" aria-hidden="true" />
            <span className="absolute inset-[9px] rounded-full bg-[#0b0908]" aria-hidden="true" />
            <Agent3D mood={mood} size={84} bounce={pop} intro={intro} onPhase={setPhase} className="relative" />
          </span>
          {messages.length === 0 && !open && <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-night-950" />}
        </motion.button>
      </div>
    </div>
  );
}

// Compact presentation used inside the Build Lab section: opens the floating agent.
export function AgentTeaser() {
  const [hover, setHover] = useState(false);
  return (
    <div className="panel-tile min-w-0 rounded-3xl p-6" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="flex items-center gap-4">
        <button onClick={() => openAgent()} className="relative shrink-0 rounded-full" aria-label={t("agent.open")}>
          <span className="absolute inset-2 rounded-full bg-ember-500/35 blur-xl" aria-hidden="true" />
          <span className="absolute inset-[9px] rounded-full bg-[#0b0908]" aria-hidden="true" />
          <Agent3D mood={hover ? "happy" : "idle"} size={88} className="relative" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-fg">Digital Haval</p>
          <p className="text-sm text-fg-muted">{t("agent.teaser")}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {[t("chat.q1"), t("chat.q2"), t("chat.q3")].map((q) => (
          <button key={q} onClick={() => openAgent(q)} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-fg-muted hover:border-ember-400/50 hover:text-fg">
            {q}
          </button>
        ))}
      </div>
      <button onClick={() => openAgent()} className="mt-4 inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-medium text-night-950">
        {t("agent.open")}
      </button>
    </div>
  );
}
