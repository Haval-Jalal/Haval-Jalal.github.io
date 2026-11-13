import { useState, type FormEvent } from "react";
import { Check, Copy, Download, ExternalLink, Linkedin, Send, X } from "lucide-react";
import { AgentError, friendlyError } from "../lib/agent";
import { downloadUrl, linkedInShareUrl, shareUrl, unlockBuild, type Build } from "../lib/lab";
import { trackEvent } from "../lib/beacon";
import { L, locale, t } from "../lib/i18n";

const input = "rounded-xl border border-white/10 bg-night-900 px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:border-ember-400/60 focus:outline-none";

// The finished prototype: sandbox, plan and the gated download. Shared by the Build Lab section
// and the stand-alone /lab/{id} page.
// onClose (Build Lab only): closes the prototype and returns the lab to the empty idea box.
export function LabFrame({ build, height = "h-[520px]", onClose }: { build: Build; height?: string; onClose?: () => void }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-[1.25rem] border border-white/5 bg-night-950">
      <div className="flex items-center gap-1.5 border-b border-white/5 bg-[#111] px-3 py-2">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 truncate font-mono text-[11px] text-white/50">{build.title} · {t("viewer.sandbox")}</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("viewer.close")}
            title={t("viewer.close")}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[11px] text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="size-3.5" />
            <span className="hidden sm:inline">{t("viewer.close")}</span>
          </button>
        )}
      </div>
      {/* key = id: the document is mounted exactly once, so clicks inside never trigger a reload. */}
      <iframe key={build.id} title={build.title} sandbox="allow-scripts" srcDoc={build.html} className={`${height} w-full bg-night-950`} />
    </div>
  );
}

export function LabActions({ build, onUnlocked }: { build: Build; onUnlocked: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl(build.id));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        {build.unlocked ? (
          <a
            href={downloadUrl(build.id)}
            download
            onClick={() => trackEvent("lab_download")}
            className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-medium text-night-950"
          >
            <Download className="size-4" /> {t("viewer.download_html")}
          </a>
        ) : (
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-medium text-night-950"
          >
            <Download className="size-4" /> {t("viewer.download_code")}
          </button>
        )}
        <button type="button" onClick={copy} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-fg-muted hover:text-fg">
          {copied ? <Check className="size-4 text-emerald-300" /> : <Copy className="size-4" />}
          {copied ? t("viewer.copied") : t("viewer.copy")}
        </button>
        <a href={L(`/lab/${build.id}`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-fg-muted hover:text-fg">
          <ExternalLink className="size-4" /> {t("viewer.fullscreen")}
        </a>
        <a
          href={linkedInShareUrl(build.id, locale)}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackEvent("lab_share_linkedin")}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-fg-muted hover:text-fg"
        >
          <Linkedin className="size-4" /> {t("viewer.linkedin")}
        </a>
      </div>
      {showForm && !build.unlocked && <UnlockForm build={build} onUnlocked={onUnlocked} />}
    </div>
  );
}

// Name + e-mail (phone and message optional) unlocks the download and sends Haval a copy.
export function UnlockForm({ build, onUnlocked }: { build: Build; onUnlocked: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    try {
      await unlockBuild(build.id, { name, email, phone, message, website });
      trackEvent("lab_unlock");
      onUnlocked();
      // Start the download right away; the button stays for later.
      window.location.href = downloadUrl(build.id);
    } catch (err) {
      setError(friendlyError(err instanceof AgentError ? err.code : "unknown"));
      setStatus("error");
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <p className="text-sm font-medium text-fg">{t("viewer.unlock_title")}</p>
        <p className="mt-1 text-xs text-fg-muted">{t("viewer.unlock_sub")}</p>
      </div>
      <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" aria-hidden="true" className="absolute -left-[9999px] h-px w-px opacity-0" />
      <input required value={name} onChange={(e) => setName(e.target.value)} placeholder={t("viewer.name")} className={input} />
      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("viewer.email")} className={input} />
      <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("viewer.phone")} className={input} />
      <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("viewer.message")} className={input} />
      <div className="flex items-center justify-between gap-3 sm:col-span-2">
        <span className="text-xs text-fg-faint">{status === "error" ? <span className="text-red-300">{error}</span> : t("viewer.no_spam")}</span>
        <button type="submit" disabled={status === "sending"} className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-medium text-night-950 disabled:opacity-40">
          <Send className="size-4" /> {status === "sending" ? t("viewer.sending") : t("viewer.unlock")}
        </button>
      </div>
    </form>
  );
}

// Minimal markdown: headings, bullets, paragraphs.
export function Plan({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <div className="space-y-2 text-sm text-fg-muted">
      {lines.map((l, i) => {
        if (/^#{1,3}\s/.test(l) || (i === 0 && !l.startsWith("-"))) {
          return (
            <p key={i} className="text-base font-semibold text-fg">
              {l.replace(/^#{1,3}\s/, "").replace(/\*\*/g, "")}
            </p>
          );
        }
        if (/^[-*•]\s/.test(l)) {
          return (
            <p key={i} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ember-500" />
              <span>{l.replace(/^[-*•]\s/, "").replace(/\*\*/g, "")}</span>
            </p>
          );
        }
        return <p key={i}>{l.replace(/\*\*/g, "")}</p>;
      })}
    </div>
  );
}
