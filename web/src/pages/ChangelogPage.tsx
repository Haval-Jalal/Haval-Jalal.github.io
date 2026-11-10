import { useEffect, useState } from "react";
import { m } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { reveal, stagger } from "../components/Section";
import { getChangelog, type ChangelogEntry } from "../lib/posts";
import { trackView } from "../lib/beacon";
import { L, locale, numberLocale, t } from "../lib/i18n";

type Entry = Omit<ChangelogEntry, "published">;

// /changelog: what changed on the site, newest first. English falls back to Swedish per entry.
export default function ChangelogPage() {
  const [entries, setEntries] = useState<Entry[] | null | undefined>(undefined);

  useEffect(() => {
    trackView();
    document.title = `${t("changelog.title")} · Haval Jalal`;
    getChangelog().then(setEntries).catch(() => setEntries(null));
  }, []);

  const fmt = new Intl.DateTimeFormat(numberLocale, { day: "numeric", month: "short", year: "numeric" });
  const pick = (e: Entry) => (locale === "en" && e.titleEn ? { title: e.titleEn, text: e.textEn || e.text } : { title: e.title, text: e.text });

  return (
    <div className="min-h-screen bg-night-950 text-fg">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
        <a href={L("/")} className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft className="size-4" /> havaljalal.se
        </a>
        <a href={L("/nu")} className="font-mono text-xs text-fg-faint hover:text-fg">{t("now.title")}</a>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-24">
        <m.div initial="hidden" animate="show" variants={stagger}>
          <m.p variants={reveal} className="pt-8 font-mono text-xs uppercase tracking-[0.2em] text-ember-300">
            {t("changelog.eyebrow")}
          </m.p>
          <m.h1 variants={reveal} className="mt-2 text-4xl font-semibold tracking-tight md:text-6xl">
            {t("changelog.title")}
          </m.h1>
          <m.p variants={reveal} className="mt-4 max-w-xl text-pretty text-lg text-fg-muted">
            {t("changelog.lede")}
          </m.p>
        </m.div>

        {entries === undefined && <p className="pt-10 text-fg-muted">{t("pitch.loading")}</p>}
        {entries === null && <p className="pt-10 text-fg-muted">{t("err.unknown")}</p>}
        {entries && entries.length === 0 && <p className="pt-10 text-fg-muted">{t("changelog.empty")}</p>}
        {entries && entries.length > 0 && (
          <ol className="relative mt-12 space-y-10 border-l border-white/10 pl-8">
            {entries.map((e, i) => {
              const { title, text } = pick(e);
              return (
                <m.li
                  key={e.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.6, delay: Math.min(i, 4) * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  className="relative"
                >
                  <span className="absolute -left-[37px] top-1.5 size-[9px] rounded-full bg-ember-400 ring-4 ring-night-950" />
                  <time className="font-mono text-xs text-fg-faint">{fmt.format(new Date(e.date + "T12:00:00"))}</time>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
                  <div className="mt-2 space-y-1.5 text-[15px] leading-relaxed text-fg-muted">
                    {text.split("\n").filter((l) => l.trim().length > 0).map((line, k) =>
                      line.trim().startsWith("- ") ? (
                        <p key={k} className="flex gap-2">
                          <span className="text-ember-300">–</span>
                          <span>{line.trim().slice(2)}</span>
                        </p>
                      ) : (
                        <p key={k}>{line}</p>
                      ),
                    )}
                  </div>
                  {e.tags.length > 0 && (
                    <p className="mt-3 flex flex-wrap gap-1.5">
                      {e.tags.map((tag) => (
                        <span key={tag} className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] text-fg-faint">{tag}</span>
                      ))}
                    </p>
                  )}
                </m.li>
              );
            })}
          </ol>
        )}
      </main>
    </div>
  );
}
