import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Eye, EyeOff, GitCommitHorizontal, Loader2, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import {
  deleteChangelog, draftChangelog, getNowAdmin, listChangelogAdmin, saveChangelog, saveNow, translateNow,
  type ChangelogEntry, type NowPage,
} from "../lib/posts";
import { AdminLangContext, AiButton } from "./AiHelp";

const input = "mt-1 w-full rounded-md border border-white/10 bg-night-900 px-3 py-2 text-sm text-fg focus:border-ember-400/60 focus:outline-none";
const area = `${input} resize-y leading-relaxed`;

/* ====================== Nu-sidan ====================== */

export function NowEditor() {
  const [lang, setLang] = useState<"sv" | "en">("sv");
  const [doc, setDoc] = useState<NowPage | null | undefined>(undefined);
  const [exists, setExists] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "translating" | "error">("idle");

  useEffect(() => {
    setDoc(undefined);
    getNowAdmin(lang)
      .then((r) => {
        setExists(r.exists);
        setDoc(r.now);
        setDirty(false);
      })
      .catch(() => setDoc(null));
  }, [lang]);

  const update = (fn: (d: NowPage) => NowPage) => {
    setDoc((d) => (d ? fn(d) : d));
    setDirty(true);
    setStatus("idle");
  };

  const save = async () => {
    if (!doc) return;
    setStatus("saving");
    try {
      setDoc(await saveNow(doc, lang));
      setExists(true);
      setDirty(false);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };

  const translate = async () => {
    if (exists && !window.confirm("Skriva över den engelska versionen med en ny AI-översättning av den svenska?")) return;
    setStatus("translating");
    try {
      setDoc(await translateNow(lang));
      setDirty(true);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };

  return (
    <AdminLangContext.Provider value={lang}>
      <div className="max-w-3xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Nu</h1>
            <p className="text-sm text-fg-muted">
              Vad du håller på med just nu. Visas på{" "}
              <a href="/nu" target="_blank" rel="noreferrer" className="text-ember-300 hover:underline">/nu <ExternalLink className="inline size-3" /></a>
              {" "}och /en/now.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(["sv", "en"] as const).map((l) => (
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
          </div>
        </header>

        {doc === undefined && <p className="mt-8 text-fg-muted">Hämtar…</p>}
        {doc === null && lang === "en" && (
          <div className="panel-tile mt-8 rounded-2xl p-6">
            <p className="text-sm text-fg-muted">Det finns ingen engelsk version ännu. Besökare på /en/now ser den svenska.</p>
            <button onClick={() => void translate()} disabled={status === "translating"} className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-ember-400/40 bg-ember-500/10 px-3 py-1.5 text-xs text-ember-200 disabled:opacity-50">
              <Sparkles className="size-3.5" /> {status === "translating" ? "Översätter…" : "Översätt från svenska med AI"}
            </button>
            {status === "error" && <p className="mt-3 text-xs text-red-300">Översättningen misslyckades.</p>}
          </div>
        )}
        {doc && (
          <>
            {lang === "en" && (
              <button onClick={() => void translate()} disabled={status === "translating"} className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-ember-400/40 bg-ember-500/10 px-3 py-1.5 text-xs text-ember-200 disabled:opacity-50">
                <Sparkles className="size-3.5" /> {status === "translating" ? "Översätter…" : "Översätt om från svenska"}
              </button>
            )}
            <section className="panel-tile mt-6 space-y-4 rounded-2xl p-5">
              <label className="block text-xs text-fg-muted">
                <span className="flex items-center justify-between">Ingress <AiButton value={doc.intro} onChange={(v) => update((d) => ({ ...d, intro: v }))} context="intro of the Now page (1-2 sentences)" /></span>
                <textarea value={doc.intro} rows={2} onChange={(e) => update((d) => ({ ...d, intro: e.target.value }))} className={area} />
              </label>
            </section>

            <div className="mt-4 space-y-3">
              {doc.sections.map((s, i) => (
                <section key={i} className="panel-tile rounded-2xl p-5">
                  <div className="flex items-center gap-2">
                    <input
                      value={s.title}
                      onChange={(e) => update((d) => ({ ...d, sections: d.sections.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)) }))}
                      placeholder="Rubrik, t.ex. Fokus / Lär mig / Läser"
                      className="flex-1 rounded-md border border-white/10 bg-night-900 px-3 py-1.5 text-sm font-medium text-fg focus:border-ember-400/60 focus:outline-none"
                    />
                    <button onClick={() => move(i, -1)} className="text-fg-faint hover:text-fg" aria-label="Flytta upp"><ChevronUp className="size-4" /></button>
                    <button onClick={() => move(i, 1)} className="text-fg-faint hover:text-fg" aria-label="Flytta ner"><ChevronDown className="size-4" /></button>
                    <button onClick={() => update((d) => ({ ...d, sections: d.sections.filter((_, k) => k !== i) }))} className="text-fg-faint hover:text-red-300" aria-label="Ta bort"><Trash2 className="size-4" /></button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {s.items.map((it, j) => (
                      <div key={j} className="flex items-start gap-2">
                        <span className="mt-3 size-1.5 shrink-0 rounded-full bg-ember-400" />
                        <textarea
                          value={it}
                          rows={1}
                          onChange={(e) => update((d) => ({ ...d, sections: d.sections.map((x, k) => (k === i ? { ...x, items: x.items.map((y, m) => (m === j ? e.target.value : y)) } : x)) }))}
                          className="flex-1 resize-y rounded-md border border-white/10 bg-night-900 px-3 py-1.5 text-sm text-fg focus:border-ember-400/60 focus:outline-none"
                        />
                        <AiButton value={it} onChange={(v) => update((d) => ({ ...d, sections: d.sections.map((x, k) => (k === i ? { ...x, items: x.items.map((y, m) => (m === j ? v : y)) } : x)) }))} context={`one item under "${s.title}" on the Now page (one short line)`} />
                        <button onClick={() => update((d) => ({ ...d, sections: d.sections.map((x, k) => (k === i ? { ...x, items: x.items.filter((_, m) => m !== j) } : x)) }))} className="mt-1.5 text-fg-faint hover:text-red-300" aria-label="Ta bort rad"><Trash2 className="size-3.5" /></button>
                      </div>
                    ))}
                    <button onClick={() => update((d) => ({ ...d, sections: d.sections.map((x, k) => (k === i ? { ...x, items: [...x.items, ""] } : x)) }))} className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg">
                      <Plus className="size-3.5" /> Rad
                    </button>
                  </div>
                </section>
              ))}
              <button onClick={() => update((d) => ({ ...d, sections: [...d.sections, { title: "", items: [""] }] }))} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-fg-muted hover:text-fg">
                <Plus className="size-3.5" /> Ny sektion
              </button>
            </div>

            <div className="sticky bottom-4 z-10 mt-8 flex items-center justify-between rounded-full border border-white/10 bg-night-900/90 px-4 py-2 backdrop-blur">
              <span className="text-xs text-fg-muted">
                {status === "saving" && "Sparar…"}
                {status === "translating" && "Översätter med AI…"}
                {status === "saved" && "Sparat. Sidan uppdateras inom två minuter."}
                {status === "error" && <span className="text-red-300">Något gick fel.</span>}
                {status === "idle" && (dirty ? "Osparade ändringar" : "Allt sparat")}
              </span>
              <button onClick={() => void save()} disabled={!dirty || status === "saving"} className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-medium text-night-950 disabled:opacity-40">
                <Save className="size-4" /> Spara
              </button>
            </div>
          </>
        )}
      </div>
    </AdminLangContext.Provider>
  );

  function move(i: number, dir: -1 | 1) {
    update((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.sections.length) return d;
      const next = [...d.sections];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...d, sections: next };
    });
  }
}

/* ====================== Changelog ====================== */

const today = () => new Date().toISOString().slice(0, 10);
const blank = (): ChangelogEntry => ({ id: "", date: today(), title: "", text: "", titleEn: "", textEn: "", tags: [], published: true });

export function ChangelogEditor() {
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null);
  const [edit, setEdit] = useState<ChangelogEntry | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "drafting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [since, setSince] = useState("");
  const [hint, setHint] = useState("");
  const [commits, setCommits] = useState<string[] | null>(null);

  const load = () => listChangelogAdmin().then(setEntries).catch(() => setEntries([]));
  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    // Default "since": the newest entry's date, else a week back.
    if (!entries || since) return;
    const newest = entries[0]?.date;
    setSince(newest ?? new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  }, [entries, since]);

  const draft = async () => {
    setStatus("drafting");
    setError(null);
    try {
      const r = await draftChangelog(since, hint);
      setCommits(r.commits);
      setEdit({ ...(edit ?? blank()), ...r.draft, date: today() });
      setStatus("idle");
    } catch (e) {
      const code = (e as Error).message;
      setError(code === "no_commits" ? "Inga commits sedan det datumet. Skriv en ledtråd eller ändra datumet." : code === "github_failed" ? "Kunde inte läsa commits från GitHub." : "AI:n svarade inte. Prova igen.");
      setStatus("error");
    }
  };

  const save = async () => {
    if (!edit) return;
    setStatus("saving");
    try {
      await saveChangelog(edit);
      setEdit(null);
      setCommits(null);
      setStatus("idle");
      await load();
    } catch {
      setStatus("error");
      setError("Kunde inte spara.");
    }
  };

  const remove = async (e: ChangelogEntry) => {
    if (!window.confirm(`Ta bort "${e.title}"?`)) return;
    await deleteChangelog(e.id);
    await load();
  };

  const toggle = async (e: ChangelogEntry) => {
    await saveChangelog({ ...e, published: !e.published });
    await load();
  };

  return (
    <div className="max-w-3xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Changelog</h1>
          <p className="text-sm text-fg-muted">
            Vad som är nytt på sajten. Visas på{" "}
            <a href="/changelog" target="_blank" rel="noreferrer" className="text-ember-300 hover:underline">/changelog <ExternalLink className="inline size-3" /></a>.
          </p>
        </div>
        {!edit && (
          <button onClick={() => setEdit(blank())} className="inline-flex items-center gap-1.5 rounded-full bg-ember-500 px-4 py-2 text-sm font-medium text-night-950">
            <Plus className="size-4" /> Ny post
          </button>
        )}
      </header>

      {edit && (
        <section className="panel-tile mt-6 space-y-4 rounded-2xl p-5">
          <div className="rounded-xl border border-ember-400/20 bg-ember-500/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-ember-200"><GitCommitHorizontal className="size-3.5" /> Utkast från GitHub-commits</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="text-[11px] text-fg-muted">Sedan <input type="date" value={since} onChange={(e) => setSince(e.target.value)} className="ml-1 rounded-md border border-white/10 bg-night-900 px-2 py-1 text-xs text-fg" /></label>
              <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Ledtråd till AI:n (valfritt), t.ex. fokusera på 3D-agenten" className="min-w-0 flex-1 rounded-md border border-white/10 bg-night-900 px-2 py-1 text-xs text-fg focus:border-ember-400/60 focus:outline-none" />
              <button onClick={() => void draft()} disabled={status === "drafting"} className="inline-flex items-center gap-1.5 rounded-full border border-ember-400/40 bg-ember-500/10 px-3 py-1.5 text-xs text-ember-200 disabled:opacity-50">
                {status === "drafting" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} {status === "drafting" ? "Skriver…" : "Skriv utkast"}
              </button>
            </div>
            {commits && (
              <details className="mt-2 text-[11px] text-fg-faint">
                <summary className="cursor-pointer">{commits.length} commits lästa</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">{commits.map((c) => <li key={c}>{c}</li>)}</ul>
              </details>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <AdminLangContext.Provider value="sv">
              <div className="space-y-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-faint">Svenska</p>
                <label className="block text-xs text-fg-muted">
                  <span className="flex items-center justify-between">Rubrik <AiButton value={edit.title} onChange={(v) => setEdit({ ...edit, title: v })} context="changelog entry title (max 8 words)" /></span>
                  <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} className={input} />
                </label>
                <label className="block text-xs text-fg-muted">
                  <span className="flex items-center justify-between">Text <AiButton value={edit.text} onChange={(v) => setEdit({ ...edit, text: v })} context="changelog entry body (2-5 sentences or '- ' lines)" /></span>
                  <textarea value={edit.text} rows={6} onChange={(e) => setEdit({ ...edit, text: e.target.value })} className={area} />
                </label>
              </div>
            </AdminLangContext.Provider>
            <AdminLangContext.Provider value="en">
              <div className="space-y-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-faint">English</p>
                <label className="block text-xs text-fg-muted">
                  <span className="flex items-center justify-between">Title <AiButton value={edit.titleEn} onChange={(v) => setEdit({ ...edit, titleEn: v })} context={`English changelog title; Swedish original: "${edit.title}"`} /></span>
                  <input value={edit.titleEn} onChange={(e) => setEdit({ ...edit, titleEn: e.target.value })} className={input} />
                </label>
                <label className="block text-xs text-fg-muted">
                  <span className="flex items-center justify-between">Text <AiButton value={edit.textEn} onChange={(v) => setEdit({ ...edit, textEn: v })} context={`English changelog body; Swedish original: "${edit.text}"`} /></span>
                  <textarea value={edit.textEn} rows={6} onChange={(e) => setEdit({ ...edit, textEn: e.target.value })} className={area} />
                </label>
              </div>
            </AdminLangContext.Provider>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-fg-muted">Datum<input type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} className={`${input} w-auto`} /></label>
            <label className="min-w-0 flex-1 text-xs text-fg-muted">Taggar (kommaseparerade)<input value={edit.tags.join(", ")} onChange={(e) => setEdit({ ...edit, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} className={input} /></label>
            <label className="inline-flex items-center gap-2 pb-2 text-xs text-fg-muted">
              <input type="checkbox" checked={edit.published} onChange={(e) => setEdit({ ...edit, published: e.target.checked })} /> Publicerad
            </label>
          </div>
          {error && <p className="text-xs text-red-300">{error}</p>}
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => { setEdit(null); setCommits(null); setError(null); }} className="rounded-full border border-white/10 px-4 py-2 text-sm text-fg-muted hover:text-fg">Avbryt</button>
            <button onClick={() => void save()} disabled={!edit.title.trim() || status === "saving"} className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-medium text-night-950 disabled:opacity-40">
              <Save className="size-4" /> Spara
            </button>
          </div>
        </section>
      )}

      {!entries ? (
        <p className="mt-8 text-fg-muted">Hämtar…</p>
      ) : entries.length === 0 ? (
        <p className="mt-8 text-sm text-fg-faint">Inga poster ännu. Skapa en ny, gärna med AI-utkastet från dina commits.</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {entries.map((e) => (
            <li key={e.id} className={`panel-tile flex items-start gap-3 rounded-xl px-4 py-3 ${e.published ? "" : "opacity-60"}`}>
              <span className="mt-0.5 font-mono text-[11px] text-fg-faint">{e.date}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-fg">{e.title}</span>
                <span className="block truncate text-xs text-fg-muted">{e.text}</span>
                {!e.titleEn && <span className="mt-1 inline-block rounded-full border border-amber-400/30 px-1.5 text-[10px] text-amber-200">saknar engelska</span>}
              </span>
              <button onClick={() => void toggle(e)} title={e.published ? "Avpublicera" : "Publicera"} className="text-fg-faint hover:text-fg">{e.published ? <Eye className="size-4" /> : <EyeOff className="size-4" />}</button>
              <button onClick={() => { setEdit(e); setError(null); }} className="text-xs text-fg-muted hover:text-fg">Ändra</button>
              <button onClick={() => void remove(e)} className="text-fg-faint hover:text-red-300" aria-label="Ta bort"><Trash2 className="size-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// One admin tab with two sub-views.
export default function Posts() {
  const [view, setView] = useState<"now" | "changelog">("now");
  return (
    <div>
      <div className="mb-6 flex gap-1 rounded-full border border-white/10 p-1 text-xs" style={{ width: "fit-content" }}>
        {(["now", "changelog"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`rounded-full px-3 py-1.5 ${view === v ? "bg-white text-night-950" : "text-fg-muted hover:text-fg"}`}>
            {v === "now" ? "Nu-sidan" : "Changelog"}
          </button>
        ))}
      </div>
      {view === "now" ? <NowEditor /> : <ChangelogEditor />}
    </div>
  );
}
