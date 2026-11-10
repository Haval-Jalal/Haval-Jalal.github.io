// Snapshots the live content document (both languages) into the bundle, so the page that renders
// before /api/content answers is the same page that renders after. Also refreshes the API's local
// seed so `func start` on a fresh machine serves the real content.
//
//   node scripts/snapshot-content.mjs            (uses https://havaljalal.se)
//   CONTENT_API=http://127.0.0.1:7071 node scripts/snapshot-content.mjs
//
// Never fails the build: if the API is unreachable the committed snapshots stay as they are.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = (process.env.CONTENT_API ?? "https://havaljalal.se").replace(/\/$/, "");
const targets = {
  sv: [path.join(here, "..", "src", "data", "content.sv.json"), path.join(here, "..", "..", "api", "Data", "seed.json")],
  en: [path.join(here, "..", "src", "data", "content.en.json")],
};

let failed = false;
for (const [lang, files] of Object.entries(targets)) {
  try {
    const res = await fetch(`${base}/api/content?lang=${lang}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = await res.json();
    if (!Array.isArray(doc.projects) || !doc.profile) throw new Error("unexpected document shape");
    const text = JSON.stringify(doc, null, 2) + "\n";
    for (const file of files) await writeFile(file, text, "utf8");
    console.log(`content snapshot ${lang}: ${doc.projects.length} projects, updated ${doc.updatedAt ?? "?"}`);
  } catch (err) {
    failed = true;
    console.warn(`content snapshot ${lang}: skipped (${err instanceof Error ? err.message : err}); keeping the committed copy`);
  }
}
process.exitCode = 0;
if (failed) console.warn("content snapshot: at least one language was not refreshed");
