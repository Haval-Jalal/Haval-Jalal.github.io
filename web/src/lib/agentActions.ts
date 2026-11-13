// Things Javal can do on the page. The API validates every action; this only moves the page.
export type AgentAction = { type: string; args: Record<string, string> };

const CLOSE_EVENT = "hj:agent-close";

function scrollTo(el: Element | null) {
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  return true;
}

function flash(el: Element | null) {
  if (!(el instanceof HTMLElement)) return;
  el.classList.add("agent-flash");
  window.setTimeout(() => el.classList.remove("agent-flash"), 2600);
}

// Returns true when the page moved somewhere, so a bottom-sheet chat on a phone can get out of the way.
export function runAgentActions(actions: AgentAction[]): boolean {
  let moved = false;
  for (const a of actions) {
    switch (a.type) {
      case "show_project": {
        const el = document.getElementById(`projekt-${a.args.slug}`);
        if (scrollTo(el)) { flash(el); moved = true; }
        break;
      }
      case "open_section": {
        if (scrollTo(document.getElementById(a.args.section))) moved = true;
        break;
      }
      case "prefill_build_lab": {
        window.dispatchEvent(new CustomEvent("lab:prefill", { detail: a.args.idea }));
        if (scrollTo(document.getElementById("build-lab"))) moved = true;
        break;
      }
      case "open_contact": {
        window.dispatchEvent(new CustomEvent("contact:prefill", { detail: { text: a.args.message ?? "" } }));
        if (scrollTo(document.getElementById("kontakt"))) moved = true;
        break;
      }
      // offer_cv is rendered as a button in the chat bubble, nothing to do here.
    }
  }
  if (moved && window.innerWidth < 640) window.dispatchEvent(new Event(CLOSE_EVENT));
  return moved;
}

export function onAgentClose(handler: () => void) {
  window.addEventListener(CLOSE_EVENT, handler);
  return () => window.removeEventListener(CLOSE_EVENT, handler);
}
