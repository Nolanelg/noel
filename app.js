/* ============================================================
   Carte de Noël — logique
   Tout le contenu de la carte est encodé dans le lien (#c=…) :
   aucun serveur, aucune base de données.
   ============================================================ */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const today = new Date();
  const NOEL_YEAR = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  const NEXT_YEAR = NOEL_YEAR + 1;

  const THEMES = {
    nuit:  { label: 'Nuit étoilée',   sw: ['#14204a', '#e8c26a'], stars: 1,   meta: '#060a1d' },
    rouge: { label: 'Rouge velours',  sw: ['#8e1527', '#f2cf7c'], stars: .7,  meta: '#170205' },
    foret: { label: 'Forêt enneigée', sw: ['#154a31', '#e3b866'], stars: .85, meta: '#020c08' },
    givre: { label: 'Givre',          sw: ['#d9eaf7', '#4f86b8'], stars: .35, meta: '#0a1d36' },
  };
  const DECORS = { sapin: 'Sapin', etoile: 'Étoile', flocon: 'Flocon', cadeau: 'Cadeau', bougie: 'Bougie' };


  /* ------------------------------------------------------------
     Encodage du lien (UTF-8 → base64url)
     ------------------------------------------------------------ */
  function encode(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(str) {
    let s = str.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  const str = (v, max) => (typeof v === 'string' ? v : '').slice(0, max);
  function sanitize(o) {
    if (!o || typeof o !== 'object') throw new Error('bad');
    return {
      to: str(o.to, 40),
      m: str(o.m, 500),
      f: str(o.f, 40),
      th: THEMES[o.th] ? o.th : 'nuit',
      d: DECORS[o.d] ? o.d : 'sapin',
    };
  }
  function cardLink(d) {
    return location.href.split('#')[0] + '#c=' + encode(d);
  }

  /* ------------------------------------------------------------
     Illustrations SVG
     ------------------------------------------------------------ */
  function starPts(cx, cy, R, r, n = 5, rot = -90) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const rad = i % 2 ? r : R;
      const a = (rot + i * 180 / n) * Math.PI / 180;
      pts.push((cx + rad * Math.cos(a)).toFixed(1) + ',' + (cy + rad * Math.sin(a)).toFixed(1));
    }
    return pts.join(' ');
  }
  function sparkle(x, y, s, delay) {
    return `<path class="sparkle" style="animation-delay:${delay}s" fill="var(--accent2)" d="M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s}Z"/>`;
  }

  function decorSVG(kind) {
    switch (kind) {
      case 'etoile': {
        let rays = '';
        for (let i = 0; i < 16; i++) {
          const a = i * 22.5 * Math.PI / 180, r1 = 60, r2 = i % 2 ? 80 : 96;
          rays += `<line x1="${(100 + r1 * Math.cos(a)).toFixed(1)}" y1="${(100 + r1 * Math.sin(a)).toFixed(1)}" x2="${(100 + r2 * Math.cos(a)).toFixed(1)}" y2="${(100 + r2 * Math.sin(a)).toFixed(1)}"/>`;
        }
        return `<svg viewBox="0 0 200 200" class="decor" aria-hidden="true">
          <g class="rays" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" opacity=".7">${rays}</g>
          <circle class="halo" cx="100" cy="100" r="56" fill="var(--accent)" opacity=".14"/>
          <g class="big-star">
            <polygon points="${starPts(100, 100, 50, 21)}" fill="var(--accent)"/>
            <polygon points="${starPts(100, 100, 50, 21)}" fill="none" stroke="var(--accent2)" stroke-width="1.5" opacity=".75"/>
            <polygon points="${starPts(100, 100, 22, 9)}" fill="var(--accent2)" opacity=".55"/>
          </g>
          ${sparkle(30, 40, 7, 0)}${sparkle(170, 52, 6, .7)}${sparkle(160, 165, 8, 1.2)}${sparkle(38, 158, 5, .4)}
        </svg>`;
      }
      case 'flocon': {
        const br = '<line x1="100" y1="100" x2="100" y2="20"/><polyline points="85,36 100,51 115,36"/><polyline points="83,60 100,77 117,60"/>';
        const inner = '<line x1="100" y1="100" x2="100" y2="64"/><polyline points="92,73 100,81 108,73"/>';
        let g1 = '', g2 = '', tips = '';
        for (let i = 0; i < 6; i++) {
          g1 += `<g transform="rotate(${i * 60} 100 100)">${br}</g>`;
          g2 += `<g transform="rotate(${i * 60 + 30} 100 100)">${inner}</g>`;
          tips += `<circle transform="rotate(${i * 60} 100 100)" cx="100" cy="14" r="5"/>`;
        }
        return `<svg viewBox="0 0 200 200" class="decor" aria-hidden="true">
          <circle class="halo" cx="100" cy="100" r="72" fill="var(--accent)" opacity=".1"/>
          <g class="flake-spin">
            <g fill="none" stroke="var(--accent)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">${g1}</g>
            <g fill="var(--accent2)">${tips}</g>
          </g>
          <g class="flake-inner" fill="none" stroke="var(--accent2)" stroke-width="3" stroke-linecap="round" opacity=".85">${g2}</g>
          <polygon points="${starPts(100, 100, 12, 12, 6, 0)}" fill="var(--accent2)"/>
          ${sparkle(28, 36, 6, .2)}${sparkle(176, 60, 5, 1)}${sparkle(168, 170, 7, .5)}
        </svg>`;
      }
      case 'cadeau':
        return `<svg viewBox="0 0 200 210" class="decor" aria-hidden="true">
          <circle class="halo" cx="100" cy="125" r="82" fill="var(--accent)" opacity=".1"/>
          <rect x="40" y="100" width="120" height="92" rx="6" fill="var(--seal)"/>
          <rect x="100" y="100" width="60" height="92" rx="6" fill="#000" opacity=".14"/>
          <rect x="40" y="136" width="120" height="16" fill="var(--accent)"/>
          <rect x="91" y="100" width="18" height="92" fill="var(--accent)"/>
          <g class="lid-group">
            <rect x="32" y="78" width="136" height="28" rx="6" fill="var(--seal2)"/>
            <rect x="100" y="78" width="68" height="28" rx="6" fill="#000" opacity=".1"/>
            <rect x="91" y="78" width="18" height="28" fill="var(--accent)"/>
            <path d="M100 78 C 80 40, 46 52, 62 72 C 70 80, 88 80, 100 78Z" fill="var(--accent)"/>
            <path d="M100 78 C 120 40, 154 52, 138 72 C 130 80, 112 80, 100 78Z" fill="var(--accent)"/>
            <path d="M100 78 C 84 52, 62 58, 70 70" fill="none" stroke="var(--accent2)" stroke-width="2" opacity=".6"/>
            <circle cx="100" cy="77" r="9" fill="var(--accent2)"/>
          </g>
          ${sparkle(30, 50, 7, 0)}${sparkle(172, 38, 6, .9)}${sparkle(178, 120, 5, .3)}${sparkle(22, 130, 5, 1.4)}
        </svg>`;
      case 'bougie':
        return `<svg viewBox="0 0 200 230" class="decor" aria-hidden="true">
          <circle class="halo" cx="100" cy="66" r="66" fill="var(--accent)" opacity=".12"/>
          <circle class="halo" cx="100" cy="66" r="36" fill="var(--accent)" opacity=".2" style="animation-delay:-1.2s"/>
          <ellipse cx="100" cy="208" rx="62" ry="10" fill="var(--accent)" opacity=".8"/>
          <rect x="74" y="98" width="52" height="108" rx="6" fill="var(--paper)"/>
          <rect x="104" y="98" width="22" height="108" rx="6" fill="#000" opacity=".08"/>
          <path d="M74 106 C 74 98, 126 98, 126 106 L126 116 C 120 116, 120 132, 114 132 C 108 132, 110 114, 102 116 C 96 118, 96 126, 90 126 C 84 126, 86 114, 74 114Z" fill="#fff" opacity=".85"/>
          <line x1="100" y1="98" x2="100" y2="86" stroke="#3a2a1a" stroke-width="2.5" stroke-linecap="round"/>
          <g class="flame">
            <path d="M100 28 C 118 52, 116 76, 100 88 C 84 76, 82 52, 100 28Z" fill="#ffad42"/>
            <path d="M100 50 C 109 63, 108 78, 100 86 C 92 78, 91 63, 100 50Z" fill="#fff4c2"/>
          </g>
          <path d="M60 206 C 50 192, 36 190, 22 196 C 30 200, 28 204, 34 206 C 30 212, 40 216, 46 212 C 50 218, 58 214, 60 206Z" fill="var(--tree)"/>
          <path d="M140 206 C 150 192, 164 190, 178 196 C 170 200, 172 204, 166 206 C 170 212, 160 216, 154 212 C 150 218, 142 214, 140 206Z" fill="var(--tree2)"/>
          <circle cx="64" cy="204" r="6" fill="#d7263d"/><circle cx="136" cy="204" r="6" fill="#c8102e"/>
          ${sparkle(36, 46, 6, .3)}${sparkle(166, 70, 7, 1)}${sparkle(40, 130, 5, .7)}
        </svg>`;
      case 'sapin':
      default: {
        const bulbs = [[82, 94], [114, 92], [70, 124], [98, 130], [126, 122], [76, 150], [124, 152],
          [60, 172], [88, 178], [116, 174], [142, 166], [100, 154], [50, 188], [150, 186]];
        const cols = ['#ff4d6d', '#ffd166', '#7bdff2', '#ffffff', '#c77dff', '#80ed99'];
        const b = bulbs.map(([x, y], i) =>
          `<g class="bulb" style="animation-delay:${((i * .37) % 1.6).toFixed(2)}s"><circle cx="${x}" cy="${y}" r="7.5" fill="${cols[i % 6]}" opacity=".28"/><circle cx="${x}" cy="${y}" r="3.8" fill="${cols[i % 6]}"/></g>`
        ).join('');
        return `<svg viewBox="0 0 200 230" class="decor" aria-hidden="true">
          <circle class="halo" cx="100" cy="122" r="92" fill="var(--accent)" opacity=".08"/>
          <rect x="89" y="192" width="22" height="24" rx="2" fill="#6d4126"/>
          <polygon points="100,110 172,196 28,196" fill="var(--tree)"/><polygon points="100,110 172,196 100,196" fill="var(--tree2)"/>
          <polygon points="100,72 156,146 44,146" fill="var(--tree)"/><polygon points="100,72 156,146 100,146" fill="var(--tree2)"/>
          <polygon points="100,42 140,100 60,100" fill="var(--tree)"/><polygon points="100,42 140,100 100,100" fill="var(--tree2)"/>
          <path class="garland" d="M70 88 Q100 104 130 86"/>
          <path class="garland" d="M56 134 Q100 156 146 130" style="animation-delay:-.5s"/>
          <path class="garland" d="M40 184 Q100 206 162 178" style="animation-delay:-1s"/>
          ${b}
          <polygon class="tree-star" points="${starPts(100, 34, 17, 7)}" fill="var(--accent)"/>
          ${sparkle(38, 58, 6, 0)}${sparkle(166, 78, 5, .8)}${sparkle(28, 130, 4, 1.3)}${sparkle(174, 140, 5, .4)}
        </svg>`;
      }
    }
  }

  const HOLLY = `<svg class="holly" viewBox="0 0 120 90" aria-hidden="true">
    <path d="M60 50 C50 30 30 22 8 26 C14 30 12 36 18 38 C12 42 16 48 22 48 C18 54 24 60 30 58 C34 64 42 62 44 58 C50 60 56 56 60 50Z" fill="var(--tree)"/>
    <path d="M60 50 C70 30 90 20 112 22 C106 27 108 32 102 35 C108 39 104 45 98 45 C102 51 96 57 90 55 C86 61 78 59 76 55 C70 57 64 55 60 50Z" fill="var(--tree2)"/>
    <path d="M60 50 C46 40 30 32 14 28 M60 50 C74 38 90 28 106 24" stroke="rgba(0,0,0,.18)" stroke-width="1.2" fill="none"/>
    <circle cx="55" cy="55" r="7" fill="#c8102e"/><circle cx="66" cy="57" r="6.5" fill="#d7263d"/><circle cx="61" cy="46" r="6" fill="#b5001f"/>
    <circle cx="53" cy="52" r="2" fill="#fff" opacity=".55"/><circle cx="64" cy="54.5" r="1.8" fill="#fff" opacity=".55"/><circle cx="59" cy="43.5" r="1.6" fill="#fff" opacity=".55"/>
  </svg>`;

  /* ------------------------------------------------------------
     Construction de la carte
     ------------------------------------------------------------ */
  function buildBook(host) {
    host.innerHTML = `
      <div class="book solo">
        <div class="page inside">
          <div class="inside-frame">
            ${HOLLY}
            <p class="greet"></p>
            <div class="msg-wrap"><p class="msg"></p></div>
            <p class="sign"><span class="sign-name"></span>
              <svg class="flourish" viewBox="0 0 120 20" aria-hidden="true"><path d="M4 14 C 30 2, 50 22, 74 10 S 110 6, 116 12"/></svg>
            </p>
          </div>
        </div>
        <div class="cover">
          <div class="cover-face cover-front">
            <div class="cover-frame">
              <i class="corner tl">✦</i><i class="corner tr">✦</i><i class="corner bl">✦</i><i class="corner br">✦</i>
              <div class="decor-slot"></div>
              <h2 class="title-script">Joyeux Noël</h2>
              <p class="cover-sub">&amp; belle année ${NEXT_YEAR}</p>
            </div>
            <div class="cover-shine"></div>
          </div>
          <div class="cover-face cover-back">
            <div class="back-inner">
              <svg class="back-star" viewBox="0 0 100 100" aria-hidden="true"><polygon points="${starPts(50, 50, 40, 16)}" fill="var(--accent)"/></svg>
              <p class="back-year">Noël ${NOEL_YEAR}</p>
              <p class="back-note">Joyeuses fêtes</p>
            </div>
          </div>
        </div>
      </div>`;
    const q = s => host.querySelector(s);
    return {
      host, book: q('.book'), greet: q('.greet'), msg: q('.msg'), msgWrap: q('.msg-wrap'),
      sign: q('.sign'), signName: q('.sign-name'), decor: q('.decor-slot'), decorKind: null,
    };
  }

  function fillBook(refs, d) {
    refs.greet.textContent = d.to ? d.to + ',' : 'Coucou,';
    refs.signName.textContent = d.f;
    refs.sign.hidden = !d.f;
    if (refs.decorKind !== d.d) {
      refs.decor.innerHTML = decorSVG(d.d);
      refs.decorKind = d.d;
    }
  }

  /* Réduit la taille du texte jusqu'à ce qu'il tienne dans la carte */
  function fitMsg(refs, text) {
    const el = refs.msg, wrap = refs.msgWrap;
    el.style.fontSize = '';
    el.textContent = text;
    let size = parseFloat(getComputedStyle(el).fontSize) || 16;
    let guard = 0;
    while (wrap.scrollHeight > wrap.clientHeight + 1 && size > 9 && guard++ < 80) {
      size *= 0.95;
      el.style.fontSize = size + 'px';
    }
  }

  function typeWriter(el, text, done) {
    const chars = [...text];
    const node = document.createTextNode('');
    const caret = document.createElement('span');
    caret.className = 'caret';
    el.textContent = '';
    el.append(node, caret);
    let i = 0, t = null, finished = false;
    const base = Math.max(14, Math.min(48, 6500 / Math.max(chars.length, 1)));
    function step() {
      if (i >= chars.length) return finish();
      const c = chars[i++];
      node.appendData(c);
      let delay = base * (0.6 + Math.random() * 0.8);
      if ('.!?…'.includes(c)) delay += 300;
      else if (',;:'.includes(c)) delay += 140;
      else if (c === '\n') delay += 220;
      t = setTimeout(step, delay);
    }
    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(t);
      node.data = text;
      caret.remove();
      if (done) done();
    }
    if (reduceMotion) finish(); else t = setTimeout(step, 350);
    return { finish, cancel() { finished = true; clearTimeout(t); }, get done() { return finished; } };
  }

  function attachTilt(zone, target, max = 10) {
    zone.addEventListener('pointermove', e => {
      if (reduceMotion || e.pointerType === 'touch') return;
      const r = zone.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5;
      const y = (e.clientY - r.top) / r.height - .5;
      target.style.transform = `rotateY(${(x * max).toFixed(2)}deg) rotateX(${(-y * max * .8).toFixed(2)}deg)`;
    });
    zone.addEventListener('pointerleave', () => { target.style.transform = ''; });
  }

  /* ------------------------------------------------------------
     Ciel : étoiles, étoiles filantes, neige, étincelles
     ------------------------------------------------------------ */
  const Sky = (() => {
    const back = $('#snow'), front = $('#fx');
    const bc = back.getContext('2d'), fc = front.getContext('2d');
    let W = 0, H = 0, flakes = [], stars = [], sparks = [];
    let shoot = null, nextShoot = performance.now() + 3500;
    let wind = 0, targetWind = 0, near = false, starAlpha = 1, last = performance.now();
    let accent = '#e8c26a', accent2 = '#fff3cf';

    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 64;
    {
      const g = sprite.getContext('2d');
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(.35, 'rgba(255,255,255,.85)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
    }

    function makeFlake(layer, anyY, f = {}) {
      const d = [.45, .75, 1.3][layer];
      f.layer = layer;
      f.x = Math.random() * W;
      f.y = anyY ? Math.random() * H : -20 - Math.random() * 40;
      f.r = layer === 2 ? 3 + Math.random() * 4 : layer === 1 ? 1.5 + Math.random() * 1.8 : .7 + Math.random() * 1.1;
      f.vy = (.35 + Math.random() * .55) * d;
      f.d = d;
      f.ph = Math.random() * 6.283;
      f.ps = .008 + Math.random() * .02;
      f.a = layer === 2 ? .5 : layer === 1 ? .8 : .55;
      return f;
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      for (const c of [back, front]) {
        c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
        c.style.width = W + 'px'; c.style.height = H + 'px';
      }
      bc.setTransform(dpr, 0, 0, dpr, 0, 0);
      fc.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sc = Math.round(Math.min(230, W * H / 6500));
      stars = Array.from({ length: sc }, () => ({
        x: Math.random() * W, y: Math.random() * H * .7,
        r: Math.random() * 1.2 + .25, p: Math.random() * 6.283, s: .4 + Math.random() * 1.8,
      }));
      const n = reduceMotion ? 40 : Math.round(Math.min(260, W * H / 6000));
      flakes = Array.from({ length: n }, (_, i) => makeFlake(i % 9 === 0 ? 2 : i % 3 === 0 ? 1 : 0, true));
    }

    function drawSparkStar(ctx, s) {
      const r = s.size;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.quadraticCurveTo(0, 0, 0, r);
      ctx.quadraticCurveTo(0, 0, -r, 0);
      ctx.quadraticCurveTo(0, 0, 0, -r);
      ctx.fill();
      ctx.restore();
    }

    function frame(t) {
      const dt = Math.min(3, (t - last) / 16.67);
      last = t;
      wind += (targetWind - wind) * .02;
      bc.clearRect(0, 0, W, H);
      fc.clearRect(0, 0, W, H);

      // étoiles
      if (starAlpha > 0) {
        bc.fillStyle = '#fff';
        for (const s of stars) {
          bc.globalAlpha = (.3 + .7 * Math.abs(Math.sin(t * .001 * s.s + s.p))) * starAlpha;
          bc.beginPath();
          bc.arc(s.x, s.y, s.r, 0, 6.283);
          bc.fill();
        }
      }

      // étoile filante
      if (starAlpha > .5 && !reduceMotion) {
        if (!shoot && t > nextShoot) {
          shoot = { x: W * (.35 + Math.random() * .65), y: Math.random() * H * .3, vx: -(9 + Math.random() * 5), vy: 3 + Math.random() * 2.5, life: 1 };
        }
        if (shoot) {
          const tx = shoot.x - shoot.vx * 12, ty = shoot.y - shoot.vy * 12;
          const g = bc.createLinearGradient(shoot.x, shoot.y, tx, ty);
          g.addColorStop(0, 'rgba(255,255,255,.95)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          bc.globalAlpha = Math.min(1, shoot.life * 1.5);
          bc.strokeStyle = g;
          bc.lineWidth = 2;
          bc.lineCap = 'round';
          bc.beginPath();
          bc.moveTo(shoot.x, shoot.y);
          bc.lineTo(tx, ty);
          bc.stroke();
          shoot.x += shoot.vx * dt;
          shoot.y += shoot.vy * dt;
          shoot.life -= .014 * dt;
          if (shoot.life <= 0 || shoot.x < -100 || shoot.y > H) {
            shoot = null;
            nextShoot = t + 5000 + Math.random() * 9000;
          }
        }
      }

      // neige
      for (const f of flakes) {
        f.ph += f.ps * dt;
        f.y += f.vy * dt;
        f.x += (Math.sin(f.ph) * .4 + wind * f.d) * dt;
        if (f.y > H + 12) makeFlake(f.layer, false, f);
        if (f.x > W + 12) f.x = -12; else if (f.x < -12) f.x = W + 12;
        if (f.layer === 2 && !near) continue;
        const ctx = f.layer === 2 ? fc : bc;
        const s = f.r * 4;
        ctx.globalAlpha = f.a;
        ctx.drawImage(sprite, f.x - s / 2, f.y - s / 2, s, s);
      }

      // étincelles
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        const drag = Math.pow(s.drag, dt);
        s.vx *= drag;
        s.vy = s.vy * drag + s.g * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.rot += s.vr * dt;
        s.life -= s.decay * dt;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        fc.globalAlpha = Math.min(1, s.life * 1.4);
        fc.fillStyle = s.color;
        if (s.star) drawSparkStar(fc, s);
        else { fc.beginPath(); fc.arc(s.x, s.y, s.size * .45, 0, 6.283); fc.fill(); }
      }

      bc.globalAlpha = fc.globalAlpha = 1;
      requestAnimationFrame(frame);
    }

    function burst(x, y, n = 60, opts = {}) {
      if (reduceMotion) n = Math.min(n, 12);
      const colors = [accent, '#ffffff', accent2, accent];
      const power = opts.power || 7;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283, sp = power * (.25 + Math.random() * .9);
        sparks.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.lift ?? 2.5),
          g: .12, drag: .965, life: 1, decay: .007 + Math.random() * .012,
          size: 2.5 + Math.random() * 5, rot: Math.random() * 6, vr: (Math.random() - .5) * .3,
          color: colors[i % colors.length], star: Math.random() < .55,
        });
      }
    }

    function rain(n = 50) {
      if (reduceMotion) return;
      const colors = [accent, '#ffffff', accent2];
      for (let i = 0; i < n; i++) {
        sparks.push({
          x: Math.random() * W, y: -10 - Math.random() * H * .4,
          vx: (Math.random() - .5) * 1.2, vy: 1.5 + Math.random() * 2,
          g: .015, drag: .995, life: 1.4, decay: .004 + Math.random() * .004,
          size: 2.5 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - .5) * .2,
          color: colors[i % 3], star: true,
        });
      }
    }

    function setTheme(key) {
      starAlpha = THEMES[key].stars;
      const cs = getComputedStyle(document.body);
      accent = cs.getPropertyValue('--accent').trim() || accent;
      accent2 = cs.getPropertyValue('--accent2').trim() || accent2;
    }

    addEventListener('resize', resize);
    addEventListener('pointermove', e => { targetWind = (e.clientX / Math.max(W, 1) - .5) * 1.8; }, { passive: true });
    resize();
    requestAnimationFrame(frame);

    return { burst, rain, setTheme, setNear(v) { near = v; } };
  })();

  /* ------------------------------------------------------------
     Boîte à musique (Web Audio, aucun fichier son)
     Mélodie : « Jingle Bells » (domaine public)
     ------------------------------------------------------------ */
  const Music = (() => {
    let ctx = null, master = null, song = null, playing = false, loopTimer = null;
    const freq = m => 440 * Math.pow(2, (m - 69) / 12);
    const N = { C3: 48, D3: 50, F3: 53, G3: 55, C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, C6: 84, E6: 88, G6: 91, C7: 96 };
    const A = [['E5', 1], ['E5', 1], ['E5', 2], ['E5', 1], ['E5', 1], ['E5', 2], ['E5', 1], ['G5', 1], ['C5', 1.5], ['D5', .5], ['E5', 4]];
    const B1 = [['F5', 1], ['F5', 1], ['F5', 1.5], ['F5', .5], ['F5', 1], ['E5', 1], ['E5', 1], ['E5', .5], ['E5', .5], ['E5', 1], ['D5', 1], ['D5', 1], ['E5', 1], ['D5', 2], ['G5', 2]];
    const B2 = [['F5', 1], ['F5', 1], ['F5', 1.5], ['F5', .5], ['F5', 1], ['E5', 1], ['E5', 1], ['E5', .5], ['E5', .5], ['G5', 1], ['G5', 1], ['F5', 1], ['D5', 1], ['C5', 4]];
    const MELODY = [...A, ...B1, ...A, ...B2];
    const BASS = ['C3', 'C3', 'C3', 'C3', 'F3', 'C3', 'D3', 'G3', 'C3', 'C3', 'C3', 'C3', 'F3', 'C3', 'G3', 'C3'];
    const BEAT = .28, LOOP_BEATS = 68;

    function ensure() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = .5;
        const delay = ctx.createDelay();
        delay.delayTime.value = .24;
        const fb = ctx.createGain(); fb.gain.value = .3;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
        const wet = ctx.createGain(); wet.gain.value = .35;
        master.connect(ctx.destination);
        master.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay);
        lp.connect(wet); wet.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    function bell(out, f, t, dur, vol) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + .01);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      g.connect(out);
      for (const [mul, amp] of [[1, 1], [2, .35], [3.01, .12]]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * mul;
        const og = ctx.createGain();
        og.gain.value = amp;
        o.connect(og); og.connect(g);
        o.start(t); o.stop(t + dur + .05);
      }
    }

    function bass(out, f, t, dur, vol) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + .02);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + dur + .05);
    }

    function scheduleLoop(t0) {
      if (!playing || !song) return;
      let t = t0;
      for (const [n, b] of MELODY) {
        bell(song, freq(N[n]), t, Math.max(.9, b * BEAT * 2.2), .2);
        t += b * BEAT;
      }
      BASS.forEach((n, i) => {
        const bt = t0 + i * 4 * BEAT;
        bass(song, freq(N[n]), bt, BEAT * 1.8, .13);
        bass(song, freq(N[n] + 7), bt + 2 * BEAT, BEAT * 1.8, .08);
      });
      const len = LOOP_BEATS * BEAT;
      loopTimer = setTimeout(() => scheduleLoop(t0 + len), Math.max(0, (t0 + len - ctx.currentTime - 1.5) * 1000));
    }

    function start() {
      if (playing || !ensure()) return;
      playing = true;
      song = ctx.createGain();
      song.connect(master);
      scheduleLoop(ctx.currentTime + .1);
    }

    function stop() {
      playing = false;
      clearTimeout(loopTimer);
      if (song && ctx) {
        const s = song;
        s.gain.setTargetAtTime(0, ctx.currentTime, .12);
        setTimeout(() => s.disconnect(), 900);
      }
      song = null;
    }

    function chime() {
      if (!ensure()) return;
      const t = ctx.currentTime + .02;
      ['C6', 'E6', 'G6', 'C7'].forEach((n, i) => bell(master, freq(N[n]), t + i * .09, 1.5, .1));
    }

    return { start, stop, chime, get playing() { return playing; } };
  })();

  /* ------------------------------------------------------------
     Utilitaires d'interface
     ------------------------------------------------------------ */
  function setTheme(key) {
    document.body.dataset.theme = key;
    Sky.setTheme(key);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = THEMES[key].meta;
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }

  const store = {
    get() { try { return JSON.parse(localStorage.getItem('noel-draft') || 'null'); } catch { return null; } },
    set(v) { try { localStorage.setItem('noel-draft', JSON.stringify(v)); } catch { /* stockage indisponible */ } },
  };

  /* ------------------------------------------------------------
     Création
     ------------------------------------------------------------ */
  const Creator = (() => {
    const fTo = $('#f-to'), fMsg = $('#f-msg'), fFrom = $('#f-from');
    const count = $('#count');
    let state = sanitize(store.get() || {});
    let refs = null;

    $('#themes').innerHTML = Object.entries(THEMES).map(([k, t]) => `
      <label class="swatch">
        <input type="radio" name="theme" value="${k}">
        <span class="sw" style="--a:${t.sw[0]};--b:${t.sw[1]}"></span>
        <span class="sw-label">${t.label}</span>
      </label>`).join('');
    $('#decors').innerHTML = Object.entries(DECORS).map(([k, label]) => `
      <label class="decor-opt">
        <input type="radio" name="decor" value="${k}">
        <span class="decor-ico">${decorSVG(k)}</span>
        <span>${label}</span>
      </label>`).join('');

    function syncForm() {
      fTo.value = state.to;
      fMsg.value = state.m;
      fFrom.value = state.f;
      $(`input[name=theme][value=${state.th}]`).checked = true;
      $(`input[name=decor][value=${state.d}]`).checked = true;
      count.textContent = [...state.m].length;
    }

    function updatePreview() {
      if (!refs) refs = buildBook($('#preview-card .tilt'));
      fillBook(refs, state);
      const txt = state.m.trim();
      fitMsg(refs, txt || 'Ton message apparaîtra ici…');
      refs.msg.classList.toggle('placeholder', !txt);
    }

    function save() { store.set(state); }

    function onInput() {
      state.to = fTo.value.trim();
      state.m = fMsg.value;
      state.f = fFrom.value.trim();
      count.textContent = [...state.m].length;
      save();
      updatePreview();
    }

    fTo.addEventListener('input', () => { onInput(); refs.book.classList.add('open'); });
    fFrom.addEventListener('input', () => { onInput(); refs.book.classList.add('open'); });
    fMsg.addEventListener('input', () => { onInput(); refs.book.classList.add('open'); });

    $('#themes').addEventListener('change', e => {
      state.th = e.target.value;
      setTheme(state.th);
      save();
      refs.book.classList.remove('open');
      const [x, y] = centerOf(e.target.closest('.swatch'));
      Sky.burst(x, y, 24, { power: 4, lift: 1 });
    });
    $('#decors').addEventListener('change', e => {
      state.d = e.target.value;
      save();
      updatePreview();
      refs.book.classList.remove('open');
    });


    const previewStage = $('#preview-stage');
    previewStage.addEventListener('click', () => refs && refs.book.classList.toggle('open'));
    attachTilt(previewStage, $('#preview-card .tilt'), 14);

    function validate() {
      if (!state.m.trim()) {
        fMsg.classList.remove('shake'); void fMsg.offsetWidth; fMsg.classList.add('shake');
        fMsg.focus();
        toast('Écris un petit message avant de créer ta carte ✍️');
        return false;
      }
      return true;
    }

    $('#preview-full').addEventListener('click', () => {
      if (!validate()) return;
      location.hash = 'c=' + encode(state);
    });

    $('#form').addEventListener('submit', e => {
      e.preventDefault();
      if (!validate()) return;
      Share.open(state);
      const [x, y] = centerOf($('#create'));
      Sky.burst(x, y, 90, { power: 9 });
      Music.chime();
    });

    return {
      show() {
        setTheme(state.th);
        syncForm();
        updatePreview();
        document.title = 'Crée ta carte de Noël ✨';
      },
    };
  })();

  /* ------------------------------------------------------------
     Partage
     ------------------------------------------------------------ */
  const Share = (() => {
    const modal = $('#modal'), input = $('#share-link');
    let lastFocus = null, url = '';

    function open(d) {
      url = cardLink(d);
      const text = d.to ? `${d.to}, j'ai une carte de Noël pour toi ✨` : "J'ai une carte de Noël pour toi ✨";
      input.value = url;
      $('#wa-share').href = 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + url);
      $('#mail-share').href = 'mailto:?subject=' + encodeURIComponent('Une carte de Noël pour toi 🎄') + '&body=' + encodeURIComponent(text + '\n\n' + url);
      $('#open-card').href = url;
      const ns = $('#native-share');
      ns.hidden = !navigator.share;
      ns.onclick = () => navigator.share({ title: 'Une carte de Noël pour toi 🎄', text, url }).catch(() => {});
      lastFocus = document.activeElement;
      modal.hidden = false;
      $('#copy-btn').focus();
    }
    function close() {
      modal.hidden = true;
      if (lastFocus) lastFocus.focus();
    }
    async function copy() {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        input.select();
        document.execCommand('copy');
      }
      $('#copy-btn').textContent = 'Copié ✓';
      setTimeout(() => { $('#copy-btn').textContent = 'Copier'; }, 2000);
      toast('Lien copié ! Colle-le dans un message 💌');
    }

    $('#copy-btn').addEventListener('click', copy);
    $('#modal-close').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) close(); });
    input.addEventListener('focus', () => input.select());

    return { open, close };
  })();

  /* ------------------------------------------------------------
     Lecture de la carte
     ------------------------------------------------------------ */
  const Viewer = (() => {
    const envWrap = $('#env-wrap'), env = $('#envelope'), card = $('#viewer-card');
    const tilt = $('#viewer-card .tilt'), glow = $('#card-glow');
    const endActions = $('#end-actions'), soundBtn = $('#sound-btn');
    let data = null, refs = null, timers = [], opened = false, typing = null, spread = false;
    let soundOn = true; // son activé par défaut

    const later = (fn, ms) => timers.push(setTimeout(fn, reduceMotion ? ms * .25 : ms));
    function clear() {
      timers.forEach(clearTimeout);
      timers = [];
      if (typing) typing.cancel();
      typing = null;
    }

    function updateSpread() {
      if (!refs) return;
      const w = card.getBoundingClientRect().width;
      spread = innerWidth >= w * 2 + 48;
      refs.book.classList.toggle('spread', spread);
      refs.book.classList.toggle('solo', !spread);
    }

    function updateSoundIcon() {
      soundBtn.textContent = soundOn ? '🔊' : '🔇';
      soundBtn.setAttribute('aria-label', soundOn ? 'Couper le son' : 'Activer le son');
    }

    function setup(d) {
      data = d;
      clear();
      Music.stop();
      opened = false;
      envWrap.className = 'env-wrap';
      env.className = 'envelope';
      card.classList.remove('show');
      glow.classList.remove('show');
      endActions.classList.remove('show');
      $('#env-to').textContent = d.to ? 'Pour ' + d.to : 'Pour toi';
      $('#env-title').textContent = d.f ? `${d.f} t'a envoyé une carte` : 'Tu as reçu une carte';
      refs = buildBook(tilt);
      fillBook(refs, d);
      refs.msg.textContent = '';
      updateSoundIcon();
      updateSpread();
      document.title = d.to ? `Une carte pour ${d.to} 🎄` : 'Une carte de Noël pour toi 🎄';
    }

    function open() {
      if (opened || !data) return;
      opened = true;
      if (soundOn) {
        Music.chime();
        later(() => { if (soundOn) Music.start(); }, 900);
      }
      const [sx, sy] = centerOf(env.querySelector('.env-seal'));
      Sky.burst(sx, sy, 45, { power: 5 });
      envWrap.classList.add('opened');
      env.classList.add('opening');
      later(() => env.classList.add('flap-behind'), 750);
      later(() => env.classList.add('letter-out'), 1050);
      later(() => {
        envWrap.classList.add('gone');
        card.classList.add('show');
        glow.classList.add('show');
      }, 2050);
      later(() => refs.book.classList.add('open'), 3200);
      later(() => {
        const r = card.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height * .35;
        Sky.burst(cx, cy, 80, { power: 9 });
        if (spread) {
          Sky.burst(cx - r.width * .8, cy, 30, { power: 6 });
          Sky.burst(cx + r.width * .8, cy, 30, { power: 6 });
        }
        startTyping();
      }, 4100);
    }

    function startTyping() {
      const text = data.m.trim() || 'Joyeux Noël !';
      fitMsg(refs, text);
      typing = typeWriter(refs.msg, text, () => {
        refs.sign.classList.add('show');
        later(() => {
          endActions.classList.add('show');
          Sky.rain(60);
        }, 1100);
      });
    }

    env.addEventListener('click', open);
    env.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    tilt.addEventListener('click', () => {
      if (!refs || !refs.book.classList.contains('open')) return;
      if (typing && !typing.done) { typing.finish(); return; }
      if (typing && typing.done) refs.book.classList.toggle('open');
    });
    attachTilt($('#viewer'), tilt, 9);
    soundBtn.addEventListener('click', () => {
      soundOn = !soundOn;
      if (!soundOn) Music.stop();
      else if (opened) Music.start();
      updateSoundIcon();
    });
    $('#replay').addEventListener('click', () => setup(data));
    $('#make-own').addEventListener('click', e => {
      e.preventDefault();
      history.pushState(null, '', location.pathname + location.search);
      route();
    });
    addEventListener('resize', updateSpread);

    return {
      show(d) { setup(d); },
      stop() { clear(); Music.stop(); },
    };
  })();

  /* ------------------------------------------------------------
     Navigation
     ------------------------------------------------------------ */
  function parseHash() {
    const m = location.hash.match(/[#&]c=([^&]+)/);
    if (!m) return null;
    try { return sanitize(decode(m[1])); } catch { return 'invalid'; }
  }

  function route() {
    const d = parseHash();
    const creator = $('#creator'), viewer = $('#viewer');
    if (d && d !== 'invalid') {
      Share.close();
      $('#modal').hidden = true;
      creator.hidden = true;
      viewer.hidden = false;
      scrollTo(0, 0);
      setTheme(d.th);
      Sky.setNear(true);
      Viewer.show(d);
    } else {
      if (d === 'invalid') toast('Ce lien de carte semble abîmé 😕');
      Viewer.stop();
      viewer.hidden = true;
      creator.hidden = false;
      Sky.setNear(false);
      Creator.show();
    }
  }

  /* Petits sapins sur les collines */
  (function hillTrees() {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let out = '';
    for (let x = 10; x < 1440; x += 14 + rnd() * 60) {
      const h = 24 + rnd() * 44, b = 176 + rnd() * 10;
      out += `<polygon points="${x.toFixed(1)},${(b - h).toFixed(1)} ${(x - h * .3).toFixed(1)},${b.toFixed(1)} ${(x + h * .3).toFixed(1)},${b.toFixed(1)}"/>`;
    }
    $('#hill-trees').innerHTML = out;
  })();

  addEventListener('hashchange', route);
  addEventListener('popstate', route);
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(route, route);
})();
