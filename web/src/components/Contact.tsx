import { m } from "motion/react";
import { ArrowUpRight, CalendarDays, Check, FileDown, Linkedin, Loader2, Mail, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getBookingInfo } from "../lib/booking";
import { sendContact } from "../lib/posts";
import { trackEvent } from "../lib/beacon";
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
    ...(bookable ? [{ icon: CalendarDays, label: t("contact.book"), href: L("/boka"), sub: t("contact.book_sub") }] : []),
    { icon: FileDown, label: t("contact.cv"), href: `/api/cv.pdf?lang=${locale}`, sub: t("contact.cv_sub") },
  ];
  return (
    <section id="kontakt" className="surface-a relative text-fg">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(60% 50% at 50% 100%, rgba(232,147,58,0.14), transparent 70%)" }}
      />
      <div className="relative mx-auto max-w-6xl px-5 py-28 md:py-40">
        <m.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
          className="mx-auto max-w-3xl text-center"
        >
          <m.p variants={reveal} className="font-mono text-xs uppercase tracking-[0.22em] text-ember-300">
            {t("contact.eyebrow")}
          </m.p>
          <m.h2
            variants={reveal}
            className="mt-4 text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.025em] md:text-6xl"
          >
            {t("contact.title")} <span className="text-ember-300">{t("contact.title_accent")}</span>
          </m.h2>
          <m.p variants={reveal} className="mt-6 text-pretty text-lg text-fg-muted">
            {profile.tagline}
          </m.p>
        </m.div>

        <m.ul
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          variants={stagger}
          className="mx-auto mt-14 grid max-w-4xl gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {links.map(({ icon: Icon, label, href, sub }) => (
            <m.li key={label} variants={reveal}>
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
            </m.li>
          ))}
        </m.ul>


        <ContactForm bookable={bookable} />

        <footer className="mt-24 flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 text-xs text-fg-faint md:flex-row">
          <p>© {new Date().getFullYear()} {profile.name}. {t("contact.footer")}</p>
          <p className="flex items-center gap-4">
            <a href={L("/nu")} className="hover:text-fg">{t("form.footer_now")}</a>
            <a href={L("/changelog")} className="hover:text-fg">{t("form.footer_log")}</a>
            <span className="font-mono">{locale === "en" ? "Gothenburg" : "Göteborg"} · 57.7°N 11.9°E</span>
          </p>
        </footer>
      </div>
    </section>
  );
}

const field = "w-full rounded-xl border border-white/10 bg-night-900/80 px-3 py-2.5 text-sm text-fg placeholder:text-fg-faint focus:border-ember-400/60 focus:outline-none";

// Plain form: name, e-mail, message. Posts to the same lead endpoint as Build Lab, source "contact".
function ContactForm({ bookable }: { bookable: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  // "Fråga om detta" on a project card lands here with the project named, so the mail says
  // which project caught the visitor's eye.
  useEffect(() => {
    const onPrefill = (e: Event) => {
      setStatus("idle");
      setMessage(t("form.about").replace("{project}", (e as CustomEvent<string>).detail) + " ");
      window.setTimeout(() => {
        const el = messageRef.current;
        if (!el) return;
        el.focus({ preventScroll: true });
        el.setSelectionRange(el.value.length, el.value.length);
      }, 700);
    };
    window.addEventListener("contact:prefill", onPrefill);
    return () => window.removeEventListener("contact:prefill", onPrefill);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    try {
      await sendContact({ name, email, message, website });
      setStatus("done");
      trackEvent("contact_sent");
    } catch (err) {
      const code = (err as Error).message;
      setError(code === "rate_limited" || code === "429" ? t("err.rate_limited") : t("err.unknown"));
      setStatus("error");
    }
  };

  return (
    <m.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="panel-tile mx-auto mt-10 max-w-4xl rounded-3xl p-6 md:p-8"
    >
      {status === "done" ? (
        <div className="py-6 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
            <Check className="size-6" />
          </span>
          <p className="mt-4 text-lg font-medium text-fg">{t("form.done")}</p>
          {bookable && (
            <p className="mt-2 text-sm text-fg-muted">
              {t("form.done_sub")} <a href={L("/boka")} className="text-ember-300 hover:underline">{t("contact.book")}</a>
            </p>
          )}
          <button onClick={() => { setStatus("idle"); setMessage(""); }} className="mt-5 text-xs text-fg-muted hover:text-fg">{t("form.again")}</button>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
          <div>
            <h3 className="text-xl font-semibold tracking-tight text-fg">{t("form.title")}</h3>
            <p className="mt-2 text-sm text-fg-muted">{t("form.sub")}</p>
          </div>
          <div className="space-y-3">
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" aria-hidden="true" className="absolute -left-[9999px] h-px w-px opacity-0" />
            <div className="grid gap-3 sm:grid-cols-2">
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder={t("viewer.name")} autoComplete="name" className={field} />
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("viewer.email")} autoComplete="email" className={field} />
            </div>
            <textarea ref={messageRef} required value={message} onChange={(e) => setMessage(e.target.value)} rows={4} placeholder={t("form.message")} className={field} />
            {error && <p className="text-xs text-red-300">{error}</p>}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-fg-faint">{t("book.privacy")}</p>
              <button
                type="submit"
                disabled={status === "sending"}
                className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-5 py-2.5 text-sm font-medium text-night-950 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
              >
                {status === "sending" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {status === "sending" ? t("form.sending") : t("form.send")}
              </button>
            </div>
          </div>
        </form>
      )}
    </m.div>
  );
}
