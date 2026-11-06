// All site copy lives here for now. The admin panel + API will serve the same shape later,
// so keep this plain data (no JSX) and keep the keys stable.

export const profile = {
  name: "Haval Jalal",
  role: "Systemutvecklare",
  tagline: "Systemutvecklare med industriell precision och kreativ ambition, en bro mellan struktur och innovation.",
  location: "Göteborg",
  availability: "Öppen för uppdrag i Göteborg och remote",
  headline: { lead: "Bygger digitala produkter med", accent: "industriell precision." },
  intro:
    "Tio år av teamledarskap på Volvo Cars, nu systemutvecklare inom .NET, React och Clean Architecture. Jag bygger produktion-klara applikationer från databas till UI.",
  about:
    "Tränad att bygga produktion-klara applikationer end-to-end: från databasdesign och säkra .NET-API:er till moderna React-gränssnitt och molndeploy. Starkt fokus på clean code, clean architecture, säkerhet, validering och teamleverans.",
  links: {
    github: "https://github.com/Haval-Jalal",
    linkedin: "", // TODO: fyll i
    email: "", // TODO: fyll i den adress som ska visas publikt
  },
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

export const projects: Project[] = [
  {
    slug: "presync",
    title: "PreSync",
    status: "pilot",
    summary: "Beskrivning kommer. (Platshållare: fyll i vad PreSync gör, vilket problem det löser och vilken stack.)", // TODO
    tags: [".NET", "React"], // TODO
    repo: "https://github.com/Haval-Jalal", // TODO: repo-länk
    year: "2026",
  },
  {
    slug: "dojo-lms",
    title: "DOJO LMS",
    status: "wip",
    summary: "Learning Management System. (Platshållare: fyll i omfattning, roller, kurser, uppföljning och stack.)", // TODO
    tags: [".NET", "SQL Server", "React"], // TODO
    repo: "https://github.com/Haval-Jalal", // TODO: repo-länk
    year: "2026",
  },
  {
    slug: "eventify",
    status: "school",
    title: "Eventify",
    summary: "Fullstack eventhanteringsapplikation med .NET-backend, CQRS-arkitektur och modern React-frontend.",
    tags: [".NET", "CQRS", "MediatR", "EF Core", "React", "Tailwind"],
    repo: "https://github.com/Haval-Jalal/Eventify",
    year: "2026",
  },
  {
    slug: "job-application-tracker",
    status: "school",
    title: "JobApplicationTracker",
    summary: "Verktyg för att spåra och hantera jobbansökningar med statusuppdateringar och påminnelser.",
    tags: [".NET", "Clean Architecture", "JWT", "React", "TypeScript"],
    repo: "https://github.com/Haval-Jalal/JobApplicationTracker",
    year: "2025",
  },
  {
    slug: "autocompare",
    status: "school",
    title: "AutoCompare",
    summary: "Applikation för att jämföra bilar sida vid sida, byggd med .NET och React.", // TODO: verifiera beskrivning
    tags: [".NET", "REST API", "React"],
    repo: "https://github.com/Haval-Jalal/AutoCompare",
    year: "2025",
  },
  {
    slug: "mini-ecommerce-db",
    status: "school",
    title: "MiniECommerceDB",
    summary: "E-handelsdatabas med optimerade SQL-frågor och relationella datamodeller.",
    tags: ["SQL Server", "T-SQL", "Relational Modelling"],
    repo: "https://github.com/Haval-Jalal/MiniECommerceDB",
    year: "2025",
  },
];

export type JourneyStep = {
  period: string;
  title: string;
  org: string;
  text: string;
  bullets?: string[];
};

export const journey: JourneyStep[] = [
  {
    period: "10+ år",
    title: "Teamledare, produktion & kvalitet",
    org: "Volvo Cars, Göteborg",
    text: "Över tio år på Volvo Cars med arbete inom produktion, kvalitetssäkring och teamledarskap. Att lära sig strukturera arbete, motivera människor och leverera under press.",
    bullets: [
      "Leder produktionsteam med fokus på kvalitet, säkerhet och leverans",
      "Coachar, utbildar och utvecklar teammedlemmar",
      "Driver ständiga förbättringsinitiativ",
      "Processoptimering och effektivisering av arbetsflöden",
    ],
  },
  {
    period: "Vändpunkten",
    title: "Från maskiner till mjukvara",
    org: "Egen utforskning",
    text: "Min fascination för teknik, automation och digitala system växte sig starkare. Jag blev fängslad av hur mjukvara kunde forma produkter och skapa nya användarupplevelser.",
  },
  {
    period: "Studier",
    title: "Systemutvecklare .NET",
    org: "NBI Handelsakademin, Göteborg",
    text: "Studerar systemutveckling på NBI Handelsakademin. Kombinerar industriellt tänkande med modern utveckling för att bygga skalbara, eleganta applikationer.",
  },
  {
    period: "Praktik",
    title: "DevOps-praktikant",
    org: "Volvo Cars, Göteborg",
    text: "Praktik inom DevOps på Volvo Cars. (Platshållare: fyll i period, team, verktyg som CI/CD, pipelines, molnplattform och vad du levererade.)", // TODO
    bullets: ["CI/CD-pipelines", "Automatisering", "Infrastruktur", "Samarbete med utvecklingsteam"], // TODO
  },
  {
    period: "Nu",
    title: "Bygger produktion-klara applikationer",
    org: "Göteborg · remote",
    text: "Öppen för uppdrag. Bygger fullstack-lösningar i .NET och React, med AI-agenter som en naturlig del av verktygslådan.",
  },
];

export const education = [
  { school: "NBI Handelsakademin, Göteborg", program: "Systemutvecklare .NET" },
  { school: "Framtidsgymnasiet, Göteborg", program: "Gymnasieutbildning" },
];

export type SkillGroup = { title: string; items: string[]; accent?: boolean };

export const skills: SkillGroup[] = [
  { title: "Backend", items: [".NET Core", "ASP.NET", "Clean Architecture", "CQRS", "MediatR", "Entity Framework"], accent: true },
  { title: "Säkerhet & Identitet", items: ["JWT", "Claims-based Access", "Validering", "Auth-aware UI"] },
  { title: "Databaser & Data Access", items: ["SQL Server", "Relational Modelling", "EF Core", "T-SQL"] },
  { title: "Frontend", items: ["React", "TypeScript", "Tailwind CSS", "Framer Motion", "Vite"] },
  { title: "Fullstack Integrationer", items: ["REST API", "Azure", "GitHub Actions", "CI/CD"] },
  { title: "AI & Moderna Verktyg", items: ["AI-powered Apps", "Claude API", "Agenter", "Prompt-design"] },
  { title: "Projektledning", items: ["GitHub Projects", "GitHub flow", "Scrum", "Teamleverans"] },
];

export const nav = [
  { label: "Projekt", href: "#projekt" },
  { label: "Resan", href: "#resan" },
  { label: "Stack", href: "#stack" },
  { label: "Build Lab", href: "#build-lab" },
  { label: "Kontakt", href: "#kontakt" },
];

export type SiteSettings = {
  background: "terrain" | "aurora" | "network" | "dunes";
  soundDefault: boolean;
  openForWork: boolean;
  sectionOrder: string[] | null;
};

// The full document served by /api/content and edited in the admin panel.
// Shape mirrors api/Data/SiteContent.cs; this bundled copy is the offline fallback.
export type SiteContent = {
  profile: typeof profile;
  projects: (Project & { hidden?: boolean })[];
  journey: JourneyStep[];
  education: { school: string; program: string }[];
  skills: SkillGroup[];
  nav: { label: string; href: string }[];
  settings: SiteSettings;
  updatedAt: string;
};

export const defaultContent: SiteContent = {
  profile,
  projects,
  journey,
  education,
  skills,
  nav,
  settings: { background: "terrain", soundDefault: false, openForWork: true, sectionOrder: null },
  updatedAt: "2026-11-05T18:00:00Z",
};
