/* ============================================================
   LAKSHYA — Three Lands, One Journey
   scene.js · the Three.js world

   A camera that flies between waypoints, one per chapter:
     0 hero  →  globe
     1       →  London   (Big Ben + the London Eye)
     2       →  India    (Taj Mahal + minarets)
     3       →  Ireland  (Cliffs of Moher + round tower)
     4       →  the finale

   The page tells this module where we are via the `zone:change`
   event (main.js owns the zone logic). Everything else here is
   continuous: damping, fog, warp streaks, an orbiting plane.

   Kept as its own ES module so a missing WebGL context or a
   blocked CDN can never take the rest of the page down.
   ============================================================ */

import * as THREE from 'three';

const canvas = document.getElementById('world');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = THREE.MathUtils.clamp;

function supportsWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

if (!canvas || !supportsWebGL()) {
  canvas?.remove();
  document.documentElement.classList.add('no-3d');
} else {
  try {
    init(canvas);
  } catch (err) {
    console.warn('[scene] 3D unavailable, falling back to the CSS aurora.', err);
    canvas.remove();
    document.documentElement.classList.add('no-3d');
  }
}

/* ════════════════════════════════════════════════════════════
   The world
   ════════════════════════════════════════════════════════════ */
function init(canvasEl) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const narrow = () => window.innerWidth < 880;

  /* ---------- waypoints ---------- */
  const ZONES = [
    { key: 'hero',    anchor: V(0, 0, 0),      cam: V(0, 2.6, 15),   focusY: 0.4, sky: 0x060a14, fog: 0x0a1224, accent: 0x3ddc84 },
    { key: 'london',  anchor: V(5.5, 0, -95),  cam: V(3.0, 6.4, -73), focusY: 5.6, sky: 0x070b18, fog: 0x121a36, accent: 0x7aa2ff },
    { key: 'india',   anchor: V(-5.5, 0, -190),cam: V(-3.0, 7.0, -167), focusY: 4.6, sky: 0x120a14, fog: 0x2a1330, accent: 0xffb347 },
    { key: 'ireland', anchor: V(5.5, 0, -285), cam: V(3.0, 6.0, -262), focusY: 3.8, sky: 0x04120d, fog: 0x0a2a20, accent: 0x35d07f },
    { key: 'finale',  anchor: V(0, 2, -380),   cam: V(0, 4.0, -349), focusY: 2.0, sky: 0x0d0920, fog: 0x2a1c5c, accent: 0xb98cff },
  ];
  ZONES.forEach((z) => {
    z.focus = V(z.anchor.x * 0.55, z.focusY, z.anchor.z);
  });

  /* ---------- renderer / scene / camera ---------- */
  const renderer = new THREE.WebGLRenderer({
    canvas: canvasEl,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const bgColor = new THREE.Color(ZONES[0].sky);
  const fogColor = new THREE.Color(ZONES[0].fog);
  const accent = new THREE.Color(ZONES[0].accent);
  scene.background = bgColor;
  scene.fog = new THREE.Fog(fogColor.getHex(), 52, 168);

  const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 900);

  /* ---------- image-based lighting ----------
     Without an environment map every material with metalness > 0 renders
     almost black: metals have no diffuse term, and there is nothing for
     them to reflect. This procedural sky gradient is what makes the globe,
     the Eye's steel, the Taj's gold and the water read as metal rather
     than as shadow. */
  (function buildEnvironment() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.00, '#33487a');
    grad.addColorStop(0.42, '#89a9d8');
    grad.addColorStop(0.52, '#d3e0f2');
    grad.addColorStop(0.63, '#44536d');
    grad.addColorStop(1.00, '#161e2b');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 256);

    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    scene.environment = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    tex.dispose();
  })();

  /* ---------- lights ---------- */
  scene.add(new THREE.HemisphereLight(0x93aaff, 0x0a1018, 0.55));
  scene.add(new THREE.AmbientLight(0xffffff, 0.16));

  const key = new THREE.DirectionalLight(0xfff2dd, 2.2);
  key.position.set(14, 28, 16);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x4d6bff, 0.7);
  fill.position.set(-16, 10, -22);
  scene.add(fill);

  // two lights that ride along with the camera — a moving headlight, which
  // also sells the sense of travel. Physical units, so these need real values.
  const rimA = new THREE.PointLight(0xffffff, 400, 80, 2);
  const rimB = new THREE.PointLight(0xffffff, 300, 75, 2);
  scene.add(rimA, rimB);

  /* ---------- shared material helpers ---------- */
  const mat = (color, o = {}) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: o.roughness ?? 0.78,
      metalness: o.metalness ?? 0.08,
      emissive: o.emissive ?? 0x000000,
      emissiveIntensity: o.emissiveIntensity ?? 1,
      flatShading: !!o.flat,
      transparent: !!o.transparent,
      opacity: o.opacity ?? 1,
      side: o.side ?? THREE.FrontSide,
    });

  function blobShadow(radius, opacity = 0.5) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, `rgba(0,0,0,${opacity})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 2, radius * 2),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(c),
        transparent: true,
        depthWrite: false,
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.02;
    return mesh;
  }

  /* ---------- animation registry ---------- */
  const animators = [];
  const onFrame = (fn) => animators.push(fn);

  /* ══════════════════════════════════════════════════════════
     HERO — a globe with orbit rings and a tiny plane
     ══════════════════════════════════════════════════════════ */
  function buildGlobe() {
    const g = new THREE.Group();

    g.add(new THREE.Mesh(
      new THREE.SphereGeometry(4, 48, 32),
      mat(0x1d3459, { roughness: 0.4, metalness: 0.5, emissive: 0x10395a, emissiveIntensity: 1.15 })
    ));

    g.add(new THREE.Mesh(
      new THREE.SphereGeometry(4.05, 30, 18),
      new THREE.MeshBasicMaterial({ color: 0x3ddc84, wireframe: true, transparent: true, opacity: 0.2 })
    ));

    g.add(new THREE.Mesh(
      new THREE.SphereGeometry(4.8, 32, 24),
      new THREE.MeshBasicMaterial({
        color: 0x2ad4ff, transparent: true, opacity: 0.05,
        side: THREE.BackSide, depthWrite: false,
      })
    ));

    // landmass speckle, fibonacci-distributed on the surface
    const N = 1100;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = i * 2.399963;
      const rad = 4.1;
      pos[i * 3] = Math.cos(theta) * r * rad;
      pos[i * 3 + 1] = y * rad;
      pos[i * 3 + 2] = Math.sin(theta) * r * rad;
    }
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.add(new THREE.Points(dotGeo, new THREE.PointsMaterial({
      color: 0x8ff7c8, size: 0.08, transparent: true, opacity: 0.85, depthWrite: false,
    })));

    // orbit rings, each carrying a satellite; the largest carries a plane
    const ringSpecs = [
      { r: 5.6, tilt: [0.22, 0, 0.36], color: 0x35d07f, speed: 0.26, plane: false },
      { r: 6.5, tilt: [0.95, 0.42, -0.2], color: 0x7aa2ff, speed: -0.19, plane: true },
      { r: 7.4, tilt: [-0.5, 0.2, 0.72], color: 0xffb347, speed: 0.12, plane: false },
    ];

    ringSpecs.forEach((s) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(s.r, 0.022, 8, 180),
        new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.45 })
      );
      ring.rotation.set(...s.tilt);

      if (s.plane) {
        const p = makePlane(0xffffff, 1.35);
        p.position.set(s.r, 0, 0);
        p.rotation.z = Math.PI / 2;
        ring.add(p);
      } else {
        const sat = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 10, 8),
          new THREE.MeshBasicMaterial({ color: s.color })
        );
        sat.position.set(s.r, 0, 0);
        ring.add(sat);
      }

      g.add(ring);
      onFrame((t, dt) => { ring.rotation.z += s.speed * dt; });
    });

    onFrame((t) => {
      g.rotation.y = t * 0.055;
      g.position.y = Math.sin(t * 0.5) * 0.22;
    });

    return g;
  }

  /* ══════════════════════════════════════════════════════════
     LONDON — Big Ben, Parliament, the London Eye
     ══════════════════════════════════════════════════════════ */
  function buildLondon() {
    const g = new THREE.Group();

    const stone = mat(0x9dabc2, { roughness: 0.86 });
    const dark = mat(0x2c3452, { roughness: 0.8 });
    const gold = mat(0xd8c07e, { roughness: 0.35, metalness: 0.75, emissive: 0x33280d, emissiveIntensity: 0.7 });
    const faceMat = new THREE.MeshBasicMaterial({ color: 0xfff4d2 });
    const steel = mat(0x8fb4ff, { roughness: 0.35, metalness: 0.7, emissive: 0x14243f, emissiveIntensity: 0.8 });
    const glass = mat(0xcfe2ff, { roughness: 0.1, metalness: 0.4, emissive: 0x1a3355, emissiveIntensity: 1 });

    // ── Big Ben ──
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.32, 9, 4), stone);
    tower.position.y = 4.5;
    tower.rotation.y = Math.PI / 4;
    g.add(tower);

    const clockBox = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.5, 2.5), stone);
    clockBox.position.y = 10.3;
    g.add(clockBox);

    const faceGeo = new THREE.CircleGeometry(0.78, 28);
    const faces = [
      [0, 10.3, 1.27, 0],
      [0, 10.3, -1.27, Math.PI],
      [1.27, 10.3, 0, Math.PI / 2],
      [-1.27, 10.3, 0, -Math.PI / 2],
    ];
    faces.forEach(([x, y, z, ry]) => {
      const f = new THREE.Mesh(faceGeo, faceMat);
      f.position.set(x, y, z);
      f.rotation.y = ry;
      g.add(f);
    });

    const trim = new THREE.Mesh(new THREE.CylinderGeometry(1.56, 1.56, 0.3, 4), gold);
    trim.position.y = 11.68;
    trim.rotation.y = Math.PI / 4;
    g.add(trim);

    const spire = new THREE.Mesh(new THREE.ConeGeometry(1.42, 3.4, 4), dark);
    spire.position.y = 13.3;
    spire.rotation.y = Math.PI / 4;
    g.add(spire);

    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.9, 8), gold);
    finial.position.y = 15.3;
    g.add(finial);

    // ── Palace of Westminster, stepping into the distance ──
    for (let i = 0; i < 5; i++) {
      const h = 2.4 + (i % 3) * 0.6;
      const block = new THREE.Mesh(new THREE.BoxGeometry(2.2 + (i % 2) * 0.9, h, 2.7), stone);
      block.position.set(-2.7 - i * 2.5, h / 2, -0.5 + (i % 2) * 0.9);
      g.add(block);
    }

    // ── the London Eye ──
    const eye = new THREE.Group();
    eye.position.set(8.8, 0, 1.6);
    eye.rotation.y = -0.55;

    const wheel = new THREE.Group();
    wheel.position.y = 4.4;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.13, 10, 72), steel);
    wheel.add(rim);

    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;

      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.5, 6), steel);
      spoke.position.set(Math.cos(a) * 1.75, Math.sin(a) * 1.75, 0);
      spoke.rotation.z = a - Math.PI / 2;
      wheel.add(spoke);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.44, 0.92), glass);
      cap.position.set(Math.cos(a) * 3.5, Math.sin(a) * 3.5, 0);
      cap.rotation.z = a;
      wheel.add(cap);
    }
    eye.add(wheel);

    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.44, 16, 12), steel);
    hub.position.y = 4.4;
    eye.add(hub);

    [-1, 1].forEach((s) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 4.8, 8), steel);
      leg.position.set(s * 1.55, 2.1, 0);
      leg.rotation.z = s * 0.33;
      eye.add(leg);
    });
    g.add(eye);

    onFrame((t, dt) => { wheel.rotation.z += 0.13 * dt; });
    onFrame((t) => { eye.rotation.y = -0.55 + Math.sin(t * 0.3) * 0.06; });

    g.add(blobShadow(13, 0.55));
    return g;
  }

  /* ══════════════════════════════════════════════════════════
     INDIA — the Taj Mahal, its minarets and reflecting pool
     ══════════════════════════════════════════════════════════ */
  function buildIndia() {
    const g = new THREE.Group();

    const marble = mat(0xf2e8d6, { roughness: 0.55, emissive: 0x1a1408, emissiveIntensity: 0.55 });
    const marble2 = mat(0xdccfb6, { roughness: 0.72 });
    const gold = mat(0xd9a13b, { roughness: 0.3, metalness: 0.85 });
    const archDark = mat(0x241c14, { roughness: 1 });
    const treeMat = mat(0x1f5c3a, { roughness: 1, flat: true });
    const water = mat(0x1c4c6e, { roughness: 0.12, metalness: 0.65, emissive: 0x0b2436, emissiveIntensity: 0.9 });

    // plinth
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(13, 0.7, 13), marble2);
    plinth.position.y = 0.35;
    g.add(plinth);

    // main block
    const block = new THREE.Mesh(new THREE.BoxGeometry(7, 5.4, 7), marble);
    block.position.y = 3.4;
    g.add(block);

    // four iwan arches
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const nx = Math.sin(a);
      const nz = Math.cos(a);

      const niche = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 3.2), archDark);
      niche.position.set(nx * 3.53, 3.3, nz * 3.53);
      niche.rotation.y = a;
      g.add(niche);

      const arch = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.11, 8, 22, Math.PI), marble);
      arch.position.set(nx * 3.6, 4.9, nz * 3.6);
      arch.rotation.y = a;
      g.add(arch);
    }

    // drum + onion dome
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 1.2, 36), marble2);
    drum.position.y = 6.7;
    g.add(drum);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(2.5, 44, 24, 0, Math.PI * 2, 0, Math.PI / 2),
      marble
    );
    dome.position.y = 7.3;
    g.add(dome);

    const finialStem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.7, 8), gold);
    finialStem.position.y = 10.6;
    g.add(finialStem);

    const finialBall = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), gold);
    finialBall.position.y = 11.5;
    g.add(finialBall);

    // four minarets
    [[-4.95, -4.95], [4.95, -4.95], [-4.95, 4.95], [4.95, 4.95]].forEach(([x, z]) => {
      const m = new THREE.Group();

      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.44, 8, 16), marble);
      shaft.position.y = 4;
      m.add(shaft);

      [3.1, 5.6].forEach((y) => {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.22, 16), marble2);
        ring.position.y = y;
        m.add(ring);
      });

      const cupola = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        marble
      );
      cupola.position.y = 8.05;
      m.add(cupola);

      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 10), gold);
      tip.position.y = 8.9;
      m.add(tip);

      m.position.set(x, 0.7, z);
      g.add(m);
    });

    // reflecting pool + cypress avenue
    const pool = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 13), water);
    pool.position.set(0, 0.75, 11);
    g.add(pool);

    for (let i = 0; i < 6; i++) {
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.8, 6), mat(0x3a2a1c, { roughness: 1 }));
      trunk.position.y = 0.4;
      t.add(trunk);

      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.52, 3.4, 9), treeMat);
      cone.position.y = 2.4;
      t.add(cone);

      t.position.set((i < 3 ? -1 : 1) * 2.6, 0.7, 5.5 + (i % 3) * 4.4);
      g.add(t);
    }

    onFrame((t) => {
      water.emissiveIntensity = 0.75 + Math.sin(t * 1.1) * 0.25;
    });

    g.add(blobShadow(14, 0.5));
    return g;
  }

  /* ══════════════════════════════════════════════════════════
     IRELAND — the Cliffs of Moher, a round tower, standing stones
     ══════════════════════════════════════════════════════════ */
  function buildIreland() {
    const g = new THREE.Group();

    const rock = mat(0x4c5d55, { roughness: 0.96, flat: true });
    const rockDark = mat(0x35433d, { roughness: 1, flat: true });
    const grass = mat(0x3d9459, { roughness: 0.94, flat: true });
    const sea = mat(0x14586a, { roughness: 0.22, metalness: 0.5, emissive: 0x0b3543, emissiveIntensity: 1.1 });

    // the Atlantic
    const seaPlane = new THREE.Mesh(new THREE.PlaneGeometry(150, 110), sea);
    seaPlane.rotation.x = -Math.PI / 2;
    seaPlane.position.set(6, -1.5, 22);
    g.add(seaPlane);

    // grass headland
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(52, 30), grass);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0.01, -5);
    g.add(ground);

    // stepped cliff wall
    const slabs = [
      [-11.5, 3.2, 1.5, 3.4, 6.4, 4.4],
      [-8.4, 4.4, -0.6, 3.4, 8.8, 4.6],
      [-5.2, 2.9, 0.9, 3.6, 5.8, 4.2],
      [-1.9, 5.1, -0.4, 4.0, 10.2, 4.8],
      [1.8, 3.7, 0.7, 3.4, 7.4, 4.4],
      [5.0, 4.5, -0.8, 3.2, 9.0, 4.2],
      [8.0, 3.0, 0.4, 3.0, 6.0, 4.0],
    ];

    slabs.forEach(([x, y, z, w, h, d], i) => {
      const rot = Math.sin(i * 2.1) * 0.2;

      const s = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), i % 2 ? rock : rockDark);
      s.position.set(x, y, z);
      s.rotation.y = rot;
      g.add(s);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.34, d * 1.02), grass);
      cap.position.set(x, y + h / 2 + 0.13, z);
      cap.rotation.y = rot;
      g.add(cap);
    });

    // sea stack
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.5, 4.6, 7), rockDark);
    stack.position.set(13.5, 0.8, 11);
    g.add(stack);

    const stackCap = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.42, 2.2), grass);
    stackCap.position.set(13.5, 3.2, 11);
    g.add(stackCap);

    // O'Brien's round tower on the headland
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.8, 5.4, 18), rock);
    tower.position.set(13, 2.7, -3.5);
    g.add(tower);

    const towerCap = new THREE.Mesh(new THREE.ConeGeometry(0.92, 1.4, 18), rockDark);
    towerCap.position.set(13, 6.1, -3.5);
    g.add(towerCap);

    // standing stones
    for (let i = 0; i < 3; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.72, 2.4 + i * 0.55, 0.46), rockDark);
      st.position.set(-9.5 + i * 2.6, 1.3, 8.5 + (i % 2) * 1.3);
      st.rotation.set((i - 1) * 0.09, i * 0.7, (i - 1) * 0.07);
      g.add(st);
    }

    onFrame((t) => {
      seaPlane.position.y = -1.5 + Math.sin(t * 0.8) * 0.07;
      sea.emissiveIntensity = 0.75 + Math.sin(t * 0.9) * 0.2;
      stackCap.rotation.y = Math.sin(t * 0.4) * 0.05;
    });

    g.add(blobShadow(16, 0.5));
    return g;
  }

  /* ══════════════════════════════════════════════════════════
     FINALE — a gate of light
     ══════════════════════════════════════════════════════════ */
  function buildFinale() {
    const g = new THREE.Group();

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 32, 24),
      mat(0xb98cff, { emissive: 0xb98cff, emissiveIntensity: 3.1, roughness: 0.3, metalness: 0.2 })
    );
    g.add(core);

    g.add(new THREE.Mesh(
      new THREE.SphereGeometry(4.4, 26, 18),
      new THREE.MeshBasicMaterial({ color: 0xb98cff, transparent: true, opacity: 0.09, side: THREE.BackSide, depthWrite: false })
    ));

    [6.2, 7.4, 8.6, 10.2].forEach((r, i) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.045, 8, 180),
        new THREE.MeshBasicMaterial({
          color: [0xb98cff, 0x6ea8ff, 0x35d07f, 0xffb347][i],
          transparent: true,
          opacity: 0.5,
        })
      );
      ring.rotation.set(0.4 + i * 0.3, i * 0.5, 0.2 + i * 0.25);
      g.add(ring);
      onFrame((t, dt) => { ring.rotation.z += (0.1 + i * 0.06) * dt; });
    });

    // shell of particles
    const N = 2200;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 3.5 + Math.pow(Math.random(), 0.7) * 13;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const cloud = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xd9c4ff, size: 0.15, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    g.add(cloud);

    onFrame((t) => {
      cloud.rotation.y = t * 0.07;
      cloud.rotation.x = Math.sin(t * 0.2) * 0.12;
      core.scale.setScalar(1 + Math.sin(t * 1.4) * 0.06);
    });

    return g;
  }

  /* ══════════════════════════════════════════════════════════
     The little plane that flies the whole route
     ══════════════════════════════════════════════════════════ */
  function makePlane(color = 0xffffff, scale = 1) {
    const p = new THREE.Group();
    const m = mat(color, {
      roughness: 0.3, metalness: 0.6,
      emissive: color, emissiveIntensity: 0.35,
    });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.5, 4, 10), m);
    body.rotation.z = Math.PI / 2;
    p.add(body);

    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.76), m);
    wing.position.x = -0.04;
    p.add(wing);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.3), m);
    tail.position.x = -0.3;
    p.add(tail);

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.24, 0.02), m);
    fin.position.set(-0.3, 0.13, 0);
    p.add(fin);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 10), m);
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = 0.42;
    p.add(nose);

    p.scale.setScalar(scale);
    return p;
  }

  function buildFlyer() {
    const curve = new THREE.CatmullRomCurve3([
      V(16, 8, 26), V(-16, 11, -28), V(9, 9, -70), V(-18, 13, -120),
      V(6, 10, -150), V(-16, 14, -180), V(11, 10, -215), V(-18, 15, -250),
      V(8, 11, -290), V(-14, 16, -325), V(6, 13, -360), V(-4, 18, -400),
    ], false, 'catmullrom', 0.4);

    const plane = makePlane(0xffffff, 2.6);
    const trailMat = new THREE.LineBasicMaterial({
      color: 0x9fd8ff, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });

    const TRAIL = 90;
    const trailPos = new Float32Array(TRAIL * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    const trail = new THREE.Line(trailGeo, trailMat);
    trail.frustumCulled = false;

    const group = new THREE.Group();
    group.add(plane, trail);

    const head = new THREE.Vector3();
    const next = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const X = new THREE.Vector3(1, 0, 0);
    const q = new THREE.Quaternion();

    let t = 0;
    let last = 0;
    let initialized = false;

    onFrame((time, dt) => {
      t += dt * 0.028;
      if (t > 1) { t -= 1; initialized = false; }

      curve.getPointAt(t, head);
      curve.getPointAt(Math.min(t + 0.002, 1), next);
      plane.position.copy(head);
      dir.subVectors(next, head).normalize();
      q.setFromUnitVectors(X, dir);
      plane.quaternion.copy(q);

      if (!initialized) {
        for (let i = 0; i < TRAIL; i++) {
          trailPos[i * 3] = head.x;
          trailPos[i * 3 + 1] = head.y;
          trailPos[i * 3 + 2] = head.z;
        }
        initialized = true;
      }

      // shift the trail history forward one slot
      for (let i = TRAIL - 1; i > 0; i--) {
        trailPos[i * 3] = trailPos[(i - 1) * 3];
        trailPos[i * 3 + 1] = trailPos[(i - 1) * 3 + 1];
        trailPos[i * 3 + 2] = trailPos[(i - 1) * 3 + 2];
      }
      trailPos[0] = head.x;
      trailPos[1] = head.y;
      trailPos[2] = head.z;
      trailGeo.attributes.position.needsUpdate = true;
    });

    return group;
  }

  /* ══════════════════════════════════════════════════════════
     Environment: ground grid, starfield, warp streaks
     ══════════════════════════════════════════════════════════ */
  const grid = new THREE.GridHelper(760, 152, 0x2a4a7a, 0x16233c);
  grid.position.y = -0.06;
  grid.position.z = -180;
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  grid.material.depthWrite = false;
  scene.add(grid);

  function buildStars() {
    const N = 2800;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);

    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 420;
      pos[i * 3 + 1] = (Math.random() - 0.35) * 260;
      pos[i * 3 + 2] = 60 - Math.random() * 600;

      const tint = Math.random();
      const c = tint < 0.7 ? [1, 1, 1] : tint < 0.85 ? [0.75, 0.85, 1] : [1, 0.88, 0.72];
      col[i * 3] = c[0];
      col[i * 3 + 1] = c[1];
      col[i * 3 + 2] = c[2];
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    const stars = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 1.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      sizeAttenuation: true,
    }));

    scene.add(stars);
    onFrame((t) => { stars.rotation.y = t * 0.008; });
  }

  function buildStreaks() {
    const N = 460;
    const positions = new Float32Array(N * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: 0xa8ccff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });

    const lines = new THREE.LineSegments(geo, material);
    lines.frustumCulled = false;
    scene.add(lines);

    const xs = new Float32Array(N);
    const ys = new Float32Array(N);
    const zs = new Float32Array(N);

    const respawn = (i, camZ, spread) => {
      xs[i] = (Math.random() - 0.5) * 150;
      ys[i] = (Math.random() - 0.35) * 100;
      zs[i] = camZ - 40 - Math.random() * spread;
    };

    for (let i = 0; i < N; i++) respawn(i, 15, 260);

    return {
      lines,
      update(cameraZ, camDelta, speed) {
        const stretch = 1.6 + Math.min(speed, 90) * 0.42;

        for (let i = 0; i < N; i++) {
          // world-anchored: they fly past because the camera moves, not because they move
          zs[i] += -camDelta;

          if (zs[i] > cameraZ + 12) respawn(i, cameraZ, 260);

          const o = i * 6;
          positions[o] = xs[i];
          positions[o + 1] = ys[i];
          positions[o + 2] = zs[i];
          positions[o + 3] = xs[i];
          positions[o + 4] = ys[i];
          positions[o + 5] = zs[i] - stretch;
        }

        geo.attributes.position.needsUpdate = true;
        material.opacity = Math.min(Math.max((speed - 3) / 70, 0), 1) * 0.45;
      },
    };
  }

  /* ══════════════════════════════════════════════════════════
     Assemble
     ══════════════════════════════════════════════════════════ */
  const heroGroup = buildGlobe();
  const londonGroup = buildLondon();
  const indiaGroup = buildIndia();
  const irelandGroup = buildIreland();
  const finaleGroup = buildFinale();

  heroGroup.name = 'hero';
  scene.add(heroGroup);
  scene.add(blobShadow(9, 0.35));

  const landmarks = [
    { group: londonGroup, zone: 1 },
    { group: indiaGroup, zone: 2 },
    { group: irelandGroup, zone: 3 },
    { group: finaleGroup, zone: 4 },
  ];

  landmarks.forEach(({ group, zone: zi }) => {
    group.position.copy(ZONES[zi].anchor);
    scene.add(group);
  });

  scene.add(buildFlyer());
  buildStars();
  const streaks = buildStreaks();

  /** keeps the hero globe framed nicely on phones vs desktops */
  function layout() {
    if (narrow()) {
      heroGroup.position.set(0, -1.6, 0);
      ZONES[0].anchor.set(0, -1.6, 0);
      ZONES[0].cam.set(0, 1.4, 19);
      ZONES[0].focus.set(0, -0.6, 0);
    } else {
      heroGroup.position.set(4.8, 0, 0);
      ZONES[0].anchor.set(4.8, 0, 0);
      ZONES[0].cam.set(2.0, 2.6, 14.5);
      ZONES[0].focus.set(2.4, 0.6, 0);
    }
  }
  layout();

  /* one strong light per waypoint, dialled up only as you arrive — this is
     what guarantees each landmark is actually readable when you get there */
  const heroLights = ZONES.map((z) => {
    const l = new THREE.PointLight(z.accent, 0, 100, 2);
    l.position.set(z.anchor.x + 5, 13, z.anchor.z + 13);
    scene.add(l);
    return l;
  });

  /* ══════════════════════════════════════════════════════════
     State
     ══════════════════════════════════════════════════════════ */
  let zoneTarget = 0;
  let zoneSmooth = 0;
  const pointer = { x: 0, y: 0 };
  const pointerSmooth = { x: 0, y: 0 };
  let roll = 0;
  let prevCamX = ZONES[0].cam.x;
  let prevCamZ = ZONES[0].cam.z;
  let streakSpeed = 0;
  let running = true;

  window.addEventListener('zone:change', (e) => {
    const z = Number(e.detail?.zone);
    if (Number.isFinite(z)) zoneTarget = clamp(z, 0, ZONES.length - 1);
  });

  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    layout();
  });

  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) clock.getDelta();   // swallow the pause so nothing jumps
  });

  /* ══════════════════════════════════════════════════════════
     Render loop
     ══════════════════════════════════════════════════════════ */
  const clock = new THREE.Clock();
  const camPos = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const pA = new THREE.Vector3();
  const pB = new THREE.Vector3();
  const fA = new THREE.Vector3();
  const fB = new THREE.Vector3();
  const colA = new THREE.Color();
  const colB = new THREE.Color();
  const white = new THREE.Color(0xffffff);
  const whiteWash = new THREE.Color();

  function zoneColors(z) {
    const i = clamp(Math.floor(z), 0, ZONES.length - 1);
    const j = Math.min(i + 1, ZONES.length - 1);
    const f = clamp(z - i, 0, 1);

    colA.setHex(ZONES[i].sky);
    colB.setHex(ZONES[j].sky);
    bgColor.copy(colA).lerp(colB, f);
    scene.background = bgColor;

    colA.setHex(ZONES[i].fog);
    colB.setHex(ZONES[j].fog);
    fogColor.copy(colA).lerp(colB, f);
    scene.fog.color.copy(fogColor);

    colA.setHex(ZONES[i].accent);
    colB.setHex(ZONES[j].accent);
    accent.copy(colA).lerp(colB, f);
  }

  function frame() {
    if (!running) { requestAnimationFrame(frame); return; }

    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    /* ---- travel between waypoints ---- */
    const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 1.7);
    zoneSmooth += (zoneTarget - zoneSmooth) * k;

    const i0 = clamp(Math.floor(zoneSmooth), 0, ZONES.length - 1);
    const i1 = Math.min(i0 + 1, ZONES.length - 1);
    const f = clamp(zoneSmooth - i0, 0, 1);
    const e = f * f * (3 - 2 * f);           // smoothstep

    camPos.lerpVectors(pA.copy(ZONES[i0].cam), pB.copy(ZONES[i1].cam), e);
    lookAt.lerpVectors(fA.copy(ZONES[i0].focus), fB.copy(ZONES[i1].focus), e);

    // a wide swing around each landmark — this is what reads as "flying"
    if (i1 !== i0 && !reduceMotion) {
      const dir = Math.sign(ZONES[i1].anchor.x - ZONES[i0].anchor.x) || 1;
      const s = Math.sin(f * Math.PI);
      camPos.x += dir * 7 * s;
      camPos.y += 2.4 * s;
    }

    // idle float
    if (!reduceMotion) {
      camPos.y += Math.sin(t * 0.55) * 0.2;
      camPos.x += Math.cos(t * 0.42) * 0.14;
    }

    // pointer parallax
    pointerSmooth.x += (pointer.x - pointerSmooth.x) * (1 - Math.exp(-dt * 3));
    pointerSmooth.y += (pointer.y - pointerSmooth.y) * (1 - Math.exp(-dt * 3));
    camPos.x += pointerSmooth.x * 0.95;
    camPos.y += -pointerSmooth.y * 0.6;

    lookAt.x -= pointerSmooth.x * 0.6;
    lookAt.y += pointerSmooth.y * 0.4;

    camera.position.copy(camPos);
    camera.lookAt(lookAt);

    /* ---- roll into the turns ---- */
    const lateral = (camPos.x - prevCamX) / Math.max(dt, 0.001);
    prevCamX = camPos.x;
    const targetRoll = reduceMotion ? 0 : clamp(-lateral * 0.006, -0.075, 0.075);
    roll += (targetRoll - roll) * (1 - Math.exp(-dt * 2.2));
    camera.rotateZ(roll);

    /* ---- warp streaks: measured from how fast the camera is advancing ---- */
    const camDelta = camPos.z - prevCamZ;
    prevCamZ = camPos.z;
    const instant = Math.abs(camDelta) / Math.max(dt, 0.001);
    streakSpeed = THREE.MathUtils.damp(streakSpeed, reduceMotion ? 0 : instant, 6, dt);
    streaks.update(camPos.z, camDelta, streakSpeed);

    /* ---- ambience ---- */
    zoneColors(zoneSmooth);

    whiteWash.copy(accent).lerp(white, 0.45);
    rimA.color.copy(whiteWash);
    rimB.color.copy(accent);

    rimA.position.set(camPos.x + 3, camPos.y + 2.4, camPos.z + 1);
    rimB.position.set(camPos.x - 3.4, camPos.y - 1.2, camPos.z + 2.5);

    // the waypoint you are standing in front of gets the strong key light
    for (let i = 0; i < heroLights.length; i++) {
      const near = clamp(1 - Math.abs(zoneSmooth - i) / 1.15, 0, 1);
      heroLights[i].intensity = near * 300;
    }

    // landmarks breathe very slightly so they never look like static geometry
    if (!reduceMotion) {
      landmarks.forEach(({ group }, i) => {
        group.position.y = ZONES[i + 1].anchor.y + Math.sin(t * 0.5 + i) * 0.09;
      });
    }

    for (const fn of animators) fn(t, dt);

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
