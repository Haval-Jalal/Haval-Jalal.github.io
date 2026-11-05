import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { MotionValue } from "motion/react";

type Props = {
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
};

// GLSL 2D simplex noise (Ian McEwan, Ashima Arts, MIT).
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
float snoise(vec2 v){
  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i=floor(v+dot(v,C.yy));
  vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
  vec4 x12=x0.xyxy+C.xxzz;
  x12.xy-=i1;
  i=mod289(i);
  vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
  m=m*m; m=m*m;
  vec3 x=2.0*fract(p*C.www)-1.0;
  vec3 h=abs(x)-0.5;
  vec3 ox=floor(x+0.5);
  vec3 a0=x-ox;
  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
  vec3 g;
  g.x=a0.x*x0.x+h.x*x0.y;
  g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.0*dot(m,g);
}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
`;

// Dune heightfield: ridged noise for the big bodies, softer noise for undulation,
// wind ripples on top. uTime drifts the field so the sand slowly migrates.
const HEIGHT = /* glsl */ `
uniform float uTime;
float dunes(vec2 p){
  vec2 q=vec2(p.x*0.5,p.y*0.8);
  float r=1.0-abs(snoise(q*0.05+vec2(uTime*0.0035,0.0)));
  r=pow(r,1.35);
  float big=r*3.2;
  // Secondary dunes, stretched along the wind so they read as drifts, not mounds.
  float mid=snoise(vec2(p.x*0.045,p.y*0.11)+vec2(7.0,3.0)+uTime*0.004)*0.6;
  float fine=snoise(vec2(p.x*0.25,p.y*0.6))*0.06;
  float ripple=sin((p.x*0.65+p.y*2.3)*2.4+snoise(p*0.7)*2.2+uTime*0.15)*0.03;
  return big+mid+fine+ripple;
}
`;

const SAND_VERT = /* glsl */ `
${NOISE}
${HEIGHT}
varying vec3 vWorld;
varying vec3 vNormal;
varying float vHeight;
void main(){
  vec3 pos=position;
  float h=dunes(pos.xy);
  float e=0.18;
  float hx=dunes(pos.xy+vec2(e,0.0));
  float hy=dunes(pos.xy+vec2(0.0,e));
  pos.z=h;
  vec3 n=normalize(vec3(h-hx,h-hy,e));
  vNormal=normalize(normalMatrix*n);
  vHeight=h;
  vec4 world=modelMatrix*vec4(pos,1.0);
  vWorld=world.xyz;
  gl_Position=projectionMatrix*viewMatrix*world;
}
`;

const SAND_FRAG = /* glsl */ `
precision highp float;
${NOISE}
uniform float uTime;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uHaze;
uniform vec3 uSun;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vHeight;
void main(){
  vec3 n=normalize(vNormal);
  vec3 sun=normalize(uSun);
  float ndl=dot(n,sun);
  float wrap=clamp(ndl*0.42+0.6,0.0,1.0);
  float diff=clamp(ndl,0.0,1.0);
  vec3 col=mix(uShade,uLit,smoothstep(0.1,0.95,wrap));
  // Warm rim where the crest catches the low sun.
  col+=vec3(1.0,0.86,0.62)*pow(diff,4.0)*0.28;
  // Height-based deepening in the troughs.
  col*=mix(0.82,1.0,smoothstep(-0.5,3.5,vHeight));
  // Sand glints.
  float g=hash(floor(vWorld.xz*150.0)+floor(uTime*0.0));
  col+=step(0.992,g)*pow(diff,1.5)*0.55;
  // Film grain, animated.
  col+=(hash(gl_FragCoord.xy*0.5+fract(uTime)*10.0)-0.5)*0.05;
  // Distance haze fades into the CSS sky behind the canvas.
  float d=length(vWorld-cameraPosition);
  float fog=1.0-exp(-d*0.034);
  col=mix(col,uHaze,fog);
  float alpha=1.0-smoothstep(0.8,0.98,fog);
  gl_FragColor=vec4(col,alpha);
}
`;

const DUST_VERT = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
attribute float aSeed;
varying float vAlpha;
void main(){
  vec3 p=position;
  float t=uTime*(1.6+aSeed*1.2);
  p.x=mod(p.x+t+sin(uTime*0.7+aSeed*6.28)*0.6,80.0)-40.0;
  p.y+=sin(uTime*0.9+aSeed*9.0)*0.25;
  vec4 mv=modelViewMatrix*vec4(p,1.0);
  float dist=-mv.z;
  gl_PointSize=(1.2+aSeed*1.6)*uPixelRatio*(18.0/max(dist,1.0));
  vAlpha=(0.25+aSeed*0.3)*smoothstep(70.0,20.0,dist);
  gl_Position=projectionMatrix*mv;
}
`;

const DUST_FRAG = /* glsl */ `
precision highp float;
varying float vAlpha;
void main(){
  vec2 c=gl_PointCoord-0.5;
  float r=dot(c,c);
  if(r>0.25)discard;
  float a=vAlpha*smoothstep(0.25,0.0,r);
  gl_FragColor=vec4(0.98,0.88,0.70,a);
}
`;

export default function DunesLive({ mouseX, mouseY }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.innerWidth < 768;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.25 : 1.75));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    const camBase = new THREE.Vector3(0, 7.5, 14);
    camera.position.copy(camBase);

    const uniforms = {
      uTime: { value: 0 },
      uLit: { value: new THREE.Color("#e9c795") },
      uShade: { value: new THREE.Color("#8f6436") },
      uHaze: { value: new THREE.Color("#f0e1c8") },
      uSun: { value: new THREE.Vector3(-0.75, 0.45, -0.45) },
    };

    const seg = mobile ? 160 : 300;
    const geo = new THREE.PlaneGeometry(150, 150, seg, seg);
    const sand = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({ vertexShader: SAND_VERT, fragmentShader: SAND_FRAG, uniforms, transparent: true }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.z = -40;
    scene.add(sand);

    // Wind-blown grains.
    const count = mobile ? 400 : 1100;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 80;
      positions[i * 3 + 1] = Math.random() * 7 + 0.5;
      positions[i * 3 + 2] = -Math.random() * 60 + 8;
      seeds[i] = Math.random();
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    dustGeo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    const dustUniforms = { uTime: uniforms.uTime, uPixelRatio: { value: renderer.getPixelRatio() } };
    const dust = new THREE.Points(
      dustGeo,
      new THREE.ShaderMaterial({
        vertexShader: DUST_VERT,
        fragmentShader: DUST_FRAG,
        uniforms: dustUniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    scene.add(dust);

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    const clock = new THREE.Clock();
    const look = new THREE.Vector3();
    let raf = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0 });
    io.observe(canvas);

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      if (!reduced) uniforms.uTime.value = clock.getElapsedTime();

      const mx = mouseX.get();
      const my = mouseY.get();
      const scroll = window.scrollY;
      camera.position.set(camBase.x + mx * 0.8, camBase.y + scroll * 0.004 - my * 0.3, camBase.z);
      look.set(mx * 2.5, 3.6 - my * 0.8 - scroll * 0.002, -30);
      camera.lookAt(look);
      renderer.render(scene, camera);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", resize);
      geo.dispose();
      dustGeo.dispose();
      (sand.material as THREE.Material).dispose();
      (dust.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }, [mouseX, mouseY]);

  return (
    <div className="pointer-events-none fixed inset-0 h-screen overflow-hidden" aria-hidden>
      {/* Sky behind the canvas; the shader's haze fades into these colours. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(110% 80% at 22% -5%, #fdf7ea 0%, #f6ebd6 30%, #efe0c6 60%, #e6d2b2 100%)",
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* Warm vignette. */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(120% 90% at 50% 45%, rgba(70,45,20,0) 60%, rgba(70,45,20,0.18) 100%)",
        }}
      />
    </div>
  );
}
