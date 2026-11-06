import { motion } from "motion/react";
import { ArrowUpRight, CalendarDays, FileDown, Linkedin, Mail, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { getBookingInfo } from "../lib/booking";
import { reveal, stagger } from "./Section";
import { useSiteContent } from "../lib/content";
import { L, locale, t } from "../lib/i18n";

export default function Contact() {
  const { profile } = useSiteContent().content;
  const [bookable, setBookable] = useState(false);
  useEffect(() => {
    void getBookingInfo().then((i) => setBookable(!!i?.enabled));
  }, []);
  const links = [
    { icon: Linkedin, label: "LinkedIn", href: profile.links.linkedin || "#", sub: profile.links.linkedin ? t("contact.linkedin_sub") : t("contact.coming") },
    { icon: Mail, label: t("contact.email"), href: profile.links.email ? `mailto:${profile.links.email}` : "#", sub: profile.links.email || t("contact.coming") },
    ...(bookable ? [{ icon: CalendarDays, label: t("contact.book"), href: L("/boka"), sub: t("contact.book_sub") }] : [{ icon: MessageSquare, label: t("contact.chat"), href: "#build-lab", sub: t("contact.chat_sub") }]),
    { icon: FileDown, label: t("contact.cv"), href: `/api/cv.pdf?lang=${locale}`, sub: t("contact.cv_sub") },
  ];
  const tool = { label: t("contact.tool"), href: L("/cv"), sub: t("contact.tool_sub") };
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
            {t("contact.eyebrow")}
          </motion.p>
          <motion.h2
            variants={reveal}
            className="mt-4 text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.025em] md:text-6xl"
          >
            {t("contact.title")} <span className="text-ember-300">{t("contact.title_accent")}</span>
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
                target={href.startsWith("http") || href.includes(".pdf") ? "_blank" : undefined}
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

        <motion.a
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          href={tool.href}
          className="group mx-auto mt-6 flex max-w-4xl items-center gap-4 rounded-2xl border border-ember-400/30 bg-ember-500/10 p-4 transition-colors hover:bg-ember-500/15"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ember-500 text-night-950">
            <FileDown className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-fg">{tool.label}</span>
            <span className="block text-xs text-fg-muted">{tool.sub}</span>
          </span>
          <ArrowUpRight className="ml-auto size-4 shrink-0 text-ember-300 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </motion.a>

        <footer className="mt-24 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 text-xs text-fg-faint md:flex-row">
          <p>© {new Date().getFullYear()} {profile.name}. {t("contact.footer")}</p>
          <p className="font-mono">{locale === "en" ? "Gothenburg" : "Göteborg"} · 57.7°N 11.9°E</p>
        </footer>
      </div>
    </section>
  );
}
