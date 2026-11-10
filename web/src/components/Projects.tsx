import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import Section, { reveal, stagger } from "./Section";
import { useSiteContent } from "../lib/content";
import type { Project } from "../data/content";
import { t } from "../lib/i18n";

// Projects are shown like products: screenshot, status, what it is, what it does, where to go.
export const STATUS_LABEL: Record<string, string> = {
  live: t("status.live"),
  delivered: t("status.delivered"),
  pilot: t("status.pilot"),
  wip: t("status.wip"),
  concept: t("status.concept"),
  school: t("status.school"),
};

export default function Projects() {
  const projects = useSiteContent().content.projects.filter((p) => !p.hidden);
  const [lightbox, setLightbox] = useState<{ project: Project; index: number } | null>(null);
  return (
    <Section
      id="projekt"
      tone="a"
      eyebrow={t("projects.eyebrow")}
      title={
        <>
          {t("projects.title")} <span className="text-ember-300">{t("projects.title_accent")}</span>
        </>
      }
      lede={t("projects.lede")}
    >
      <Rail count={projects.length}>
        {projects.map((p) => (
          <motion.li key={p.slug} id={`projekt-${p.slug}`} variants={reveal} className="flex w-[82vw] max-w-sm shrink-0 snap-start scroll-mt-24 md:w-[calc((100%-1.25rem)/2)] md:max-w-none xl:w-[calc((100%-2.5rem)/3)]">
            <ProjectCard project={p} onOpen={(index) => setLightbox({ project: p, index })} />
          </motion.li>
        ))}
      </Rail>
      <AnimatePresence>{lightbox && <Lightbox {...lightbox} onClose={() => setLightbox(null)} />}</AnimatePresence>
    </Section>
  );
}

// One horizontal row of cards, swiped on a phone and paged with the arrows on a desktop. Native
// scrolling with snap points, so it is as cheap and accessible as a plain list; the arrows just
// scroll the row one viewport at a time. The page counter follows the scroll position.
function Rail({ count, children }: { count: number; children: React.ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState({ index: 0, pages: 1, atStart: true, atEnd: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      // A page is one viewport plus the gap that follows it, so six cards in threes make two pages, not three.
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      const pages = Math.max(1, Math.ceil((el.scrollWidth + gap) / (el.clientWidth + gap)));
      const atEnd = el.scrollLeft >= max - 2;
      const index = atEnd ? pages - 1 : Math.min(pages - 1, Math.round(el.scrollLeft / (el.clientWidth + gap)));
      setPos({ index, pages, atStart: el.scrollLeft <= 2, atEnd });
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [count]);

  const page = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    el.scrollBy({ left: dir * (el.clientWidth + gap), behavior: "smooth" });
  };

  return (
    <div className="relative">
      <motion.ul
        ref={ref}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-60px" }}
        variants={stagger}
        className="-mx-5 flex snap-x snap-mandatory gap-5 overflow-x-auto overscroll-x-contain px-5 pb-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
        aria-label={t("projects.eyebrow")}
      >
        {children}
      </motion.ul>
      <div className="mt-2 flex items-center justify-between">
        <p className="font-mono text-xs text-fg-faint" aria-live="polite">
          {pos.index + 1} / {pos.pages}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => page(-1)}
            disabled={pos.atStart}
            className="grid size-10 place-items-center rounded-full border border-white/10 text-fg transition-colors hover:border-ember-400/50 disabled:opacity-30 disabled:hover:border-white/10"
            aria-label={t("projects.prev")}
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => page(1)}
            disabled={pos.atEnd}
            className="grid size-10 place-items-center rounded-full border border-white/10 text-fg transition-colors hover:border-ember-400/50 disabled:opacity-30 disabled:hover:border-white/10"
            aria-label={t("projects.next")}
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectCard({ project: p, onOpen }: { project: Project; onOpen: (index: number) => void }) {
  const images = p.images ?? [];
  const cover = images[0];
  const highlights = (p.highlights ?? []).filter(Boolean);
  const links = (p.links ?? []).filter((l) => l.url);
  return (
    <article className="panel-tile flex h-full min-w-0 flex-col overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:border-ember-400/40">
      <button
        type="button"
        onClick={() => cover && onOpen(0)}
        className={`group relative block aspect-[16/10] w-full overflow-hidden bg-night-800 text-left ${cover ? "cursor-zoom-in" : "cursor-default"}`}
        aria-label={cover ? `${t("projects.show_images")} ${p.title}` : undefined}
      >
        {cover ? (
          <img
            src={cover}
            srcSet={`${cover.replace(/\.webp$/, "-800.webp")} 800w, ${cover} 1600w`}
            sizes="(min-width: 1280px) 30vw, (min-width: 768px) 45vw, 82vw"
            alt={p.title}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
        ) : (
          <Placeholder title={p.title} />
        )}
        {images.length > 1 && (
          <span className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-night-950/70 px-2 py-1 font-mono text-[10px] text-fg backdrop-blur">
            <Images className="size-3" /> {images.length}
          </span>
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col p-6">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-xl font-semibold tracking-tight text-fg">{p.title}</h3>
          <span className="shrink-0 font-mono text-[11px] text-fg-faint">{p.year}</span>
        </div>
        {p.status && <p className="mt-1 text-xs font-medium text-ember-300">{STATUS_LABEL[p.status] ?? p.status}</p>}
        {p.tags.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {p.tags.map((t) => (
              <li key={t} className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 font-mono text-[11px] text-fg-muted">
                {t}
              </li>
            ))}
          </ul>
        )}
        {p.tagline && <p className="mt-4 font-medium text-fg">{p.tagline}</p>}
        {p.summary && <p className="mt-2 whitespace-pre-line text-pretty text-sm leading-relaxed text-fg-muted">{p.summary}</p>}
        {highlights.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {highlights.map((h) => (
              <li key={h} className="flex items-start gap-2 text-sm text-fg-muted">
                <Check className="mt-0.5 size-3.5 shrink-0 text-ember-300" strokeWidth={2.5} />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-6">
          {links.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-ember-500 px-3.5 py-1.5 text-xs font-medium text-night-950 transition-colors hover:bg-ember-400"
            >
              {l.label || t("projects.visit")} <ArrowUpRight className="size-3.5" />
            </a>
          ))}
          <a
            href="#kontakt"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-1.5 text-xs text-fg transition-colors hover:border-ember-400/50"
          >
            {t("projects.ask")} <ArrowRight className="size-3.5" />
          </a>
        </div>
      </div>
    </article>
  );
}

// No screenshot yet: a quiet gradient with the initials, so the grid never looks broken.
function Placeholder({ title }: { title: string }) {
  const initials = title
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  return (
    <div className="grid size-full place-items-center bg-[radial-gradient(80%_80%_at_30%_20%,rgba(232,147,58,0.22),transparent_60%),linear-gradient(135deg,#17171d,#0f0f13)]">
      <span className="font-mono text-4xl font-semibold tracking-tight text-ember-300/70">{initials}</span>
    </div>
  );
}

function Lightbox({ project, index: start, onClose }: { project: Project; index: number; onClose: () => void }) {
  const images = project.images ?? [];
  const [index, setIndex] = useState(start);
  const prev = () => setIndex((i) => (i - 1 + images.length) % images.length);
  const next = () => setIndex((i) => (i + 1) % images.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-night-950/90 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${t("projects.images_alt")}: ${project.title}`}
    >
      <button onClick={onClose} className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/[0.06] text-fg hover:bg-white/[0.12]" aria-label={t("projects.close")}>
        <X className="size-5" />
      </button>
      {images.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); prev(); }} className="absolute left-4 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/[0.06] text-fg hover:bg-white/[0.12]" aria-label={t("projects.prev")}>
            <ChevronLeft className="size-5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); next(); }} className="absolute right-4 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/[0.06] text-fg hover:bg-white/[0.12]" aria-label={t("projects.next")}>
            <ChevronRight className="size-5" />
          </button>
        </>
      )}
      <motion.figure
        key={index}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="max-h-full max-w-6xl"
        onClick={(e) => e.stopPropagation()}
      >
        <img src={images[index]} alt={`${project.title} ${index + 1}`} className="max-h-[82vh] w-auto rounded-xl border border-white/10 object-contain" />
        <figcaption className="mt-3 flex items-center justify-between font-mono text-xs text-fg-muted">
          <span>{project.title}</span>
          <span>{index + 1} / {images.length}</span>
        </figcaption>
      </motion.figure>
    </motion.div>
  );
}
