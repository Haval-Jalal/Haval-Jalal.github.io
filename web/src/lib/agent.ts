// Client for the AI endpoints in the .NET API.
import { locale, t } from "./i18n";

export type ChatMsg = { role: "user" | "assistant"; text: string };

export class AgentError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export const PLAN_MARKER = "=====PLAN=====";

export function friendlyError(code: string): string {
  switch (code) {
    case "rate_limited":
      return t("err.rate_limited");
    case "daily_cap":
      return t("err.daily_cap");
    case "not_configured":
      return t("err.not_configured");
    case "upstream":
      return t("err.upstream");
    default:
      return t("err.unknown");
  }
}

async function codeOf(r: Response): Promise<string> {
  try {
    const body = (await r.json()) as { error?: string };
    return body.error ?? String(r.status);
  } catch {
    return String(r.status);
  }
}

export type BudgetMode = "full" | "eco" | "stopped" | "off";

// "full" = Opus builds, "eco" = Sonnet builds past 70 % of the daily cap, "stopped" = caps reached
// (lead form only), "off" = no API key on this environment.
export async function getStatus(): Promise<BudgetMode> {
  try {
    const r = await fetch("/api/agent/status", { cache: "no-store" });
    if (!r.ok) return "off";
    return ((await r.json()) as { mode: BudgetMode }).mode;
  } catch {
    return "off";
  }
}

export async function chat(messages: ChatMsg[]): Promise<{ reply: string; refused: boolean }> {
  const r = await fetch("/api/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, lang: locale }),
  });
  if (!r.ok) throw new AgentError(await codeOf(r));
  return r.json();
}

// Reads the server-sent event stream from /api/agent/build and forwards text deltas.
export async function streamBuild(
  idea: string,
  visitor: string,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  onMode?: (mode: BudgetMode) => void,
  onDone?: (info: { truncated: boolean; id: string | null }) => void,
): Promise<void> {
  const r = await fetch("/api/agent/build", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idea, visitor, lang: locale }),
    signal,
  });
  if (!r.ok || !r.body) throw new AgentError(await codeOf(r));

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = "message";
      let data = "";
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (event === "delta") onDelta((JSON.parse(data) as { t: string }).t);
      else if (event === "mode") onMode?.((JSON.parse(data) as { mode: BudgetMode }).mode);
      else if (event === "done") {
        const d = JSON.parse(data) as { truncated?: boolean; id?: string | null };
        onDone?.({ truncated: d.truncated === true, id: d.id ?? null });
      }
      else if (event === "error") throw new AgentError((JSON.parse(data) as { error: string }).error);
    }
  }
}

export async function sendLead(lead: { name: string; email: string; message: string; idea?: string; plan?: string; source?: string; website?: string }) {
  const r = await fetch("/api/agent/lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lead),
  });
  if (!r.ok) throw new AgentError(await codeOf(r));
}
