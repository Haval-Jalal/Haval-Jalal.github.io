import { useEffect, useState } from "react";
import { m } from "motion/react";
import { ArrowUpRight, Sparkles } from "lucide-react";
import Section, { reveal, stagger } from "./Section";
import { listGallery, type GalleryItem } from "../lib/lab";
import { relativeTime } from "../lib/github";
import { L, t } from "../lib/i18n";

// "Built by visitors": prototypes Haval has picked in admin. Each card renders the real
// prototype, scaled down and non-interactive; the link opens it full size.
export default function Gallery() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  useEffect(() => {
    void listGallery().then(setItems);
  }, []);
  if (items.length === 0) return null;

  return (
    <Section
      id="galleri"
      tone="a"
      eyebrow={t("gallery.eyebrow")}
      title={
        <>
          {t("gallery.title")} <span className="text-ember-300">{t("gallery.title_accent")}</span>
        </>
      }
      lede={t("gallery.lede")}
    >
      <m.ul
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-60px" }}
        variants={stagger}
        className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
      >
        {items.map((b) => (
          <m.li key={b.id} variants={reveal} className="min-w-0">
            <a
              href={L(`/lab/${b.id}`)}
              className="panel-tile group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:border-ember-400/40"
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-night-950">
                <iframe
                  title={b.title}
                  sandbox="allow-scripts"
                  srcDoc={b.html}
                  tabIndex={-1}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 top-0 h-[250%] w-[250%] origin-top-left scale-[0.4] bg-night-950"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-night-900/60 to-transparent" />
                <span className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-night-950/70 px-2 py-1 font-mono text-[10px] text-ember-300 backdrop-blur">
                  <Sparkles className="size-3" /> {t("gallery.built_by")}
                </span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold tracking-tight text-fg">{b.title}</h3>
                  <span className="shrink-0 font-mono text-[11px] text-fg-faint">{relativeTime(b.ts)}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-fg-muted">{b.idea}</p>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm text-ember-300">
                  {t("gallery.open")} <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </div>
            </a>
          </m.li>
        ))}
      </m.ul>
    </Section>
  );
}
