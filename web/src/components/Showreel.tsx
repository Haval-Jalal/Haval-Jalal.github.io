import { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import type { ReelItem } from "../data/content";
import { t } from "../lib/i18n";

// A slowly turning wall of screenshots: the viewer stands inside a cylinder of cards, so the
// middle ones face them and the outer ones lean in and slip out of the picture. One CSS
// animation on one transform, so it costs the GPU nothing to speak of. Customer work is shown
// here without names: only the picture, a short label and, when there is one, a link.
const SLOTS = 14;

export default function Showreel({ items }: { items: ReelItem[] }) {
  const slots = useMemo(() => {
    const n = Math.max(items.length, 1);
    return Array.from({ length: SLOTS }, (_, i) => items[i % n]);
  }, [items]);
  if (items.length === 0) return null;
  const step = 360 / SLOTS;

  return (
    <figure className="reel relative -mx-5 mb-16 md:mb-20" aria-label={t("projects.reel_caption")}>
      <div className="reel-stage">
        <div className="reel-ring">
          {slots.map((item, i) => {
            const style = { transform: `rotateY(${i * step}deg) translateZ(calc(var(--reel-r) * -1))` };
            const inner = (
              <>
                <img src={item.image} alt={item.label ?? ""} loading="lazy" decoding="async" draggable={false} className="size-full object-cover object-top" />
                {item.label && (
                  <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-night-950/75 px-2 py-1 font-mono text-[10px] text-fg backdrop-blur">
                    {item.label}
                    {item.url && <ArrowUpRight className="size-3 text-ember-300" />}
                  </span>
                )}
              </>
            );
            return item.url ? (
              <a key={i} href={item.url} target="_blank" rel="noreferrer" style={style} className="reel-card" aria-label={item.label || item.url}>
                {inner}
              </a>
            ) : (
              <div key={i} style={style} className="reel-card">
                {inner}
              </div>
            );
          })}
        </div>
        <div className="reel-edge reel-edge-l" aria-hidden />
        <div className="reel-edge reel-edge-r" aria-hidden />
      </div>
      <figcaption className="mt-4 text-center font-mono text-xs text-fg-faint">{t("projects.reel_caption")}</figcaption>
    </figure>
  );
}
