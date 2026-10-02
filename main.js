/* ============================================================
   LAKSHYA — Three Lands, One Journey
   main.js · page behaviour (no dependencies, no build step)

   The 3D world lives in scene.js as a separate ES module, so a
   missing WebGL context or a blocked CDN can never take the
   navigation, reveals or counters down with it.
   ============================================================ */

/* ────────────────────────────────────────────────────────────
   0. Helpers
   ──────────────────────────────────────────────────────────── */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const canHover     = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const root         = document.documentElement;

document.documentElement.classList.add('js');

/* ────────────────────────────────────────────────────────────
   1. Zones — the single source of truth for "where are we?"
      Sections carry data-zone; the section sitting under the
      middle of the viewport wins. scene.js listens for the
      event and flies the camera there.
   ──────────────────────────────────────────────────────────── */
const ZONES = [
  { place: 'Departure',          coord: 'boarding · gate 07',        accent: '--a-hero'    },
  { place: 'London',             coord: '51.5074° N · 0.1278° W',    accent: '--a-london'  },
  { place: 'India',              coord: '28.6139° N · 77.2090° E',   accent: '--a-india'   },
  { place: 'Ireland',            coord: '53.3498° N · 6.2603° W',    accent: '--a-ireland' },
  { place: 'The long way round', coord: '41,286 km · 3 countries',   accent: '--a-route'   },
];

const zoneSections = $$('[data-zone]');
let currentZone = -1;

function detectZone() {
  const mid = window.innerHeight * 0.5;
  let nearest = 0;
  let nearestDist = Infinity;

  for (const el of zoneSections) {
    const r = el.getBoundingClientRect();
    // the section the viewport centre is actually inside wins outright
    if (r.top <= mid && r.bottom >= mid) return Number(el.dataset.zone) || 0;

    const dist = Math.abs(r.top + r.height / 2 - mid);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = Number(el.dataset.zone) || 0;
    }
  }
  return nearest;
}

function applyZone(zone) {
  if (zone === currentZone) return;
  currentZone = zone;

  const meta = ZONES[zone] || ZONES[0];

  root.style.setProperty('--accent', `var(${meta.accent})`);
  document.body.dataset.zone = String(zone);

  const place = $('#hud-place');
  const coord = $('#hud-coord');
  if (place) place.textContent = meta.place;
  if (coord) coord.textContent = meta.coord;

  window.dispatchEvent(new CustomEvent('zone:change', { detail: { zone } }));
}

/* ────────────────────────────────────────────────────────────
   2. Loader
   ──────────────────────────────────────────────────────────── */
function initLoader() {
  const loader = $('#loader');
  const bar = loader && $('.loader__bar i', loader);
  const pct = $('#load-pct');
  if (!loader) return;

  let progress = 0;
  let done = false;

  const tick = window.setInterval(() => {
    // ease toward 92% and wait there for window load
    progress += Math.max(1.5, (92 - progress) * 0.12);
    if (progress > 92) progress = 92;
    if (bar) bar.style.width = progress + '%';
    if (pct) pct.textContent = Math.round(progress);
  }, 90);

  function finish() {
    if (done) return;
    done = true;
    window.clearInterval(tick);
    if (bar) bar.style.width = '100%';
    if (pct) pct.textContent = '100';
    window.setTimeout(() => {
      loader.classList.add('is-hidden');
      root.classList.add('is-ready');
      document.body.style.overflow = '';
    }, reduceMotion ? 0 : 380);
  }

  // hold the page still while "boarding"
  document.body.style.overflow = 'hidden';

  if (document.readyState === 'complete') window.setTimeout(finish, 700);
  else window.addEventListener('load', () => window.setTimeout(finish, 700));

  // absolute safety net — never trap the user behind the loader
  window.setTimeout(finish, 6000);
}

/* ────────────────────────────────────────────────────────────
   3. Navigation
   ──────────────────────────────────────────────────────────── */
function initNav() {
  const nav = $('#nav');
  const toggle = $('#nav-toggle');
  const menu = $('#nav-menu');

  const closeMenu = () => {
    if (!menu || !toggle) return;
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  };

  toggle?.addEventListener('click', () => {
    const open = menu.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });

  menu?.addEventListener('click', (e) => {
    if (e.target.closest('a')) closeMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  // highlight the chapter you are actually inside
  const links = $$('#nav-menu a[href^="#"]');
  const targets = links
    .map((a) => ({ a, el: document.getElementById(a.getAttribute('href').slice(1)) }))
    .filter((t) => t.el);

  const setActive = () => {
    const mid = window.innerHeight * 0.4;
    let match = targets[0];
    for (const t of targets) {
      if (t.el.getBoundingClientRect().top <= mid) match = t;
    }
    links.forEach((a) => a.classList.toggle('is-active', a === match?.a));
  };

  // sticky nav state + active link, both driven by one scroll handler
  const onScroll = () => {
    nav?.classList.toggle('is-stuck', window.scrollY > 40);
    setActive();
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ────────────────────────────────────────────────────────────
   4. Rotating tagline word
   ──────────────────────────────────────────────────────────── */
function initRotator() {
  const el = $('#rotator');
  if (!el || reduceMotion) return;

  const words = ['London', 'India', 'Ireland', 'the long way round'];
  let i = 0;

  window.setInterval(() => {
    i = (i + 1) % words.length;
    el.classList.remove('is-swap');
    void el.offsetWidth;               // restart the animation
    el.textContent = words[i];
    el.classList.add('is-swap');
  }, 2800);
}

/* ────────────────────────────────────────────────────────────
   5. Split text — per-character reveal
   ──────────────────────────────────────────────────────────── */
function initSplit() {
  $$('[data-split]').forEach((el) => {
    const text = el.textContent.trim();
    const frag = document.createDocumentFragment();
    let index = 0;

    for (const word of text.split(/\s+/)) {
      const wrap = document.createElement('span');
      wrap.style.display = 'inline-block';
      wrap.style.whiteSpace = 'nowrap';

      for (const ch of word) {
        const span = document.createElement('span');
        span.className = 'char';
        span.textContent = ch;
        span.style.transitionDelay = `${Math.min(index * 45, 900)}ms`;
        wrap.appendChild(span);
        index += 1;
      }
      frag.appendChild(wrap);
      frag.appendChild(document.createTextNode(' '));
      index += 1;
    }

    el.setAttribute('aria-label', text);
    el.textContent = '';
    el.appendChild(frag);
  });
}

/* ────────────────────────────────────────────────────────────
   6. Scroll reveals
   ──────────────────────────────────────────────────────────── */
function initReveals() {
  const items = $$('.reveal, [data-split]');

  // stagger siblings inside the same group
  const groups = ['.highlights', '.cards', '.itin', '.journal', '.facts', '.stats'];
  groups.forEach((sel) => {
    $$(sel).forEach((group) => {
      $$('.reveal', group).forEach((el, i) => {
        el.style.transitionDelay = `${Math.min(i * 90, 540)}ms`;
      });
    });
  });

  if (!('IntersectionObserver' in window) || reduceMotion) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.12 }
  );

  items.forEach((el) => io.observe(el));

  // never leave content invisible if the observer misbehaves
  window.setTimeout(() => items.forEach((el) => el.classList.add('is-in')), 4000);
}

/* ────────────────────────────────────────────────────────────
   7. Counters
   ──────────────────────────────────────────────────────────── */
function initCounters() {
  const nums = $$('[data-count]');
  if (!nums.length) return;

  const run = (el) => {
    const target = Number(el.dataset.count) || 0;
    if (reduceMotion) {
      el.textContent = target.toLocaleString('en-GB');
      return;
    }
    const duration = 1500;
    const start = performance.now();

    const step = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString('en-GB');
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  if (!('IntersectionObserver' in window)) {
    nums.forEach(run);
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        run(entry.target);
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.6 }
  );

  nums.forEach((el) => io.observe(el));
}

/* ────────────────────────────────────────────────────────────
   8. Card tilt
   ──────────────────────────────────────────────────────────── */
function initTilt() {
  if (!canHover || reduceMotion) return;

  $$('[data-tilt]').forEach((card) => {
    let raf = 0;

    const move = (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;

      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        card.style.transform =
          `perspective(900px) rotateY(${px * 11}deg) rotateX(${-py * 11}deg) translateY(-6px) scale(1.015)`;
      });
    };

    const reset = () => {
      cancelAnimationFrame(raf);
      card.style.transform = '';
    };

    card.addEventListener('pointermove', move);
    card.addEventListener('pointerleave', reset);
  });
}

/* ────────────────────────────────────────────────────────────
   9. Parallax (ghost chapter numbers)
   ──────────────────────────────────────────────────────────── */
function initParallax() {
  const items = $$('[data-parallax]');
  if (!items.length || reduceMotion) return;

  const update = () => {
    const vh = window.innerHeight;
    for (const el of items) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      const speed = Number(el.dataset.parallax) || 0.15;
      const offset = (r.top + r.height / 2 - vh / 2) * speed;
      el.style.transform = `translateY(${offset.toFixed(1)}px)`;
    }
  };

  let raf = 0;
  const onScroll = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
}

/* ────────────────────────────────────────────────────────────
   10. Route map — draw the arcs as you scroll past
   ──────────────────────────────────────────────────────────── */
function initMap() {
  const section = $('#route');
  const paths = $$('.map__route:not(.map__route--return)');
  if (!section || !paths.length) return;

  paths.forEach((p) => {
    const len = p.getTotalLength();
    p.dataset.len = String(len);
    p.style.strokeDasharray = String(len);
    p.style.strokeDashoffset = String(len);
    p.style.transition = 'none';
  });

  const update = () => {
    const r = section.getBoundingClientRect();
    const vh = window.innerHeight;
    // 0 when the section enters from the bottom, 1 once it is well inside
    const raw = (vh - r.top) / (vh + r.height * 0.55);
    const p = Math.min(Math.max(raw, 0), 1);

    paths.forEach((path, i) => {
      const local = Math.min(Math.max((p - i * 0.22) / 0.6, 0), 1);
      path.style.strokeDashoffset = String(Number(path.dataset.len) * (1 - local));
    });
  };

  let raf = 0;
  const onScroll = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
}

/* ────────────────────────────────────────────────────────────
   11. Pointer — a glow trail plus Lakshya's travelling companion

   She is dragged along behind the pointer: the casing swings back on its
   handle the faster she is pulled, the wheels roll, and the legs run a
   walk cycle. She turns to face the direction of travel, and lifts when
   you hover something you can actually click.
   ──────────────────────────────────────────────────────────── */
function initPointer() {
  const glow = $('#cursor');
  const walker = $('#walker');
  const pivot = $('#walker-pivot');
  if (!glow || !walker || !pivot || !canHover) return;

  const parts = {
    upper: $('#w-upper', walker),
    legFront: $('#leg-front', walker),
    legBack: $('#leg-back', walker),
    bag: $('#w-bag', walker),
    wheelA: $('#wheel-a', walker),
    wheelB: $('#wheel-b', walker),
  };
  if (Object.values(parts).some((p) => !p)) return;

  const HIP = [53, 42];    // legs hinge here
  const PIVOT = [34, 32];  // and the case swings on the grip
  const ease = (dt, rate) => 1 - Math.exp(-dt * rate);

  let tx = window.innerWidth / 2;
  let ty = window.innerHeight / 2;
  let gx = tx, gy = ty;                 // glow — slowest, so it trails
  let x = tx, y = ty;                   // walker — quick, so it feels like a cursor
  let px = x, py = y;
  let speed = 0, phase = 0, facing = 1;
  let bagAngle = 0, wheelSpin = 0, lift = 0, liftTarget = 0;
  let placed = false;

  window.addEventListener('pointermove', (e) => {
    tx = e.clientX;
    ty = e.clientY;

    if (!placed) {
      // first sighting: drop her in place, then hide the system cursor so
      // there is never a moment with no pointer at all
      placed = true;
      x = gx = tx;
      y = gy = ty;
      walker.classList.add('is-on');
      glow.style.opacity = '0.3';
      root.classList.add('has-walker');
    }
  }, { passive: true });

  document.addEventListener('pointerleave', () => {
    walker.classList.remove('is-on');
    glow.style.opacity = '0';
  });

  document.addEventListener('pointerover', (e) => {
    if (!(e.target instanceof Element)) return;
    const hot = !!e.target.closest('a, button, input, .card, [data-tilt]');
    liftTarget = hot ? 1 : 0;
    walker.classList.toggle('is-active', hot);
  });

  let last = performance.now();

  const loop = (now) => {
    const dt = Math.min(Math.max((now - last) / 1000, 0.001), 0.05);
    last = now;

    /* glow trails furthest behind */
    gx += (tx - gx) * ease(dt, 6);
    gy += (ty - gy) * ease(dt, 6);
    glow.style.transform = `translate3d(${gx.toFixed(1)}px, ${gy.toFixed(1)}px, 0)`;

    /* she keeps right up with it */
    px = x;
    py = y;
    x += (tx - x) * ease(dt, 17);
    y += (ty - y) * ease(dt, 17);
    walker.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;

    const vx = (x - px) / dt;
    const vy = (y - py) / dt;
    speed += (Math.hypot(vx, vy) - speed) * ease(dt, 7);

    // turn to face the way she is being pulled (hysteresis stops flicker)
    if (vx > 70) facing = 1;
    else if (vx < -70) facing = -1;

    if (reduceMotion) {
      // no walk cycle for reduced-motion users — she is just carried along
      pivot.style.transform = `scaleX(${facing})`;
      requestAnimationFrame(loop);
      return;
    }

    const moving = Math.min(speed / 900, 1);
    phase += dt * (2.4 + speed * 0.02);

    const swing = Math.sin(phase) * 30 * moving;
    parts.legFront.setAttribute('transform', `rotate(${swing.toFixed(1)} ${HIP[0]} ${HIP[1]})`);
    parts.legBack.setAttribute('transform', `rotate(${(-swing).toFixed(1)} ${HIP[0]} ${HIP[1]})`);

    // the case always trails back, and further the harder she is pulled
    bagAngle += (-10 * moving - bagAngle) * ease(dt, 5);
    parts.bag.setAttribute('transform', `rotate(${bagAngle.toFixed(2)} ${PIVOT[0]} ${PIVOT[1]})`);

    wheelSpin = (wheelSpin + speed * dt * 0.45) % 360;
    parts.wheelA.setAttribute('transform', `rotate(${wheelSpin.toFixed(1)} 12.5 58)`);
    parts.wheelB.setAttribute('transform', `rotate(${wheelSpin.toFixed(1)} 21.5 58)`);

    // step-bob on the upper body only — her feet stay planted
    lift += (liftTarget - lift) * ease(dt, 9);
    const bob = -(Math.abs(Math.sin(phase)) * 1.8 * moving + lift * 2.2);
    parts.upper.setAttribute('transform', `translate(0 ${bob.toFixed(2)})`);

    pivot.style.transform = `scaleX(${facing})`;

    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
}

/* ────────────────────────────────────────────────────────────
   12. Scroll progress bar
   ──────────────────────────────────────────────────────────── */
function initProgress() {
  const bar = $('#progress-bar');
  if (!bar) return;

  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? window.scrollY / max : 0;
    bar.style.width = (p * 100).toFixed(2) + '%';
  };

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}

/* ────────────────────────────────────────────────────────────
   13. Misc
   ──────────────────────────────────────────────────────────── */
function initMisc() {
  const year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());
}

/* ────────────────────────────────────────────────────────────
   14. One scroll loop for zone detection
   ──────────────────────────────────────────────────────────── */
function initZoneLoop() {
  let raf = 0;

  const run = () => {
    applyZone(detectZone());
    raf = 0;
  };

  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(run);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  run();
}

/* ────────────────────────────────────────────────────────────
   Boot
   ──────────────────────────────────────────────────────────── */
initLoader();
initNav();
initRotator();
initSplit();
initReveals();
initCounters();
initTilt();
initParallax();
initMap();
initPointer();
initProgress();
initMisc();
initZoneLoop();
