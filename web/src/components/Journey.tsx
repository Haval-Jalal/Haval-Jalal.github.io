import { m } from "motion/react";
import Section, { reveal, stagger } from "./Section";
import { useSiteContent } from "../lib/content";
import { t } from "../lib/i18n";

export default function Journey() {
  const { education, journey, profile } = useSiteContent().content;
  return (
    <Section
      id="resan"
      tone="b"
      eyebrow={t("journey.eyebrow")}
      title={
        <>
          {t("journey.title")} <span className="text-ember-300">{t("journey.title_accent")}</span>
        </>
      }
      lede={profile.about}
    >
      <div className="grid gap-12 md:grid-cols-[1fr_1.4fr] md:gap-16">
        {/* Portrait + facts */}
        <m.aside
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          variants={stagger}
          className="md:sticky md:top-28 md:self-start"
        >
          <m.div
            variants={reveal}
            className="relative overflow-hidden rounded-3xl border border-white/10 shadow-2xl shadow-black/60"
          >
            <img src="/profile.webp" alt={profile.name} width={400} height={400} loading="lazy" decoding="async" className="aspect-[4/5] w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-night-950/90 to-transparent p-5">
              <p className="text-lg font-semibold text-fg">{profile.name}</p>
              <p className="text-sm text-fg-muted">
                {profile.role} · {profile.location}
              </p>
            </div>
          </m.div>
          <m.ul variants={reveal} className="mt-6 space-y-3">
            {education.map((e) => (
              <li key={e.school} className="panel-tile rounded-xl px-4 py-3">
                <p className="text-sm font-medium text-fg">{e.program}</p>
                <p className="text-xs text-fg-muted">{e.school}</p>
              </li>
            ))}
          </m.ul>
        </m.aside>

        {/* Timeline */}
        <m.ol
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          variants={stagger}
          className="relative border-l border-white/10 pl-8"
        >
          {journey.map((step, i) => (
            <m.li key={step.title} variants={reveal} className="relative pb-12 last:pb-0">
              <span
                className={`absolute -left-[2.35rem] top-1.5 grid size-5 place-items-center rounded-full border-2 border-night-900 ${
                  i === 0 ? "bg-ember-500 shadow-[0_0_18px_rgba(232,147,58,0.6)]" : "bg-night-700"
                }`}
              />
              <div className={i === 0 ? "panel-tile rounded-2xl border-ember-400/30 p-6" : ""}>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember-300">{step.period}</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-fg">{step.title}</h3>
              <p className="text-sm text-fg-muted">{step.org}</p>
              <p className="mt-4 text-pretty text-fg-muted">{step.text}</p>
              {step.bullets && (
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {step.bullets.map((b) => (
                    <li key={b} className="flex gap-2 text-sm text-fg-muted">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ember-500" />
                      {b}
                    </li>
                  ))}
                </ul>
              )}
              </div>
            </m.li>
          ))}
        </m.ol>
      </div>
    </Section>
  );
}
