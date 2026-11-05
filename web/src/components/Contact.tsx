import { motion } from "motion/react";
import { ArrowUpRight, FileDown, Github, Linkedin, Mail } from "lucide-react";
import { reveal, stagger } from "./Section";
import { profile } from "../data/content";

export default function Contact() {
  const links = [
    { icon: Github, label: "GitHub", href: profile.links.github, sub: "Haval-Jalal" },
    { icon: Linkedin, label: "LinkedIn", href: profile.links.linkedin || "#", sub: "Kommer" },
    { icon: Mail, label: "E-post", href: profile.links.email ? `mailto:${profile.links.email}` : "#", sub: "Kommer" },
    { icon: FileDown, label: "CV som PDF", href: "#", sub: "Genereras snart" },
  ];
  return (
    <section id="kontakt" className="surface-a relative text-fg">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(60% 50% at 50% 100%, rgba(232,147,58,0.14), transparent 70%)" }}
      />
      <div className="relative mx-auto max-w-6xl px-5 py-28 md:py-40">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
          className="mx-auto max-w-3xl text-center"
        >
          <motion.p variants={reveal} className="font-mono text-xs uppercase tracking-[0.22em] text-ember-300">
            Kontakt
          </motion.p>
          <motion.h2
            variants={reveal}
            className="mt-4 text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.025em] md:text-6xl"
          >
            Öppen för nya möjligheter, samarbeten och{" "}
            <span className="text-ember-300">bra samtal om teknik.</span>
          </motion.h2>
          <motion.p variants={reveal} className="mt-6 text-pretty text-lg text-fg-muted">
            {profile.tagline}
          </motion.p>
        </motion.div>

        <motion.ul
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          variants={stagger}
          className="mx-auto mt-14 grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {links.map(({ icon: Icon, label, href, sub }) => (
            <motion.li key={label} variants={reveal}>
              <a
                href={href}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer"
                className="panel-tile group flex items-center gap-3 rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:border-ember-400/40"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ember-500/15 text-ember-300">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-fg">{label}</span>
                  <span className="block truncate text-xs text-fg-muted">{sub}</span>
                </span>
                <ArrowUpRight className="ml-auto size-4 text-fg-faint transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            </motion.li>
          ))}
        </motion.ul>

        <footer className="mt-24 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 text-xs text-fg-faint md:flex-row">
          <p>© {new Date().getFullYear()} {profile.name}. Byggd för hand med React, Three.js och .NET på Azure.</p>
          <p className="font-mono">Göteborg · 57.7°N 11.9°E</p>
        </footer>
      </div>
    </section>
  );
}
