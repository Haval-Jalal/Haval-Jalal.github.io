// Cookie-free analytics: one tiny POST per page view, plus named events for interactions.
// No identifiers are stored client-side; the server derives a daily-rotating visitor hash.

function send(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/beacon", new Blob([body], { type: "application/json" }));
  } else {
    fetch("/api/beacon", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
  }
}

export function trackView() {
  send({
    p: location.pathname,
    r: document.referrer || undefined,
    w: window.innerWidth,
    l: navigator.language,
  });
}

export function trackEvent(name: string) {
  send({ p: location.pathname, e: name, w: window.innerWidth });
}
