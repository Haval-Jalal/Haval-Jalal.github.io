import { useEffect, useState } from "react";
import { ArrowLeft, Copy, ExternalLink, Eye, FileDown, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useSiteContent } from "../lib/content";
import { deletePitch, draftPitch, listPitches, pitchUrl, savePitch, slugify, type Pitch } from "../lib/pitch";

const STATUS: Record<Pitch["status"], { text: string; cls: string }> = {
  draft: { text: "Utkast", cls: "bg-white/[0.06] text-fg-muted" },
  published: { text: "Publicerad", cls: "bg-emerald-500/15 text-emerald-300" },
  closed: { text: "Stängd", cls: "bg-red-500/15 text-red-300" },
};

function empty(): Pitch {
  return {
    slug: "", company: "", role: "", jobUrl: "", notes: "", greeting: "", intro: "", projects: [], highlights: [], closing: "",
    ctaLabel: "Boka ett samtal", ctaUrl: "", status: "draft", createdAt: "", updatedAt: "",
    stats: { views: 0, unique: 0, cvDownloads: 0, labClicks: 0, firstViewedAt: null, lastViewedAt: null },
  };
}

export default function Pitches() {
  const [items, setItems] = useState<Pitch[] | null>(null);
  const [editing, setEditing] = useState<Pitch | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => listPitches().then(setItems).catch((e: Error) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  if (error) return <p className="text-red-300">{error}</p>;
  if (editing) {
    return (
      <PitchEditor
        pitch={editing}
        isNew={!items?.some((p) => p.slug === editing.slug)}
        onBack={() => setEditing(null)}
        onSaved={(p) => {
          setEditing(p);
          load();
        }}
      />
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rekryterarläge</h1>
          <p className="text-sm text-fg-muted">En personlig sida per företag: havaljalal.se/for/företag. Du ser när den öppnas och vad de gör.</p>
        </div>
        <button onClick={() => setEditing(empty())} className="inline-flex items-center gap-1.5 rounded-full bg-ember-500 px-4 py-2 text-sm font-medium text-night-950">
          <Plus className="size-4" /> Ny pitch
        </button>
      </header>
      {!items ? (
        <p className="text-fg-muted">Hämtar…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-fg-faint">Inga pitchar ännu. Skapa en för nästa ansökan.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((p) => (
            <li key={p.slug} className="panel-tile flex flex-wrap items-center gap-3 rounded-xl px-4 py-3">
              <button onClick={() => setEditing(p)} className="min-w-0 flex-1 text-left">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-fg">{p.company}</span>
                  {p.role && <span className="text-xs text-fg-muted">{p.role}</span>}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS[p.status].cls}`}>{STATUS[p.status].text}</span>
                </span>
                <span className="mt-0.5 block font-mono text-[11px] text-fg-faint">
                  /for/{p.slug} · {p.stats.views} visningar ({p.stats.unique} unika)
                  {p.stats.firstViewedAt ? ` · öppnad första gången ${new Date(p.stats.firstViewedAt).toLocaleString("sv-SE")}` : " · inte öppnad än"}
                  {p.stats.cvDownloads > 0 ? ` · CV ${p.stats.cvDownloads}×` : ""}
                  {p.stats.labClicks > 0 ? ` · Build Lab ${p.stats.labClicks}×` : ""}
                </span>
              </button>
              <CopyButton text={pitchUrl(p.slug)} />
              <CopyButton text={`${window.location.origin}/api/share/for/${p.slug}`} label="Med förhandsvisning" title="Länk som visar titel och bild när den delas på LinkedIn, Slack eller Teams" />
              <a href={`/for/${p.slug}`} target="_blank" rel="noreferrer" title="Öppna" className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-white/[0.06] hover:text-fg">
                <ExternalLink className="size-4" />
              </a>
              <button
                onClick={async () => {
                  if (!window.confirm(`Ta bort pitchen för ${p.company}? Länken slutar fungera.`)) return;
                  await deletePitch(p.slug);
                  load();
                }}
                title="Ta bort"
                className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-red-500/15 hover:text-red-300"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CopyButton({ text, label = "Länk", title = "Kopiera länk" }: { text: string; label?: string; title?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); })}
      title={title}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-fg-muted hover:bg-white/[0.06] hover:text-fg"
    >
      <Copy className="size-3.5" /> {done ? "Kopierad" : label}
    </button>
  );
}

function PitchEditor({ pitch, isNew, onBack, onSaved }: { pitch: Pitch; isNew: boolean; onBack: () => void; onSaved: (p: Pitch) => void }) {
  const { content } = useSiteContent();
  const [p, setP] = useState<Pitch>(pitch);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [busy, setBusy] = useState<"draft" | "save" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (patch: Partial<Pitch>) => setP((x) => ({ ...x, ...patch }));

  const runDraft = async () => {
    if (!p.company.trim()) return setMsg({ ok: false, text: "Fyll i företag först." });
    setBusy("draft");
    setMsg(null);
    try {
      const d = await draftPitch({ company: p.company, role: p.role, jobUrl: p.jobUrl, notes: p.notes });
      set(d);
      setMsg({ ok: true, text: "Utkast klart. Läs igenom, justera och spara." });
    } catch (e) {
      setMsg({ ok: false, text: `Utkastet misslyckades: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  };

  const save = async (status?: Pitch["status"]) => {
    const slug = p.slug || slugify(p.company);
    if (!p.company.trim() || !slug) return setMsg({ ok: false, text: "Företag saknas." });
    setBusy("save");
    setMsg(null);
    try {
      const saved = await savePitch({ ...p, slug, status: status ?? p.status });
      setP(saved);
      setSlugTouched(true);
      onSaved(saved);
      setMsg({ ok: true, text: saved.status === "published" ? `Publicerad: ${pitchUrl(saved.slug)}` : "Sparad." });
    } catch (e) {
      setMsg({ ok: false, text: `Kunde inte spara: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  };

  const toggleProject = (slug: string) => {
    const has = p.projects.some((x) => x.slug === slug);
    set({ projects: has ? p.projects.filter((x) => x.slug !== slug) : [...p.projects, { slug, why: "" }] });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Alla pitchar
      </button>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{isNew ? "Ny pitch" : p.company}</h1>
          <p className="text-sm text-fg-muted">Fyll i företag, roll och dina anteckningar. Låt AI:n skriva utkastet, justera, publicera.</p>
        </div>
        {!isNew && (
          <div className="panel-tile rounded-xl px-4 py-2 text-xs text-fg-muted">
            <span className="inline-flex items-center gap-1"><Eye className="size-3.5" /> {p.stats.views} ({p.stats.unique} unika)</span>
            <span className="ml-3 inline-flex items-center gap-1"><FileDown className="size-3.5" /> {p.stats.cvDownloads}</span>
            <span className="ml-3 inline-flex items-center gap-1"><Sparkles className="size-3.5" /> {p.stats.labClicks}</span>
          </div>
        )}
      </header>

      <Group title="Underlag">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Företag" value={p.company} onChange={(v) => set({ company: v, slug: slugTouched ? p.slug : slugify(v) })} />
          <Field label="Roll / tjänst" value={p.role} onChange={(v) => set({ role: v })} />
        </div>
        <Field label="Länk till annonsen (valfri, bara för dig)" value={p.jobUrl} onChange={(v) => set({ jobUrl: v })} />
        <Area label="Dina anteckningar till AI:n (vad de söker, varför du vill dit, vad du vill lyfta)" value={p.notes} onChange={(v) => set({ notes: v })} rows={5} />
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={runDraft} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-full bg-ember-500 px-4 py-2 text-sm font-medium text-night-950 disabled:opacity-50">
            <Wand2 className="size-4" /> {busy === "draft" ? "Skriver…" : "Skriv utkast med AI"}
          </button>
          <span className="text-xs text-fg-faint">Sonnet 5.5, cirka 0,02 USD per utkast. Skriver över texterna nedan.</span>
        </div>
      </Group>

      <Group title="Sidan">
        <Field label="Hälsning (rubrik)" value={p.greeting} onChange={(v) => set({ greeting: v })} placeholder={`Hej ${p.company || "företaget"}.`} />
        <Area label="Inledning (stycken separerade med tom rad)" value={p.intro} onChange={(v) => set({ intro: v })} rows={7} />
        <Area label="Varför jag passar (en punkt per rad)" value={p.highlights.join("\n")} onChange={(v) => set({ highlights: v.split("\n").map((t) => t.trim()).filter(Boolean) })} rows={5} />
        <div>
          <span className="mb-1 block text-xs text-fg-muted">Relevanta projekt (bocka i, skriv varför)</span>
          <ul className="space-y-2">
            {content.projects.map((proj) => {
              const sel = p.projects.find((x) => x.slug === proj.slug);
              return (
                <li key={proj.slug} className="rounded-lg border border-white/8 bg-night-950/50 p-3">
                  <label className="flex items-center gap-2 text-sm text-fg">
                    <input type="checkbox" checked={!!sel} onChange={() => toggleProject(proj.slug)} /> {proj.title}
                    {proj.hidden && <span className="text-[11px] text-fg-faint">(dold på sajten)</span>}
                  </label>
                  {sel && (
                    <textarea
                      value={sel.why}
                      onChange={(e) => set({ projects: p.projects.map((x) => (x.slug === proj.slug ? { ...x, why: e.target.value } : x)) })}
                      placeholder="Varför är det här relevant för dem?"
                      rows={2}
                      className="mt-2 w-full rounded-lg border border-white/10 bg-night-950/60 px-3 py-2 text-sm text-fg"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <Area label="Avslutning" value={p.closing} onChange={(v) => set({ closing: v })} rows={2} />
        <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
          <Field label="Knapptext" value={p.ctaLabel} onChange={(v) => set({ ctaLabel: v })} placeholder="Boka ett samtal" />
          <Field label="Knapplänk (bokning, LinkedIn eller mailto:). Tom = din e-post/kontakt" value={p.ctaUrl} onChange={(v) => set({ ctaUrl: v })} />
        </div>
        <Field label="Adress: havaljalal.se/for/…" value={p.slug} onChange={(v) => { setSlugTouched(true); set({ slug: slugify(v) }); }} />
      </Group>

      <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-night-900/90 px-4 py-3 backdrop-blur">
        {msg && <span className={`text-xs ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          {p.status === "published" ? (
            <button onClick={() => save("closed")} disabled={busy !== null} className="rounded-full border border-white/10 px-4 py-2 text-sm text-fg disabled:opacity-50">Stäng länken</button>
          ) : (
            <button onClick={() => save("published")} disabled={busy !== null} className="rounded-full border border-emerald-400/40 px-4 py-2 text-sm text-emerald-300 disabled:opacity-50">Publicera</button>
          )}
          <button onClick={() => save()} disabled={busy !== null} className="rounded-full bg-ember-500 px-4 py-2 text-sm font-medium text-night-950 disabled:opacity-50">
            {busy === "save" ? "Sparar…" : "Spara"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/8 bg-night-900/50 p-5">
      <h2 className="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-ember-300">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-fg-muted">{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-white/10 bg-night-950/60 px-3 py-2 text-sm text-fg" />
    </label>
  );
}

function Area({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-fg-muted">{label}</span>
      <textarea value={value} rows={rows} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-white/10 bg-night-950/60 px-3 py-2 text-sm leading-relaxed text-fg" />
    </label>
  );
}
