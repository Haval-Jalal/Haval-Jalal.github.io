import { motion, type Variants } from "motion/react";
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
};

// Shared section shell. Two alternating near-black surfaces, both slightly transparent,
// scrolling over the fixed terrain canvas.
export default function Section({ id, tone, eyebrow, title, lede, children, className = "" }: Props) {
  return (
    <section id={id} className={`relative text-fg ${tone === "a" ? "surface-a" : "surface-b"} ${className}`}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="relative mx-auto max-w-6xl px-5 py-28 md:py-36">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
          className="mb-14 max-w-2xl"
        >
          <motion.p variants={reveal} className="font-mono text-xs uppercase tracking-[0.22em] text-ember-300">
            {eyebrow}
          </motion.p>
          <motion.h2
            variants={reveal}
            className="mt-4 text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.025em] md:text-5xl"
          >
            {title}
          </motion.h2>
          {lede && (
            <motion.p variants={reveal} className="mt-5 text-pretty text-lg text-fg-muted">
              {lede}
            </motion.p>
          )}
        </motion.div>
        {children}
      </div>
    </section>
  );
}
