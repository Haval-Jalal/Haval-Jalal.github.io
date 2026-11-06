import { useEffect, useState } from "react";
import { ExternalLink, Lock, LockOpen, Star, StarOff } from "lucide-react";
import { listRecentBuilds, setFeatured, type AdminBuild } from "../lib/lab";

// Every prototype visitors have built, newest first. The star puts it in the public gallery.
export default function Builds() {
  const [items, setItems] = useState<AdminBuild[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => listRecentBuilds().then(setItems).catch((e: Error) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const toggle = async (b: AdminBuild) => {
    setBusy(b.id);
    try {
      await setFeatured(b.id, !b.featured);
      setItems((list) => list?.map((x) => (x.id === b.id ? { ...x, featured: !b.featured } : x)) ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (error) return <p className="text-red-300">{error}</p>;
  if (!items) return <p className="text-fg-muted">Hämtar…</p>;
  const featured = items.filter((b) => b.featured).length;

  return (
    <div className="max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Build Lab</h1>
          <p className="text-sm text-fg-muted">Allt besökare byggt. Stjärnmärk de bästa så visas de i galleriet "Byggt av besökare" på sajten.</p>
        </div>
        <div className="panel-tile rounded-xl px-4 py-2 text-xs text-fg-muted">
          {items.length} prototyper · <span className="text-ember-300">{featured} i galleriet</span>
        </div>
      </header>
      {items.length === 0 ? (
        <p className="text-sm text-fg-faint">Inga prototyper ännu.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((b) => (
            <li key={b.id} className={`panel-tile flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 ${b.featured ? "border-ember-400/40" : ""}`}>
              <button
                onClick={() => toggle(b)}
                disabled={busy === b.id}
                title={b.featured ? "Ta bort från galleriet" : "Visa i galleriet"}
                className={`grid size-9 shrink-0 place-items-center rounded-lg transition-colors disabled:opacity-50 ${b.featured ? "bg-ember-500 text-night-950" : "bg-white/[0.05] text-fg-muted hover:text-fg"}`}
              >
                {b.featured ? <Star className="size-4" /> : <StarOff className="size-4" />}
              </button>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-fg">{b.title}</span>
                  {b.truncated && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-200">avklippt</span>}
                  {b.unlocked ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300"><LockOpen className="size-3" /> {b.contactName}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-fg-muted"><Lock className="size-3" /> låst</span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-xs text-fg-muted">{b.idea}</span>
                <span className="block font-mono text-[11px] text-fg-faint">
                  {new Date(b.ts).toLocaleString("sv-SE")} · {b.model} · {b.id}
                </span>
              </span>
              <a href={`/lab/${b.id}`} target="_blank" rel="noreferrer" title="Öppna" className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-white/[0.06] hover:text-fg">
                <ExternalLink className="size-4" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
