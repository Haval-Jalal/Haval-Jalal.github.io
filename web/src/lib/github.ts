import { useEffect, useState } from "react";
import { numberLocale, t } from "./i18n";

export type GitHubRepo = {
  name: string;
  description: string | null;
  url: string;
  language: string | null;
  stars: number;
  pushedAt: string | null;
};

export type DayCount = { date: string; count: number };

export type GitHubActivity = {
  user: string;
  // "graphql": the full year, private repos counted. "public": public repos, last ~90 days.
  source: "graphql" | "public";
  repos: GitHubRepo[];
  contributions: { total: number; commits: number; calendar: DayCount[] };
  latestCommit: { repo: string; message: string; url: string; at: string } | null;
  updatedAt: string;
};

type State = { status: "loading" } | { status: "ok"; data: GitHubActivity } | { status: "error" };

// Live data from the .NET API (which caches GitHub for 15 min).
export function useGitHub(): State {
  const [state, setState] = useState<State>({ status: "loading" });
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/github", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: GitHubActivity) => setState({ status: "ok", data }))
      .catch(() => {
        if (!ctrl.signal.aborted) setState({ status: "error" });
      });
    return () => ctrl.abort();
  }, []);
  return state;
}

// Sum of the last `days` days of the calendar.
export function recentTotal(calendar: DayCount[], days: number): number {
  return calendar.slice(-days).reduce((s, d) => s + d.count, 0);
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return t("time.unknown");
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 60) return `${m} ${t("time.min")}`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} ${t("time.h")}`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} ${t("time.days")}`;
  return new Date(iso).toLocaleDateString(numberLocale, { day: "numeric", month: "short" });
}
