import { motion } from "motion/react";
import Section, { reveal, stagger } from "./Section";
import { useSiteContent } from "../lib/content";

export default function Stack() {
  const { skills } = useSiteContent().content;
  return (
    <Section
      id="stack"
      tone="a"
      eyebrow="Stack"
      title={
        <>
          Verktygen jag bygger <span className="text-ember-300">på riktigt</span> med.
        </>
      }
      lede="Jag kombinerar mitt industriella tankesätt med moderna utvecklingsmetoder för att bygga skalbara, eleganta och användarfokuserade applikationer."
    >
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-60px" }}
        variants={stagger}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {skills.map((g) => (
          <motion.div
            key={g.title}
            variants={reveal}
            className={`rounded-2xl p-6 ${
              g.accent
                ? "bg-gradient-to-br from-ember-400 to-ember-600 text-night-950 shadow-[0_0_60px_-20px_rgba(232,147,58,0.8)]"
                : "panel-tile text-fg"
            }`}
          >
            <p className={`font-mono text-xs uppercase tracking-[0.2em] ${g.accent ? "text-night-950/70" : "text-ember-300"}`}>
              {g.title}
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {g.items.map((s) => (
                <li
                  key={s}
                  className={`rounded-full px-3 py-1.5 text-sm ${
                    g.accent ? "bg-night-950/15 font-medium" : "border border-white/8 bg-white/[0.03] text-fg-muted"
                  }`}
                >
                  {s}
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </motion.div>
    </Section>
  );
}
