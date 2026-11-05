import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { defaultContent, type SiteContent } from "../data/content";

type ContentState = { content: SiteContent; source: "api" | "bundle"; refresh: () => Promise<void> };

const ContentContext = createContext<ContentState>({ content: defaultContent, source: "bundle", refresh: async () => {} });

export async function fetchContent(): Promise<SiteContent | null> {
  try {
    const r = await fetch("/api/content", { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    return (await r.json()) as SiteContent;
  } catch {
    return null;
  }
}

// Serves the bundled copy instantly, then swaps in the live document from the API.
// The bundled copy is deliberately identical to the API seed, so the swap is invisible.
export function ContentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<ContentState, "refresh">>({ content: defaultContent, source: "bundle" });

  const refresh = async () => {
    const live = await fetchContent();
    if (live) setState({ content: live, source: "api" });
  };

  useEffect(() => {
    void refresh();
  }, []);

  return <ContentContext.Provider value={{ ...state, refresh }}>{children}</ContentContext.Provider>;
}

export function useSiteContent() {
  return useContext(ContentContext);
}
