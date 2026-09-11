// Momentum BodyViewer — PREVIEW RUNTIME.
//
// This is a faithful plain-JS port of src/features/body/* so the design preview
// (which has no bundler) can run the real thing on a real iPhone. The React +
// TypeScript source is the deliverable; this file is the test harness. Keep the
// two in step, or delete this one once the PWA renders the components.
//
// Ported from:
//   BodyViewer.tsx        → element setup, lighting, view buttons, fallback
//   CameraRig.tsx         → orbit + inertia + presets
//   useTapVsDrag.ts       → tap-vs-drag discrimination
//   useMuscleHighlight.ts → material instances + eased colour/emissive
//   muscleMeshMap.ts      → material name ↔ MuscleGroup, contract validation
//
// Model: ./momentum-body.glb (override with data-model-url)
// Model file: momentum-body-v3.glb — 40k triangles, smooth normals,
// KHR_mesh_quantization, ten muscle regions + inert `none`. Derived from
// "Muscular Athletic Body - Male Base Mesh" by patmateee, CC-BY-4.0, modified
// for Momentum.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ── muscleMeshMap.ts ──────────────────────────────────────────────────── */

const BODY_REGIONS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'core', 'quadriceps', 'hamstringsGlutes', 'calves', 'forearms'];
const INERT_REGION = 'none';
const REGION_FACING = {
  chest: 0, core: 0, quadriceps: 0, biceps: 0, forearms: 0, shoulders: 0,
  back: 180, hamstringsGlutes: 180, triceps: 180, calves: 180,
};
const VIEW_AZIMUTH = { front: 0, side: 90, back: 180 };
const VIEW_LABEL = { front: 'Vorne', side: 'Seite', back: 'Hinten' };

function resolveMuscleMeshes(root) {
  const found = new Map();
  const unknown = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const material = Array.isArray(o.material) ? o.material[0] : o.material;
    const name = (material && material.name) || '';
    if (name === INERT_REGION) { o.userData.muscle = null; return; }
    if (!BODY_REGIONS.includes(name)) { unknown.push(name || '(unnamed)'); o.userData.muscle = null; return; }
    if (found.has(name)) throw new Error(`body model: region "${name}" appears more than once`);
    o.userData.muscle = name;
    found.set(name, o);
  });
  const missing = BODY_REGIONS.filter((id) => !found.has(id));
  if (missing.length) throw new Error(`body model: missing region(s) ${missing.join(', ')}`);
  if (unknown.length) throw new Error(`body model: unknown region(s) ${unknown.join(', ')}`);
  return found;
}

/* ── useTapVsDrag.ts ──────────────────────────────────────────────────── */

const SLOP_PX = { touch: 10, pen: 6, mouse: 4 };
const MAX_MS = { touch: 500, pen: 500, mouse: 400 };

class TapVsDrag {
  constructor() { this.gesture = null; this.multiTouch = false; }
  down(e) {
    if (this.gesture) { this.gesture.isTap = false; this.multiTouch = true; return; }
    const kind = e.pointerType === 'mouse' ? 'mouse' : e.pointerType === 'pen' ? 'pen' : 'touch';
    this.multiTouch = false;
    this.gesture = { pointerId: e.pointerId, kind, startedAt: performance.now(), lastX: e.clientX, lastY: e.clientY, travel: 0, isTap: true };
  }
  move(e) {
    const g = this.gesture;
    if (!g || e.pointerId !== g.pointerId) return null;
    const dx = e.clientX - g.lastX, dy = e.clientY - g.lastY;
    g.lastX = e.clientX; g.lastY = e.clientY;
    g.travel += Math.abs(dx) + Math.abs(dy);
    if (g.travel > SLOP_PX[g.kind]) g.isTap = false;
    return { dx, dy };
  }
  up(e) {
    const g = this.gesture;
    if (!g || e.pointerId !== g.pointerId) return false;
    this.gesture = null;
    if (this.multiTouch) return false;
    return g.isTap && performance.now() - g.startedAt <= MAX_MS[g.kind];
  }
  cancel() { this.gesture = null; this.multiTouch = false; }
  get isDown() { return this.gesture !== null; }
}

/* ── shared constants ─────────────────────────────────────────────────── */

const BASE_COLOR = 0xc9c9d2;
const NEUTRAL_HIGHLIGHT = 0x5e5ce6;
const SELECTED_MIX = 0.72, RESTING_MIX = 0.55;
const SELECTED_EMISSIVE = 0.26, RESTING_EMISSIVE = 0.11;
const SELECTED_RIM = 0.95, RESTING_RIM = 0.42;
// 1 - exp(-dt * EASE_RATE): ~250 ms to settle, same curve for colour, emissive
// and rim so a state or selection change reads as one cross-fade.
const EASE_RATE = 12;
const DISTANCE = 4.05, PITCH_MIN = -22, PITCH_MAX = 30;
const YAW_PER_PX = 0.55, PITCH_PER_PX = 0.22, FRICTION = 0.93;
const D2R = Math.PI / 180;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function shortestDelta(from, to) {
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/* Region material: standard PBR plus a view-dependent rim term added to the
   emissive output. The rim keeps the body plastic — the tint reads as light on
   a surface instead of a flat fill, and region edges fall off smoothly. Own
   varyings so the patch never depends on three's internal varying names. */
function regionMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: BASE_COLOR, roughness: 0.74, metalness: 0 });
  const rim = { uRim: { value: 0 }, uRimColor: { value: new THREE.Color(0x000000) } };
  material.userData.rim = rim;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = rim.uRim;
    shader.uniforms.uRimColor = rim.uRimColor;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vRimN;\nvarying vec3 vRimP;\nvoid main() {')
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\n\tvRimN = normalize( normalMatrix * objectNormal );\n\tvRimP = ( modelViewMatrix * vec4( transformed, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uRim;\nuniform vec3 uRimColor;\nvarying vec3 vRimN;\nvarying vec3 vRimP;\nvoid main() {')
      .replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n\tfloat rimF = pow( 1.0 - abs( dot( normalize( vRimN ), normalize( -vRimP ) ) ), 2.6 );\n\ttotalEmissiveRadiance += uRimColor * uRim * rimF;');
  };
  return material;
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

/* ── the element ──────────────────────────────────────────────────────── */

class BodyViewer extends HTMLElement {
  static get observedAttributes() { return ['data-visuals', 'data-selected', 'data-tint', 'data-view', 'data-model-url']; }

  connectedCallback() {
    if (this._built) return;
    this._built = true;
    this.style.display = 'block';
    this.style.position = 'relative';
    if (!this.style.height) this.style.height = '380px';

    if (!hasWebGL()) { this.#fallback('WebGL ist auf diesem Gerät nicht verfügbar.'); return; }

    this._yaw = 0; this._pitch = 8; this._vel = 0; this._yawTo = null;
    this._visuals = {}; this._sel = ''; this._tinted = true;
    this._slots = new Map();
    this._gestures = new TapVsDrag();
    this._view = 'front';

    try { this.#init(); } catch (e) { console.error(e); this.#fallback('3D-Ansicht konnte nicht geladen werden.'); return; }
    this.#applyAttrs();
  }

  disconnectedCallback() {
    cancelAnimationFrame(this._raf);
    if (this._ro) this._ro.disconnect();
    for (const s of this._slots.values()) s.material.dispose();
    if (this._renderer) this._renderer.dispose();
  }

  attributeChangedCallback() { if (this._built && this._renderer) this.#applyAttrs(); }

  #fallback(message) {
    const box = document.createElement('div');
    box.setAttribute('data-fallback', '');
    box.style.cssText = 'height:100%;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font-size:12px;color:#8a8a95';
    box.textContent = message;
    this.appendChild(box);
    this.dispatchEvent(new CustomEvent('body-fallback', { bubbles: true, detail: { message } }));
  }

  #init() {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));  // iPhone reports 3
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent';
    this.appendChild(renderer.domElement);
    this._renderer = renderer;

    const scene = new THREE.Scene();
    this._scene = scene;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    scene.add(new THREE.HemisphereLight(0xffffff, 0xcdcdda, 1.35));
    const key = new THREE.DirectionalLight(0xffffff, 2.15); key.position.set(-1.7, 2.6, 2.4); scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe4f5, 0.75); fill.position.set(2.4, 0.9, 1.5); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 1.05); rim.position.set(0.4, 1.9, -2.8); scene.add(rim);

    this._camera = new THREE.PerspectiveCamera(27, 1, 0.1, 40);
    this._target = new THREE.Vector3(0, 0.92, 0);
    this._root = new THREE.Group();
    scene.add(this._root);
    this._raycaster = new THREE.Raycaster();

    const url = this.getAttribute('data-model-url') || './momentum-body.glb';
    new GLTFLoader().load(url, (gltf) => {
      let meshes;
      try { meshes = resolveMuscleMeshes(gltf.scene); }
      catch (e) { console.error(e); this.#fallback('Modell-Vertrag verletzt: ' + e.message); return; }

      let tris = 0;
      for (const [id, mesh] of meshes) {
        const g = mesh.geometry;
        tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
        const material = regionMaterial();
        material.name = id;
        mesh.material = material;
        this._slots.set(id, {
          material,
          rim: material.userData.rim,
          target: new THREE.Color(BASE_COLOR),
          targetEmissive: new THREE.Color(0x000000),
          targetEmissiveIntensity: 0,
          targetRim: 0,
          targetRimColor: new THREE.Color(0x000000),
        });
      }
      // The inert primitive keeps its own material so it can never be tinted.
      gltf.scene.traverse((o) => {
        if (o.isMesh && !o.userData.muscle) {
          o.material = new THREE.MeshStandardMaterial({ color: BASE_COLOR, roughness: 0.8, metalness: 0 });
          o.material.name = INERT_REGION;
        }
      });

      const hasNormals = !!gltf.scene.children.length;
      this._root.add(gltf.scene);
      this._loaded = true;
      this.#retarget();
      this.#dirty();
      // Announce twice: the host may still be attaching its listener when a
      // cached model resolves on the first frame.
      this._ready = { regions: meshes.size, triangles: Math.round(tris), hasNormals };
      const announce = () => this.dispatchEvent(new CustomEvent('body-ready', { bubbles: true, detail: this._ready }));
      announce();
      setTimeout(announce, 300);
    }, undefined, (e) => { console.error('body model failed', e); this.#fallback('Modell konnte nicht geladen werden.'); });

    this.#buildViewButtons();
    this.#bind(renderer.domElement);
    this._ro = new ResizeObserver(() => this.#resize());
    this._ro.observe(this);
    this.#resize();
    this._raf = requestAnimationFrame(this.#step);
  }

  #buildViewButtons() {
    const bar = document.createElement('div');
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Ansicht');
    bar.style.cssText = 'position:absolute;top:10px;right:12px;display:flex;gap:2px;padding:2px;border-radius:999px;background:#ececf2;z-index:2';
    this._viewButtons = {};
    for (const v of Object.keys(VIEW_AZIMUTH)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = VIEW_LABEL[v];
      // 30px + the pill's padding clears a comfortable touch target without
      // dominating a 390px-wide phone card.
      b.style.cssText = 'min-height:30px;padding:5px 11px;border:none;border-radius:999px;background:transparent;font:inherit;font-size:11px;color:#1c1c1e;cursor:pointer;-webkit-tap-highlight-color:transparent';
      b.addEventListener('click', () => this.goTo(v));
      bar.appendChild(b);
      this._viewButtons[v] = b;
    }
    this.appendChild(bar);
    this.#paintViewButtons();
  }

  #paintViewButtons() {
    if (!this._viewButtons) return;
    for (const [v, b] of Object.entries(this._viewButtons)) {
      const on = v === this._view;
      b.setAttribute('aria-pressed', String(on));
      b.style.background = on ? '#ffffff' : 'transparent';
      b.style.fontWeight = on ? '600' : '400';
      b.style.boxShadow = on ? '0 1px 2px rgba(16,24,40,0.12)' : 'none';
    }
  }

  /* ── CameraRig ──────────────────────────────────────────────────────── */

  goTo(view) {
    const want = VIEW_AZIMUTH[view];
    this._yawTo = Math.round((this._yaw - want) / 360) * 360 + want;
    this._vel = 0;
    this._view = view;
    this.#paintViewButtons();
    this.#dirty();
  }

  faceAzimuth(deg) {
    const cur = ((this._yaw % 360) + 360) % 360;
    this._yawTo = this._yaw + shortestDelta(cur, deg);
    this._vel = 0;
    this.#dirty();
  }

  #resize() {
    const w = this.clientWidth || 340, h = this.clientHeight || 380;
    this._renderer.setSize(w, h, false);
    this._camera.aspect = w / h;
    this._camera.fov = clamp(27 * (400 / h), 22, 40);
    this._camera.updateProjectionMatrix();
    this.#dirty();
  }

  #dirty() { this._needs = true; }

  #step = () => {
    this._raf = requestAnimationFrame(this.#step);
    const now = performance.now();
    const delta = Math.min(0.05, (now - (this._last || now)) / 1000);
    this._last = now;

    let moving = false;
    if (this._yawTo !== null) {
      const d = this._yawTo - this._yaw;
      if (Math.abs(d) < 0.4) { this._yaw = this._yawTo; this._yawTo = null; }
      else this._yaw += d * 0.18;
      moving = true;
    } else if (!this._gestures.isDown && Math.abs(this._vel) > 0.02) {
      this._yaw += this._vel;
      this._vel *= FRICTION;
      moving = true;
    }
    if (this.#ease(delta)) moving = true;
    if (moving) this.#dirty();
    if (!this._needs) return;                 // frameloop="demand" equivalent
    this._needs = false;

    const y = this._yaw * D2R, p = this._pitch * D2R;
    const r = DISTANCE * Math.cos(p);
    this._camera.position.set(
      this._target.x + r * Math.sin(y),
      this._target.y + DISTANCE * Math.sin(p),
      this._target.z + r * Math.cos(y),
    );
    this._camera.lookAt(this._target);
    this._renderer.render(this._scene, this._camera);

    const deg = Math.round(((this._yaw % 360) + 360) % 360);
    const settled = !moving && !this._gestures.isDown;
    if (deg !== this._lastDeg && (settled || now - (this._lastEmit || 0) > 200)) {
      this._lastDeg = deg;
      this._lastEmit = now;
      const view = deg < 45 || deg > 315 ? 'front' : deg > 135 && deg < 225 ? 'back' : 'side';
      if (view !== this._view) { this._view = view; this.#paintViewButtons(); }
      // `angle` is the contract name; `deg` is kept as its alias for the
      // existing host. Both carry the same authoritative rotation.
      this.dispatchEvent(new CustomEvent('body-rotate', { bubbles: true, detail: { angle: deg, deg, view } }));
    }
  };

  #bind(el) {
    el.addEventListener('pointerdown', (e) => {
      this._gestures.down(e);
      this._vel = 0; this._yawTo = null;
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      el.style.cursor = 'grabbing';
    });
    el.addEventListener('pointermove', (e) => {
      const d = this._gestures.move(e);
      if (!d) return;
      e.preventDefault();
      this._yaw += d.dx * YAW_PER_PX;
      this._vel = d.dx * YAW_PER_PX;
      this._pitch = clamp(this._pitch - d.dy * PITCH_PER_PX, PITCH_MIN, PITCH_MAX);
      this.#dirty();
    }, { passive: false });
    const end = (e) => {
      const wasTap = this._gestures.up(e);
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      el.style.cursor = 'grab';
      if (wasTap) { this._vel = 0; this.#pick(e, el); }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => { this._gestures.cancel(); el.style.cursor = 'grab'; });
  }

  #pick(e, el) {
    if (!this._loaded) return;
    const r = el.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
    this._raycaster.setFromCamera(ndc, this._camera);
    const hits = this._raycaster.intersectObject(this._root, true);   // near → far
    for (const hit of hits) {
      const id = hit.object.userData.muscle;
      if (id) { this.dispatchEvent(new CustomEvent('muscle-select', { bubbles: true, detail: { id } })); return; }
    }
    // A miss does nothing: an accidental deselect is worse than a missed tap.
  }

  /* ── useMuscleHighlight ─────────────────────────────────────────────── */

  #retarget() {
    if (!this._loaded) return;
    const base = new THREE.Color(BASE_COLOR);
    for (const [id, slot] of this._slots) {
      const v = this._visuals[id];
      const on = id === this._sel;
      if (!this._tinted || !v || !v.tint) {
        slot.target.copy(base);
        slot.targetEmissive.setHex(on ? NEUTRAL_HIGHLIGHT : 0x000000);
        slot.targetEmissiveIntensity = on ? 0.1 : 0;
        slot.targetRimColor.setHex(on ? NEUTRAL_HIGHLIGHT : 0x000000);
        slot.targetRim = on ? SELECTED_RIM * 0.6 : 0;
        continue;
      }
      // intensity carries the magnitude of the change (core/gym decides it);
      // an untrained region arrives at 0 and stays base grey.
      const amount = v.intensity == null ? 1 : Math.max(0, Math.min(1, v.intensity));
      const strength = (on ? SELECTED_MIX : RESTING_MIX) * amount;
      const tint = new THREE.Color(v.tint);
      slot.target.copy(base).lerp(tint, strength);
      slot.targetEmissive.copy(tint);
      slot.targetEmissiveIntensity = (on ? SELECTED_EMISSIVE : RESTING_EMISSIVE) * amount;
      slot.targetRimColor.copy(tint);
      slot.targetRim = on ? SELECTED_RIM : RESTING_RIM * amount;
    }
    this.#dirty();
  }

  #ease(delta) {
    if (!this._loaded) return false;
    const k = 1 - Math.exp(-delta * EASE_RATE);   // frame-rate independent
    let moving = false;
    for (const slot of this._slots.values()) {
      const m = slot.material;
      if (slot.rim) {
        const dr = slot.targetRim - slot.rim.uRim.value;
        if (Math.abs(dr) > 0.002) { slot.rim.uRim.value += dr * k; moving = true; }
        const rc = slot.rim.uRimColor.value;
        if (rc.getHex() !== slot.targetRimColor.getHex()) { rc.lerp(slot.targetRimColor, k); moving = true; }
      }
      if (m.color.getHex() !== slot.target.getHex()) { m.color.lerp(slot.target, k); moving = true; }
      if (m.emissive.getHex() !== slot.targetEmissive.getHex()) { m.emissive.lerp(slot.targetEmissive, k); moving = true; }
      const de = slot.targetEmissiveIntensity - m.emissiveIntensity;
      if (Math.abs(de) > 0.001) { m.emissiveIntensity += de * k; moving = true; }
    }
    return moving;
  }

  #applyAttrs() {
    const raw = this.getAttribute('data-visuals');
    if (raw) { try { this._visuals = JSON.parse(raw); } catch (_) { /* keep last good */ } }
    this._tinted = this.getAttribute('data-tint') !== 'off';
    const wantView = this.getAttribute('data-view');
    if (wantView && wantView !== this._view && VIEW_AZIMUTH[wantView] !== undefined) this.goTo(wantView);
    const sel = this.getAttribute('data-selected') || '';
    if (sel !== this._sel) {
      const firstPaint = this._sel === '' && !this._loaded;
      this._sel = sel;
      const want = REGION_FACING[sel];
      if (!firstPaint && want !== undefined && this._yawTo === null) {
        const cur = ((this._yaw % 360) + 360) % 360;
        if (Math.abs(shortestDelta(cur, want)) > 70) this.faceAzimuth(want);
      }
    }
    this.#retarget();
  }
}

customElements.define('body-viewer', BodyViewer);
