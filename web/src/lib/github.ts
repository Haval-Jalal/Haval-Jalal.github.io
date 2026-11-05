import { useEffect, useState } from "react";

export type GitHubRepo = {
  name: string;
  description: string | null;
  url: string;
  language: string | null;
  stars: number;
  pushedAt: string | null;
};

export type GitHubActivity = {
  user: string;
  repos: GitHubRepo[];
  weeklyCommits: number[];
  commits90d: number;
  updatedAt: string;
};

type State = { status: "loading" } | { status: "ok"; data: GitHubActivity } | { status: "error" };

// Live data from the .NET API (which caches GitHub for 15 min). Components fall back to
// illustrative numbers while loading or if the API is down, so the panel never looks broken.
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

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "okänt";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 60) return `${m} min sedan`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h sedan`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} dagar sedan`;
  return new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}
