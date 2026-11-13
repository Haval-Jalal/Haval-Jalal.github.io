import { m } from "motion/react";
import { ArrowUpRight, FileText, MessageCircle, Sparkles } from "lucide-react";
import Section, { reveal, stagger } from "./Section";
import { L, t } from "../lib/i18n";
import { openAgent } from "../lib/chat";

// The second half of the site, for peers rather than recruiters: tools built for fun, free to use.
// Sits right before the Build Lab so the lab reads as a toy, not a service.
export default function Playground() {
  const items = [
    { icon: Sparkles, label: t("play.lab"), sub: t("play.lab_sub"), href: "#build-lab" },
    { icon: FileText, label: t("play.cv"), sub: t("play.cv_sub"), href: L("/cv") },
    { icon: MessageCircle, label: t("play.agent"), sub: t("play.agent_sub"), onClick: () => openAgent() },
  ];
  const cls = "group panel-tile flex w-full items-center gap-4 rounded-2xl p-4 text-left transition-colors hover:border-ember-400/40";
  return (
    <Section
      id="lekplats"
      tone="b"
      edgeBottom="self"
      eyebrow={t("play.eyebrow")}
      title={
        <>
          {t("play.title")} <span className="text-ember-300">{t("play.title_accent")}</span>
        </>
      }
      lede={t("play.lede")}
      className="[&>div:nth-child(2)]:pb-8"
    >
      <m.ul initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} variants={stagger} className="grid gap-4 md:grid-cols-3">
        {items.map(({ icon: Icon, label, sub, href, onClick }) => {
          const inner = (
            <>
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ember-500/15 text-ember-300">
                <Icon className="size-4" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-fg">{label}</span>
                <span className="block text-xs text-fg-muted">{sub}</span>
              </span>
              <ArrowUpRight className="size-4 shrink-0 text-fg-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ember-300" />
            </>
          );
          return (
            <m.li key={label} variants={reveal}>
              {href ? (
                <a href={href} className={cls}>{inner}</a>
              ) : (
                <button type="button" onClick={onClick} className={cls}>{inner}</button>
              )}
            </m.li>
          );
        })}
      </m.ul>
    </Section>
  );
}
