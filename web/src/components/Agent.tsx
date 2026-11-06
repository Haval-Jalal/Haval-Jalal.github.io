import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Send, Trash2, X } from "lucide-react";
import { onAgentOpen, openAgent, useDigitalHaval } from "../lib/chat";
import { t } from "../lib/i18n";

/* ---------- The face ---------- */

type Mood = "idle" | "thinking" | "speaking" | "happy";

// An animated face in the site's ember palette: eyes follow the pointer, it blinks, and the mouth
// changes with what the agent is doing. Pure SVG + motion, so it stays crisp at any size.
export function AgentFace({ mood = "idle", size = 56, className = "" }: { mood?: Mood; size?: number; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
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

  return (
    <svg ref={ref} viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <radialGradient id="hj-face-bg" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#2a1d14" />
          <stop offset="60%" stopColor="#14110f" />
          <stop offset="100%" stopColor="#0b0b0f" />
        </radialGradient>
        <linearGradient id="hj-face-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffb86b" />
          <stop offset="100%" stopColor="#d9772a" />
        </linearGradient>
      </defs>
      {/* glow ring */}
      <circle cx="32" cy="32" r="30" fill="url(#hj-face-bg)" stroke="url(#hj-face-ring)" strokeWidth="2" />
      <motion.circle
        cx="32" cy="32" r="30" fill="none" stroke="#e8933a" strokeWidth="1"
        animate={mood === "thinking" ? { opacity: [0.2, 0.9, 0.2], r: [30, 31, 30] } : { opacity: 0.25, r: 30 }}
        transition={mood === "thinking" ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" } : { duration: 0.4 }}
      />
      {/* eyes */}
      <g>
        <motion.ellipse
          cx={22} cy={27} rx={4.2} ry={blink ? 0.4 : mood === "happy" ? 2.2 : 5}
          fill="#ffb86b"
          animate={{ x: eyeX, y: eyeY }}
          transition={{ type: "spring", stiffness: 180, damping: 18 }}
        />
        <motion.ellipse
          cx={42} cy={27} rx={4.2} ry={blink ? 0.4 : mood === "happy" ? 2.2 : 5}
          fill="#ffb86b"
          animate={{ x: eyeX, y: eyeY }}
          transition={{ type: "spring", stiffness: 180, damping: 18 }}
        />
        {/* pupils */}
        {!blink && mood !== "happy" && (
          <>
            <motion.circle cx={22} cy={28} r={1.6} fill="#0b0b0f" animate={{ x: eyeX * 1.4, y: eyeY * 1.4 }} transition={{ type: "spring", stiffness: 200, damping: 18 }} />
            <motion.circle cx={42} cy={28} r={1.6} fill="#0b0b0f" animate={{ x: eyeX * 1.4, y: eyeY * 1.4 }} transition={{ type: "spring", stiffness: 200, damping: 18 }} />
          </>
        )}
      </g>
      {/* mouth */}
      {mood === "speaking" ? (
        <motion.rect
          x={25} y={40} width={14} rx={4} fill="#ffb86b"
          animate={{ height: [3, 9, 4, 8, 3], y: [41, 38, 40.5, 38.5, 41] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : mood === "thinking" ? (
        <g fill="#ffb86b">
          <motion.circle cx={26} cy={42} r={1.8} animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: 0 }} />
          <motion.circle cx={32} cy={42} r={1.8} animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: 0.2 }} />
          <motion.circle cx={38} cy={42} r={1.8} animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: 0.4 }} />
        </g>
      ) : (
        <motion.path
          d={mood === "happy" ? "M23 40 Q32 50 41 40" : "M24 41 Q32 46 40 41"}
          fill="none" stroke="#ffb86b" strokeWidth={2.4} strokeLinecap="round"
          animate={{ d: mood === "happy" ? "M23 40 Q32 50 41 40" : "M24 41 Q32 46 40 41" }}
          transition={{ duration: 0.3 }}
        />
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
    if (messages.length > 0) return;
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
              <AgentFace mood={mood} size={40} />
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
          onClick={() => { setOpen((o) => !o); setBubble(false); }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.96 }}
          animate={open ? { y: 0 } : { y: [0, -4, 0] }}
          transition={open ? { duration: 0.2 } : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
          aria-label={open ? t("agent.close") : t("agent.open")}
          aria-expanded={open}
          className="relative grid size-16 place-items-center rounded-full shadow-[0_0_40px_-8px_rgba(232,147,58,0.9)]"
        >
          <AgentFace mood={mood} size={64} />
          {messages.length === 0 && !open && <span className="absolute right-1 top-1 size-2.5 rounded-full bg-emerald-400 ring-2 ring-night-950" />}
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
        <button onClick={() => openAgent()} className="shrink-0 rounded-full shadow-[0_0_30px_-8px_rgba(232,147,58,0.8)]" aria-label={t("agent.open")}>
          <AgentFace mood={hover ? "happy" : "idle"} size={64} />
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
