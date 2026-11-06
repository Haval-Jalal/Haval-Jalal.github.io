// Changelog + the "Nu" page, the contact form and the admin writing help.

export type ChangelogEntry = {
  id: string;
  date: string;
  title: string;
  text: string;
  titleEn: string;
  textEn: string;
  tags: string[];
  published: boolean;
  ts?: string;
};

export type NowSection = { title: string; items: string[] };
export type NowPage = { updatedAt: string; intro: string; sections: NowSection[] };

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let code = String(r.status);
    try {
      code = ((await r.json()) as { error?: string }).error ?? code;
    } catch {
      /* ignore */
    }
    throw new Error(code);
  }
  return r.json() as Promise<T>;
}

/* ---- public ---- */

export async function getChangelog(): Promise<Omit<ChangelogEntry, "published">[]> {
  const r = await fetch("/api/changelog");
  return (await json<{ entries: Omit<ChangelogEntry, "published">[] }>(r)).entries;
}

export async function getNow(lang: string): Promise<{ now: NowPage; lang: string }> {
  const r = await fetch(`/api/now?lang=${lang}`);
  const now = await json<NowPage>(r);
  return { now, lang: r.headers.get("X-Content-Lang") ?? lang };
}

export async function sendContact(input: { name: string; email: string; message: string; website?: string }): Promise<{ ok: boolean; mailed?: boolean }> {
  const r = await fetch("/api/agent/lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, source: "contact" }),
  });
  return json(r);
}

/* ---- admin ---- */

export async function listChangelogAdmin(): Promise<ChangelogEntry[]> {
  return (await json<{ entries: ChangelogEntry[] }>(await fetch("/api/manage/changelog", { cache: "no-store" }))).entries;
}

export async function saveChangelog(entry: ChangelogEntry): Promise<ChangelogEntry> {
  return json(await fetch("/api/manage/changelog", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) }));
}

export async function deleteChangelog(id: string): Promise<void> {
  await json(await fetch(`/api/manage/changelog/${encodeURIComponent(id)}`, { method: "DELETE" }));
}

export type ChangelogDraft = { title: string; text: string; titleEn: string; textEn: string; tags: string[] };

export async function draftChangelog(since: string, hint: string): Promise<{ draft: ChangelogDraft; commits: string[] }> {
  return json(await fetch("/api/manage/changelog/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ since, hint }) }));
}

export async function getNowAdmin(lang: string): Promise<{ exists: boolean; now: NowPage | null }> {
  return json(await fetch(`/api/manage/now?lang=${lang}`, { cache: "no-store" }));
}

export async function saveNow(now: NowPage, lang: string): Promise<NowPage> {
  return json(await fetch(`/api/manage/now?lang=${lang}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(now) }));
}

export async function translateNow(lang: string): Promise<NowPage> {
  return json(await fetch(`/api/manage/now/translate?lang=${lang}`, { method: "POST" }));
}

export async function aiDraft(input: { instruction: string; text: string; context: string; lang: string }): Promise<string> {
  return (await json<{ text: string }>(await fetch("/api/manage/ai/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }))).text;
}

export async function sendWeeklyReport(): Promise<{ ok: boolean; mailed: boolean; subject: string; text: string }> {
  return json(await fetch("/api/manage/report/weekly", { method: "POST" }));
}
