import { motion } from "motion/react";
import { Bot, Sparkles, Wand2 } from "lucide-react";
import Section, { reveal, stagger } from "./Section";

const EXAMPLES = [
  "En app som räknar ut vad min bil kostar per mil",
  "En landningssida för ett café i Majorna",
  "Ett verktyg som sorterar mina jobbansökningar",
];

// Teaser until the .NET API + Claude integration is live. The layout is final; the wiring comes in step 3.
export default function BuildLab() {
  return (
    <Section
      id="build-lab"
      tone="b"
      eyebrow="AI Build Lab"
      title={
        <>
          Beskriv en idé. <span className="text-ember-300">Se den byggas.</span>
        </>
      }
      lede="Skriv vad du vill ha, så bygger min AI-agent en körbar prototyp direkt här på sidan och förklarar hur jag skulle bygga den på riktigt med .NET och React. Gillar du resultatet? Skicka det till mig med ett klick."
    >
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          variants={stagger}
          className="panel-glass rounded-3xl p-2"
        >
          <motion.div variants={reveal} className="rounded-[1.25rem] border border-white/5 bg-night-950/60 p-5 md:p-7">
            <div className="flex items-center gap-2 text-xs text-fg-faint">
              <Sparkles className="size-3.5 text-ember-300" />
              Build Lab · drivs av Claude Opus
            </div>
            <label htmlFor="build-idea" className="sr-only">
              Beskriv din idé
            </label>
            <textarea
              id="build-idea"
              rows={4}
              placeholder="T.ex. en app som håller koll på mina löprundor och visar statistik…"
              className="mt-4 w-full resize-none bg-transparent text-lg leading-relaxed text-fg placeholder:text-fg-faint focus:outline-none"
            />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-fg-muted transition-colors hover:border-ember-400/50 hover:text-fg"
                >
                  {e}
                </button>
              ))}
            </div>
            <div className="mt-6 flex items-center justify-between gap-4">
              <p className="text-xs text-fg-faint">Kommer snart: koppling till backend pågår.</p>
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-5 py-2.5 text-sm font-medium text-night-950 opacity-70"
              >
                <Wand2 className="size-4" />
                Bygg prototyp
              </button>
            </div>
          </motion.div>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          variants={stagger}
          className="flex flex-col gap-4"
        >
          <motion.div variants={reveal} className="panel-tile rounded-3xl p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-ember-500 text-night-950">
                <Bot className="size-5" />
              </span>
              <div>
                <p className="font-semibold text-fg">Digital Haval</p>
                <p className="text-xs text-fg-muted">Fråga om mitt CV, mina projekt eller min stack</p>
              </div>
            </div>
            <div className="mt-5 space-y-3 text-sm">
              <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-ember-500 px-4 py-2.5 text-night-950">
                Har Haval jobbat med CQRS?
              </p>
              <p className="w-fit max-w-[90%] rounded-2xl rounded-bl-sm border border-white/10 bg-white/[0.04] px-4 py-2.5 text-fg">
                Ja. I Eventify använder han CQRS med MediatR i en Clean Architecture-struktur, med EF Core mot SQL
                Server. Vill du se repot?
              </p>
            </div>
            <p className="mt-5 text-xs text-fg-faint">Chatten aktiveras i steg 3.</p>
          </motion.div>
          <motion.div variants={reveal} className="panel-tile rounded-3xl p-6">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember-300">Så funkar det</p>
            <ol className="mt-3 space-y-2 text-sm text-fg-muted">
              <li>1. Du beskriver vad du vill bygga.</li>
              <li>2. Agenten bygger en körbar prototyp i en sandlåda.</li>
              <li>3. Du får en arkitekturskiss för en riktig version.</li>
              <li>4. Skicka till mig, så pratar vi om nästa steg.</li>
            </ol>
          </motion.div>
        </motion.div>
      </div>
    </Section>
  );
}
