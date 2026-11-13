import { useCallback, useEffect, useState } from "react";
import { AgentError, chat, friendlyError, type ChatMsg } from "./agent";
import { trackEvent } from "./beacon";
import { runAgentActions } from "./agentActions";

const CHAT_KEY = "hj_chat";
const OPEN_EVENT = "hj:agent-open";

// One conversation with Javal (the AI assistant), shared by the floating agent and the Build Lab card.
// History lives in localStorage so it survives reloads.
export function useDigitalHaval() {
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CHAT_KEY) ?? "[]") as ChatMsg[];
    } catch {
      return [];
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      /* storage blocked */
    }
  }, [messages]);

  const send = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t || busy) return;
      const next: ChatMsg[] = [...messages, { role: "user", text: t }];
      setMessages(next);
      setBusy(true);
      setError(null);
      trackEvent("chat_message");
      try {
        const { reply, actions = [] } = await chat(next);
        setMessages([...next, { role: "assistant", text: reply, actions: actions.length ? actions : undefined }]);
        if (actions.length) {
          trackEvent("chat_action");
          runAgentActions(actions);
        }
        setSpeaking(true);
        setTimeout(() => setSpeaking(false), Math.min(6000, 1500 + reply.length * 15));
      } catch (e) {
        setError(friendlyError(e instanceof AgentError ? e.code : "unknown"));
      } finally {
        setBusy(false);
      }
    },
    [messages, busy],
  );

  const clear = useCallback(() => setMessages([]), []);

  return { messages, busy, error, speaking, send, clear };
}

// Any component can pop the floating agent open (optionally with a question to send).
export function openAgent(question?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { question } }));
}

export function onAgentOpen(handler: (question?: string) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<{ question?: string }>).detail?.question);
  window.addEventListener(OPEN_EVENT, listener);
  return () => window.removeEventListener(OPEN_EVENT, listener);
}
