import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { LabActions, LabFrame, Plan } from "../components/LabViewer";
import { getBuild, type Build } from "../lib/lab";
import { trackView } from "../lib/beacon";

// Stand-alone page for a saved prototype: /lab/{id}. Shareable, full-height sandbox.
export default function LabPage() {
  const id = window.location.pathname.split("/")[2] ?? "";
  const [build, setBuild] = useState<Build | null | undefined>(undefined);

  useEffect(() => {
    trackView();
    getBuild(id).then(setBuild).catch(() => setBuild(null));
  }, [id]);

  return (
    <div className="min-h-screen bg-night-950 text-fg">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <a href="/" className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft className="size-4" /> havaljalal.se
        </a>
        <span className="font-mono text-xs text-fg-faint">AI Build Lab</span>
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-20">
        {build === undefined && <p className="text-fg-muted">Hämtar prototypen…</p>}
        {build === null && (
          <div className="py-20 text-center">
            <h1 className="text-2xl font-semibold">Prototypen hittades inte</h1>
            <p className="mt-2 text-fg-muted">Länken kan vara fel, eller så har prototypen tagits bort.</p>
          </div>
        )}
        {build && (
          <>
            <div className="mb-6">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember-300">Prototyp</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">{build.title}</h1>
              <p className="mt-1 text-fg-muted">Idé: {build.idea}</p>
            </div>
            <div className="grid min-w-0 gap-6 lg:grid-cols-[1.6fr_1fr]">
              <LabFrame build={build} height="h-[72vh]" />
              <div className="min-w-0 rounded-[1.25rem] border border-white/5 bg-night-900/60 p-5 md:p-7">
                {build.plan ? <Plan text={build.plan} /> : <p className="text-sm text-fg-muted">Ingen plan sparad för den här prototypen.</p>}
                <LabActions build={build} onUnlocked={() => setBuild({ ...build, unlocked: true })} />
                <p className="mt-6 text-xs text-fg-faint">
                  Byggd av AI-agenten på havaljalal.se. Vill du ha något liknande på riktigt? Haval bygger fullstack-lösningar i .NET och React.
                </p>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
