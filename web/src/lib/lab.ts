// Saved Build Lab prototypes. The visitor id lives in localStorage so people find their own
// prototypes again without an account; nothing about it is personal.

import { AgentError } from "./agent";

const VISITOR_KEY = "hj_visitor";

export function visitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return "anon-" + Math.random().toString(36).slice(2, 18).padEnd(16, "0");
  }
}

export type BuildSummary = { id: string; ts: string; idea: string; title: string; unlocked: boolean };
export type Build = {
  id: string;
  ts: string;
  idea: string;
  title: string;
  html: string;
  plan: string;
  model: string;
  truncated: boolean;
  unlocked: boolean;
  mine: boolean;
};

export async function listBuilds(): Promise<BuildSummary[]> {
  try {
    const r = await fetch(`/api/lab?visitor=${encodeURIComponent(visitorId())}`, { cache: "no-store" });
    if (!r.ok) return [];
    return ((await r.json()) as { builds: BuildSummary[] }).builds;
  } catch {
    return [];
  }
}

export async function getBuild(id: string): Promise<Build | null> {
  const r = await fetch(`/api/lab/${encodeURIComponent(id)}?visitor=${encodeURIComponent(visitorId())}`, { cache: "no-store" });
  if (!r.ok) return null;
  return (await r.json()) as Build;
}

export async function unlockBuild(id: string, contact: { name: string; email: string; phone?: string; message?: string; website?: string }) {
  const r = await fetch(`/api/lab/${encodeURIComponent(id)}/unlock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(contact),
  });
  if (!r.ok) {
    let code = String(r.status);
    try {
      code = ((await r.json()) as { error?: string }).error ?? code;
    } catch {
      /* ignore */
    }
    throw new AgentError(code);
  }
  return (await r.json()) as { ok: boolean; mailed: boolean };
}

export const downloadUrl = (id: string) => `/api/lab/${encodeURIComponent(id)}/download`;
export const shareUrl = (id: string) => `${location.origin}/lab/${id}`;
