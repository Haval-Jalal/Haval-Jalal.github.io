import { useEffect, useRef, useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { Bot, Loader2, Send, Sparkles, Wand2 } from "lucide-react";
import Section, { reveal, stagger } from "./Section";
import { AgentError, chat, friendlyError, getStatus, PLAN_MARKER, sendLead, streamBuild, type BudgetMode, type ChatMsg } from "../lib/agent";
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
      lede="Skriv vad du vill ha, så bygger min AI-agent en körbar prototyp direkt här på sidan och förklarar hur jag skulle bygga den på riktigt med .NET och React. Gillar du resultatet? Skicka det till mig med ett klick."
    >
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Lab />
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          variants={stagger}
          className="flex flex-col gap-4"
        >
          <DigitalHaval />
          <motion.div variants={reveal} className="panel-tile rounded-3xl p-6">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember-300">Så funkar det</p>
            <ol className="mt-3 space-y-2 text-sm text-fg-muted">
              <li>1. Du beskriver vad du vill bygga.</li>
              <li>2. Agenten bygger en körbar prototyp i en sandlåda.</li>
              <li>3. Du får en arkitekturskiss för en riktig version.</li>
              <li>4. Skicka till mig, så pratar vi om nästa steg.</li>
            </ol>
          </motion.div>
        </motion.div>
      </div>
    </Section>
  );
}

type LabState = { status: "idle" } | { status: "running" } | { status: "done" } | { status: "error"; message: string };

function Lab() {
  const [idea, setIdea] = useState("");
  const [state, setState] = useState<LabState>({ status: "idle" });
  const [raw, setRaw] = useState("");
  const [shownHtml, setShownHtml] = useState("");
  const [mode, setMode] = useState<BudgetMode>("full");
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    void getStatus().then(setMode);
  }, []);

  const stopped = mode === "stopped";

  const markerAt = raw.indexOf(PLAN_MARKER);
  const html = markerAt >= 0 ? raw.slice(0, markerAt) : raw;
  const plan = markerAt >= 0 ? raw.slice(markerAt + PLAN_MARKER.length).trim() : "";
  const isHtml = html.trimStart().toLowerCase().startsWith("<!doctype") || html.trimStart().startsWith("<html");

  // Re-render the sandbox at most every 400 ms while streaming, then once more when finished.
  useEffect(() => {
    if (state.status === "running") {
      const t = setTimeout(() => setShownHtml(html), 400);
      return () => clearTimeout(t);
    }
    setShownHtml(html);
  }, [html, state.status]);

  const run = async (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 8 || state.status === "running") return;
    abort.current?.abort();
    abort.current = new AbortController();
    setRaw("");
    setShownHtml("");
    setState({ status: "running" });
    trackEvent("build_lab_run");
    try {
      await streamBuild(trimmed, (t) => setRaw((r) => r + t), abort.current.signal, setMode);
      setState({ status: "done" });
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
      className="panel-glass rounded-3xl p-2"
    >
      <motion.div variants={reveal} className="rounded-[1.25rem] border border-white/5 bg-night-950/60 p-5 md:p-7">
        <div className="flex flex-wrap items-center gap-2 text-xs text-fg-faint">
          <Sparkles className="size-3.5 text-ember-300" />
          Build Lab · drivs av Claude {mode === "eco" ? "Sonnet" : "Opus"}
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
            <button
              key={e}
              type="button"
              onClick={() => setIdea(e)}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-fg-muted transition-colors hover:border-ember-400/50 hover:text-fg"
            >
              {e}
            </button>
          ))}
        </div>
        {stopped ? (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm text-fg">Dagens AI-budget är slut, men idén behöver inte vänta.</p>
            <p className="mt-1 text-xs text-fg-muted">Skicka den till Haval så bygger han prototypen själv och hör av sig.</p>
            <LeadForm idea={idea} plan="" compact />
          </div>
        ) : (
          <div className="mt-6 flex items-center justify-between gap-4">
            <p className="text-xs text-fg-faint">
              {state.status === "running" && "Bygger… prototypen dyker upp medan den skrivs."}
              {state.status === "done" && "Klart. Prova prototypen nedan."}
              {state.status === "error" && <span className="text-red-300">{state.message}</span>}
              {state.status === "idle" && "Ctrl+Enter för att bygga. Max 3 per timme."}
            </p>
            <button
              type="button"
              onClick={() => void run(idea)}
              disabled={idea.trim().length < 8 || state.status === "running"}
              className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-5 py-2.5 text-sm font-medium text-night-950 transition-opacity disabled:opacity-40"
            >
              {state.status === "running" ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
              Bygg prototyp
            </button>
          </div>
        )}
      </motion.div>

      {(shownHtml || plan || (state.status !== "idle" && raw)) && (
        <div className="mt-2 space-y-2">
          {isHtml ? (
            <div className="overflow-hidden rounded-[1.25rem] border border-white/5 bg-white">
              <div className="flex items-center gap-1.5 border-b border-black/10 bg-[#111] px-3 py-2">
                <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                <span className="size-2.5 rounded-full bg-[#febc2e]" />
                <span className="size-2.5 rounded-full bg-[#28c840]" />
                <span className="ml-3 font-mono text-[11px] text-white/50">prototyp.html · sandlåda</span>
              </div>
              <iframe
                title="Prototyp"
                sandbox="allow-scripts"
                srcDoc={shownHtml}
                className="h-[520px] w-full bg-white"
              />
            </div>
          ) : (
            raw && <p className="rounded-[1.25rem] border border-white/5 bg-night-950/60 p-5 text-sm text-fg-muted">{raw}</p>
          )}

          {plan && (
            <div className="rounded-[1.25rem] border border-white/5 bg-night-950/60 p-5 md:p-7">
              <Plan text={plan} />
              {state.status === "done" && <LeadForm idea={idea} plan={plan} />}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

// Minimal markdown: headings, bullets, paragraphs.
function Plan({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <div className="space-y-2 text-sm text-fg-muted">
      {lines.map((l, i) => {
        if (/^#{1,3}\s/.test(l) || (i === 0 && !l.startsWith("-"))) {
          return (
            <p key={i} className="text-base font-semibold text-fg">
              {l.replace(/^#{1,3}\s/, "").replace(/\*\*/g, "")}
            </p>
          );
        }
        if (/^[-*•]\s/.test(l)) {
          return (
            <p key={i} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ember-500" />
              <span>{l.replace(/^[-*•]\s/, "").replace(/\*\*/g, "")}</span>
            </p>
          );
        }
        return <p key={i}>{l.replace(/\*\*/g, "")}</p>;
      })}
    </div>
  );
}

function LeadForm({ idea, plan, compact = false }: { idea: string; plan: string; compact?: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot, never shown
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    try {
      await sendLead({ name, email, message, idea, plan, website, source: compact ? "build-lab-budget" : "build-lab" });
      setStatus("sent");
      trackEvent("lead_sent");
    } catch {
      setStatus("error");
    }
  };

  if (status === "sent")
    return <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-200">Tack! Haval hör av sig.</p>;

  return (
    <form onSubmit={submit} className={`grid gap-3 sm:grid-cols-2 ${compact ? "mt-4" : "mt-6 border-t border-white/5 pt-6"}`}>
      {!compact && <p className="text-sm font-medium text-fg sm:col-span-2">Vill du bygga det här på riktigt? Skicka idén till Haval.</p>}
      <input
        tabIndex={-1}
        autoComplete="off"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        name="website"
        aria-hidden="true"
        className="absolute -left-[9999px] h-px w-px opacity-0"
      />
      <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Namn" className={input} />
      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-post" className={input} />
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="Meddelande (valfritt)" className={`${input} sm:col-span-2`} />
      <div className="flex items-center justify-between sm:col-span-2">
        <span className="text-xs text-fg-faint">{status === "error" ? "Kunde inte skicka, prova igen." : "Idén och planen följer med."}</span>
        <button type="submit" disabled={status === "sending"} className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-medium text-night-950 disabled:opacity-40">
          <Send className="size-4" /> Skicka till Haval
        </button>
      </div>
    </form>
  );
}

const input = "rounded-xl border border-white/10 bg-night-900 px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-ember-400/60 focus:outline-none";

function DigitalHaval() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length > 0) bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy]);

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
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      variants={reveal}
      className="panel-tile rounded-3xl p-6"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-ember-500 text-night-950">
          <Bot className="size-5" />
        </span>
        <div>
          <p className="font-semibold text-fg">Digital Haval</p>
          <p className="text-xs text-fg-muted">Fråga om mitt CV, mina projekt eller min stack</p>
        </div>
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
          className={`${input} flex-1`}
          aria-label="Fråga Digital Haval"
        />
        <button type="submit" disabled={busy || !draft.trim()} className="grid size-10 shrink-0 place-items-center rounded-xl bg-ember-500 text-night-950 disabled:opacity-40" aria-label="Skicka">
          <Send className="size-4" />
        </button>
      </form>
    </motion.div>
  );
}
