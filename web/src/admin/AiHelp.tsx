import { createContext, useContext, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { aiDraft } from "../lib/posts";

// Which language the editor around a field is working in (the AI writes in that language).
export const AdminLangContext = createContext<"sv" | "en">("sv");

const PRESETS = ["Gör texten tydligare och mer konkret", "Korta ner", "Mer självsäker ton, utan att bli säljig", "Rätta stavning och grammatik"];

// A small ✨ button next to a text field: opens a one-line instruction, replaces the field with the AI's draft.
export function AiButton({ value, onChange, context }: { value: string; onChange: (v: string) => void; context: string }) {
  const lang = useContext(AdminLangContext);
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);

  const run = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const next = await aiDraft({ instruction: text, text: value, context, lang });
      setPrevious(value);
      onChange(next);
      setOpen(false);
    } catch (e) {
      const code = (e as Error).message;
      setError(code === "not_configured" ? "AI är inte aktiverat i den här miljön." : "AI:n svarade inte. Prova igen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="relative inline-flex items-center gap-1">
      {previous !== null && (
        <button
          type="button"
          onClick={() => {
            onChange(previous);
            setPrevious(null);
          }}
          className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-fg-muted hover:text-fg"
          title="Ångra AI-ändringen"
        >
          Ångra
        </button>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-colors ${open ? "border-ember-400/60 bg-ember-500/15 text-ember-200" : "border-white/10 text-fg-muted hover:border-ember-400/40 hover:text-ember-200"}`}
        title="Skriv eller förbättra med AI"
      >
        {busy ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />} AI
      </button>
      {open && (
        <span className="absolute right-0 top-7 z-20 w-80 rounded-xl border border-white/10 bg-night-900 p-3 shadow-xl shadow-black/40">
          <span className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-fg">Vad ska AI göra med texten?</span>
            <button type="button" onClick={() => setOpen(false)} className="text-fg-faint hover:text-fg" aria-label="Stäng"><X className="size-3.5" /></button>
          </span>
          <span className="mt-2 flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button key={p} type="button" disabled={busy} onClick={() => void run(p)} className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-fg-muted hover:border-ember-400/40 hover:text-fg disabled:opacity-50">
                {p}
              </button>
            ))}
          </span>
          <span className="mt-2 flex gap-1">
            <input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void run(instruction);
                }
              }}
              placeholder={value.trim() ? "Egen instruktion…" : "Beskriv vad som ska stå här…"}
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-night-950 px-2 py-1 text-xs text-fg focus:border-ember-400/60 focus:outline-none"
            />
            <button type="button" disabled={busy || !instruction.trim()} onClick={() => void run(instruction)} className="rounded-md bg-ember-500 px-2.5 py-1 text-xs font-medium text-night-950 disabled:opacity-40">
              Kör
            </button>
          </span>
          {error && <span className="mt-2 block text-[11px] text-red-300">{error}</span>}
          <span className="mt-2 block text-[10px] text-fg-faint">Sonnet 5.5 · känner till ditt innehåll och hittar inte på fakta. Du kan ångra efteråt.</span>
        </span>
      )}
    </span>
  );
}
