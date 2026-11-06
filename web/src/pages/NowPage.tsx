import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { reveal, stagger } from "../components/Section";
import { getNow, type NowPage as NowDoc } from "../lib/posts";
import { trackView } from "../lib/beacon";
import { L, locale, numberLocale, t } from "../lib/i18n";

// /nu (/en/now): what Haval is doing right now. Inspired by the "now page" idea (nownownow.com).
export default function NowPage() {
  const [doc, setDoc] = useState<NowDoc | null | undefined>(undefined);
  const [servedLang, setServedLang] = useState(locale);

  useEffect(() => {
    trackView();
    document.title = `${t("now.title")} · Haval Jalal`;
    getNow(locale)
      .then((r) => {
        setDoc(r.now);
        setServedLang(r.lang as typeof locale);
      })
      .catch(() => setDoc(null));
  }, []);

  const updated = doc ? new Intl.DateTimeFormat(numberLocale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(doc.updatedAt)) : "";

  return (
    <div className="min-h-screen bg-night-950 text-fg">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
        <a href={L("/")} className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft className="size-4" /> havaljalal.se
        </a>
        <a href={L("/changelog")} className="font-mono text-xs text-fg-faint hover:text-fg">{t("changelog.title")}</a>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-24">
        {doc === undefined && <p className="pt-10 text-fg-muted">{t("pitch.loading")}</p>}
        {doc === null && <p className="pt-10 text-fg-muted">{t("err.unknown")}</p>}
        {doc && (
          <motion.div initial="hidden" animate="show" variants={stagger}>
            <motion.p variants={reveal} className="pt-8 font-mono text-xs uppercase tracking-[0.2em] text-ember-300">
              {t("now.eyebrow")}
            </motion.p>
            <motion.h1 variants={reveal} className="mt-2 text-4xl font-semibold tracking-tight md:text-6xl">
              {t("now.title")}
            </motion.h1>
            <motion.p variants={reveal} className="mt-4 max-w-xl text-pretty text-lg text-fg-muted">
              {doc.intro}
            </motion.p>
            <motion.p variants={reveal} className="mt-3 font-mono text-xs text-fg-faint">
              {t("now.updated")} {updated}
              {servedLang !== locale && <span className="ml-2 text-fg-faint">· {t("now.sv_only")}</span>}
            </motion.p>

            <div className="mt-12 space-y-8">
              {doc.sections.map((s) => (
                <motion.section key={s.title} variants={reveal} className="panel-tile rounded-2xl p-6">
                  <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-ember-300">
                    <Sparkles className="size-3.5" /> {s.title}
                  </h2>
                  {s.items.length === 0 ? (
                    <p className="mt-3 text-sm text-fg-faint">—</p>
                  ) : (
                    <ul className="mt-4 space-y-2.5">
                      {s.items.map((it) => (
                        <li key={it} className="flex gap-3 text-[15px] leading-relaxed text-fg">
                          <span className="mt-[11px] size-1.5 shrink-0 rounded-full bg-ember-400" />
                          <span>{it}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </motion.section>
              ))}
            </div>

            <motion.div variants={reveal} className="mt-14 flex flex-wrap gap-3">
              <a href={L("/#kontakt")} className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-5 py-2.5 text-sm font-medium text-night-950">
                {t("nav.cta")}
              </a>
              <a href={L("/")} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-sm text-fg hover:border-ember-400/50">
                {t("pitch.to_site")}
              </a>
            </motion.div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
