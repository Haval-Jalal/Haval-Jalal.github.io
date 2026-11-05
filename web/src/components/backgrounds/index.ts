import { lazy } from "react";

// Hero background variants. The active one is chosen with ?bg=<key> while we are deciding;
// later this becomes a setting in the admin panel.
export const BACKGROUNDS = {
  dunes: { label: "Dyner", theme: "light", accent: "sand", load: lazy(() => import("../DunesLive")) },
  aurora: { label: "Aurora", theme: "dark", accent: "indigo", load: lazy(() => import("./Aurora")) },
  network: { label: "Nätverk", theme: "dark", accent: "cyan", load: lazy(() => import("./Network")) },
  terrain: { label: "Terräng", theme: "dark", accent: "ember", load: lazy(() => import("./Terrain")) },
} as const;

export type BackgroundKey = keyof typeof BACKGROUNDS;

export function currentBackground(): BackgroundKey {
  const key = new URLSearchParams(window.location.search).get("bg") as BackgroundKey | null;
  return key && key in BACKGROUNDS ? key : "terrain";
}
