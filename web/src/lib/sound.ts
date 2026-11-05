// Tiny synthesised sound layer: no audio files, everything is generated with Web Audio.
// Nothing plays until the visitor enables sound (browsers block autoplay anyway).

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let ambient: { gain: GainNode; stop: () => void } | null = null;
let enabled = false;

function ensureContext() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return { ctx, master: master! };
}

export function isSoundEnabled() {
  return enabled;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (on) {
    ensureContext();
    startAmbient();
    click();
  } else {
    stopAmbient();
  }
}

// Soft tick on hover: a short, quiet sine blip.
export function hover() {
  if (!enabled) return;
  const { ctx, master } = ensureContext();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1400, t);
  osc.frequency.exponentialRampToValueAtTime(900, t + 0.05);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.025, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + 0.07);
}

// Click: two quick, slightly detuned pulses, like a soft mechanical key.
export function click() {
  if (!enabled) return;
  const { ctx, master } = ensureContext();
  const t = ctx.currentTime;
  [660, 440].forEach((f, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(f, t + i * 0.03);
    g.gain.setValueAtTime(0.0001, t + i * 0.03);
    g.gain.exponentialRampToValueAtTime(0.05, t + i * 0.03 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.03 + 0.09);
    osc.connect(g).connect(master);
    osc.start(t + i * 0.03);
    osc.stop(t + i * 0.03 + 0.1);
  });
}

// Ambient: filtered noise with a slow, wandering cutoff = wind over sand.
function startAmbient() {
  if (ambient) return;
  const { ctx, master } = ensureContext();
  const seconds = 4;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Brown-ish noise: integrate white noise, keep it bounded.
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 420;
  filter.Q.value = 0.7;

  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.type = "sine";
  lfo.frequency.value = 0.07;
  lfoGain.gain.value = 260;
  lfo.connect(lfoGain).connect(filter.frequency);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 2.5);

  src.connect(filter).connect(gain).connect(master);
  src.start();
  lfo.start();

  ambient = {
    gain,
    stop: () => {
      src.stop();
      lfo.stop();
    },
  };
}

function stopAmbient() {
  if (!ambient || !ctx) return;
  const a = ambient;
  ambient = null;
  a.gain.gain.cancelScheduledValues(ctx.currentTime);
  a.gain.gain.setValueAtTime(a.gain.gain.value, ctx.currentTime);
  a.gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
  setTimeout(a.stop, 1300);
}

// Wire hover/click sounds to every link and button on the page, once.
export function attachGlobalSfx() {
  const isTarget = (e: Event) => (e.target as HTMLElement | null)?.closest("a, button, [data-sfx]");
  const onOver = (e: PointerEvent) => {
    const el = isTarget(e);
    if (el && !el.hasAttribute("data-sfx-hovered")) {
      el.setAttribute("data-sfx-hovered", "");
      el.addEventListener("pointerleave", () => el.removeAttribute("data-sfx-hovered"), { once: true });
      hover();
    }
  };
  const onClick = (e: MouseEvent) => {
    if (isTarget(e)) click();
  };
  document.addEventListener("pointerover", onOver);
  document.addEventListener("click", onClick);
  return () => {
    document.removeEventListener("pointerover", onOver);
    document.removeEventListener("click", onClick);
  };
}
