import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { MotionValue } from "motion/react";
import { NOISE } from "./noise";

type Props = { mouseX: MotionValue<number>; mouseY: MotionValue<number> };

// Glowing wireframe landscape streaming toward the camera: the dune idea, translated into the digital world.
const VERT = /* glsl */ `
${NOISE}
uniform float uTime;
varying float vH;
varying float vD;
float terrain(vec2 p){
  vec2 q=p+vec2(0.0,uTime*2.2);
  float r=1.0-abs(snoise(q*0.045));
  float big=pow(r,1.5)*5.5;
  float mid=snoise(q*0.12+3.0)*1.1;
  float fine=snoise(q*0.35)*0.25;
  return big+mid+fine;
}
void main(){
  vec3 pos=position;
  pos.z=terrain(pos.xy);
  vH=pos.z;
  vec4 mv=modelViewMatrix*vec4(pos,1.0);
  vD=-mv.z;
  gl_Position=projectionMatrix*mv;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uDim;
uniform vec3 uGlow;
varying float vH;
varying float vD;
void main(){
  float h=smoothstep(-1.0,6.0,vH);
  vec3 col=mix(uDim,uGlow,pow(h,1.6));
  float fade=1.0-smoothstep(40.0,120.0,vD);
  float near=smoothstep(2.0,10.0,vD);
  gl_FragColor=vec4(col,fade*near*0.9);
}
`;

export default function Terrain({ mouseX, mouseY }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
    const uniforms = {
      uTime: { value: 0 },
      uDim: { value: new THREE.Color("#1a1210") },
      uGlow: { value: new THREE.Color("#f08a3c") },
    };
    const mobile = window.innerWidth < 768;
    const geo = new THREE.PlaneGeometry(160, 240, mobile ? 60 : 110, mobile ? 90 : 160);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, wireframe: true, transparent: true, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.z = -80;
    scene.add(mesh);

    const resize = () => {
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clock = new THREE.Clock();
    const look = new THREE.Vector3();
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!reduced) uniforms.uTime.value = clock.getElapsedTime();
      const mx = mouseX.get();
      const my = mouseY.get();
      camera.position.set(mx * 1.5, 9 + window.scrollY * 0.006 - my * 0.6, 20);
      look.set(mx * 4, 2.5 - my, -60);
      camera.lookAt(look);
      renderer.render(scene, camera);
    };
    frame();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      geo.dispose();
      (mesh.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }, [mouseX, mouseY]);

  return (
    <div className="pointer-events-none fixed inset-0 h-screen overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 50% at 50% 55%, rgba(240,138,60,0.14) 0%, rgba(240,138,60,0) 60%), linear-gradient(to bottom, #09080c 0%, #0c0a0e 60%, #120d0b 100%)",
        }}
      />
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 90% at 50% 50%, transparent 50%, rgba(0,0,0,0.6) 100%)" }}
      />
    </div>
  );
}
