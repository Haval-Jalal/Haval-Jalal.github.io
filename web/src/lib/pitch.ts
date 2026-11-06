// Recruiter mode: one personal page per company at /for/{slug}.
export type PitchProject = { slug: string; why: string };

export type PublicPitch = {
  slug: string;
  company: string;
  role: string;
  greeting: string;
  intro: string;
  projects: PitchProject[];
  highlights: string[];
  closing: string;
  ctaLabel: string;
  ctaUrl: string;
};

export type PitchStats = {
  views: number;
  unique: number;
  cvDownloads: number;
  labClicks: number;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
};

export type Pitch = PublicPitch & {
  jobUrl: string;
  notes: string;
  status: "draft" | "published" | "closed";
  createdAt: string;
  updatedAt: string;
  stats: PitchStats;
};

export type PitchDraft = Pick<Pitch, "greeting" | "intro" | "projects" | "highlights" | "closing">;

export async function getPitch(slug: string): Promise<PublicPitch | null> {
  const r = await fetch(`/api/pitch/${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export function pitchEvent(slug: string, kind: "view" | "cv" | "lab") {
  const body = JSON.stringify({ kind });
  const url = `/api/pitch/${encodeURIComponent(slug)}/event`;
  if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
  else fetch(url, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
}

export function pitchUrl(slug: string) {
  return `${window.location.origin}/for/${slug}`;
}

export function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/* ---- admin ---- */

export async function listPitches(): Promise<Pitch[]> {
  const r = await fetch("/api/manage/pitches", { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()).pitches;
}

export async function savePitch(pitch: Pitch): Promise<Pitch> {
  const r = await fetch(`/api/manage/pitches/${encodeURIComponent(pitch.slug)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pitch),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function deletePitch(slug: string): Promise<void> {
  const r = await fetch(`/api/manage/pitches/${encodeURIComponent(slug)}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

export async function draftPitch(input: Pick<Pitch, "company" | "role" | "jobUrl" | "notes">): Promise<PitchDraft> {
  const r = await fetch("/api/manage/pitches/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(r.status === 503 ? "AI är inte konfigurerad" : `HTTP ${r.status}`);
  return r.json();
}
