// 3D-такса Кулик: модель + скелет + процедурные анимации (three.js)
import * as THREE from "./three/three.module.js";
import { GLTFLoader } from "./three/GLTFLoader.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// суставы: [родитель, позиция в позе покоя]
const SIDES = [["p", 1], ["n", -1]];
const JOINTS = { root: [null, V(0, 0, 0)], hips: ["root", V(0, 0.5, -0.5)], spine: ["hips", V(0, 0.5, -0.05)], chest: ["spine", V(0, 0.5, 0.35)],
  neck: ["chest", V(0, 0.6, 0.5)], head: ["neck", V(0, 0.9, 0.62)], tail1: ["hips", V(0, 0.6, -0.78)], tail2: ["tail1", V(0, 0.42, -0.88)] };
for (const [s, k] of SIDES) {
  JOINTS["ear" + s] = ["head", V(0.11 * k, 1.0, 0.68)];
  JOINTS["fsh" + s] = ["chest", V(0.124 * k, 0.56, 0.35)]; JOINTS["fel" + s] = ["fsh" + s, V(0.124 * k, 0.3, 0.35)]; JOINTS["fpw" + s] = ["fel" + s, V(0.124 * k, 0.05, 0.37)];
  JOINTS["rhp" + s] = ["hips", V(0.145 * k, 0.55, -0.55)]; JOINTS["rkn" + s] = ["rhp" + s, V(0.145 * k, 0.3, -0.55)]; JOINTS["rpw" + s] = ["rkn" + s, V(0.145 * k, 0.05, -0.58)];
}
// сегменты для весов: [кость, от, до, фильтр]
function segments() {
  const S = [
    ["hips", V(0, 0.5, -0.62), V(0, 0.5, -0.05)], ["spine", V(0, 0.5, -0.05), V(0, 0.5, 0.35)], ["chest", V(0, 0.5, 0.35), V(0, 0.58, 0.5)],
    ["neck", V(0, 0.6, 0.5), V(0, 0.88, 0.62)], ["head", V(0, 0.9, 0.62), V(0, 0.9, 0.95)],
    ["tail1", V(0, 0.6, -0.78), V(0, 0.42, -0.88)], ["tail2", V(0, 0.42, -0.88), V(0, 0.1, -0.96)],
  ];
  for (const [s, k] of SIDES) {
    S.push(["fsh" + s, V(0.124 * k, 0.56, 0.35), V(0.124 * k, 0.3, 0.35), { side: k, zc: 0.35 }], ["fel" + s, V(0.124 * k, 0.3, 0.35), V(0.124 * k, 0.04, 0.37), { side: k, zc: 0.35 }],
      ["rhp" + s, V(0.145 * k, 0.55, -0.55), V(0.145 * k, 0.3, -0.55), { side: k, zc: -0.57 }], ["rkn" + s, V(0.145 * k, 0.3, -0.55), V(0.145 * k, 0.04, -0.58), { side: k, zc: -0.57 }],
      ["ear" + s, V(0.11 * k, 1.0, 0.68), V(0.15 * k, 0.65, 0.65), { ear: k }]);
  }
  return S;
}
function distSeg(p, a, b) {
  const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

function buildSkeleton(geo) {
  const bones = {}, list = [];
  for (const [name, [par, pos]] of Object.entries(JOINTS)) {
    const b = new THREE.Bone(); b.name = name;
    b.position.copy(par ? pos.clone().sub(JOINTS[par][1]) : pos);
    bones[name] = b; list.push(b);
    if (par) bones[par].add(b);
  }
  const idx = Object.fromEntries(list.map((b, i) => [b.name, i]));
  const segs = segments(), pos = geo.attributes.position, n = pos.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    const cand = [];
    for (const [name, a, b, f] of segs) {
      if (f) {
        if (f.side && (Math.sign(p.x) !== f.side || p.y > 0.66 || Math.abs(p.z - f.zc) > 0.2)) continue;
        if (f.ear && (Math.sign(p.x) !== f.ear || Math.abs(p.x) < 0.1 || p.z < 0.45 || p.z > 0.68 || p.y < 0.62 || p.y > 1.02)) continue;
      }
      const d = distSeg(p, a, b);
      cand.push([idx[name], 1 / Math.pow(d + 0.02, 3)]);
    }
    // уши забирают вершины целиком
    const ear = cand.find((c) => list[c[0]].name.startsWith("ear"));
    if (ear) { si[i * 4] = ear[0]; sw[i * 4] = 1; continue; }
    cand.sort((a, b) => b[1] - a[1]);
    const top = cand.slice(0, 3), sum = top.reduce((s, c) => s + c[1], 0);
    top.forEach((c, k) => { si[i * 4 + k] = c[0]; sw[i * 4 + k] = c[1] / sum; });
  }
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
  return { bones, list };
}

const lerp = THREE.MathUtils.lerp;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const sm = (x) => x * x * (3 - 2 * x);

// целевая поза: возвращает {bone: [rx, ry, rz]}, root: {y, rx, ry, rz}
function poseFor(state, t, trick, tt) {
  const P = {}, R = { y: 0, x: 0, ry: 0, rz: 0, px: 0, pz: 0 };
  const set = (n, x = 0, y = 0, z = 0) => { const o = P[n] || (P[n] = [0, 0, 0]); o[0] += x; o[1] += y; o[2] += z; };
  const wag = (amp, sp) => { set("tail1", 0, Math.sin(t * sp) * amp, 0); set("tail2", 0, Math.sin(t * sp - 0.8) * amp * 0.8, 0); };
  const ears = (a = 1) => { set("earp", Math.sin(t * 1.3) * 0.04 * a, 0, -0.05 * a); set("earn", Math.sin(t * 1.3 + 1) * 0.04 * a, 0, 0.05 * a); };
  const breathe = (a = 1) => { set("spine", Math.sin(t * 2.2) * 0.012 * a); set("chest", Math.sin(t * 2.2 + 0.6) * 0.012 * a); };
  const walk = (sp, amp) => {
    const ph = t * sp;
    for (const [s, k] of SIDES) {
      const fph = ph + (k > 0 ? 0 : Math.PI), rph = ph + (k > 0 ? Math.PI : 0);
      set("fsh" + s, Math.sin(fph) * amp); set("fel" + s, Math.max(0, Math.cos(fph)) * amp * 1.3);
      set("rhp" + s, Math.sin(rph) * amp * 0.9); set("rkn" + s, -Math.max(0, Math.cos(rph)) * amp * 1.1);
    }
    R.y += Math.abs(Math.sin(ph)) * 0.015; set("spine", 0, Math.sin(ph) * 0.05); set("hips", 0, -Math.sin(ph) * 0.04);
  };
  if (state === "sleep") {
    R.rz = Math.PI / 2; R.y = -0.34; R.sleep = true;
    set("spine", 0, 0.3, 0); set("chest", 0, 0.45, 0); set("neck", 0.55, 0.5, 0); set("head", 0.5, 0.3, 0);
    for (const [s, k] of SIDES) { set("fsh" + s, -1.35); set("fel" + s, 1.6); set("rhp" + s, -1.5); set("rkn" + s, 1.7); }
    set("tail1", 0, 0.6, 0.2); set("earp", 0, 0, -0.3); set("earn", 0, 0, 0.3);
    set("spine", Math.sin(t * 1.4) * 0.03); set("chest", Math.sin(t * 1.4) * 0.03);
    return { P, R };
  }
  breathe(); ears();
  const look = Math.sin(t * 0.5) * 0.28, look2 = Math.sin(t * 0.31 + 1) * 0.06;
  if (state === "eat") {
    set("neck", 0.5, look * 0.2); set("head", 0.55 + Math.sin(t * 9) * 0.1); wag(0.3, 6); set("chest", 0.1);
  } else if (state === "pet") {
    set("neck", -0.1, 0, 0.1); set("head", -0.25, 0.15, 0.25); wag(0.75, 14); R.y += 0.01; ears(2);
  } else if (state === "happy") {
    set("head", -0.15, look * 0.5); set("neck", -0.05); wag(0.7, 13); R.y += Math.abs(Math.sin(t * 6)) * 0.03;
  } else if (state === "walk") {
    walk(7, 0.55); set("head", 0, look * 0.3); wag(0.25, 5);
  } else if (state === "worried") {
    set("head", 0.3, look * 0.2); set("neck", 0.15); set("tail1", 0.5); set("earp", 0, 0, 0.25); set("earn", 0, 0, -0.25); set("chest", 0.05);
  } else { // idle
    set("head", look2, look); set("neck", 0, look * 0.4); wag(0.22, 2.4);
  }
  // трюки
  if (trick) {
    const d = clamp01(tt / 1.8), e = Math.sin(d * Math.PI), k = Math.min(1, e * 4);
    switch (trick) {
      case "paw": set("fshp", -1.0 * k); set("felp", 0.5 * k + Math.sin(tt * 14) * 0.25 * k); set("head", -0.1 * k, 0, 0.15 * k); wag(0.5, 12); break;
      case "spin": R.ry = sm(clamp01(tt / 1.3)) * Math.PI * 2; R.y = Math.sin(clamp01(tt / 1.3) * Math.PI) * 0.06; wag(0.6, 12); break;
      case "roll": R.rz = sm(clamp01(tt / 1.5)) * Math.PI * 2; R.y = Math.sin(clamp01(tt / 1.5) * Math.PI) * 0.22; for (const [s] of SIDES) { set("fsh" + s, -0.4 * k); set("rhp" + s, 0.4 * k); } break;
      case "beg": R.x = -0.9 * k; R.y = 0.12 * k; for (const [s] of SIDES) { set("fsh" + s, -0.9 * k); set("fel" + s, 1.2 * k); } set("head", 0.7 * k); set("neck", 0.2 * k); wag(0.5, 10); break;
      case "dead": R.rz = (1.45 * Math.min(1, tt / 0.5)) * (tt < 1.5 ? 1 : 1 - (tt - 1.5) / 0.3); R.y = 0.2 * Math.min(1, tt / 0.5); for (const [s] of SIDES) { set("fsh" + s, -0.5 * k); set("rhp" + s, 0.5 * k); } set("head", 0.5 * k); break;
      case "dance": R.ry = Math.sin(tt * 8) * 0.35; R.y = Math.abs(Math.sin(tt * 8)) * 0.05; set("head", 0, Math.sin(tt * 8) * -0.3, Math.sin(tt * 8) * 0.2); wag(0.8, 14); for (const [s, kk] of SIDES) { set("fsh" + s, Math.sin(tt * 8 + kk) * 0.5 * k); } break;
      case "sing": set("neck", -0.5 * k); set("head", -0.8 * k, 0, 0); R.x = -0.12 * k; wag(0.3, 6); break;
      case "bow": for (const [s] of SIDES) { set("fsh" + s, 0.7 * k); set("fel" + s, 0.4 * k); } set("neck", 0.6 * k); set("head", 0.4 * k); R.x = 0.18 * k; wag(0.7, 12); break;
      case "fetch": walk(10, 0.6); R.px = Math.sin(d * Math.PI * 2) * 0.35; set("head", 0.1); break;
    }
  }
  return { P, R };
}


const mat = (c, r = 0.6) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
function accessory(id) {
  const g = new THREE.Group(), M = (geo, c, x = 0, y = 0, z = 0, r) => { const m = new THREE.Mesh(geo, mat(c, r)); m.position.set(x, y, z); g.add(m); return m; };
  switch (id) {
    case "crown": { const base = M(new THREE.CylinderGeometry(0.075, 0.08, 0.04, 20, 1, true), 0xffd25a, 0, 0, 0, 0.3); base.material.side = THREE.DoubleSide;
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; M(new THREE.ConeGeometry(0.02, 0.07, 6), 0xffd25a, Math.sin(a) * 0.072, 0.05, Math.cos(a) * 0.072, 0.3); M(new THREE.SphereGeometry(0.009, 8, 8), 0xe2483d, Math.sin(a) * 0.072, 0.09, Math.cos(a) * 0.072); } g.position.set(0, 0.19, -0.02); break; }
    case "cap": M(new THREE.SphereGeometry(0.085, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0xe2483d, 0, 0, 0); M(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 20, 1, false, -0.9, 1.8), 0xb9322a, 0, 0.002, 0.075).scale.set(1, 1, 0.75); M(new THREE.SphereGeometry(0.012, 8, 8), 0xb9322a, 0, 0.085, 0); g.position.set(0, 0.17, -0.01); g.rotation.x = 0.1; break;
    case "party": M(new THREE.ConeGeometry(0.07, 0.19, 16), 0x7fc8f8, 0, 0.09, 0); M(new THREE.TorusGeometry(0.045, 0.008, 6, 16), 0xff8fb0, 0, 0.07, 0).rotation.x = Math.PI / 2; M(new THREE.SphereGeometry(0.02, 8, 8), 0xffd25a, 0, 0.19, 0); g.position.set(0, 0.165, -0.01); break;
    case "santa": M(new THREE.ConeGeometry(0.085, 0.2, 16), 0xd9343f, 0, 0.1, 0).rotation.z = -0.25; M(new THREE.TorusGeometry(0.082, 0.02, 8, 20), 0xfff8f0, 0, 0, 0).rotation.x = Math.PI / 2; M(new THREE.SphereGeometry(0.03, 10, 10), 0xfff8f0, 0.05, 0.19, 0); g.position.set(0, 0.165, -0.01); break;
    case "glasses": for (const k of [-1, 1]) { const r = M(new THREE.TorusGeometry(0.033, 0.006, 8, 20), 0x2a1a14, k * 0.085, 0.09, 0.14, 0.4); r.rotation.y = k * 0.25; M(new THREE.CircleGeometry(0.03, 16), 0xaad7ff, k * 0.085, 0.09, 0.14).material.transparent = true; }
      M(new THREE.BoxGeometry(0.05, 0.006, 0.006), 0x2a1a14, 0, 0.1, 0.15); g.position.set(0, -0.01, -0.01); break;
    case "flower": for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; M(new THREE.SphereGeometry(0.02, 8, 8), 0xff8fb0, Math.cos(a) * 0.026, Math.sin(a) * 0.026, 0); } M(new THREE.SphereGeometry(0.014, 8, 8), 0xffd25a, 0, 0, 0.012); g.position.set(0.1, 0.17, 0.0); g.rotation.y = 0.9; break;
    case "bandana": { const t = M(new THREE.TorusGeometry(0.1, 0.022, 8, 24), 0x3a7bd5, 0, 0, 0); t.rotation.x = Math.PI / 2; t.scale.set(1, 1.15, 1); const tri = M(new THREE.ConeGeometry(0.075, 0.13, 3), 0x3a7bd5, 0, -0.07, 0.085); tri.rotation.set(Math.PI, 0, 0); tri.scale.set(1, 1, 0.35); g.position.set(0, 0.12, 0.06); break; }
    case "scarf": { const t = M(new THREE.TorusGeometry(0.105, 0.03, 10, 24), 0xe24a5e, 0, 0, 0); t.rotation.x = Math.PI / 2; M(new THREE.BoxGeometry(0.05, 0.2, 0.03), 0xe24a5e, 0.07, -0.1, 0.07).rotation.z = 0.1; for (let i = 0; i < 3; i++) M(new THREE.BoxGeometry(0.052, 0.012, 0.032), 0xffffff, 0.07 + i * 0.002, -0.06 - i * 0.05, 0.07); g.position.set(0, 0.12, 0.06); break; }
    case "bow": M(new THREE.ConeGeometry(0.04, 0.06, 10), 0xe24a5e, -0.04, 0, 0.1).rotation.z = Math.PI / 2; M(new THREE.ConeGeometry(0.04, 0.06, 10), 0xe24a5e, 0.04, 0, 0.1).rotation.z = -Math.PI / 2; M(new THREE.SphereGeometry(0.018, 10, 10), 0xc2334a, 0, 0, 0.1); g.position.set(0, 0.07, 0.13); break;
    case "sweater": { const b = M(new THREE.CylinderGeometry(0.235, 0.228, 0.8, 28, 1, true), 0x7c9be6, 0, 0, 0, 0.9); b.material.side = THREE.DoubleSide; b.rotation.x = Math.PI / 2; b.scale.set(0.9, 1, 0.92);
      const c = M(new THREE.TorusGeometry(0.232, 0.028, 8, 28), 0x5e7cc8, 0, 0, 0.4); c.scale.set(0.9, 0.92, 1); const d = c.clone(); d.position.z = -0.4; g.add(d); g.position.set(0, 0, -0.42); break; }
  }
  return g;
}
const HEAD_ITEMS = ["crown", "cap", "party", "santa", "glasses", "flower"];

export class Dog3D {
  constructor(canvas, opts = {}) {
    this.canvas = canvas; this.state = "idle"; this.base = "idle"; this.trick = null; this.t = 0; this.tt = 0; this.ready = false; this.cur = {}; this.curR = { y: 0, x: 0, ry: 0, rz: 0, px: 0, pz: 0 };
    this.view = opts.view || { az: 0.62, el: 0.2, dist: 3.35, ty: 0.5 };
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: !!opts.preserve });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    this.scene.add(new THREE.HemisphereLight(0xfff4e6, 0x8a6a58, 1.55));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(1.5, 3, 2.5); this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0xffd8b0, 0.7); rim.position.set(-2, 1, -2); this.scene.add(rim);
    // тень под собакой
    const g = document.createElement("canvas"); g.width = g.height = 64; const c = g.getContext("2d"), gr = c.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, "rgba(40,20,10,.5)"); gr.addColorStop(1, "rgba(40,20,10,0)"); c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.0), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(g), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.002; this.scene.add(this.shadow);
    this.props = new THREE.Group(); this.scene.add(this.props);
    this.loaded = new GLTFLoader().loadAsync(opts.url || "/static/kulik.glb").then((gltf) => {
      const mesh = gltf.scene.getObjectByProperty("isMesh", true), geo = mesh.geometry;
      const { bones, list } = buildSkeleton(geo);
      this.bones = bones; this.root = bones.root;
      this.mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 }));
      this.mesh.frustumCulled = false; this.mesh.add(bones.root);
      this.mesh.bind(new THREE.Skeleton(list));
      for (const k of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.02, 14, 12), new THREE.MeshStandardMaterial({ color: 0x120a08, roughness: 0.15 })); e.position.set(k * 0.086, 0.09, 0.115); e.scale.set(0.8, 1.1, 1); bones.head.add(e);
        const gl = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); gl.position.set(k * 0.094, 0.099, 0.126); bones.head.add(gl); }
      this.scene.add(this.mesh); this.ready = true; this.resize();
      this.items = {}; return this;
    });
    this.last = performance.now(); this._loop = this._loop.bind(this); this.raf = requestAnimationFrame(this._loop);
  }
  resize() {
    const w = this.canvas.clientWidth || 300, h = this.canvas.clientHeight || 300;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  setOutfit(o = {}) {
    this.loaded.then(() => {
      for (const b of [this.bones.head, this.bones.neck, this.bones.chest]) for (const c of [...b.children]) if (c.userData.acc) b.remove(c);
      const put = (id, bone) => { if (!id) return; const a = accessory(id); a.userData.acc = true; bone.add(a); };
      const h = o.head, n = o.neck;
      if (h) put(h, this.bones.head);
      if (n === "sweater") put(n, this.bones.chest); else if (n) put(n, this.bones.neck);
    });
  }
  setState(s) { this.state = s; }
  setBase(s) { this.base = s; if (!this.actTimer) this.state = s; }
  act(s, ms) { this.state = s; clearTimeout(this.actTimer); this.actTimer = setTimeout(() => { this.actTimer = null; this.state = this.base; }, ms); }
  playTrick(id) { this.trick = id; this.tt = 0; }
  _loop(now) {
    this.raf = requestAnimationFrame(this._loop);
    if (!this.canvas.isConnected) return this.dispose();
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (!this.ready) return;
    if (this.canvas.clientWidth && Math.abs(this.canvas.width / this.renderer.getPixelRatio() - this.canvas.clientWidth) > 1) this.resize();
    this.t += dt;
    if (this.trick) { this.tt += dt; if (this.tt > 1.8) this.trick = null; }
    const { P, R } = poseFor(this.state, this.t, this.trick, this.tt);
    const k = 1 - Math.exp(-dt * (this.trick ? 18 : 9));
    for (const name in this.bones) {
      if (name === "root") continue;
      const b = this.bones[name], tgt = P[name] || [0, 0, 0], c = this.cur[name] || (this.cur[name] = [0, 0, 0]);
      for (let i = 0; i < 3; i++) c[i] += (tgt[i] - c[i]) * k;
      b.rotation.set(c[0], c[1], c[2]);
    }
    const c = this.curR;
    for (const key of ["y", "x", "ry", "rz", "px", "pz"]) c[key] += ((R[key] || 0) - c[key]) * (this.trick ? 1 : 1 - Math.exp(-dt * 6));
    const r = this.root;
    r.position.set(c.px, c.y, c.pz); r.rotation.set(c.x, c.ry, c.rz, "YXZ");
    // для лежания на боку вращаем вокруг центра корпуса
    if (R.sleep || Math.abs(c.rz) > 0.01) { const piv = V(0, 0.5, 0); const q = new THREE.Quaternion().setFromEuler(r.rotation); const off = piv.clone().sub(piv.clone().applyQuaternion(q)); r.position.add(off); }
    this.shadow.scale.set(1 + Math.abs(Math.sin(c.rz)) * -0.2, 1, 1);
    const v = this.view, cx = Math.sin(v.az) * v.dist, cz = Math.cos(v.az) * v.dist;
    this.camera.position.set(cx, v.ty + Math.sin(v.el) * v.dist, cz); this.camera.lookAt(0, v.ty, 0);
    this.renderer.render(this.scene, this.camera);
  }
  dispose() { cancelAnimationFrame(this.raf); clearTimeout(this.actTimer); this.dead = true; try { this.renderer.dispose(); } catch {} }
}
