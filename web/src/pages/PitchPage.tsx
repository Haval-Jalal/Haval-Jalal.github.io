import { lazy, Suspense, useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { ArrowRight, ArrowUpRight, Check, FileDown, Sparkles } from "lucide-react";
import { reveal, stagger } from "../components/Section";
import { useSiteContent } from "../lib/content";
import { getPitch, pitchEvent, type PublicPitch } from "../lib/pitch";
import { getBookingInfo } from "../lib/booking";
import { trackView } from "../lib/beacon";
import type { Project } from "../data/content";
import { L, locale, sitePath, t } from "../lib/i18n";

const Terrain = lazy(() => import("../components/backgrounds/Terrain"));

// /for/{slug}: the personal page for one company. Same look as the site, content curated for them.
export default function PitchPage() {
  const slug = sitePath.split("/")[2] ?? "";
  const [pitch, setPitch] = useState<PublicPitch | null | undefined>(undefined);
  const [bookable, setBookable] = useState(false);
  const { content } = useSiteContent();

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const mouseX = useSpring(rawX, { stiffness: 40, damping: 20 });
  const mouseY = useSpring(rawY, { stiffness: 40, damping: 20 });

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    trackView();
    void getBookingInfo().then((i) => setBookable(!!i?.enabled));
    getPitch(slug)
      .then((p) => {
        setPitch(p);
        if (p) {
          document.title = `${p.greeting || p.company} · Haval Jalal`;
          pitchEvent(slug, "view");
        }
      })
      .catch(() => setPitch(null));
    const onMove = (e: PointerEvent) => {
      rawX.set((e.clientX / window.innerWidth) * 2 - 1);
      rawY.set((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      meta.remove();
    };
  }, [slug, rawX, rawY]);

  const projects = (pitch?.projects ?? [])
    .map((pp) => ({ why: pp.why, project: content.projects.find((p) => p.slug === pp.slug) }))
    .filter((x): x is { why: string; project: Project } => !!x.project);
  const email = content.profile.links.email;
  const cta = pitch?.ctaUrl || (bookable ? L("/boka") : email ? `mailto:${email}` : L("/#kontakt"));

  return (
    <div className="min-h-screen bg-night-950 text-fg">
      <Suspense fallback={<div className="fixed inset-0 bg-[#070810]" aria-hidden />}>
        <Terrain mouseX={mouseX} mouseY={mouseY} />
      </Suspense>
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-night-950/40 via-night-950/70 to-night-950" aria-hidden />

      <div className="relative z-10">
        <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5">
          <a href={L("/")} className="flex items-center gap-2 text-sm text-fg-muted hover:text-fg">
            <span className="grid size-7 place-items-center rounded-md bg-ember-400 text-xs font-bold text-night-950">H</span>
            Haval Jalal
          </a>
          <span className="font-mono text-xs text-fg-faint">{t("pitch.personal")}</span>
        </header>

        <main className="mx-auto max-w-5xl px-5 pb-24">
          {pitch === undefined && <p className="pt-24 text-fg-muted">{t("pitch.loading")}</p>}
          {pitch === null && (
            <div className="pt-32 text-center">
              <h1 className="text-3xl font-semibold tracking-tight">{t("pitch.gone")}</h1>
              <p className="mt-3 text-fg-muted">{t("pitch.gone_sub")}</p>
              <a href={L("/")} className="mt-8 inline-flex items-center gap-2 rounded-full bg-ember-500 px-5 py-2.5 text-sm font-medium text-night-950">
                {t("pitch.to_site")} <ArrowRight className="size-4" />
              </a>
            </div>
          )}
          {pitch && (
            <motion.div initial="hidden" animate="show" variants={stagger}>
              <motion.p variants={reveal} className="pt-16 font-mono text-xs uppercase tracking-[0.22em] text-ember-300 md:pt-24">
                {t("pitch.for")} {pitch.company}{pitch.role ? ` · ${pitch.role}` : ""}
              </motion.p>
              <motion.h1 variants={reveal} className="mt-4 max-w-3xl text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.03em] md:text-7xl">
                {pitch.greeting || `${t("pitch.hi")} ${pitch.company}.`}
              </motion.h1>
              <motion.div variants={reveal} className="mt-8 max-w-2xl space-y-4 text-lg leading-relaxed text-fg-muted">
                {pitch.intro.split(/\n\s*\n/).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </motion.div>

              <motion.div variants={reveal} className="mt-8 flex flex-wrap gap-3">
                <a href={cta} target={pitch.ctaUrl ? "_blank" : undefined} rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-5 py-2.5 text-sm font-medium text-night-950 transition-colors hover:bg-ember-400">
                  {pitch.ctaLabel || t("pitch.cta")} <ArrowUpRight className="size-4" />
                </a>
                <a href={`/api/cv.pdf?download=1&lang=${locale}`} onClick={() => pitchEvent(pitch.slug, "cv")} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm text-fg transition-colors hover:border-ember-400/50">
                  <FileDown className="size-4" /> {t("pitch.cv")}
                </a>
              </motion.div>

              {pitch.highlights.length > 0 && (
                <motion.section variants={reveal} className="panel-tile mt-16 rounded-2xl p-6 md:p-8">
                  <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-ember-300">{t("pitch.why")}</h2>
                  <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                    {pitch.highlights.map((h) => (
                      <li key={h} className="flex items-start gap-2.5 text-fg">
                        <Check className="mt-1 size-4 shrink-0 text-ember-300" strokeWidth={2.5} />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </motion.section>
              )}

              {projects.length > 0 && (
                <section className="mt-16">
                  <motion.h2 variants={reveal} className="text-2xl font-semibold tracking-tight md:text-3xl">
                    {t("pitch.projects")} <span className="text-ember-300">{t("pitch.projects_accent")}</span>
                  </motion.h2>
                  <div className="mt-6 grid gap-5 md:grid-cols-2">
                    {projects.map(({ project: p, why }) => (
                      <motion.article key={p.slug} variants={reveal} className="panel-tile flex min-w-0 flex-col overflow-hidden rounded-2xl">
                        {p.images?.[0] ? (
                          <img src={p.images[0]} alt={p.title} loading="lazy" className="aspect-[16/9] w-full object-cover" />
                        ) : (
                          <div className="grid aspect-[16/9] place-items-center bg-[radial-gradient(80%_80%_at_30%_20%,rgba(232,147,58,0.22),transparent_60%),linear-gradient(135deg,#17171d,#0f0f13)] font-mono text-3xl text-ember-300/70">
                            {p.title.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="p-6">
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="text-lg font-semibold tracking-tight">{p.title}</h3>
                            <span className="shrink-0 font-mono text-[11px] text-fg-faint">{p.year}</span>
                          </div>
                          {p.tagline && <p className="mt-1 text-sm text-fg-muted">{p.tagline}</p>}
                          {why && <p className="mt-3 border-l-2 border-ember-400/60 pl-3 text-sm text-fg">{why}</p>}
                          <ul className="mt-4 flex flex-wrap gap-1.5">
                            {p.tags.slice(0, 6).map((t) => (
                              <li key={t} className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] text-fg-muted">{t}</li>
                            ))}
                          </ul>
                        </div>
                      </motion.article>
                    ))}
                  </div>
                  <motion.a variants={reveal} href={L("/#projekt")} className="mt-4 inline-flex items-center gap-1.5 text-sm text-ember-300 hover:underline">
                    {t("pitch.all_projects")} <ArrowRight className="size-4" />
                  </motion.a>
                </section>
              )}

              <motion.section variants={reveal} className="mt-16 rounded-2xl border border-ember-400/30 bg-ember-500/10 p-6 md:p-8">
                <div className="flex flex-wrap items-center justify-between gap-6">
                  <div className="max-w-xl">
                    <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-ember-300">
                      <Sparkles className="size-3.5" /> {t("pitch.unique")}
                    </p>
                    <h2 className="mt-2 text-xl font-semibold tracking-tight md:text-2xl">{t("pitch.lab_title")}</h2>
                    <p className="mt-2 text-sm text-fg-muted">{t("pitch.lab_sub")}</p>
                  </div>
                  <a href={L("/#build-lab")} onClick={() => pitchEvent(pitch.slug, "lab")} className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-5 py-2.5 text-sm font-medium text-night-950 transition-colors hover:bg-ember-400">
                    {t("pitch.lab_cta")} <ArrowRight className="size-4" />
                  </a>
                </div>
              </motion.section>

              {pitch.closing && (
                <motion.p variants={reveal} className="mt-16 max-w-2xl text-lg text-fg-muted">
                  {pitch.closing}
                </motion.p>
              )}
              <motion.p variants={reveal} className="mt-6 text-fg">
                {content.profile.name}
                <span className="block text-sm text-fg-muted">{content.profile.role} · {content.profile.location}</span>
              </motion.p>
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}
