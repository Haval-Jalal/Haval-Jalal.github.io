import { useEffect, useRef } from "react";
import type { MotionValue } from "motion/react";

type Props = { mouseX: MotionValue<number>; mouseY: MotionValue<number> };

type Node = { x: number; y: number; vx: number; vy: number; r: number };
type Packet = { a: number; b: number; t: number; speed: number };

// Drifting nodes with proximity links and "packets" travelling along them. Canvas 2D, cheap.
export default function Network({ mouseX, mouseY }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio, 1.5);
    let w = 0;
    let h = 0;
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const count = w < 768 ? 55 : 120;
    const nodes: Node[] = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: 1 + Math.random() * 1.6,
    }));
    const packets: Packet[] = [];
    const LINK = w < 768 ? 120 : 150;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const mx = (mouseX.get() * 0.5 + 0.5) * w;
      const my = (mouseY.get() * 0.5 + 0.5) * h;

      ctx.clearRect(0, 0, w, h);

      if (!reduced) {
        for (const n of nodes) {
          // Gentle pull toward the cursor, so the field "notices" the visitor.
          const dx = mx - n.x;
          const dy = my - n.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 260 * 260) {
            n.vx += (dx / Math.sqrt(d2 + 1)) * 0.004;
            n.vy += (dy / Math.sqrt(d2 + 1)) * 0.004;
          }
          n.vx *= 0.995;
          n.vy *= 0.995;
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < -20) n.x = w + 20;
          if (n.x > w + 20) n.x = -20;
          if (n.y < -20) n.y = h + 20;
          if (n.y > h + 20) n.y = -20;
        }
      }

      // Links.
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < LINK) {
            const alpha = (1 - d / LINK) * 0.35;
            ctx.strokeStyle = `rgba(103,232,249,${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            if (!reduced && packets.length < 14 && Math.random() < 0.0015) packets.push({ a: i, b: j, t: 0, speed: 0.006 + Math.random() * 0.01 });
          }
        }
      }

      // Packets.
      for (let k = packets.length - 1; k >= 0; k--) {
        const p = packets[k];
        p.t += p.speed;
        if (p.t >= 1) {
          packets.splice(k, 1);
          continue;
        }
        const a = nodes[p.a];
        const b = nodes[p.b];
        const x = a.x + (b.x - a.x) * p.t;
        const y = a.y + (b.y - a.y) * p.t;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 8);
        g.addColorStop(0, "rgba(255,255,255,0.9)");
        g.addColorStop(0.3, "rgba(103,232,249,0.6)");
        g.addColorStop(1, "rgba(103,232,249,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
      }

      // Nodes.
      for (const n of nodes) {
        ctx.fillStyle = "rgba(190,240,250,0.85)";
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    frame();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [mouseX, mouseY]);

  return (
    <div className="pointer-events-none fixed inset-0 h-screen overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(80% 60% at 50% 0%, #0d1b2a 0%, #070b12 55%, #05070c 100%)",
        }}
      />
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 90% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)" }}
      />
    </div>
  );
}
