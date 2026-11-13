import { m, type Variants } from "motion/react";
import type { ReactNode } from "react";

export const reveal: Variants = {
  hidden: { opacity: 0, y: 28, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } },
};

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

type Props = {
  id: string;
  tone: "a" | "b";
  eyebrow: string;
  title: ReactNode;
  lede?: string;
  children: ReactNode;
  className?: string;
  // How the surface meets its neighbours: "mid" (default) blends into the shared mid tone, "self"
  // keeps its own tone to the edge (next to a section of the same tone), "clear" fades from
  // transparent (under the hero, where the terrain shows through).
  edgeTop?: "mid" | "self" | "clear";
  edgeBottom?: "mid" | "self" | "clear";
};

// Shared section shell. Two alternating near-black surfaces, both slightly transparent,
// scrolling over the fixed terrain canvas. Seams between tones are soft gradients (see index.css).
export default function Section({ id, tone, eyebrow, title, lede, children, className = "", edgeTop = "mid", edgeBottom = "mid" }: Props) {
  const edges = `${edgeTop === "mid" ? "" : `edge-top-${edgeTop}`} ${edgeBottom === "mid" ? "" : `edge-bottom-${edgeBottom}`}`;
  return (
    <section id={id} className={`relative text-fg ${tone === "a" ? "surface-a" : "surface-b"} ${edges} ${className}`}>
      <div className="relative mx-auto max-w-6xl px-5 py-28 md:py-36">
        <m.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
          className="mb-14 max-w-2xl"
        >
          <m.p variants={reveal} className="font-mono text-xs uppercase tracking-[0.22em] text-ember-300">
            {eyebrow}
          </m.p>
          <m.h2
            variants={reveal}
            className="mt-4 text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.025em] md:text-5xl"
          >
            {title}
          </m.h2>
          {lede && (
            <m.p variants={reveal} className="mt-5 text-pretty text-lg text-fg-muted">
              {lede}
            </m.p>
          )}
        </m.div>
        {children}
      </div>
    </section>
  );
}
