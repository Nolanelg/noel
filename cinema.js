/* ============================================================
   Cinématiques avancées, dessinées en temps réel (canvas 2D)
   - hyper  : saut en hyperespace, galaxie qui forme le prénom
   - aurore : aurores boréales sur un lac gelé, lucioles
   - globe  : boule à neige, village qui s'illumine, plongée dedans
   ============================================================ */
window.Cinema = (() => {
  'use strict';

  const canvas = document.getElementById('cine-canvas');
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, raf = 0, scene = null, hideT = 0;

  /* ---------- Outils ---------- */
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const bell = (t, c, w) => Math.exp(-Math.pow((t - c) / w, 2));
  const ease = {
    in: t => t * t * t,
    out: t => 1 - Math.pow(1 - t, 3),
    inOut: t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  };
  function seeded(seed) {
    let s = seed;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }
  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // Sprites lumineux (un par couleur), dessinés en mode additif
  const sprites = new Map();
  function sprite(color) {
    if (sprites.has(color)) return sprites.get(color);
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(.16, rgba(color, 1));
    gr.addColorStop(.45, rgba(color, .28));
    gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    sprites.set(color, c);
    return c;
  }
  const dot = (color, x, y, size) => ctx.drawImage(sprite(color), x - size / 2, y - size / 2, size, size);

  function glow(x, y, r, color, a) {
    if (a <= 0 || r <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, a));
    g.addColorStop(.25, rgba(color, a * .55));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Points qui dessinent un texte (pour les particules)
  function textPoints(text, cy, max) {
    const off = document.createElement('canvas');
    off.width = Math.ceil(W);
    off.height = Math.ceil(H);
    const g = off.getContext('2d');
    let size = Math.min(H * .24, W * .2, 190);
    g.font = `${size}px "Great Vibes", cursive`;
    const w = g.measureText(text).width;
    if (w > W * .86) { size *= W * .86 / w; g.font = `${size}px "Great Vibes", cursive`; }
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, W / 2, cy);
    const data = g.getImageData(0, 0, off.width, off.height).data;
    const step = Math.max(2, Math.round(size / 42));
    const pts = [];
    for (let y = 0; y < off.height; y += step) {
      for (let x = 0; x < off.width; x += step) {
        if (data[(y * off.width + x) * 4 + 3] > 120) pts.push({ x: x + (Math.random() - .5) * step * .7, y: y + (Math.random() - .5) * step * .7 });
      }
    }
    for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
    if (pts.length > max) pts.length = max;
    if (!pts.length) pts.push({ x: W / 2, y: cy });
    return { pts, size };
  }

  // Petit texte en capitales espacées (sur-titre)
  function kicker(text, x, y, a) {
    if (a <= 0) return;
    const size = clamp(W * .012, 11, 15);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a;
    ctx.font = `500 ${size}px Outfit, system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.shadowColor = 'rgba(0,0,0,.7)';
    ctx.shadowBlur = 14;
    ctx.textBaseline = 'middle';
    const chars = [...text.toUpperCase()], gap = size * .38;
    const total = chars.reduce((s, c) => s + ctx.measureText(c).width + gap, -gap);
    let cx = x - total / 2;
    for (const c of chars) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + gap; }
    ctx.restore();
  }

  const titleFor = d => d.to || 'Joyeux Noël';
  const kickerFor = d => (d.to
    ? (d.f ? `${d.f} t'envoie ses vœux` : 'Une carte de Noël pour')
    : (d.f ? `Une carte de ${d.f}` : 'Une carte rien que pour toi'));

  /* =========================================================
     1. HYPERESPACE
     ========================================================= */
  function hyper(data) {
    const cx = W / 2, cy = H * .48, fov = Math.max(W, H) * .32;
    const N = Math.round(clamp(W * H / 1300, 350, 1000));
    const pal = ['#ffffff', '#fff1c9', '#c8dcff', '#ffd27a', '#e8d4ff'];
    const newStar = any => ({
      x: (Math.random() * 2 - 1) * 1.3, y: (Math.random() * 2 - 1) * 1.3,
      z: any ? .05 + Math.random() : 1.05, c: pal[Math.floor(Math.random() * pal.length)],
    });
    const stars = Array.from({ length: N }, () => newStar(true));
    const bg = Array.from({ length: Math.round(N * .6) }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.3 + .3, p: Math.random() * 6.28 }));

    // Nébuleuses
    const nebula = ['#6a2c91', '#1d6f8a', '#a8437a', '#2f3f9e'].map((col, i) => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, rgba(col, .55));
      gr.addColorStop(.5, rgba(col, .2));
      gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 256);
      return { c, o: i * 1.57, r: .16 + i * .05 };
    });

    const title = titleFor(data), kick = kickerFor(data);
    const { pts, size } = textPoints(title, H * .5, Math.round(clamp(W * H / 650, 700, 2200)));
    const gold = ['#ffd27a', '#ffe9b8', '#ffffff', '#ffc65c'];
    const parts = pts.map((p, i) => ({
      tx: p.x, ty: p.y,
      r: Math.pow(Math.random(), .55) * Math.min(W, H) * .42 + 8,
      a: (i % 3) * 2.094 + Math.random() * .6,
      d: Math.random(), s: 1.4 + Math.random() * 1.8, ph: Math.random() * 6.28,
      c: gold[i % gold.length],
    }));

    return {
      duration: 13.2,
      cues: [
        { t: .9, fn: s => s.whoosh(3.2) },
        { t: 6.3, fn: s => s.swell(5) },
        { t: 8.7, fn: s => s.chime() },
        { t: 11, fn: s => s.whoosh(1.5) },
      ],
      frame(t, dt) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#01020a';
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'lighter';

        const ramp = ease.in(seg(t, .9, 3.6)), brake = ease.out(seg(t, 4, 5.4));
        const speed = (.12 + 2.4 * ramp) * (1 - brake) + .015 * brake;
        const roll = t * .1 + ramp * .7;

        // nébuleuse + étoiles fixes
        const nA = seg(t, 4.8, 6.6) * (1 - seg(t, 11.8, 12.8));
        if (nA > 0) {
          for (const n of nebula) {
            const a = n.o + t * .06;
            const s = Math.max(W, H) * 1.1;
            ctx.globalAlpha = nA * .9;
            ctx.drawImage(n.c, cx + Math.cos(a) * W * n.r - s / 2, cy + Math.sin(a) * H * n.r - s / 2, s, s);
          }
          ctx.fillStyle = '#fff';
          for (const b of bg) {
            ctx.globalAlpha = nA * (.25 + .75 * Math.abs(Math.sin(t * 1.4 + b.p)));
            ctx.fillRect(b.x, b.y, b.r, b.r);
          }
        }

        // étoiles en hyperespace
        const warpA = seg(t, .3, 1.3) * (1 - seg(t, 5.6, 7));
        if (warpA > 0) {
          const cs = Math.cos(roll), sn = Math.sin(roll);
          ctx.lineCap = 'round';
          for (const s of stars) {
            s.z -= speed * dt;
            const pz = s.z + Math.max(.004, speed * .09);
            if (s.z <= .04) { Object.assign(s, newStar(false)); continue; }
            const rx = s.x * cs - s.y * sn, ry = s.x * sn + s.y * cs;
            const x = cx + rx / s.z * fov, y = cy + ry / s.z * fov;
            const px = cx + rx / pz * fov, py = cy + ry / pz * fov;
            const near = 1 - s.z;
            ctx.globalAlpha = warpA * clamp(near * 1.5);
            ctx.strokeStyle = s.c;
            ctx.lineWidth = .4 + near * 2.6;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(x + .01, y);
            ctx.stroke();
          }
        }

        // cœur lumineux au centre
        const core = seg(t, .1, 1) * (1 - seg(t, 5, 6)) * (.3 + ramp);
        ctx.globalAlpha = 1;
        glow(cx, cy, 60 + ramp * 280, '#cfe0ff', core * .9);

        // flash de sortie d'hyperespace
        const fl = bell(t, 5, .35);
        if (fl > .01) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = fl;
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, W, H);
          ctx.globalCompositeOperation = 'lighter';
        }

        // galaxie de particules qui forme le prénom
        if (t > 5) {
          const appear = seg(t, 5, 6.2);
          const waveX = lerp(-W * .2, W * 1.2, seg(t, 9.2, 10.8));
          for (const p of parts) {
            const ang = p.a + t * (.3 + 40 / (p.r + 40));
            const gx = cx + Math.cos(ang) * p.r, gy = cy + Math.sin(ang) * p.r * .55;
            const m = ease.inOut(seg(t, 6.4 + p.d * .8, 8.3 + p.d * .8));
            let x = lerp(gx, p.tx, m), y = lerp(gy, p.ty, m);
            const q = ease.in(seg(t, 10.9 + p.d * .5, 12.3));
            if (q > 0) { x = lerp(x, cx, q); y = lerp(y, cy, q); }
            const w = Math.exp(-Math.pow(p.tx - waveX, 2) / 5000) * m;
            const b = (.55 + .45 * Math.sin(t * 3 + p.ph)) + w * 1.4;
            ctx.globalAlpha = clamp(appear * b);
            dot(p.c, x, y, p.s * 3.4 * (1 + w * .7) * (1 - q * .5));
          }
        }

        kicker(kick, cx, H * .5 - size * .78, seg(t, 8.4, 9.2) * (1 - seg(t, 10.6, 11.2)));

        // implosion finale
        const ff = seg(t, 11.7, 13);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1;
        glow(cx, cy, 30 + ease.in(ff) * Math.max(W, H) * 1.3, '#fff6dd', clamp(ff * 1.4));
      },
    };
  }

  /* =========================================================
     2. AURORE BORÉALE
     ========================================================= */
  function aurora(data) {
    const rnd = seeded(29);
    const WH = H * 1.45, horizon = WH * .68;
    const camStart = WH - H, camEnd = H * .2;

    const stars = Array.from({ length: Math.round(clamp(W * H / 4000, 120, 380)) }, () => ({
      x: rnd() * W, y: rnd() * horizon, r: rnd() * 1.3 + .3, p: rnd() * 6.28,
    }));

    function ribbonSprite(top, mid, edge) {
      const c = document.createElement('canvas');
      c.width = 4; c.height = 256;
      const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, rgba(top, 0));
      gr.addColorStop(.45, rgba(top, .22));
      gr.addColorStop(.8, rgba(mid, .65));
      gr.addColorStop(.95, rgba(edge, .75));
      gr.addColorStop(1, rgba(edge, 0));
      g.fillStyle = gr;
      g.fillRect(0, 0, 4, 256);
      return c;
    }
    const ribbons = [
      { base: WH * .36, amp: H * .06, h: H * .32, k1: .0042, k2: .011, w1: .35, w2: .6, ph: 0, spr: ribbonSprite('#7b5cff', '#3dffb0', '#c8ffe9'), a: .9 },
      { base: WH * .42, amp: H * .05, h: H * .26, k1: .0055, k2: .009, w1: .28, w2: .45, ph: 2, spr: ribbonSprite('#ff5fa8', '#26e3a3', '#d9fff0'), a: .7 },
      { base: WH * .3, amp: H * .07, h: H * .36, k1: .003, k2: .013, w1: .22, w2: .5, ph: 4, spr: ribbonSprite('#5b8cff', '#a66bff', '#f0d9ff'), a: .55 },
    ];

    function range(baseY, amp, step, seed) {
      const r = seeded(seed), pts = [[-20, baseY]];
      for (let x = -20; x < W + 40; x += step * (.5 + r())) pts.push([x, baseY - amp * (.25 + r() * .75)]);
      pts.push([W + 40, baseY]);
      return pts;
    }
    const farM = range(horizon, H * .2, Math.max(60, W / 16), 5);
    const nearM = range(horizon, H * .12, Math.max(40, W / 22), 9);
    const glints = Array.from({ length: 50 }, () => ({ x: rnd() * W, y: rnd(), w: 10 + rnd() * 60, p: rnd() * 6.28 }));

    const title = titleFor(data), kick = kickerFor(data);
    const hsEnd = horizon - camEnd;
    const textY = hsEnd * .66;
    const { pts, size } = textPoints(title, textY, Math.round(clamp(W * H / 800, 600, 1800)));
    const star = { x: W / 2, y: H * .14 };
    const flies = pts.map(p => ({
      tx: p.x, ty: p.y,
      sx: rnd() * W, sy: hsEnd + 20 + rnd() * (H - hsEnd - 30),
      mx: rnd() * W, my: H * .1 + rnd() * hsEnd * .7,
      d: rnd(), ph: rnd() * 6.28, s: 1.3 + rnd() * 1.8,
      c: rnd() < .18 ? '#9ff5e1' : (rnd() < .5 ? '#ffd27a' : '#fff1c9'),
    }));
    const shooting = [9.7, 10.3, 11].map((st, i) => ({ st, x: W * (.55 + i * .15), y: H * (.08 + i * .05) }));

    function mountains(pts, color, camY) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1] - camY);
      for (const [x, y] of pts) ctx.lineTo(x, y - camY);
      ctx.closePath();
      ctx.fill();
    }

    return {
      duration: 13.8,
      cues: [
        { t: 1, fn: s => s.swell(6) },
        { t: 9.3, fn: s => s.chime() },
        { t: 11.9, fn: s => s.whoosh(1.6) },
      ],
      frame(t) {
        const camY = lerp(camStart, camEnd, ease.inOut(seg(t, .8, 5.5)));
        const hs = horizon - camY;

        // ciel
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        const sky = ctx.createLinearGradient(0, -camY, 0, hs);
        sky.addColorStop(0, '#020510');
        sky.addColorStop(.6, '#071a33');
        sky.addColorStop(1, '#0f3745');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, Math.max(0, hs));
        ctx.fillStyle = '#01040a';
        ctx.fillRect(0, hs, W, H - hs);

        ctx.fillStyle = '#fff';
        for (const s of stars) {
          const y = s.y - camY;
          if (y < 0 || y > hs) continue;
          ctx.globalAlpha = .3 + .7 * Math.abs(Math.sin(t * 1.2 + s.p));
          ctx.fillRect(s.x, y, s.r, s.r);
        }

        // aurores
        const I = seg(t, .6, 4.5) * .95 + bell(t, 10.2, .7) * .7;
        ctx.globalCompositeOperation = 'lighter';
        for (const rb of ribbons) {
          for (let x = -4; x < W + 4; x += 4) {
            const y = rb.base - camY + rb.amp * Math.sin(x * rb.k1 + t * rb.w1 + rb.ph) + rb.amp * .5 * Math.sin(x * rb.k2 - t * rb.w2);
            const h = rb.h * (.7 + .3 * Math.sin(x * .006 + t * .4 + rb.ph));
            const i = .45 + .55 * Math.pow(Math.sin(x * .011 + t * 1.1 + rb.ph) * .5 + .5, 1.5);
            ctx.globalAlpha = clamp(I * rb.a * i);
            ctx.drawImage(rb.spr, x, y - h, 4, h);
          }
        }

        // montagnes
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        mountains(farM, '#0a1a2c', camY);
        mountains(nearM, '#040b15', camY);

        // reflet sur le lac gelé
        const hsd = Math.round(hs * dpr), lakeH = canvas.height - hsd;
        if (lakeH > 0 && hsd > 0) {
          const srcH = Math.min(hsd, lakeH);
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = .5;
          ctx.translate(0, hsd * 2);
          ctx.scale(1, -1);
          ctx.drawImage(canvas, 0, hsd - srcH, canvas.width, srcH, 0, hsd - srcH, canvas.width, srcH);
          ctx.restore();
          const lake = ctx.createLinearGradient(0, hs, 0, H);
          lake.addColorStop(0, 'rgba(4,14,26,.35)');
          lake.addColorStop(1, 'rgba(1,4,10,.85)');
          ctx.fillStyle = lake;
          ctx.fillRect(0, hs, W, H - hs);
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = '#bfefff';
          for (const g of glints) {
            ctx.globalAlpha = .12 * (.5 + .5 * Math.sin(t * 2 + g.p));
            ctx.fillRect(g.x, hs + 4 + g.y * (H - hs - 8), g.w, 1);
          }
        }

        // étoiles filantes
        ctx.globalCompositeOperation = 'lighter';
        for (const s of shooting) {
          const p = seg(t, s.st, s.st + .8);
          if (p <= 0 || p >= 1) continue;
          const x = s.x - p * W * .35, y = s.y + p * H * .16;
          const grd = ctx.createLinearGradient(x, y, x + 120, y - 55);
          grd.addColorStop(0, 'rgba(255,255,255,.95)');
          grd.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.globalAlpha = Math.sin(p * Math.PI);
          ctx.strokeStyle = grd;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 120, y - 55); ctx.stroke();
        }

        // lucioles qui s'élèvent du lac et écrivent le prénom
        for (const f of flies) {
          const st = 5 + f.d * 1.4;
          const ap = seg(t, st, st + .6);
          if (ap <= 0) continue;
          const r = ease.out(seg(t, st, 7.6 + f.d * .6));
          let x = lerp(f.sx, f.mx, r) + Math.sin(t * 2 + f.ph) * 12 * (1 - r * .6);
          let y = lerp(f.sy, f.my, r) + Math.cos(t * 1.7 + f.ph) * 8 * (1 - r * .6);
          const m = ease.inOut(seg(t, 7.6 + f.d * .7, 9.4 + f.d * .6));
          x = lerp(x, f.tx, m); y = lerp(y, f.ty, m);
          const q = ease.in(seg(t, 11.2 + f.d * .4, 12.7));
          if (q > 0) { x = lerp(x, star.x, q); y = lerp(y, star.y, q); }
          ctx.globalAlpha = clamp(ap * (.55 + .45 * Math.sin(t * 4 + f.ph)) + m * .3);
          dot(f.c, x, y, f.s * 3.4 * (1 - q * .4));
        }

        kicker(kick, W / 2, textY - size * .78, seg(t, 9, 9.8) * (1 - seg(t, 10.9, 11.4)));

        // étoile finale qui envahit l'écran
        const ff = seg(t, 12.2, 13.7);
        ctx.globalAlpha = 1;
        glow(star.x, star.y, 20 + ease.in(ff) * Math.max(W, H) * 1.6, '#fff4d6', clamp(ff * 1.5));

        // ouverture au noir
        const fade = 1 - seg(t, 0, 1.4);
        if (fade > 0) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = fade;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, W, H);
        }
      },
    };
  }

  /* =========================================================
     3. BOULE À NEIGE
     ========================================================= */
  function globe(data) {
    const rnd = seeded(53);
    const cx = W / 2, cy = H * .46, R = Math.min(W * .34, H * .26);
    const starPt = { x: .04, y: -.4 };   // étoile du clocher (unités du globe)
    const groundY = x => .62 - .55 * Math.sqrt(Math.max(0, 1 - Math.pow(x / 1.15, 2)));

    const houses = [
      { x: -.58, w: .2, c: '#7a3b2e' }, { x: -.3, w: .22, c: '#3d5a73' },
      { x: .34, w: .2, c: '#6b4a3a' }, { x: .6, w: .16, c: '#8a4b3a' },
    ].map((h, i) => ({ ...h, y: groundY(h.x) + .03, lit: 4.2 + i * .38 }));
    const trees = [-.82, -.44, -.12, .2, .48, .78].map(x => ({ x, y: groundY(x) + .02, s: .1 + rnd() * .06 }));
    const skyStars = Array.from({ length: 26 }, () => ({ x: (rnd() * 2 - 1) * .8, y: -.85 + rnd() * .6, p: rnd() * 6.28 }));
    const snow = Array.from({ length: 280 }, () => {
      const a = rnd() * 6.28, r = Math.sqrt(rnd()) * .9;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, s: .006 + rnd() * .01 };
    });

    const title = titleFor(data), kick = kickerFor(data);
    let lastT = 0;

    function house(h, t) {
      const { x, y, w } = h, bh = w * .72;
      ctx.fillStyle = h.c;
      ctx.fillRect(x - w / 2, y - bh, w, bh);
      ctx.fillStyle = '#e9f1ff';
      ctx.beginPath(); ctx.moveTo(x - w * .62, y - bh + .005); ctx.lineTo(x, y - bh - w * .5); ctx.lineTo(x + w * .62, y - bh + .005); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(40,60,90,.35)';
      ctx.fillRect(x - w * .62, y - bh, w * 1.24, .012);
      const on = seg(t, h.lit, h.lit + .25);
      const ww = w * .2;
      for (const dx of [-.22, .22]) {
        const wx = x + dx * w - ww / 2, wy = y - bh * .72;
        ctx.fillStyle = '#1b2433';
        ctx.fillRect(wx, wy, ww, ww);
        if (on > 0) {
          ctx.globalAlpha = on;
          ctx.fillStyle = '#ffd27a';
          ctx.fillRect(wx, wy, ww, ww);
          ctx.globalCompositeOperation = 'lighter';
          dot('#ffb84d', wx + ww / 2, wy + ww / 2, w * 1.1);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        }
      }
      ctx.fillStyle = '#3a2418';
      ctx.fillRect(x - w * .09, y - bh * .42, w * .18, bh * .42);
    }

    function church(t) {
      const x = .04, y = groundY(.04) + .02, w = .2, bh = .3;
      ctx.fillStyle = '#d9cfc0';
      ctx.fillRect(x - w / 2, y - bh, w, bh);
      ctx.fillStyle = '#e9f1ff';
      ctx.beginPath(); ctx.moveTo(x - w * .62, y - bh); ctx.lineTo(x, y - bh - .12); ctx.lineTo(x + w * .62, y - bh); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#cfc4b3';
      ctx.fillRect(x - .035, y - bh - .2, .07, .2);
      ctx.fillStyle = '#e9f1ff';
      ctx.beginPath(); ctx.moveTo(x - .05, y - bh - .2); ctx.lineTo(x, starPt.y + .05); ctx.lineTo(x + .05, y - bh - .2); ctx.closePath(); ctx.fill();
      const on = seg(t, 5.4, 5.8);
      ctx.fillStyle = on > 0 ? `rgba(255,210,122,${.4 + on * .6})` : '#1b2433';
      ctx.beginPath(); ctx.arc(x, y - bh * .6, .03, Math.PI, 0); ctx.lineTo(x + .03, y - bh * .35); ctx.lineTo(x - .03, y - bh * .35); ctx.closePath(); ctx.fill();
      if (on > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = on; dot('#ffb84d', x, y - bh * .5, .2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    }

    function tree(tr) {
      const { x, y, s } = tr;
      ctx.fillStyle = '#1f4d3a';
      for (let k = 0; k < 3; k++) {
        const ty = y - k * s * .45, tw = s * (.55 - k * .12);
        ctx.beginPath(); ctx.moveTo(x - tw, ty); ctx.lineTo(x, ty - s * .7); ctx.lineTo(x + tw, ty); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = 'rgba(240,246,255,.85)';
      ctx.beginPath(); ctx.moveTo(x - s * .16, y - s * 1.12); ctx.lineTo(x, y - s * 1.6); ctx.lineTo(x + s * .16, y - s * 1.12); ctx.closePath(); ctx.fill();
    }

    return {
      duration: 13.4,
      cues: [
        { t: 1.6, fn: s => s.bells(2.2) },
        { t: 5.5, fn: s => s.chime() },
        { t: 7.7, fn: s => s.swell(5) },
        { t: 11, fn: s => s.whoosh(1.6) },
      ],
      frame(t) {
        const dt = Math.min(.05, Math.max(0, t - lastT));
        lastT = t;
        const shake = bell(t, 2.7, .75);

        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#04050a';
        ctx.fillRect(0, 0, W, H);

        // caméra : plongée vers l'étoile du clocher
        const z = ease.inOut(seg(t, 7.6, 11.6));
        const S = lerp(1, 5.5, z);
        const fx = cx + starPt.x * R, fy = cy + starPt.y * R;
        ctx.save();
        ctx.translate(fx, fy);
        ctx.scale(S, S);
        ctx.translate(-fx, -fy);

        // projecteur et reflet au sol
        glow(cx, cy - R * .4, R * 2.6, '#ffe2b0', .16);
        ctx.fillStyle = 'rgba(255,226,176,.06)';
        ctx.beginPath(); ctx.ellipse(cx, cy + R * 1.54, R * 1.5, R * .2, 0, 0, 6.283); ctx.fill();

        // secousse (rotation autour du socle)
        const bx = cx, by = cy + R * 1.5;
        ctx.translate(bx + Math.sin(t * 31) * R * .05 * shake, by);
        ctx.rotate(Math.sin(t * 26) * .09 * shake);
        ctx.translate(-bx, -by);

        // socle en bois et plaque dorée
        const top = cy + R * .8, bot = cy + R * 1.5;
        const wood = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
        wood.addColorStop(0, '#3a1d12'); wood.addColorStop(.5, '#7a3f24'); wood.addColorStop(1, '#2c150c');
        ctx.fillStyle = wood;
        ctx.beginPath();
        ctx.moveTo(cx - R * .92, top); ctx.lineTo(cx + R * .92, top);
        ctx.lineTo(cx + R * 1.12, bot); ctx.lineTo(cx - R * 1.12, bot); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#c9a24e';
        ctx.fillRect(cx - R * .95, top - R * .02, R * 1.9, R * .04);
        ctx.fillRect(cx - R * 1.13, bot - R * .035, R * 2.26, R * .035);
        const pw = R * 1.25, ph = R * .26, px = cx - pw / 2, py = top + R * .3;
        const brass = ctx.createLinearGradient(px, py, px + pw, py + ph);
        brass.addColorStop(0, '#a87b2c'); brass.addColorStop(.45, '#f3d58a'); brass.addColorStop(1, '#9b6f24');
        ctx.fillStyle = brass;
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = 'rgba(80,50,10,.6)'; ctx.lineWidth = 1;
        ctx.strokeRect(px + 3, py + 3, pw - 6, ph - 6);
        const reveal = ease.out(seg(t, 5, 7.2));
        if (reveal > 0) {
          ctx.save();
          ctx.beginPath(); ctx.rect(px, py, pw * reveal, ph); ctx.clip();
          let fs = ph * .78;
          ctx.font = `${fs}px "Great Vibes", cursive`;
          const tw = ctx.measureText(title).width;
          if (tw > pw * .88) { fs *= pw * .88 / tw; ctx.font = `${fs}px "Great Vibes", cursive`; }
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(255,240,200,.5)';
          ctx.fillText(title, cx + 1, py + ph * .54 + 1);
          ctx.fillStyle = '#4a2e0c';
          ctx.fillText(title, cx, py + ph * .54);
          ctx.restore();
          const sx = px + pw * reveal;
          if (reveal < 1) { ctx.globalCompositeOperation = 'lighter'; dot('#ffe9b8', sx, py + ph / 2, ph * 1.6); ctx.globalCompositeOperation = 'source-over'; }
        }

        // intérieur du globe
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(R, R);
        ctx.beginPath(); ctx.arc(0, 0, 1, 0, 6.283); ctx.clip();
        const sky = ctx.createLinearGradient(0, -1, 0, .6);
        sky.addColorStop(0, '#0b1438'); sky.addColorStop(1, '#2a3f78');
        ctx.fillStyle = sky;
        ctx.fillRect(-1, -1, 2, 2);
        ctx.fillStyle = '#fff';
        for (const s of skyStars) { ctx.globalAlpha = .4 + .6 * Math.abs(Math.sin(t * 1.5 + s.p)); ctx.beginPath(); ctx.arc(s.x, s.y, .007, 0, 6.283); ctx.fill(); }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff8e6';
        ctx.beginPath(); ctx.arc(-.48, -.5, .09, 0, 6.283); ctx.fill();
        const ground = ctx.createLinearGradient(0, .1, 0, 1);
        ground.addColorStop(0, '#ffffff'); ground.addColorStop(1, '#b9cbe8');
        ctx.fillStyle = ground;
        ctx.beginPath(); ctx.ellipse(0, .62, 1.15, .55, 0, 0, 6.283); ctx.fill();
        for (const tr of trees) tree(tr);
        church(t);
        for (const h of houses) house(h, t);

        // étoile du clocher
        const sOn = seg(t, 5.5, 6.2);
        if (sOn > 0) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = sOn * (.8 + .2 * Math.sin(t * 5));
          dot('#ffd27a', starPt.x, starPt.y, .35 + z * .2);
          dot('#ffffff', starPt.x, starPt.y, .12);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        }

        // neige qui tourbillonne
        const swirl = shake * 2.4 + .04;
        ctx.fillStyle = '#fff';
        for (const s of snow) {
          s.vx += (-s.y * swirl - s.vx * .7) * dt * 3 + (Math.random() - .5) * shake * dt * 8;
          s.vy += (s.x * swirl - s.vy * .7) * dt * 3 + (Math.random() - .5) * shake * dt * 8 + .25 * dt;
          s.x += s.vx * dt; s.y += s.vy * dt;
          const r = Math.hypot(s.x, s.y);
          if (r > .95) { s.x *= .95 / r; s.y *= .95 / r; s.vx *= -.3; s.vy *= -.3; }
          const gy = groundY(s.x);
          if (shake < .08 && s.y > gy) { s.y = gy; s.vx = s.vy = 0; }
          ctx.globalAlpha = .9;
          ctx.beginPath(); ctx.arc(s.x, s.y, s.s, 0, 6.283); ctx.fill();
        }
        ctx.globalAlpha = 1;

        // verre : ombre intérieure et reflets
        const inner = ctx.createRadialGradient(0, 0, .7, 0, 0, 1);
        inner.addColorStop(0, 'rgba(0,0,0,0)'); inner.addColorStop(1, 'rgba(0,10,30,.45)');
        ctx.fillStyle = inner;
        ctx.fillRect(-1, -1, 2, 2);
        ctx.restore();

        ctx.save();
        ctx.translate(cx, cy);
        ctx.strokeStyle = 'rgba(255,255,255,.35)';
        ctx.lineWidth = 2 / S;
        ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.283); ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,255,255,.22)';
        ctx.lineWidth = R * .07;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, 0, R * .84, Math.PI * 1.08, Math.PI * 1.42); ctx.stroke();
        ctx.lineWidth = R * .03;
        ctx.beginPath(); ctx.arc(0, 0, R * .84, Math.PI * 1.5, Math.PI * 1.58); ctx.stroke();
        ctx.globalAlpha = .5;
        dot('#ffffff', R * .42, -R * .55, R * .12);
        ctx.restore();
        ctx.restore();

        // sur-titre au-dessus du globe
        ctx.globalCompositeOperation = 'source-over';
        kicker(kick, cx, cy - R * 1.16, seg(t, 6.4, 7.2) * (1 - seg(t, 7.8, 8.4)));

        // l'étoile envahit l'écran
        const ff = seg(t, 10.2, 12.9);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1;
        glow(fx, fy, 20 + ease.in(ff) * Math.max(W, H) * 1.5, '#fff4d6', clamp(ff * 1.4));

        // ouverture au noir
        const fade = 1 - seg(t, 0, 1.4);
        if (fade > 0) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = fade;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, W, H);
        }
      },
    };
  }

  /* ---------- Moteur ---------- */
  const SCENES = { hyper, aurore: aurora, globe };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    W = innerWidth;
    H = innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
    if (!scene) return;
    scene = null;
    canvas.classList.remove('on');
    clearTimeout(hideT);
    hideT = setTimeout(() => { if (!scene) canvas.hidden = true; }, 1000);
  }

  function play(kind, data, { sfx = null, onEnd = null } = {}) {
    stop();
    const make = SCENES[kind];
    if (!make) { if (onEnd) onEnd(); return false; }
    clearTimeout(hideT);
    resize();
    canvas.hidden = false;
    const current = make(data);
    scene = current;
    const cues = (current.cues || []).map(c => ({ ...c, done: false }));
    const t0 = performance.now();
    let last = t0;
    requestAnimationFrame(() => canvas.classList.add('on'));
    const loop = now => {
      if (scene !== current) return;
      const t = (now - t0) / 1000, dt = Math.min(.05, (now - last) / 1000);
      last = now;
      for (const c of cues) {
        if (!c.done && t >= c.t) { c.done = true; if (sfx) { try { c.fn(sfx); } catch { /* son facultatif */ } } }
      }
      ctx.save();
      current.frame(t, dt);
      ctx.restore();
      if (t >= current.duration) {
        stop();
        if (onEnd) onEnd();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return true;
  }

  return { play, stop, kinds: Object.keys(SCENES) };
})();
