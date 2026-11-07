import { motion, useScroll, useTransform } from "motion/react";
import { Volume2, VolumeX } from "lucide-react";
import { useSiteContent } from "../lib/content";
import { L, otherLocaleUrl, t } from "../lib/i18n";

type Props = {
  soundOn: boolean;
  onToggleSound: () => void;
  dark?: boolean;
};

export default function Nav({ soundOn, onToggleSound, dark = false }: Props) {
  const links = useSiteContent().content.nav;
  // Transparent over the hero, frosted once content starts scrolling underneath.
  const { scrollY } = useScroll();
  const barOpacity = useTransform(scrollY, [40, 160], [0, 1]);

  const text = dark ? "text-white/70 hover:text-white" : "text-ink-soft hover:text-ink";
  const logoBox = dark ? "bg-white text-[#0b0d14]" : "bg-ink text-sand-100";
  const brand = dark ? "text-white" : "text-ink";
  const iconBtn = dark
    ? "border-white/15 bg-white/5 text-white/70 hover:text-white"
    : "border-ink/10 bg-sand-50/40 text-ink-soft hover:text-ink";
  const cta = dark ? "bg-white text-[#0b0d14]" : "bg-ink text-sand-100";
  const bar = dark ? "border-white/5 bg-[#070810]/70" : "border-ink/5 bg-sand-100/70";

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="fixed inset-x-0 top-0 z-50"
    >
      <motion.div style={{ opacity: barOpacity }} className={`absolute inset-0 border-b backdrop-blur-md ${bar}`} />
      <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <a href="#" className="flex items-center gap-2.5">
          <span className={`grid size-7 place-items-center rounded-lg ${logoBox}`}>
            <span className="text-sm font-bold leading-none">H</span>
          </span>
          <span className={`text-sm font-semibold tracking-tight ${brand}`}>Haval Jalal</span>
        </a>
        <ul className="flex items-center gap-7 text-[13px] font-medium max-md:hidden">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className={`transition-colors ${text}`}>
                {l.label}
              </a>
            </li>
          ))}
          <li>
            <a href={L("/nu")} title={t("nav.now_title")} className={`inline-flex items-center gap-1.5 transition-colors ${text}`}>
              <span className="size-1.5 rounded-full bg-ember-400 shadow-[0_0_8px_theme(--color-ember-400)]" aria-hidden />
              {t("nav.now")}
            </a>
          </li>
        </ul>
        <div className="flex items-center gap-2">
          <a
            href={otherLocaleUrl()}
            title={t("nav.lang_title")}
            className={`grid h-9 place-items-center rounded-full border px-3 font-mono text-[11px] font-medium backdrop-blur transition-colors ${iconBtn}`}
          >
            {t("nav.lang")}
          </a>
          <button
            onClick={onToggleSound}
            aria-label={soundOn ? t("nav.sound_off") : t("nav.sound_on")}
            className={`grid size-9 place-items-center rounded-full border backdrop-blur transition-colors ${iconBtn}`}
          >
            {soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
          <a href="#kontakt" className={`rounded-full px-4 py-2 text-[13px] font-medium transition-transform hover:-translate-y-px ${cta}`}>
            {t("nav.cta")}
          </a>
        </div>
      </nav>
    </motion.header>
  );
}
