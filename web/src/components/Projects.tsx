import { motion } from "motion/react";
import { ArrowUpRight, Github } from "lucide-react";
import Section, { reveal, stagger } from "./Section";
import { useSiteContent } from "../lib/content";

export default function Projects() {
  const projects = useSiteContent().content.projects.filter((p) => !p.hidden);
  return (
    <Section
      id="projekt"
      tone="a"
      eyebrow="Projekt"
      title={
        <>
          Byggt från databas <span className="text-ember-300">till UI.</span>
        </>
      }
      lede="Ett urval av projekt från mina studier och egna utforskningar. Riktig kod, riktiga repos."
    >
      <motion.ul
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-60px" }}
        variants={stagger}
        className="grid gap-4 md:grid-cols-2"
      >
        {projects.map((p, i) => (
          <motion.li key={p.slug} variants={reveal}>
            <a
              href={p.repo}
              target="_blank"
              rel="noreferrer"
              className="panel-tile group flex h-full flex-col rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 hover:border-ember-400/40 md:p-8"
            >
              <div className="flex items-center justify-between font-mono text-xs text-fg-faint">
                <span>{String(i + 1).padStart(2, "0")}</span>
                <span>{p.year}</span>
              </div>
              <h3 className="mt-6 text-2xl font-semibold tracking-tight text-fg">{p.title}</h3>
              <p className="mt-3 text-pretty text-fg-muted">{p.summary}</p>
              <ul className="mt-6 flex flex-wrap gap-1.5">
                {p.tags.map((t) => (
                  <li
                    key={t}
                    className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 font-mono text-[11px] text-fg-muted"
                  >
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex items-center gap-2 pt-8 text-sm text-ember-300">
                <Github className="size-4" />
                <span>Visa på GitHub</span>
                <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </a>
          </motion.li>
        ))}
      </motion.ul>
    </Section>
  );
}
