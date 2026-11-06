import { Suspense, useEffect, useState } from "react";
import Lenis from "lenis";
import { motion, useMotionValue, useSpring, type Variants } from "motion/react";
import { ArrowRight, Sparkles } from "lucide-react";
import Nav from "./components/Nav";
import HavalOS from "./components/HavalOS";
import Projects from "./components/Projects";
import Journey from "./components/Journey";
import Stack from "./components/Stack";
import BuildLab from "./components/BuildLab";
import Gallery from "./components/Gallery";
import AgentWidget from "./components/Agent";
import Agent3D from "./components/Agent3D";
import Contact from "./components/Contact";
import { BACKGROUNDS, currentBackground, type BackgroundKey } from "./components/backgrounds";
import { useSiteContent } from "./lib/content";
import { attachGlobalSfx, setSoundEnabled } from "./lib/sound";
import { trackView } from "./lib/beacon";
import { t } from "./lib/i18n";

// Accent colour for the italic headline word, per background.
const ACCENT: Record<string, string> = {
  sand: "text-sand-700",
  indigo: "text-indigo-300",
  cyan: "text-cyan-300",
  ember: "text-ember-300",
};

export default function App() {
  const { content } = useSiteContent();
  const { profile } = content;
  const [soundOn, setSoundOn] = useState(false);
  const [bgKey] = useState<BackgroundKey>(currentBackground);
  const bg = BACKGROUNDS[bgKey];
  const Background = bg.load;
  const dark = bg.theme === "dark";

  // Normalised pointer position (-1..1) feeding the background and the panel tilt.
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const mouseX = useSpring(rawX, { stiffness: 40, damping: 20 });
  const mouseY = useSpring(rawY, { stiffness: 40, damping: 20 });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      rawX.set((e.clientX / window.innerWidth) * 2 - 1);
      rawY.set((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [rawX, rawY]);

  // Smooth scrolling. Lenis drives native scroll, so motion's useScroll keeps working.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);

  useEffect(() => attachGlobalSfx(), []);
  useEffect(() => trackView(), []);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  };

  const primaryBtn = dark
    ? "bg-white text-[#0b0d14] shadow-lg shadow-black/40"
    : "bg-ink text-sand-100 shadow-lg shadow-ink/20";
  const secondaryBtn = dark
    ? "border border-white/15 bg-white/5 text-white hover:bg-white/10"
    : "border border-ink/15 bg-sand-50/50 text-ink hover:bg-sand-50";

  return (
    <div className={`grain ${dark ? "bg-night-950" : ""}`}>
      <Nav soundOn={soundOn} onToggleSound={toggleSound} dark={dark} />

      <section className="relative min-h-[140vh]">
        <Suspense fallback={<div className={`fixed inset-0 ${dark ? "bg-[#070810]" : "bg-sand-100"}`} aria-hidden />}>
          <Background mouseX={mouseX} mouseY={mouseY} />
        </Suspense>

        <div className="relative z-10 mx-auto max-w-6xl px-5 pt-32">
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12 } } }}
            className="mx-auto max-w-4xl text-center"
          >
            <motion.p
              variants={fade}
              className={`mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium backdrop-blur ${
                dark ? "border-white/10 bg-white/5 text-white/70" : "border-ink/10 bg-sand-50/50 text-ink-soft"
              }`}
            >
              <span className={`size-1.5 rounded-full ${dark ? "bg-emerald-400" : "bg-ember-500"}`} />
              {profile.availability}
              <ArrowRight className="size-3" />
            </motion.p>
            <motion.h1
              variants={fade}
              className={`text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.03em] md:text-7xl ${
                dark ? "text-white" : "text-ink"
              }`}
            >
              {profile.headline.lead}{" "}
              <span className={ACCENT[bg.accent]}>{profile.headline.accent}</span>
            </motion.h1>
            <motion.p
              variants={fade}
              className={`mx-auto mt-6 max-w-xl text-pretty text-base md:text-lg ${dark ? "text-white/65" : "text-ink-soft"}`}
            >
              {profile.intro}
            </motion.p>
            <motion.div variants={fade} className="mt-8 flex items-center justify-center gap-3">
              <a
                href="#build-lab"
                className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition-transform hover:-translate-y-0.5 ${primaryBtn}`}
              >
                <Sparkles className="size-4" />
                {t("hero.lab")}
              </a>
              <a
                href="#projekt"
                className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium backdrop-blur transition-colors ${secondaryBtn}`}
              >
                {t("hero.projects")}
                <ArrowRight className="size-4" />
              </a>
            </motion.div>
          </motion.div>

          <div className="mt-16">
            <HavalOS mouseX={mouseX} mouseY={mouseY} />
          </div>
        </div>
      </section>

      {/* Everything below scrolls over the fixed background. */}
      <div className="relative z-10">
        <Projects />
        <Journey />
        <Stack />
        <BuildLab />
        <Gallery />
        <Contact />
      </div>

      <AgentWidget />
      {import.meta.env.DEV && <BackgroundSwitcher active={bgKey} />}
      {import.meta.env.DEV && new URLSearchParams(window.location.search).get("agent") === "big" && (
        <div className="fixed left-10 top-28 z-[100] rounded-3xl bg-night-950 p-8">
          <Agent3D size={360} mood={(new URLSearchParams(window.location.search).get("mood") as "idle" | "thinking" | "speaking" | "happy") ?? "idle"} />
        </div>
      )}
    </div>
  );
}

// Dev-only picker while we decide on the hero background.
function BackgroundSwitcher({ active }: { active: BackgroundKey }) {
  return (
    <div className="fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-black/70 p-1 text-xs text-white backdrop-blur">
      {(Object.keys(BACKGROUNDS) as BackgroundKey[]).map((k) => (
        <a
          key={k}
          href={`?bg=${k}`}
          className={`rounded-full px-3 py-1.5 transition-colors ${k === active ? "bg-white text-black" : "hover:bg-white/10"}`}
        >
          {BACKGROUNDS[k].label}
        </a>
      ))}
    </div>
  );
}

const fade: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } },
};
