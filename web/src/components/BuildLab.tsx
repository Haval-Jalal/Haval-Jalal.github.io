import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Bot, Clock, Loader2, Lock, LockOpen, Send, Sparkles, Trash2, Wand2 } from "lucide-react";
import Section, { reveal, stagger } from "./Section";
import { LabActions, LabFrame, Plan } from "./LabViewer";
import { AgentError, chat, friendlyError, getStatus, PLAN_MARKER, sendLead, streamBuild, type BudgetMode, type ChatMsg } from "../lib/agent";
import { getBuild, listBuilds, visitorId, type Build, type BuildSummary } from "../lib/lab";
import { relativeTime } from "../lib/github";
import { trackEvent } from "../lib/beacon";

const EXAMPLES = [
  "En app som räknar ut vad min bil kostar per mil",
  "En landningssida för ett café i Majorna",
  "Ett verktyg som sorterar mina jobbansökningar",
];

export default function BuildLab() {
  return (
    <Section
      id="build-lab"
      tone="b"
      eyebrow="AI Build Lab"
      title={
        <>
          Beskriv en idé. <span className="text-ember-300">Se den byggas.</span>
        </>
      }
      lede="Skriv vad du vill ha, så bygger min AI-agent en körbar prototyp direkt här på sidan och förklarar hur jag skulle bygga den på riktigt med .NET och React. Prototyperna sparas, går att dela och ladda ner."
    >
      <div className="grid min-w-0 gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Lab />
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          variants={stagger}
          className="flex min-w-0 flex-col gap-4"
        >
          <DigitalHaval />
          <motion.div variants={reveal} className="panel-tile rounded-3xl p-6">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember-300">Så funkar det</p>
            <ol className="mt-3 space-y-2 text-sm text-fg-muted">
              <li>1. Du beskriver vad du vill bygga.</li>
              <li>2. Agenten bygger en körbar prototyp i en sandlåda.</li>
              <li>3. Du får en arkitekturskiss för en riktig version.</li>
              <li>4. Ladda ner koden eller dela länken, och hör av dig om du vill bygga vidare.</li>
            </ol>
          </motion.div>
        </motion.div>
      </div>
    </Section>
  );
}

type LabState = { status: "idle" } | { status: "running" } | { status: "done"; truncated: boolean } | { status: "error"; message: string };

function Lab() {
  const [idea, setIdea] = useState("");
  const [state, setState] = useState<LabState>({ status: "idle" });
  const [raw, setRaw] = useState("");
  const [current, setCurrent] = useState<Build | null>(null);
  const [mine, setMine] = useState<BuildSummary[]>([]);
  const [mode, setMode] = useState<BudgetMode>("full");
  const abort = useRef<AbortController | null>(null);

  // On load: budget mode, the visitor's earlier prototypes, and the latest one back in the viewer.
  useEffect(() => {
    void getStatus().then(setMode);
    void listBuilds().then(async (list) => {
      setMine(list);
      if (list.length > 0) {
        const b = await getBuild(list[0].id);
        if (b) {
          setCurrent(b);
          setIdea(b.idea);
        }
      }
    });
  }, []);

  const stopped = mode === "stopped";
  const markerAt = raw.indexOf(PLAN_MARKER);
  const streamingHtml = markerAt >= 0 ? raw.slice(0, markerAt) : raw;

  const open = async (id: string) => {
    const b = await getBuild(id);
    if (b) {
      setCurrent(b);
      setIdea(b.idea);
      setRaw("");
      setState({ status: "idle" });
    }
  };

  const run = async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 8 || state.status === "running") return;
    abort.current?.abort();
    abort.current = new AbortController();
    setRaw("");
    setCurrent(null);
    setState({ status: "running" });
    trackEvent("build_lab_run");
    try {
      let done: { truncated: boolean; id: string | null } = { truncated: false, id: null };
      await streamBuild(trimmed, visitorId(), (t) => setRaw((r) => r + t), abort.current.signal, setMode, (info) => (done = info));
      if (done.id) {
        const b = await getBuild(done.id);
        if (b) {
          setCurrent(b);
          setRaw("");
        }
        setMine(await listBuilds());
      }
      setState({ status: "done", truncated: done.truncated });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      const code = e instanceof AgentError ? e.code : "unknown";
      if (code === "daily_cap") setMode("stopped");
      setState({ status: "error", message: friendlyError(code) });
    }
  };

  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      variants={stagger}
      className="panel-glass min-w-0 overflow-hidden rounded-3xl p-2"
    >
      <motion.div variants={reveal} className="rounded-[1.25rem] border border-white/5 bg-night-950/60 p-5 md:p-7">
        <div className="flex flex-wrap items-center gap-2 text-xs text-fg-faint">
          <Sparkles className="size-3.5 text-ember-300" />
          Build Lab · AI-agent byggd på Claude
          {mode === "eco" && (
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-amber-200" title="Dagens budget är nästan slut, så prototyperna byggs med en snabbare modell.">
              Sparläge
            </span>
          )}
        </div>
        <label htmlFor="build-idea" className="sr-only">
          Beskriv din idé
        </label>
        <textarea
          id="build-idea"
          rows={3}
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void run(idea);
          }}
          placeholder="T.ex. en app som håller koll på mina löprundor och visar statistik…"
          className="mt-4 w-full resize-none bg-transparent text-lg leading-relaxed text-fg placeholder:text-fg-faint focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {EXAMPLES.map((e) => (
            <button key={e} type="button" onClick={() => setIdea(e)} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-fg-muted transition-colors hover:border-ember-400/50 hover:text-fg">
              {e}
            </button>
          ))}
        </div>
        {stopped ? (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm text-fg">Dagens AI-budget är slut, men idén behöver inte vänta.</p>
            <p className="mt-1 text-xs text-fg-muted">Skicka den till Haval så bygger han prototypen själv och hör av sig.</p>
            <IdeaForm idea={idea} />
          </div>
        ) : (
          <div className="mt-6 flex items-center justify-between gap-4">
            <p className="text-xs text-fg-faint">
              {state.status === "running" && "Bygger… prototypen dyker upp medan den skrivs."}
              {state.status === "done" && !state.truncated && "Klart. Prova prototypen nedan."}
              {state.status === "done" && state.truncated && <span className="text-amber-200">Idén blev för stor för en prototyp och klipptes av. Prova att avgränsa den till kärnflödet.</span>}
              {state.status === "error" && <span className="text-red-300">{state.message}</span>}
              {state.status === "idle" && "Ctrl+Enter för att bygga. Max 3 per timme."}
            </p>
            <button
              type="button"
              onClick={() => void run(idea)}
              disabled={idea.trim().length < 8 || state.status === "running"}
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-ember-500 px-5 py-2.5 text-sm font-medium text-night-950 transition-opacity disabled:opacity-40"
            >
              {state.status === "running" ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
              Bygg prototyp
            </button>
          </div>
        )}
      </motion.div>

      {state.status === "running" && (
        <div className="mt-2 min-w-0 overflow-hidden rounded-[1.25rem] border border-white/5 bg-night-950">
          <div className="flex items-center gap-1.5 border-b border-white/5 bg-[#111] px-3 py-2">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
            <span className="ml-3 font-mono text-[11px] text-white/50">prototyp.html · bygger…</span>
          </div>
          <BuildProgress raw={streamingHtml} />
        </div>
      )}

      {state.status !== "running" && raw && !current && (
        <p className="mt-2 rounded-[1.25rem] border border-white/5 bg-night-950/60 p-5 text-sm text-fg-muted">{raw.replace(PLAN_MARKER, "").trim()}</p>
      )}

      {state.status !== "running" && current && (
        <div className="mt-2 space-y-2">
          <LabFrame build={current} />
          <div className="min-w-0 rounded-[1.25rem] border border-white/5 bg-night-950/60 p-5 md:p-7">
            {current.plan && <Plan text={current.plan} />}
            <LabActions build={current} onUnlocked={() => {
              setCurrent({ ...current, unlocked: true });
              setMine((m) => m.map((b) => (b.id === current.id ? { ...b, unlocked: true } : b)));
            }} />
          </div>
        </div>
      )}

      {mine.length > 0 && (
        <div className="mt-2 rounded-[1.25rem] border border-white/5 bg-night-950/40 p-4">
          <p className="flex items-center gap-2 px-1 font-mono text-[11px] uppercase tracking-[0.2em] text-fg-faint">
            <Clock className="size-3" /> Dina prototyper
          </p>
          <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {mine.map((b) => (
              <li key={b.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => void open(b.id)}
                  className={`w-56 rounded-xl border p-3 text-left transition-colors ${
                    current?.id === b.id ? "border-ember-400/50 bg-ember-500/10" : "border-white/8 bg-white/[0.03] hover:border-white/20"
                  }`}
                >
                  <p className="truncate text-sm font-medium text-fg">{b.title}</p>
                  <p className="mt-0.5 truncate text-xs text-fg-muted">{b.idea}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-fg-faint">
                    {b.unlocked ? <LockOpen className="size-3 text-emerald-300" /> : <Lock className="size-3" />}
                    {relativeTime(b.ts)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}

// What the visitor sees while the agent thinks and the code streams in.
function BuildProgress({ raw }: { raw: string }) {
  const thinking = raw.length === 0;
  const lines = raw.split("\n");
  const tail = lines.slice(-14);
  const phase = thinking
    ? "Agenten läser idén och planerar prototypen"
    : raw.includes("<script") ? "Skriver logiken" : raw.includes("<body") ? "Bygger gränssnittet" : "Sätter struktur och stil";
  return (
    <div className="flex h-[520px] flex-col">
      <div className="flex items-center gap-3 border-b border-white/5 px-5 py-3 text-xs text-fg-muted">
        <Loader2 className="size-3.5 animate-spin text-ember-300" />
        <span className="text-fg">{phase}…</span>
        {!thinking && (
          <span className="ml-auto font-mono text-fg-faint">
            {lines.length} rader · {raw.length.toLocaleString("sv-SE")} tecken
          </span>
        )}
      </div>
      <pre className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden whitespace-pre-wrap break-all px-5 py-4 font-mono text-[11px] leading-relaxed text-fg-muted">
        {thinking ? (
          <span className="text-fg-faint">{"// Första raderna dyker upp om några sekunder.\n// Prototypen körs här i en sandlåda när den är komplett."}</span>
        ) : (
          tail.map((l, i) => (
            <div key={i} className={i === tail.length - 1 ? "text-fg" : ""}>
              {l || " "}
            </div>
          ))
        )}
        {!thinking && <span className="inline-block h-3 w-1.5 animate-pulse bg-ember-400 align-middle" />}
      </pre>
    </div>
  );
}

// Budget-stopped fallback: send the idea to Haval without a prototype.
function IdeaForm({ idea }: { idea: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const field = "rounded-xl border border-white/10 bg-night-900 px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-ember-400/60 focus:outline-none";

  if (status === "sent") return <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">Tack! Haval hör av sig.</p>;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setStatus("sending");
        try {
          await sendLead({ name, email, message, idea, website, source: "build-lab-budget" });
          setStatus("sent");
          trackEvent("lead_sent");
        } catch {
          setStatus("error");
        }
      }}
      className="mt-4 grid gap-3 sm:grid-cols-2"
    >
      <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" aria-hidden="true" className="absolute -left-[9999px] h-px w-px opacity-0" />
      <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Namn" className={field} />
      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-post" className={field} />
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="Meddelande (valfritt)" className={`${field} sm:col-span-2`} />
      <div className="flex items-center justify-between sm:col-span-2">
        <span className="text-xs text-fg-faint">{status === "error" ? "Kunde inte skicka, prova igen." : "Idén följer med."}</span>
        <button type="submit" disabled={status === "sending"} className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-medium text-night-950 disabled:opacity-40">
          <Send className="size-4" /> Skicka till Haval
        </button>
      </div>
    </form>
  );
}

const CHAT_KEY = "hj_chat";

function DigitalHaval() {
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CHAT_KEY) ?? "[]") as ChatMsg[];
    } catch {
      return [];
    }
  });
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      /* storage blocked */
    }
    if (messages.length > 0) bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const next: ChatMsg[] = [...messages, { role: "user", text: t }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    setError(null);
    trackEvent("chat_message");
    try {
      const { reply } = await chat(next);
      setMessages([...next, { role: "assistant", text: reply }]);
    } catch (e) {
      setError(friendlyError(e instanceof AgentError ? e.code : "unknown"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} variants={reveal} className="panel-tile min-w-0 rounded-3xl p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-ember-500 text-night-950">
          <Bot className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-fg">Digital Haval</p>
          <p className="text-xs text-fg-muted">Fråga om mitt CV, mina projekt eller min stack</p>
        </div>
        {messages.length > 0 && (
          <button type="button" onClick={() => setMessages([])} className="text-fg-faint hover:text-fg" aria-label="Rensa chatten" title="Rensa chatten">
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      <div className="mt-5 max-h-72 space-y-3 overflow-y-auto pr-1 text-sm">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {["Har Haval jobbat med CQRS?", "Vad gjorde han på Volvo?", "Är han öppen för uppdrag?"].map((q) => (
              <button key={q} onClick={() => void send(q)} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-fg-muted hover:border-ember-400/50 hover:text-fg">
                {q}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <p key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-ember-500 px-4 py-2.5 text-night-950">
              {m.text}
            </p>
          ) : (
            <p key={i} className="w-fit max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-white/10 bg-white/[0.04] px-4 py-2.5 text-fg">
              {m.text}
            </p>
          ),
        )}
        {busy && (
          <p className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-sm border border-white/10 bg-white/[0.04] px-4 py-2.5 text-fg-muted">
            <Loader2 className="size-3.5 animate-spin" /> Tänker…
          </p>
        )}
        {error && <p className="text-xs text-red-300">{error}</p>}
        <div ref={bottom} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
        className="mt-4 flex gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ställ en fråga…"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-night-900 px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-ember-400/60 focus:outline-none"
          aria-label="Fråga Digital Haval"
        />
        <button type="submit" disabled={busy || !draft.trim()} className="grid size-10 shrink-0 place-items-center rounded-xl bg-ember-500 text-night-950 disabled:opacity-40" aria-label="Skicka">
          <Send className="size-4" />
        </button>
      </form>
    </motion.div>
  );
}
