import { m, useScroll, useTransform, type MotionValue } from "motion/react";

type Layer = {
  d: string;
  lit: string; // sun-facing slope
  shade: string; // slope turned away from the sun
  base: string; // bottom of the dune, in the trough
  ridge: string;
  depth: number; // 0 = horizon, 1 = foreground; drives parallax speed
};

// Four dune ridges, far to near. Shapes are hand-drawn beziers in a 1440x900 box.
// The sun sits upper-left, so every dune is lit on the left and shaded to the right.
const LAYERS: Layer[] = [
  {
    d: "M0 430 C 200 380, 380 420, 600 370 C 820 325, 1040 410, 1440 345 L1440 900 L0 900 Z",
    lit: "#e9d3ab",
    shade: "#cfae7c",
    base: "#c4a06e",
    ridge: "#fff4de",
    depth: 0.12,
  },
  {
    d: "M0 560 C 180 500, 380 555, 560 500 C 760 445, 920 560, 1120 505 C 1270 465, 1370 540, 1440 480 L1440 900 L0 900 Z",
    lit: "#dfbc84",
    shade: "#b2864f",
    base: "#a47a47",
    ridge: "#fbe9c9",
    depth: 0.3,
  },
  {
    d: "M0 690 C 170 655, 300 735, 520 670 C 700 615, 830 715, 1010 685 C 1200 650, 1320 740, 1440 665 L1440 900 L0 900 Z",
    lit: "#d1a46a",
    shade: "#99692f",
    base: "#875b2b",
    ridge: "#f6dfb6",
    depth: 0.58,
  },
  {
    d: "M0 830 C 240 750, 460 840, 720 785 C 940 740, 1180 850, 1440 770 L1440 900 L0 900 Z",
    lit: "#c08c53",
    shade: "#7d5128",
    base: "#5e3d1f",
    ridge: "#efd3a6",
    depth: 1,
  },
];

type Props = {
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
};

export default function Dunes({ mouseX, mouseY }: Props) {
  const { scrollY } = useScroll();

  return (
    <div className="pointer-events-none fixed inset-0 h-screen overflow-hidden" aria-hidden>
      {/* Sky: warm haze, brightest where the low sun sits. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(110% 75% at 22% -5%, #fcf5e8 0%, #f4e7d1 30%, #ead7b6 62%, #dcc094 100%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(45% 40% at 24% 6%, rgba(255,246,224,0.95), rgba(255,246,224,0) 70%)",
        }}
      />

      <svg className="absolute size-0">
        <defs>
          {/* Roughens dune edges and surfaces so they read as sand, not vector. */}
          <filter id="sand-rough" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="3" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <filter id="sand-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="3" result="g" />
            <feColorMatrix in="g" type="saturate" values="0" result="gray" />
            <feComponentTransfer in="gray" result="soft">
              <feFuncA type="table" tableValues="0 0.18" />
            </feComponentTransfer>
            <feComposite in="soft" in2="SourceGraphic" operator="in" />
          </filter>
        </defs>
      </svg>

      {LAYERS.map((layer, i) => (
        <DuneLayer key={i} layer={layer} index={i} scrollY={scrollY} mouseX={mouseX} mouseY={mouseY} />
      ))}

      {/* Thin heat haze on the horizon and a warm vignette in the corners. */}
      <div
        className="absolute inset-x-0 top-[34%] h-24"
        style={{
          background:
            "linear-gradient(to bottom, rgba(250,241,226,0) 0%, rgba(250,241,226,0.28) 50%, rgba(250,241,226,0) 100%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 45%, rgba(70,45,20,0) 60%, rgba(70,45,20,0.16) 100%)",
        }}
      />
    </div>
  );
}

function DuneLayer({
  layer,
  index,
  scrollY,
  mouseX,
  mouseY,
}: {
  layer: Layer;
  index: number;
  scrollY: MotionValue<number>;
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
}) {
  // Near layers move faster on scroll (and in the opposite direction of the content).
  const y = useTransform(scrollY, [0, 900], [0, -120 * layer.depth]);
  const x = useTransform(mouseX, [-1, 1], [18 * layer.depth, -18 * layer.depth]);
  const yMouse = useTransform(mouseY, [-1, 1], [8 * layer.depth, -8 * layer.depth]);
  const id = `dune-${index}`;
  const crest = layer.d.split(" L")[0];

  return (
    <m.svg
      viewBox="0 0 1440 900"
      // Stretch to the viewport so the composition (sky/dune split) is the same on every screen.
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full"
      style={{ y, x, translateY: yMouse, scale: 1.05 }}
    >
      <defs>
        {/* Lit slope on the left fading to the shaded slope on the right. */}
        <linearGradient id={`${id}-slope`} x1="0" y1="0" x2="1" y2="0.25">
          <stop offset="0" stopColor={layer.lit} />
          <stop offset="0.45" stopColor={layer.lit} />
          <stop offset="0.75" stopColor={layer.shade} />
          <stop offset="1" stopColor={layer.shade} />
        </linearGradient>
        {/* Crest is brightest, trough darkest. */}
        <linearGradient id={`${id}-height`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3dc" stopOpacity={0.35} />
          <stop offset="0.25" stopColor="#fff3dc" stopOpacity={0} />
          <stop offset="0.7" stopColor={layer.base} stopOpacity={0} />
          <stop offset="1" stopColor={layer.base} stopOpacity={0.9} />
        </linearGradient>
        {/* Ridge glow: the backlit edge seen in the reference footage. */}
        <linearGradient id={`${id}-ridge`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={layer.ridge} stopOpacity="0.15" />
          <stop offset="0.4" stopColor={layer.ridge} stopOpacity="0.9" />
          <stop offset="0.8" stopColor={layer.ridge} stopOpacity="0.5" />
          <stop offset="1" stopColor={layer.ridge} stopOpacity="0.1" />
        </linearGradient>
        <filter id={`${id}-haze`}>
          <feGaussianBlur stdDeviation={Math.max(0, 1.1 - layer.depth * 1.1)} />
        </filter>
        <filter id={`${id}-glow`}>
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>

      <g filter={layer.depth < 0.4 ? `url(#${id}-haze)` : undefined}>
        <g filter="url(#sand-rough)">
          <path d={layer.d} fill={`url(#${id}-slope)`} />
          <path d={layer.d} fill={`url(#${id}-height)`} />
        </g>
        <path d={layer.d} fill="#000" filter="url(#sand-grain)" opacity={0.35 + layer.depth * 0.4} />
        <path
          d={crest}
          fill="none"
          stroke={layer.ridge}
          strokeWidth={6 + layer.depth * 6}
          strokeOpacity={0.35}
          filter={`url(#${id}-glow)`}
        />
        <path d={crest} fill="none" stroke={`url(#${id}-ridge)`} strokeWidth={1.1 + layer.depth * 0.9} strokeLinecap="round" />
      </g>
    </m.svg>
  );
}
