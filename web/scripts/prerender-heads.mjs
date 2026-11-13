// Per-route <head> for the indexable pages. Static Web Apps serves one index.html for every path,
// so without this /en, /cv, /nu and /changelog all declared canonical "https://havaljalal.se/" and
// Google treated them as duplicates of the start page. Runs after `vite build` (npm postbuild):
// copies dist/index.html into dist/_pages/<name>.html with the route's language, title,
// description, canonical and hreflang set; staticwebapp.config.json rewrites each route to its file.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const ORIGIN = "https://havaljalal.se";

const SV_DESC = "Haval Jalal, systemutvecklare i Göteborg. .NET, React och Clean Architecture, med tio år av teamledarskap från Volvo Cars. Testa AI Build Lab: beskriv en idé och få en prototyp på 20 sekunder.";
const EN_DESC = "Haval Jalal, software developer in Gothenburg. .NET, React and Clean Architecture, with ten years of team leadership from Volvo Cars. Try the AI Build Lab: describe an idea and get a prototype in 20 seconds.";

// sv/en pairs; the Swedish URL is also the x-default. The Swedish start page is index.html itself.
const PAGES = [
  { sv: "/", en: "/en", skipSv: true,
    title: { sv: "Haval Jalal – Systemutvecklare .NET & React i Göteborg", en: "Haval Jalal – .NET & React Developer in Gothenburg" },
    desc: { sv: SV_DESC, en: EN_DESC } },
  { sv: "/cv", en: "/en/cv",
    title: { sv: "CV-byggaren – Haval Jalal", en: "The CV builder – Haval Jalal" },
    desc: { sv: "Skapa ett snyggt CV: fyll i, låt AI vässa texten och ladda ner som PDF. Byggt av Haval Jalal, fritt att använda.",
            en: "Create a clean CV: fill it in, let AI sharpen the text and download it as PDF. Built by Haval Jalal, free to use." } },
  { sv: "/nu", en: "/en/now",
    title: { sv: "Vad jag gör nu – Haval Jalal", en: "What I am doing now – Haval Jalal" },
    desc: { sv: "Vad Haval Jalal pluggar, bygger och fokuserar på just nu. Uppdateras löpande.",
            en: "What Haval Jalal is studying, building and focusing on right now. Updated continuously." } },
  { sv: "/changelog", en: "/en/changelog",
    title: { sv: "Nytt på sajten – Haval Jalal", en: "What is new – Haval Jalal" },
    desc: { sv: "havaljalal.se är ett levande projekt. Här står vad som har ändrats på sajten, och varför.",
            en: "havaljalal.se is a living project. Here is what changed on the site, and why." } },
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const fileName = (route) => route.replace(/^\//, "").replace(/\//g, "-") + ".html";

function render(base, page, lang) {
  const url = ORIGIN + page[lang];
  const title = page.title[lang];
  const desc = page.desc[lang];
  const rep = (html, re, out) => {
    if (!re.test(html)) throw new Error(`pattern not found in index.html: ${re}`);
    return html.replace(re, out);
  };
  let h = base;
  h = rep(h, /<html lang="sv">/, `<html lang="${lang}">`);
  h = rep(h, /<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  h = rep(h, /<meta\s+name="description"\s+content="[^"]*"\s*\/>/, `<meta name="description" content="${esc(desc)}" />`);
  h = rep(h, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`);
  h = rep(h, /<link rel="alternate" hreflang="sv" href="[^"]*" \/>/, `<link rel="alternate" hreflang="sv" href="${ORIGIN + page.sv}" />`);
  h = rep(h, /<link rel="alternate" hreflang="en" href="[^"]*" \/>/, `<link rel="alternate" hreflang="en" href="${ORIGIN + page.en}" />`);
  h = rep(h, /<link rel="alternate" hreflang="x-default" href="[^"]*" \/>/, `<link rel="alternate" hreflang="x-default" href="${ORIGIN + page.sv}" />`);
  h = rep(h, /<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${esc(title)}" />`);
  h = rep(h, /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/, `<meta property="og:description" content="${esc(desc)}" />`);
  h = rep(h, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`);
  h = rep(h, /<meta property="og:locale" content="[^"]*" \/>/, `<meta property="og:locale" content="${lang === "en" ? "en_GB" : "sv_SE"}" />`);
  h = rep(h, /<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${esc(title)}" />`);
  h = rep(h, /<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${esc(desc)}" />`);
  return h;
}

const base = await readFile(path.join(dist, "index.html"), "utf8");
await mkdir(path.join(dist, "_pages"), { recursive: true });
const routes = [];
for (const page of PAGES) {
  for (const lang of ["sv", "en"]) {
    if (lang === "sv" && page.skipSv) continue;
    const route = page[lang];
    const file = fileName(route);
    await writeFile(path.join(dist, "_pages", file), render(base, page, lang));
    routes.push({ route, file });
  }
}
// The config must rewrite exactly these routes; fail the build if it drifted.
const cfg = JSON.parse(await readFile(path.join(dist, "staticwebapp.config.json"), "utf8"));
const missing = routes.filter((r) => !cfg.routes.some((c) => c.route === r.route && c.rewrite === `/_pages/${r.file}`));
if (missing.length) throw new Error("staticwebapp.config.json lacks rewrites for: " + missing.map((m) => m.route).join(", "));
console.log(`prerendered heads: ${routes.map((r) => r.route).join(" ")}`);
