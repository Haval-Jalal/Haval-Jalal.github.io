import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, Download, Loader2, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { AgentError, friendlyError } from "../lib/agent";
import { trackEvent, trackView } from "../lib/beacon";
import { L, locale, t } from "../lib/i18n";

type Contact = { label: string; value: string; url?: string | null };
type Experience = { period: string; title: string; org: string; text: string; bullets: string[] };
type Project = { title: string; summary: string; tags: string[]; url?: string | null; year: string };
type SkillGroup = { title: string; items: string[] };
type Education = { school: string; program: string };
type Cv = {
  name: string;
  role: string;
  location: string;
  summary: string;
  contacts: Contact[];
  experience: Experience[];
  projects: Project[];
  skills: SkillGroup[];
  education: Education[];
  footer: string;
  accent: string;
};

const EMPTY: Cv = {
  name: "",
  role: "",
  location: "",
  summary: "",
  contacts: [
    { label: t("cv.contact_email"), value: "" },
    { label: "LinkedIn", value: "" },
  ],
  experience: [{ period: "", title: "", org: "", text: "", bullets: [] }],
  projects: [],
  skills: [{ title: t("cv.skills_default"), items: [] }],
  education: [{ school: "", program: "" }],
  footer: "",
  accent: "#d9772a",
};

const DRAFT_KEY = "hj_cv_draft";
const field = "w-full rounded-xl border border-white/10 bg-night-900 px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-ember-400/60 focus:outline-none";

// Visitor CV builder: same PDF engine as Haval's own CV. Draft lives in localStorage only.
export default function CvBuilder() {
  const [cv, setCv] = useState<Cv>(() => {
    try {
      return { ...EMPTY, ...(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as Cv | null) };
    } catch {
      return EMPTY;
    }
  });
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<"idle" | "preview" | "polish" | "download">("idle");
  const [error, setError] = useState<string | null>(null);
  const [polished, setPolished] = useState(false);
  const debounce = useRef<number | null>(null);

  useEffect(() => trackView(), []);

  // Persist and re-render the preview 1.5 s after the last edit.
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(cv));
    } catch {
      /* storage blocked */
    }
    if (!cv.name.trim()) return;
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => void render(), 1500);
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cv]);

  const post = async (path: string, body: unknown) => {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) {
      let code = String(r.status);
      try {
        code = ((await r.json()) as { error?: string }).error ?? code;
      } catch {
        /* ignore */
      }
      throw new AgentError(code);
    }
    return r;
  };

  const render = async () => {
    if (!cv.name.trim()) return;
    setBusy((b) => (b === "idle" ? "preview" : b));
    setError(null);
    try {
      const r = await post(`/api/cv/build?lang=${locale}`, cv);
      const url = URL.createObjectURL(await r.blob());
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
    } catch (e) {
      setError(friendlyError(e instanceof AgentError ? e.code : "unknown"));
    } finally {
      setBusy((b) => (b === "preview" ? "idle" : b));
    }
  };

  const polish = async () => {
    setBusy("polish");
    setError(null);
    trackEvent("cv_polish");
    try {
      const r = await post(`/api/cv/polish?lang=${locale}`, cv);
      const next = (await r.json()) as Cv;
      setCv((c) => ({ ...c, summary: next.summary, experience: next.experience, projects: next.projects }));
      setPolished(true);
    } catch (e) {
      const code = e instanceof AgentError ? e.code : "unknown";
      setError(code === "refused" ? t("err.refused") : friendlyError(code));
    } finally {
      setBusy("idle");
    }
  };

  const download = async () => {
    setBusy("download");
    setError(null);
    trackEvent("cv_download");
    try {
      const r = await post(`/api/cv/build?download=1&lang=${locale}`, cv);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${cv.name.trim().replace(/\s+/g, "-") || "CV"}-CV.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(friendlyError(e instanceof AgentError ? e.code : "unknown"));
    } finally {
      setBusy("idle");
    }
  };

  const set = (patch: Partial<Cv>) => setCv((c) => ({ ...c, ...patch }));

  return (
    <div className="min-h-screen bg-night-950 text-fg">
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
        <a href={L("/")} className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft className="size-4" /> havaljalal.se
        </a>
        <span className="font-mono text-xs text-fg-faint">{t("cv.tool")}</span>
      </header>

      <main className="mx-auto max-w-7xl px-5 pb-20">
        <div className="mb-8 max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember-300">{t("cv.eyebrow")}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            {t("cv.title")} <span className="text-ember-300">{t("cv.title_accent")}</span>
          </h1>
          <p className="mt-3 text-fg-muted">{t("cv.lede")}</p>
        </div>

        <div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_1fr]">
          {/* Form */}
          <div className="min-w-0 space-y-6">
            <Group title={t("cv.basics")}>
              <div className="grid gap-3 sm:grid-cols-2">
                <input value={cv.name} onChange={(e) => set({ name: e.target.value })} placeholder={t("cv.name")} className={field} />
                <input value={cv.role} onChange={(e) => set({ role: e.target.value })} placeholder={t("cv.role")} className={field} />
                <input value={cv.location} onChange={(e) => set({ location: e.target.value })} placeholder={t("cv.location")} className={`${field} sm:col-span-2`} />
              </div>
              <textarea value={cv.summary} onChange={(e) => set({ summary: e.target.value })} rows={4} placeholder={t("cv.summary")} className={field} />
            </Group>

            <Group title={t("cv.contact")}>
              <ListEditor<Contact>
                items={cv.contacts}
                onChange={(contacts) => set({ contacts })}
                create={() => ({ label: t("cv.contact_phone"), value: "" })}
                label={(c) => `${c.label}: ${c.value || "…"}`}
                render={(c, s) => (
                  <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
                    <input value={c.label} onChange={(e) => s({ ...c, label: e.target.value })} placeholder={t("cv.label")} className={field} />
                    <input value={c.value} onChange={(e) => s({ ...c, value: e.target.value })} placeholder={t("cv.value")} className={field} />
                  </div>
                )}
              />
            </Group>

            <Group title={t("cv.experience")}>
              <ListEditor<Experience>
                items={cv.experience}
                onChange={(experience) => set({ experience })}
                create={() => ({ period: "", title: "", org: "", text: "", bullets: [] })}
                label={(e) => e.title || t("cv.new_experience")}
                render={(e, s) => (
                  <>
                    <div className="grid gap-3 sm:grid-cols-[130px_1fr]">
                      <input value={e.period} onChange={(ev) => s({ ...e, period: ev.target.value })} placeholder={t("cv.period")} className={field} />
                      <input value={e.title} onChange={(ev) => s({ ...e, title: ev.target.value })} placeholder={t("cv.title_field")} className={field} />
                    </div>
                    <input value={e.org} onChange={(ev) => s({ ...e, org: ev.target.value })} placeholder={t("cv.org")} className={field} />
                    <textarea value={e.text} onChange={(ev) => s({ ...e, text: ev.target.value })} rows={3} placeholder={t("cv.exp_text")} className={field} />
                    <textarea value={e.bullets.join("\n")} onChange={(ev) => s({ ...e, bullets: ev.target.value.split("\n") })} rows={3} placeholder={t("cv.bullets")} className={field} />
                  </>
                )}
              />
            </Group>

            <Group title={t("cv.projects")}>
              <ListEditor<Project>
                items={cv.projects}
                onChange={(projects) => set({ projects })}
                create={() => ({ title: "", summary: "", tags: [], year: String(new Date().getFullYear()) })}
                label={(p) => p.title || t("cv.new_project")}
                render={(p, s) => (
                  <>
                    <div className="grid gap-3 sm:grid-cols-[1fr_90px]">
                      <input value={p.title} onChange={(ev) => s({ ...p, title: ev.target.value })} placeholder={t("cv.project_name")} className={field} />
                      <input value={p.year} onChange={(ev) => s({ ...p, year: ev.target.value })} placeholder={t("cv.year")} className={field} />
                    </div>
                    <textarea value={p.summary} onChange={(ev) => s({ ...p, summary: ev.target.value })} rows={2} placeholder={t("cv.short_desc")} className={field} />
                    <input value={p.tags.join(", ")} onChange={(ev) => s({ ...p, tags: ev.target.value.split(",").map((x) => x.trim()) })} placeholder={t("cv.tech")} className={field} />
                    <input value={p.url ?? ""} onChange={(ev) => s({ ...p, url: ev.target.value })} placeholder={t("cv.link_opt")} className={field} />
                  </>
                )}
              />
            </Group>

            <Group title={t("cv.skills")}>
              <ListEditor<SkillGroup>
                items={cv.skills}
                onChange={(skills) => set({ skills })}
                create={() => ({ title: "", items: [] })}
                label={(g) => g.title || t("cv.new_group")}
                render={(g, s) => (
                  <>
                    <input value={g.title} onChange={(ev) => s({ ...g, title: ev.target.value })} placeholder={t("cv.group")} className={field} />
                    <input value={g.items.join(", ")} onChange={(ev) => s({ ...g, items: ev.target.value.split(",").map((x) => x.trim()) })} placeholder={t("cv.comma")} className={field} />
                  </>
                )}
              />
            </Group>

            <Group title={t("cv.education")}>
              <ListEditor<Education>
                items={cv.education}
                onChange={(education) => set({ education })}
                create={() => ({ school: "", program: "" })}
                label={(e) => e.program || t("cv.new_education")}
                render={(e, s) => (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input value={e.program} onChange={(ev) => s({ ...e, program: ev.target.value })} placeholder={t("cv.program")} className={field} />
                    <input value={e.school} onChange={(ev) => s({ ...e, school: ev.target.value })} placeholder={t("cv.school")} className={field} />
                  </div>
                )}
              />
            </Group>
          </div>

          {/* Preview */}
          <div className="min-w-0 lg:sticky lg:top-6 lg:self-start">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => void render()} disabled={!cv.name.trim() || busy !== "idle"} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-fg-muted hover:text-fg disabled:opacity-40">
                {busy === "preview" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} {t("cv.refresh")}
              </button>
              <button onClick={() => void polish()} disabled={!cv.name.trim() || busy !== "idle"} className="inline-flex items-center gap-2 rounded-full border border-ember-400/40 bg-ember-500/10 px-4 py-2 text-sm text-ember-200 hover:bg-ember-500/20 disabled:opacity-40" title={t("cv.polish_title")}>
                {busy === "polish" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {t("cv.polish")}
              </button>
              <button onClick={() => void download()} disabled={!cv.name.trim() || busy !== "idle"} className="ml-auto inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-medium text-night-950 disabled:opacity-40">
                {busy === "download" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} {t("cv.download")}
              </button>
            </div>
            {polished && <p className="mt-2 text-xs text-emerald-200">{t("cv.polished")}</p>}
            {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
            <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-[#2a2a30]">
              {preview ? (
                <iframe title={t("cv.preview")} src={`${preview}#toolbar=0&navpanes=0`} className="h-[78vh] w-full" />
              ) : (
                <div className="flex h-[78vh] items-center justify-center p-8 text-center text-sm text-fg-muted">
                  {cv.name.trim() ? t("cv.rendering") : t("cv.fill_name")}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-ember-300">{title}</h2>
      <div className="panel-tile space-y-3 rounded-2xl p-5">{children}</div>
    </section>
  );
}

function ListEditor<T>({
  items,
  onChange,
  create,
  label,
  render,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  create: () => T;
  label: (item: T) => string;
  render: (item: T, set: (item: T) => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState<number | null>(items.length === 1 ? 0 : null);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    setOpen(j);
  };
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="rounded-xl border border-white/8 bg-night-950/50">
          <div className="flex items-center gap-2 px-3 py-2">
            <button type="button" onClick={() => setOpen(open === i ? null : i)} className="flex-1 truncate text-left text-sm text-fg">
              {label(item)}
            </button>
            <button type="button" onClick={() => move(i, -1)} className="text-fg-faint hover:text-fg" aria-label={t("cv.up")}><ChevronUp className="size-4" /></button>
            <button type="button" onClick={() => move(i, 1)} className="text-fg-faint hover:text-fg" aria-label={t("cv.down")}><ChevronDown className="size-4" /></button>
            <button type="button" onClick={() => onChange(items.filter((_, k) => k !== i))} className="text-fg-faint hover:text-red-300" aria-label={t("cv.remove")}><Trash2 className="size-4" /></button>
          </div>
          {open === i && <div className="space-y-3 border-t border-white/5 p-3">{render(item, (next) => onChange(items.map((x, k) => (k === i ? next : x))))}</div>}
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          onChange([...items, create()]);
          setOpen(items.length);
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-fg-muted hover:text-fg"
      >
        <Plus className="size-3.5" /> {t("cv.add")}
      </button>
    </div>
  );
}
