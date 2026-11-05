import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { MotionValue } from "motion/react";
import { NOISE } from "./noise";

type Props = { mouseX: MotionValue<number>; mouseY: MotionValue<number> };

const FRAG = /* glsl */ `
precision highp float;
${NOISE}
uniform float uTime;
uniform vec2 uRes;
uniform vec2 uMouse;
void main(){
  vec2 uv=gl_FragCoord.xy/uRes;
  vec2 p=uv; p.x*=uRes.x/uRes.y;
  float t=uTime*0.045;
  float n1=snoise(p*1.1+vec2(t,-t*0.7));
  float n2=snoise(p*1.9-vec2(t*0.6,t*0.4)+n1*0.55);
  float n3=snoise(p*0.65+vec2(-t*0.3,t*0.5)+n2*0.35);
  vec3 base=vec3(0.027,0.031,0.055);
  vec3 c1=vec3(0.25,0.42,1.0);
  vec3 c2=vec3(0.56,0.36,0.98);
  vec3 c3=vec3(0.30,0.86,0.96);
  float m1=smoothstep(0.25,0.95,n1*0.5+0.5);
  float m2=smoothstep(0.35,1.0,n2*0.5+0.5);
  float m3=smoothstep(0.6,1.0,n3*0.5+0.5);
  vec3 col=base;
  col+=c1*m1*0.34;
  col+=c2*m2*0.26;
  col+=c3*m3*0.22;
  // Light source above the fold, like a monitor glow behind the headline.
  float glow=exp(-length((uv-vec2(0.5,1.15))*vec2(1.3,1.0))*2.2);
  col+=vec3(0.36,0.46,1.0)*glow*0.22;
  // Soft light that follows the cursor.
  float ml=exp(-length((uv-uMouse)*vec2(uRes.x/uRes.y,1.0))*2.6);
  col+=c3*ml*0.10;
  col*=1.0-0.55*pow(length(uv-0.5),1.6);
  col+=(hash(gl_FragCoord.xy+fract(uTime))-0.5)*0.028;
  gl_FragColor=vec4(col,1.0);
}
`;

const VERT = /* glsl */ `
void main(){ gl_Position=vec4(position,1.0); }
`;

export default function Aurora({ mouseX, mouseY }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const uniforms = {
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    };
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms }));
    scene.add(quad);
    const resize = () => {
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      uniforms.uRes.value.set(canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clock = new THREE.Clock();
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!reduced) uniforms.uTime.value = clock.getElapsedTime();
      uniforms.uMouse.value.set(mouseX.get() * 0.5 + 0.5, 0.5 - mouseY.get() * 0.5);
      renderer.render(scene, camera);
    };
    frame();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      quad.geometry.dispose();
      (quad.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }, [mouseX, mouseY]);

  return (
    <div className="pointer-events-none fixed inset-0 h-screen overflow-hidden bg-[#070810]" aria-hidden>
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      {/* Fine dot grid, fading out toward the edges. */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.22) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(70% 60% at 50% 40%, #000 30%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(70% 60% at 50% 40%, #000 30%, transparent 100%)",
        }}
      />
    </div>
  );
}
