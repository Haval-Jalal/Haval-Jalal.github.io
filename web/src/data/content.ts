// The content document: the shape served by /api/content and edited in the admin panel
// (mirrors api/Data/SiteContent.cs). The bundled copies in content.sv.json and content.en.json
// are snapshots of the live document, refreshed by `npm run content:snapshot` and on every deploy,
// so the first paint shows the same content the API returns a moment later.
import sv from "./content.sv.json";
import en from "./content.en.json";
import { locale } from "../lib/i18n";

export type Profile = {
  name: string;
  role: string;
  tagline: string;
  location: string;
  availability: string;
  headline: { lead: string; accent: string };
  intro: string;
  about: string;
  links: { github: string; linkedin: string; email: string };
};

export type ProjectStatus = "live" | "delivered" | "pilot" | "wip" | "concept" | "school" | "";

export type ProjectLink = { label: string; url: string };

// Presented like a product: screenshots, a one-line tagline, the story, what it does and where
// to go. Repo is optional and only used as a fallback link in the CV.
export type Project = {
  slug: string;
  title: string;
  status?: ProjectStatus;
  tagline?: string;
  summary: string;
  highlights?: string[];
  tags: string[];
  images?: string[];
  links?: ProjectLink[];
  repo: string;
  year: string;
  hidden?: boolean;
};

export type JourneyStep = {
  period: string;
  title: string;
  org: string;
  text: string;
  bullets?: string[];
};

export type SkillGroup = { title: string; items: string[]; accent?: boolean };

export type SiteSettings = {
  background: "terrain" | "aurora" | "network" | "dunes";
  soundDefault: boolean;
  openForWork: boolean;
  sectionOrder: string[] | null;
};

export type SiteContent = {
  profile: Profile;
  projects: (Project & { hidden?: boolean })[];
  journey: JourneyStep[];
  education: { school: string; program: string }[];
  skills: SkillGroup[];
  nav: { label: string; href: string }[];
  settings: SiteSettings;
  updatedAt: string;
};

// JSON widens the string unions (status, background) to plain strings; the snapshot comes from
// the same API that produces the live document, so the cast is safe.
export const defaultContent: SiteContent = (locale === "en" ? en : sv) as unknown as SiteContent;
