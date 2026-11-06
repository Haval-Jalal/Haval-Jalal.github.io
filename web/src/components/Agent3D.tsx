import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { AgentFace } from "./Agent";

export type Mood = "idle" | "thinking" | "speaking" | "happy";

export type IntroPhase = "buried" | "jump" | "shake" | "reveal" | "present" | "done";
type Props = { mood?: Mood; size?: number; className?: string; bounce?: number; intro?: boolean; onPhase?: (phase: IntroPhase) => void };

// Digital Haval as a little 3D character: a glossy dark sphere with an ember core, big glowing
// eyes that look at the pointer, a rotating ring of light, squash-and-stretch when touched,
// particles when it thinks and pulses when it speaks. Falls back to the SVG face without WebGL.
// A tiny studio for the reflections: warm ember panels, one cool panel, a thin white strip, dark otherwise.
function emberStudio(): THREE.Scene {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x05040a);
  const panel = (color: number, intensity: number, w: number, h: number, pos: [number, number, number], look: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...look);
    env.add(m);
  };
  panel(0xff8a3a, 6, 6, 3, [-6, -3, 2], [0, 0, 0]);   // ember from below-left
  panel(0xffb060, 3, 2, 8, [5, -1, -3], [0, 0, 0]);   // warm back-right
  panel(0x9bb8ff, 2.5, 3, 3, [4, 5, 2], [0, 0, 0]);   // cool key top-right
  panel(0xffffff, 4, 8, 0.6, [0, 7, 1], [0, 0, 0]);   // thin highlight strip above
  return env;
}

// Soft glowing blob: opaque (so the glass transmission pass sees it) but fades to black at the rim.
function glowMaterial(color: number, intensity: number, power: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uPower: { value: power } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uIntensity; uniform float uPower;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = pow(max(dot(normalize(vN), normalize(vV)), 0.0), uPower);
        gl_FragColor = vec4(uColor * f * uIntensity, 1.0);
      }`,
  });
}

export default function Agent3D({ mood = "idle", size = 68, className = "", bounce = 0, intro = false, onPhase }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const moodRef = useRef<Mood>(mood);
  const bounceRef = useRef(0);
  const phaseRef = useRef(onPhase);
  const [webgl, setWebgl] = useState(true);
  moodRef.current = mood;
  phaseRef.current = onPhase;

  useEffect(() => {
    if (bounce > 0) bounceRef.current = 1;
  }, [bounce]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      setWebgl(false);
      return;
    }
    const pad = 2.1; // canvas is this many times the character's size, centred on it
    const px = Math.round(size * pad);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(px, px);
    Object.assign(renderer.domElement.style, { position: "absolute", left: `${(size - px) / 2}px`, top: `${(size - px) / 2}px`, pointerEvents: "none" });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
    camera.position.set(0, 0.05, 4.6 * pad);

    // Soft studio reflections for the glass, plus a warm and a cool light for shape.
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(emberStudio(), 0.04).texture;
    pmrem.dispose();
    scene.add(new THREE.AmbientLight(0xffe2c4, 0.25));
    const warm = new THREE.PointLight(0xff9a3c, 6, 10, 2);
    warm.position.set(-1.8, -1.4, 2.4);
    scene.add(warm);
    const cool = new THREE.DirectionalLight(0xbfd4ff, 0.9);
    cool.position.set(1.6, 2.2, 1.2);
    scene.add(cool);

    const head = new THREE.Group();
    scene.add(head);

    // Body: smoky glass. Everything inside shows through, tinted ember.
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 64),
      new THREE.MeshPhysicalMaterial({
        color: 0x5a3f33, roughness: 0.03, metalness: 0, transmission: 0.9, thickness: 0.8, ior: 1.4,
        attenuationColor: new THREE.Color(0xff9a4a), attenuationDistance: 2.2,
        clearcoat: 0.9, clearcoatRoughness: 0.06, envMapIntensity: 1,
      }),
    );
    head.add(body);

    // Ember heart: a glowing core low in the sphere, a brighter plasma blob that drifts, and sparks.
    const coreMat = glowMaterial(0xff5a12, 1.7, 1.6);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.62, 32, 32), coreMat);
    core.position.set(0, -0.38, -0.05);
    head.add(core);
    const plasmaMat = glowMaterial(0xffa040, 1.5, 2.2);
    const plasma = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 24), plasmaMat);
    plasma.position.set(-0.2, -0.45, 0.25);
    head.add(plasma);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xfff1dc });
    const sparks: { m: THREE.Mesh; a: number; r: number; h: number; sp: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.025 + Math.random() * 0.02, 8, 8), sparkMat);
      head.add(m);
      sparks.push({ m, a: Math.random() * Math.PI * 2, r: 0.3 + Math.random() * 0.35, h: -0.6 + Math.random() * 0.8, sp: 0.4 + Math.random() * 0.6 });
    }

    // Eyes: glowing capsules + white highlight
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xfff6ea, emissive: 0xffc070, emissiveIntensity: 3.2, roughness: 0.3, depthTest: false, transparent: true });
    const hiMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true });
    const eyes: THREE.Group[] = [];
    for (const x of [-0.3, 0.3]) {
      const g = new THREE.Group();
      const eye = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.07, 8, 20), eyeMat);
      const hi = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), hiMat);
      hi.position.set(0.055, 0.07, 0.14);
      eye.renderOrder = 10;
      hi.renderOrder = 11;
      g.add(eye, hi);
      g.position.set(x, 0.14, 0.8);
      g.lookAt(x * 2.2, 0.3, 4);
      head.add(g);
      eyes.push(g);
    }
    // Happy arcs (eyes become smiling curves)
    const arcMat = new THREE.MeshBasicMaterial({ color: 0xffd9a8, depthTest: false, transparent: true });
    const arcs: THREE.Mesh[] = [];
    for (const x of [-0.3, 0.3]) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 24, Math.PI), arcMat);
      arc.position.set(x, 0.1, 0.78);
      arc.rotation.y = x * 0.5;
      arc.renderOrder = 10;
      arc.visible = false;
      head.add(arc);
      arcs.push(arc);
    }

    // Rotating light ring around the body
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.08, 0.012, 8, 96, Math.PI * 0.55),
      new THREE.MeshBasicMaterial({ color: 0xffd2a1, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }),
    );
    ring.rotation.x = Math.PI / 2.4;
    scene.add(ring);

    // Thinking particles
    const dots: THREE.Mesh[] = [];
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffb86b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 3; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), dotMat.clone());
      scene.add(d);
      dots.push(d);
    }
    // Speaking pulse rings
    const pulses: { mesh: THREE.Mesh; t: number }[] = [];
    const pulseGeo = new THREE.RingGeometry(1.04, 1.07, 64);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      scene.add(m);
      pulses.push({ mesh: m, t: i / 3 });
    }

    // Intro: the character arrives as a lump of terrain (dark rock + ember wireframe) and shakes it off.
    const noise = (v: THREE.Vector3) => 1 + (Math.sin(v.x * 7.1) * Math.cos(v.y * 5.3) + Math.sin(v.z * 6.7 + v.x * 2)) * 0.05;
    const lumpy = (geo: THREE.BufferGeometry) => {
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        v.multiplyScalar(noise(v));
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      return geo;
    };
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x0f0c0a, roughness: 1, metalness: 0, transparent: true, opacity: 1 });
    const rock = new THREE.Mesh(lumpy(new THREE.SphereGeometry(1.02, 24, 16)), rockMat);
    rock.renderOrder = 20;
    rock.visible = intro;
    head.add(rock);
    const wireMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, wireframe: true, transparent: true, opacity: 0.95, depthTest: false });
    const wire = new THREE.Mesh(lumpy(new THREE.SphereGeometry(1.05, 18, 12)), wireMat);
    wire.renderOrder = 21;
    wire.visible = intro;
    head.add(wire);
    const fragMat = new THREE.MeshBasicMaterial({ color: 0xffa040, wireframe: true, transparent: true, opacity: 1, depthTest: false });
    const frags: { m: THREE.Mesh; v: THREE.Vector3; r: THREE.Vector3 }[] = [];
    for (let i = 0; i < 30; i++) {
      const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.08 + Math.random() * 0.1, 0), fragMat);
      m.visible = false;
      m.renderOrder = 22;
      scene.add(m);
      frags.push({ m, v: new THREE.Vector3(), r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6) });
    }
    const introStart = intro ? performance.now() : -1;
    let phase: IntroPhase = intro ? "buried" : "done";
    const setPhase = (p: IntroPhase) => {
      if (phase === p) return;
      phase = p;
      phaseRef.current?.(p);
    };
    let fragsLaunched = false;
    let shakeAmp = 0;

    // Pointer tracking (whole page) in normalised coordinates relative to the character.
    const target = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      target.x = Math.max(-1, Math.min(1, dx / 360));
      target.y = Math.max(-1, Math.min(1, dy / 360));
    };
    const onLeave = () => { target.x = 0; target.y = 0; };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);

    // Blink schedule
    let nextBlink = 2 + Math.random() * 3;
    let blinkT = -1;

    let raf = 0;
    let last = performance.now();
    let t = 0;
    let visible = true;
    const look = { x: 0, y: 0 };
    const squash = { v: 1, vel: 0 };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      let mood = moodRef.current;

      // ----- intro timeline -----
      if (phase !== "done") {
        const it = (now - introStart) / 1000;
        if (it < 0.6) setPhase("buried");
        else if (it < 1.7) setPhase("jump");
        else if (it < 2.45) setPhase("shake");
        else if (it < 2.95) setPhase("reveal");
        else if (it < 4.8) setPhase("present");
        else setPhase("done");

        const covered = phase === "buried" || phase === "jump" || phase === "shake";
        rock.visible = covered || phase === "reveal";
        wire.visible = covered || phase === "reveal";
        if (phase === "shake") {
          shakeAmp = Math.min(1, shakeAmp + dt * 6);
          if (it > 1.95 && !fragsLaunched) {
            fragsLaunched = true;
            for (const f of frags) {
              const dir = new THREE.Vector3().randomDirection();
              f.m.position.copy(dir).multiplyScalar(1.05);
              f.v.copy(dir).multiplyScalar(2 + Math.random() * 2.5).add(new THREE.Vector3(0, 1.5 + Math.random(), 0));
              f.m.visible = true;
              f.m.scale.setScalar(1);
            }
          }
          if (it > 2.1) {
            const k = (it - 2.1) / 0.35;
            wireMat.opacity = Math.max(0, 1 - k);
            wire.scale.setScalar(1 + k * 0.6);
          }
        }
        if (phase === "reveal") {
          const k = (it - 2.45) / 0.5;
          rockMat.opacity = Math.max(0, 1 - k * 1.4);
          rock.scale.setScalar(Math.max(0.01, 1 - k * 0.9));
          wireMat.opacity = 0;
          shakeAmp = Math.max(0, shakeAmp - dt * 4);
        }
        if (phase === "present") mood = "happy";
        if ((phase as IntroPhase) === "done") { rock.visible = false; wire.visible = false; }
      }
      // fragments fly out and fall
      if (fragsLaunched) {
        let alive = false;
        for (const f of frags) {
          if (!f.m.visible) continue;
          f.v.y -= 7 * dt;
          f.m.position.addScaledVector(f.v, dt);
          f.m.rotation.x += f.r.x * dt;
          f.m.rotation.y += f.r.y * dt;
          f.m.scale.multiplyScalar(1 - dt * 1.1);
          if (f.m.position.y < -3.5 || f.m.scale.x < 0.06) f.m.visible = false;
          else alive = true;
        }
        if (!alive) fragsLaunched = false;
      }

      // Head follows the pointer with a soft spring; eyes lead a little.
      look.x += (target.x - look.x) * Math.min(1, dt * 6);
      look.y += (target.y - look.y) * Math.min(1, dt * 6);
      head.rotation.y = look.x * 0.5 + Math.sin(t * 0.6) * 0.04;
      head.rotation.x = look.y * 0.35 + (mood === "thinking" ? -0.18 : 0) + Math.sin(t * 0.9) * 0.02;
      head.rotation.z = Math.sin(t * 0.7) * 0.03 + (mood === "happy" ? Math.sin(t * 6) * 0.04 : 0) + Math.sin(t * 48) * 0.32 * shakeAmp;
      head.position.x = Math.sin(t * 61) * 0.06 * shakeAmp;

      // Idle bob + squash/stretch spring (bounce on click, wobble on hover)
      if (bounceRef.current > 0) { squash.vel -= 6; bounceRef.current = 0; }
      const stiff = 120, damp = 9;
      squash.vel += (1 - squash.v) * stiff * dt - squash.vel * damp * dt;
      squash.v += squash.vel * dt;
      const bobY = Math.sin(t * 1.6) * 0.05;
      head.position.y = bobY;
      head.scale.set(1 / Math.sqrt(squash.v), squash.v, 1 / Math.sqrt(squash.v));

      // Blink
      if (blinkT < 0 && t > nextBlink) { blinkT = 0; nextBlink = t + 2.5 + Math.random() * 3.5; }
      let blinkScale = 1;
      if (blinkT >= 0) {
        blinkT += dt;
        const k = blinkT / 0.18;
        blinkScale = k < 0.5 ? 1 - k * 2 * 0.92 : 0.08 + (k - 0.5) * 2 * 0.92;
        if (blinkT > 0.18) blinkT = -1;
      }
      const happy = mood === "happy";
      const covered = phase === "buried" || phase === "jump" || phase === "shake";
      for (const e of eyes) {
        e.visible = !happy && !covered;
        e.scale.y = Math.max(0.08, blinkScale);
        e.position.x = (e === eyes[0] ? -0.3 : 0.3) + look.x * 0.06;
        e.position.y = 0.14 - look.y * 0.05;
      }
      for (const a of arcs) a.visible = happy && !covered;

      // Ember heart breathing, drifting plasma, rising sparks; eyes pulse while speaking
      const coreScale = mood === "thinking" ? 1 + Math.sin(t * 5) * 0.08 : 1 + Math.sin(t * 1.3) * 0.05;
      core.scale.setScalar(coreScale);
      coreMat.uniforms.uIntensity.value = mood === "speaking" ? 1.7 + Math.sin(t * 12) * 0.5 : mood === "thinking" ? 2.1 : 1.7 + Math.sin(t * 1.3) * 0.15;
      plasma.position.x = -0.2 + Math.sin(t * 0.8) * 0.22;
      plasma.position.y = -0.45 + Math.cos(t * 0.6) * 0.1;
      plasma.position.z = 0.25 + Math.sin(t * 0.5) * 0.15;
      for (const sp of sparks) {
        sp.a += dt * sp.sp;
        sp.h += dt * 0.25;
        if (sp.h > 0.55) sp.h = -0.7;
        sp.m.position.set(Math.cos(sp.a) * sp.r, sp.h, Math.sin(sp.a) * sp.r * 0.8);
        sp.m.visible = Math.sin(sp.a * 3) > -0.6;
      }
      eyeMat.emissiveIntensity = mood === "speaking" ? 3.2 + Math.sin(t * 14) * 1.2 : 3.2;

      // Ring of light
      ring.rotation.z += dt * (mood === "thinking" ? 2.6 : 0.7);

      // Thinking dots orbit above the head
      dots.forEach((d, i) => {
        const m = d.material as THREE.MeshBasicMaterial;
        m.opacity += ((mood === "thinking" ? 0.9 : 0) - m.opacity) * Math.min(1, dt * 6);
        const a = t * 2.2 + (i * Math.PI * 2) / 3;
        d.position.set(Math.cos(a) * 0.9, 1.05 + Math.sin(a * 2) * 0.12, Math.sin(a) * 0.9);
      });

      // Speaking pulses expand outward
      pulses.forEach((p) => {
        const m = p.mesh.material as THREE.MeshBasicMaterial;
        if (mood === "speaking") {
          p.t += dt * 0.9;
          if (p.t > 1) p.t = 0;
          const s = 1 + p.t * 0.9;
          p.mesh.scale.set(s, s, s);
          m.opacity = (1 - p.t) * 0.5;
        } else {
          m.opacity += (0 - m.opacity) * Math.min(1, dt * 8);
        }
      });

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    const onVis = () => { visible = document.visibilityState === "visible"; last = performance.now(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      renderer.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const mat = o.material as THREE.Material | THREE.Material[];
          (Array.isArray(mat) ? mat : [mat]).forEach((mm) => mm.dispose());
        }
      });
      el.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  if (!webgl) return <AgentFace mood={mood} size={size} className={className} />;
  return <div ref={host} className={className} style={{ width: size, height: size, position: "relative", overflow: "visible" }} aria-hidden="true" />;
}
