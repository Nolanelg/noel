/* ============================================================
   Carte de Noël — logique
   Avec Supabase configuré (config.js) : les cartes et leurs photos
   sont enregistrées en ligne, le lien est court (#k=…) et les visites
   sont comptées. Sans configuration, la carte est encodée dans le lien.
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
  const REACTIONS = ['❤️', '🥰', '😭', '😂', '🎄', '🙏'];
  const DECORS = { sapin: 'Sapin', etoile: 'Étoile', flocon: 'Flocon', cadeau: 'Cadeau', bougie: 'Bougie' };
  const CINEMAS = {
    lune:   { label: 'Clair de lune',  desc: 'Travelling sous la pleine lune, le traîneau passe' },
    hyper:  { label: 'Hyperespace',    desc: 'Saut dans les étoiles, le prénom en poussière d’or' },
    aurore: { label: 'Aurore boréale', desc: 'Aurores sur un lac gelé, des lucioles écrivent le prénom' },
    globe:  { label: 'Boule à neige',  desc: 'Le village s’illumine, puis on plonge dans la boule' },
  };


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
      ci: CINEMAS[o.ci] ? o.ci : 'lune',
    };
  }
  const siteBase = () => location.href.split('#')[0];
  function sanitizeReply(o) {
    if (!o || typeof o !== 'object') throw new Error('bad');
    const re = REACTIONS.includes(o.re) ? o.re : '';
    const m = str(o.m, 300);
    if (!re && !m.trim()) throw new Error('empty');
    return { to: str(o.to, 40), from: str(o.from, 40), m, re, th: THEMES[o.th] ? o.th : 'nuit' };
  }
  function cardLink(d) {
    return siteBase() + '#c=' + encode(d);
  }

  function randomId(len) {
    const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.getRandomValues(new Uint8Array(len));
    return Array.from(bytes, b => abc[b % abc.length]).join('');
  }

  /* ------------------------------------------------------------
     Supabase (via son API REST, sans bibliothèque)
     ------------------------------------------------------------ */
  const API = (() => {
    const cfg = window.NOEL_CONFIG || {};
    const base = String(cfg.supabaseUrl || '').trim().replace(/\/+$/, '');
    const key = String(cfg.supabaseAnonKey || '').trim();
    const enabled = /^https:\/\/[^/]+$/.test(base) && key.length > 20;

    function headers(extra = {}) {
      const h = { apikey: key, ...extra };
      if (key.startsWith('eyJ')) h.Authorization = 'Bearer ' + key;
      return h;
    }
    async function rpc(fn, args) {
      const res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(args),
      });
      if (!res.ok) throw new Error(`${fn} : ${res.status}`);
      const txt = await res.text();
      return txt ? JSON.parse(txt) : null;
    }
    async function upload(bucket, blob, ext, type) {
      const name = randomId(20) + '.' + ext;
      const res = await fetch(`${base}/storage/v1/object/${bucket}/${name}`, {
        method: 'POST',
        headers: headers({ 'Content-Type': type, 'x-upsert': 'false' }),
        body: blob,
      });
      if (!res.ok) throw new Error(bucket + ' : ' + res.status);
      return name;
    }
    const photoUrl = path => (path && /^[A-Za-z0-9_-]{8,64}\.jpg$/.test(path))
      ? `${base}/storage/v1/object/public/photos/${path}` : '';
    const voiceUrl = path => (path && /^[A-Za-z0-9_-]{8,64}\.(webm|m4a|ogg)$/.test(path))
      ? `${base}/storage/v1/object/public/voix/${path}` : '';

    const store = (k, fallback) => {
      try {
        let v = localStorage.getItem(k);
        if (!v) { v = fallback(); localStorage.setItem(k, v); }
        return v;
      } catch { return fallback(); }
    };
    const visitorId = () => store('noel-visitor', () => randomId(16));

    // Cartes créées depuis ce navigateur : on ne compte pas leurs ouvertures
    const mine = {
      list() {
        try {
          const raw = JSON.parse(localStorage.getItem('noel-mine') || '[]');
          return raw.map(x => (typeof x === 'string' ? { id: x } : x)).filter(x => x && x.id);
        } catch { return []; }
      },
      add(entry) {
        try { localStorage.setItem('noel-mine', JSON.stringify([...this.list(), entry].slice(-200))); } catch { /* ignoré */ }
      },
      has(id) { return this.list().some(x => x.id === id); },
    };

    function track(type, cardId = null, page = null) {
      if (!enabled) return;
      rpc('log_event', {
        p_type: type, p_card_id: cardId, p_visitor_id: visitorId(), p_page: page,
        p_referrer: (document.referrer || '').slice(0, 300) || null,
        p_user_agent: navigator.userAgent.slice(0, 400),
        p_lang: (navigator.language || '').slice(0, 20) || null,
        p_screen: `${screen.width}x${screen.height}`,
      }).catch(() => {});
    }

    async function createCard(d, { photo = null, voice = null, unlockAt = null } = {}) {
      const [photoPath, voicePath] = await Promise.all([
        photo ? upload('photos', photo, 'jpg', 'image/jpeg') : null,
        voice ? upload('voix', voice.blob, voice.ext, voice.type) : null,
      ]);
      const res = await rpc('create_card', {
        p_recipient: d.to, p_message: d.m, p_sender: d.f, p_theme: d.th, p_decor: d.d,
        p_photo_path: photoPath, p_visitor_id: visitorId(), p_cinema: d.ci,
        p_unlock_at: unlockAt ? unlockAt.toISOString() : null, p_voice_path: voicePath,
      });
      if (!res || typeof res.id !== 'string') throw new Error('identifiant manquant');
      mine.add({ id: res.id, to: d.to, at: new Date().toISOString(), unlock: unlockAt ? unlockAt.toISOString() : null });
      return res;
    }

    async function getCard(id) {
      const rows = await rpc('get_card', { p_id: id });
      const c = Array.isArray(rows) ? rows[0] : null;
      if (!c) return null;
      const d = sanitize({ to: c.recipient, m: c.message || '', f: c.sender, th: c.theme, d: c.decor, ci: c.cinema });
      d.ph = photoUrl(c.photo_path);
      d.voice = voiceUrl(c.voice_path);
      d.locked = !!c.locked;
      d.unlockAt = c.unlock_at ? new Date(c.unlock_at) : null;
      return d;
    }

    const addReply = (cardId, reaction, message, author) => rpc('add_reply', {
      p_card_id: cardId, p_reaction: reaction, p_message: message, p_author: author, p_visitor_id: visitorId(),
    });

    return { enabled, track, createCard, getCard, addReply, mine };
  })();

  /* Réduit et compresse une photo en JPEG (1280 px max) */
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 2000); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('format')); };
      img.src = url;
    });
  }
  async function compressImage(file) {
    const img = await loadImage(file);
    const max = 1280;
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    let q = .85, blob = null;
    do {
      blob = await new Promise(res => c.toBlob(res, 'image/jpeg', q));
      q -= .1;
    } while (blob && blob.size > 2.5e6 && q > .4);
    if (!blob) throw new Error('compression');
    return blob;
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
            <figure class="polaroid" hidden><img alt="Photo jointe à la carte"></figure>
            <p class="greet"></p>
            <div class="msg-wrap"><p class="msg"></p></div>
            <button type="button" class="voice-pill" hidden aria-label="Écouter le message vocal">
              <span class="vp-ico" aria-hidden="true">▶</span><span class="vp-label">Message vocal</span><span class="vp-bar" aria-hidden="true"><i></i></span>
            </button>
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
    const refs = {
      host, book: q('.book'), greet: q('.greet'), msg: q('.msg'), msgWrap: q('.msg-wrap'),
      sign: q('.sign'), signName: q('.sign-name'), decor: q('.decor-slot'), decorKind: null,
      frame: q('.inside-frame'), polaroid: q('.polaroid'), photo: q('.polaroid img'),
      voicePill: q('.voice-pill'), voiceSrc: '', audio: null,
    };
    setupVoice(refs);
    return refs;
  }

  /* Lecture du message vocal dans la carte */
  function setupVoice(refs) {
    const pill = refs.voicePill, ico = pill.querySelector('.vp-ico'), bar = pill.querySelector('.vp-bar i');
    const sync = () => {
      const a = refs.audio, playing = !!a && !a.paused && !a.ended;
      pill.classList.toggle('playing', playing);
      ico.textContent = playing ? '❚❚' : '▶';
      pill.setAttribute('aria-label', playing ? 'Mettre en pause le message vocal' : 'Écouter le message vocal');
      Music.duck(playing);
    };
    refs.playVoice = () => {
      if (!refs.voiceSrc) return;
      if (!refs.audio || refs.audio.dataset.src !== refs.voiceSrc) {
        if (refs.audio) refs.audio.pause();
        const a = new Audio(refs.voiceSrc);
        a.dataset.src = refs.voiceSrc;
        a.addEventListener('play', sync);
        a.addEventListener('pause', sync);
        a.addEventListener('ended', () => { bar.style.width = '100%'; sync(); });
        a.addEventListener('timeupdate', () => {
          if (isFinite(a.duration) && a.duration > 0) bar.style.width = (a.currentTime / a.duration * 100).toFixed(1) + '%';
        });
        refs.audio = a;
      }
      if (refs.audio.ended) refs.audio.currentTime = 0;
      refs.audio.play().catch(() => sync());
    };
    refs.stopVoice = () => { if (refs.audio) refs.audio.pause(); };
    pill.addEventListener('click', e => {
      e.stopPropagation();
      if (refs.audio && !refs.audio.paused) refs.stopVoice(); else refs.playVoice();
    });
  }

  function fillBook(refs, d) {
    refs.greet.textContent = d.to ? d.to + ',' : 'Coucou,';
    refs.signName.textContent = d.f;
    refs.sign.hidden = !d.f;
    const ph = d.ph || '';
    refs.polaroid.hidden = !ph;
    refs.frame.classList.toggle('has-photo', !!ph);
    if (ph && refs.photo.getAttribute('src') !== ph) refs.photo.src = ph;
    if (!ph) refs.photo.removeAttribute('src');
    const voice = d.voice || '';
    if (voice !== refs.voiceSrc) {
      if (refs.audio) refs.audio.pause();
      refs.audio = null;
      refs.voicePill.querySelector('.vp-bar i').style.width = '0';
      refs.voicePill.classList.remove('playing');
      refs.voicePill.querySelector('.vp-ico').textContent = '▶';
    }
    refs.voiceSrc = voice;
    refs.voicePill.hidden = !voice;
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
    let shoot = null, nextShoot = performance.now() + 3500, comet = null, rockets = [];
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

      // comète (cinématique)
      if (comet) {
        const p = Math.min(1, (t - comet.t0) / comet.dur);
        const e = p * p * (3 - 2 * p);
        const x = comet.x0 + (comet.x1 - comet.x0) * e, y = comet.y0 + (comet.y1 - comet.y0) * e;
        const dx = comet.x1 - comet.x0, dy = comet.y1 - comet.y0, len = Math.hypot(dx, dy) || 1;
        const tail = 60 + 200 * Math.sin(Math.PI * Math.min(p, .9));
        const tx = x - dx / len * tail, ty = y - dy / len * tail;
        const g = fc.createLinearGradient(x, y, tx, ty);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(.3, accent2);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        fc.globalAlpha = 1;
        fc.strokeStyle = g; fc.lineWidth = 4; fc.lineCap = 'round';
        fc.beginPath(); fc.moveTo(x, y); fc.lineTo(tx, ty); fc.stroke();
        fc.drawImage(sprite, x - 22, y - 22, 44, 44);
        for (let k = 0; k < 3; k++) dust(x, y);
        if (p >= 1) { const cb = comet.cb; comet = null; if (cb) cb(); }
      }

      // fusées de feu d'artifice
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.vy += .06 * dt;
        r.x += r.vx * dt; r.y += r.vy * dt;
        fc.globalAlpha = 1; fc.fillStyle = '#fff';
        fc.beginPath(); fc.arc(r.x, r.y, 2.2, 0, 6.283); fc.fill();
        sparks.push({ x: r.x, y: r.y, vx: (Math.random() - .5) * .5, vy: Math.random() * .6, g: .02, drag: .96,
          life: .7, decay: .03, size: 2, rot: 0, vr: 0, color: r.colors[0], star: false });
        if (r.vy >= -1.2 || r.y <= r.ty) {
          rockets.splice(i, 1);
          burst(r.x, r.y, 90, { power: 8, lift: .5, colors: r.colors, decay: .006 });
          if (r.onBurst) r.onBurst();
        }
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
      const colors = opts.colors || [accent, '#ffffff', accent2, accent];
      const power = opts.power || 7;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.283, sp = power * (.25 + Math.random() * .9);
        sparks.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.lift ?? 2.5),
          g: .12, drag: .965, life: 1, decay: (opts.decay || .007) + Math.random() * .012,
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

    function dust(x, y) {
      if (sparks.length > 900) return;
      sparks.push({
        x: x + (Math.random() - .5) * 6, y: y + (Math.random() - .5) * 6,
        vx: (Math.random() - .5) * .7, vy: .15 + Math.random() * .5,
        g: .008, drag: .985, life: 1, decay: .012 + Math.random() * .016,
        size: 1.5 + Math.random() * 2.6, rot: Math.random() * 6, vr: (Math.random() - .5) * .2,
        color: Math.random() < .5 ? accent : (Math.random() < .5 ? '#ffffff' : accent2), star: Math.random() < .45,
      });
    }

    function launchComet(x0, y0, x1, y1, dur, cb) {
      comet = { x0, y0, x1, y1, dur, cb, t0: performance.now() };
    }

    const FIRE = [['#ff4d6d', '#ffd1dc', '#ffffff'], ['#7bdff2', '#d6f6ff', '#ffffff'], ['#ffd166', '#fff3c4', '#ffffff'],
      ['#c77dff', '#f0dcff', '#ffffff'], ['#80ed99', '#dcffe4', '#ffffff']];
    function firework(x, ty, onBurst) {
      if (reduceMotion) return;
      const colors = Math.random() < .35 ? [accent, accent2, '#ffffff'] : FIRE[Math.floor(Math.random() * FIRE.length)];
      const vy = -Math.sqrt(2 * .06 * Math.max(60, H - ty)) * 1.02;
      rockets.push({ x, y: H + 10, vx: (Math.random() - .5) * 1.2, vy, ty, colors, onBurst });
    }

    return {
      burst, rain, dust, firework, setTheme, setNear(v) { near = v; },
      comet: launchComet, cancelComet() { comet = null; },
      size: () => [W, H],
    };
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
      // accord final, puis la musique s'arrête (elle ne tourne pas en boucle)
      const end = t0 + 64 * BEAT;
      ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => bell(song, freq(N[n]), end + i * .06, 3.2, .14));
      bass(song, freq(N.C3), end, 2.4, .12);
      loopTimer = setTimeout(() => { playing = false; played = true; song = null; }, Math.max(0, (end + 3.4 - ctx.currentTime) * 1000));
    }

    // une seule écoute complète par visite
    let played = false;
    function start() {
      if (playing || played || !ensure()) return;
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

    let noiseBuf = null;
    function noise() {
      if (!noiseBuf) {
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      return src;
    }

    // souffle de la comète
    function whoosh(dur = 1.2) {
      if (!ensure()) return;
      const t = ctx.currentTime, src = noise();
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(3200, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(.35, t + dur * .8);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur + .25);
      src.connect(bp); bp.connect(g); g.connect(master);
      src.start(t); src.stop(t + dur + .3);
    }

    // petit « pop » de feu d'artifice
    function pop() {
      if (!ensure()) return;
      const t = ctx.currentTime, src = noise();
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.setValueAtTime(.25, t);
      g.gain.exponentialRampToValueAtTime(.0001, t + .5);
      src.connect(lp); lp.connect(g); g.connect(master);
      src.start(t); src.stop(t + .55);
    }

    function duck(on) {
      if (!ctx || !master) return;
      master.gain.setTargetAtTime(on ? .1 : .5, ctx.currentTime, .25);
    }

    // nappe d'accords qui monte doucement
    function swell(dur = 4) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(300, t);
      lp.frequency.exponentialRampToValueAtTime(2600, t + dur * .7);
      const g = ctx.createGain();
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(.09, t + dur * .55);
      g.gain.exponentialRampToValueAtTime(.0001, t + dur);
      lp.connect(g); g.connect(master);
      [261.63, 329.63, 392, 523.25, 659.25].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = i % 2 ? 'triangle' : 'sine';
        o.frequency.value = f;
        o.detune.value = (Math.random() - .5) * 14;
        o.connect(lp);
        o.start(t); o.stop(t + dur + .1);
      });
    }

    // grelots (boule à neige qu'on secoue)
    function bells(dur = 2) {
      if (!ensure()) return;
      const t0 = ctx.currentTime;
      for (let k = 0; k < dur * 12; k++) {
        const t = t0 + k / 12 + Math.random() * .03;
        const src = noise();
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 6000 + Math.random() * 3000; bp.Q.value = 5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(.0001, t);
        g.gain.exponentialRampToValueAtTime(.3, t + .004);
        g.gain.exponentialRampToValueAtTime(.0001, t + .12);
        src.connect(bp); bp.connect(g); g.connect(master);
        src.start(t, Math.random()); src.stop(t + .14);
        if (k % 3 === 0) bell(master, 2400 + Math.random() * 1600, t, .35, .03);
      }
    }

    return { start, stop, chime, whoosh, pop, duck, swell, bells, get playing() { return playing; } };
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
  let previewData = null;

  const fmtWhen = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const fmtDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  function ago(date) {
    const sec = (new Date(date).getTime() - Date.now()) / 1000, a = Math.abs(sec);
    if (a < 60) return 'à l’instant';
    if (a < 3600) return rtf.format(Math.round(sec / 60), 'minute');
    if (a < 86400) return rtf.format(Math.round(sec / 3600), 'hour');
    if (a < 86400 * 7) return rtf.format(Math.round(sec / 86400), 'day');
    return 'le ' + fmtDay.format(new Date(date));
  }
  const pad = n => String(n).padStart(2, '0');
  const toLocalInput = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  /* Prochain 24 ou 25 décembre (heure locale) */
  function nextXmas(day, hour) {
    const now = new Date();
    let d = new Date(now.getFullYear(), 11, day, hour, 0);
    if (d <= now) d = new Date(now.getFullYear() + 1, 11, day, hour, 0);
    return d;
  }

  const Creator = (() => {
    const fTo = $('#f-to'), fMsg = $('#f-msg'), fFrom = $('#f-from');
    const count = $('#count');
    let state = sanitize(store.get() || {});
    let refs = null, photoBlob = null, photoUrl = '', busy = false;

    $('#themes').innerHTML = Object.entries(THEMES).map(([k, t]) => `
      <label class="swatch">
        <input type="radio" name="theme" value="${k}">
        <span class="sw" style="--a:${t.sw[0]};--b:${t.sw[1]}"></span>
        <span class="sw-label">${t.label}</span>
      </label>`).join('');
    $('#cinemas').innerHTML = Object.entries(CINEMAS).map(([k, c]) => `
      <label class="cinema-opt">
        <input type="radio" name="cinema" value="${k}">
        <span class="cth cth-${k}" aria-hidden="true"></span>
        <b>${c.label}</b>
        <small>${c.desc}</small>
      </label>`).join('');
    $('#decors').innerHTML = Object.entries(DECORS).map(([k, label]) => `
      <label class="decor-opt">
        <input type="radio" name="decor" value="${k}">
        <span class="decor-ico">${decorSVG(k)}</span>
        <span>${label}</span>
      </label>`).join('');

    $('#photo-field').hidden = !API.enabled;
    $('#options-field').hidden = !API.enabled;

    /* --- option : date d'ouverture --- */
    const optLock = $('#opt-lock'), fUnlock = $('#f-unlock'), unlockHint = $('#unlock-hint');
    function unlockDate() {
      if (!optLock.checked || !fUnlock.value) return null;
      const d = new Date(fUnlock.value);
      return isNaN(d) ? null : d;
    }
    function syncLock() {
      $('#lock-body').hidden = !optLock.checked;
      fUnlock.min = toLocalInput(new Date());
      if (optLock.checked && !fUnlock.value) fUnlock.value = toLocalInput(nextXmas(24, 19));
      const d = unlockDate();
      unlockHint.textContent = !optLock.checked ? ''
        : !d ? 'Choisis une date et une heure.'
        : d <= new Date() ? '⚠️ Cette date est déjà passée.'
        : `La carte s'ouvrira le ${fmtWhen.format(d)}.`;
    }
    optLock.addEventListener('change', syncLock);
    fUnlock.addEventListener('input', syncLock);
    document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => {
      fUnlock.value = toLocalInput(b.dataset.preset === 'eve' ? nextXmas(24, 19) : nextXmas(25, 0));
      syncLock();
    }));

    /* --- option : message vocal --- */
    const optVoice = $('#opt-voice'), recBtn = $('#rec-btn'), recLabel = $('#rec-label'), recTime = $('#rec-time');
    const recErr = $('#rec-err'), recAudio = $('#rec-audio');
    const MAX_REC = 60;
    let recorder = null, recTimer = 0, recStart = 0, voice = null;
    const fmtSec = n => `${Math.floor(n / 60)}:${pad(Math.floor(n % 60))}`;
    function recError(msg) { recErr.textContent = msg; recErr.hidden = !msg; }
    function setRecUI(on) {
      recBtn.classList.toggle('on', on);
      recLabel.textContent = on ? 'Arrêter' : 'Enregistrer';
      if (!on) recTime.textContent = `0:00 / ${fmtSec(MAX_REC)}`;
    }
    function showVoice() {
      $('#rec-done').hidden = !voice;
      $('.rec').hidden = !!voice;
      if (voice) recAudio.src = voice.url; else recAudio.removeAttribute('src');
    }
    async function startRec() {
      recError('');
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
        recError("Ton navigateur ne permet pas d'enregistrer. Essaie avec Chrome, Safari ou Firefox à jour.");
        return;
      }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch {
        recError("Le micro n'est pas autorisé. Autorise-le dans ton navigateur puis réessaie.");
        return;
      }
      const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
      const mime = types.find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
      const chunks = [];
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : {});
      recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const raw = (recorder.mimeType || (chunks[0] && chunks[0].type) || 'audio/webm').split(';')[0];
        const type = raw.includes('mp4') || raw.includes('m4a') ? 'audio/mp4' : raw.includes('ogg') ? 'audio/ogg' : 'audio/webm';
        const blob = new Blob(chunks, { type });
        recorder = null;
        setRecUI(false);
        if (blob.size < 2000) { recError("L'enregistrement est trop court, réessaie."); return; }
        if (blob.size > 3e6) { recError("L'enregistrement est trop lourd, essaie plus court."); return; }
        voice = { blob, type, ext: type === 'audio/mp4' ? 'm4a' : type === 'audio/ogg' ? 'ogg' : 'webm', url: URL.createObjectURL(blob) };
        showVoice();
        updatePreview();
        refs.book.classList.add('open');
      };
      recorder.start(250);
      recStart = Date.now();
      setRecUI(true);
      recTimer = setInterval(() => {
        const t = (Date.now() - recStart) / 1000;
        recTime.textContent = `${fmtSec(t)} / ${fmtSec(MAX_REC)}`;
        if (t >= MAX_REC) stopRec();
      }, 200);
    }
    function stopRec() {
      clearInterval(recTimer);
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    }
    recBtn.addEventListener('click', () => { if (recorder) stopRec(); else startRec(); });
    $('#rec-delete').addEventListener('click', () => {
      if (voice) URL.revokeObjectURL(voice.url);
      voice = null;
      recAudio.pause();
      showVoice();
      updatePreview();
    });
    optVoice.addEventListener('change', () => {
      $('#voice-body').hidden = !optVoice.checked;
      if (!optVoice.checked) stopRec();
      updatePreview();
    });


    function syncForm() {
      fTo.value = state.to;
      fMsg.value = state.m;
      fFrom.value = state.f;
      $(`input[name=theme][value=${state.th}]`).checked = true;
      $(`input[name=decor][value=${state.d}]`).checked = true;
      $(`input[name=cinema][value=${state.ci}]`).checked = true;
      count.textContent = [...state.m].length;
    }

    const current = () => ({ ...state, ph: photoUrl, voice: optVoice.checked && voice ? voice.url : '' });

    function updatePreview() {
      if (!refs) refs = buildBook($('#preview-card .tilt'));
      fillBook(refs, current());
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
    $('#cinemas').addEventListener('change', e => {
      state.ci = e.target.value;
      save();
      const [x, y] = centerOf(e.target.closest('.cinema-opt'));
      Sky.burst(x, y, 20, { power: 3.5, lift: 1 });
    });
    $('#cinema-preview').addEventListener('click', () => $('#preview-full').click());
    $('#decors').addEventListener('change', e => {
      state.d = e.target.value;
      save();
      updatePreview();
      refs.book.classList.remove('open');
    });

    /* --- photo --- */
    const drop = $('#photo-drop'), fPhoto = $('#f-photo');
    function showPhotoUI() {
      const has = !!photoUrl;
      $('#photo-empty').hidden = has;
      $('#photo-filled').hidden = !has;
      $('#photo-remove').hidden = !has;
      if (has) $('#photo-thumb').src = photoUrl;
    }
    async function setPhoto(file) {
      if (!file) return;
      if (!/^image\//.test(file.type) && !/\.(heic|heif)$/i.test(file.name)) {
        toast('Choisis un fichier image 📷');
        return;
      }
      drop.classList.add('busy');
      try {
        const blob = await compressImage(file);
        if (photoUrl) URL.revokeObjectURL(photoUrl);
        photoBlob = blob;
        photoUrl = URL.createObjectURL(blob);
        showPhotoUI();
        updatePreview();
        refs.book.classList.add('open');
        const [x, y] = centerOf(drop);
        Sky.burst(x, y, 24, { power: 4, lift: 1 });
      } catch {
        toast("Cette photo n'a pas pu être lue. Essaie avec une photo JPG ou PNG 📷");
      } finally {
        drop.classList.remove('busy');
        fPhoto.value = '';
      }
    }
    function clearPhoto() {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      photoBlob = null;
      photoUrl = '';
      showPhotoUI();
      updatePreview();
    }
    fPhoto.addEventListener('change', () => setPhoto(fPhoto.files[0]));
    $('#photo-remove').addEventListener('click', clearPhoto);
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('drag');
      setPhoto(e.dataTransfer.files[0]);
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
      previewData = current();
      location.hash = 'apercu';
    });

    function celebrate() {
      const [x, y] = centerOf($('#create'));
      Sky.burst(x, y, 90, { power: 9 });
      Music.chime();
    }

    $('#form').addEventListener('submit', async e => {
      e.preventDefault();
      if (busy || !validate()) return;
      if (!API.enabled) {
        Share.open(cardLink(state), state);
        celebrate();
        return;
      }
      if (recorder) { toast("Termine d'abord l'enregistrement 🎙️"); return; }
      const unlockAt = unlockDate();
      if (optLock.checked && (!unlockAt || unlockAt <= new Date())) {
        toast("Choisis une date d'ouverture dans le futur 📅");
        fUnlock.focus();
        return;
      }
      const sendVoice = optVoice.checked && voice ? voice : null;
      const btn = $('#create'), label = btn.textContent;
      busy = true;
      btn.disabled = true;
      btn.textContent = photoBlob || sendVoice ? 'Envoi en cours…' : 'Création…';
      try {
        const res = await API.createCard(state, { photo: photoBlob, voice: sendVoice, unlockAt: optLock.checked ? unlockAt : null });
        Share.open(siteBase() + '#k=' + res.id, state, { unlockAt: optLock.checked ? unlockAt : null });
        celebrate();
      } catch {
        toast("Oups, la carte n'a pas pu être créée. Vérifie ta connexion et réessaie.");
      } finally {
        busy = false;
        btn.disabled = false;
        btn.textContent = label;
      }
    });

    return {
      show() {
        setTheme(state.th);
        syncForm();
        showPhotoUI();
        showVoice();
        syncLock();
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

    function open(link, d, extra = {}) {
      url = link;
      $('#lock-note').hidden = !extra.unlockAt;
      if (extra.unlockAt) $('#lock-note').textContent = `🔒 Elle ne pourra être ouverte qu'à partir du ${fmtWhen.format(extra.unlockAt)}.`;
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
      if (modal.hidden) return;
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
     Lecture de la carte (avec cinématique d'introduction)
     ------------------------------------------------------------ */
  const Viewer = (() => {
    const envWrap = $('#env-wrap'), env = $('#envelope'), card = $('#viewer-card');
    const tilt = $('#viewer-card .tilt'), glow = $('#card-glow');
    const endActions = $('#end-actions'), soundBtn = $('#sound-btn'), replyBtn = $('#reply-btn');
    const cine = $('#cine'), gateBox = $('#cine-gate'), gateTitle = $('#gate-title');
    const gateBtn = $('#gate-btn'), gateNote = $('#gate-note'), sleigh = $('#sleigh');
    let data = null, opts = {}, refs = null, timers = [], opened = false, typing = null, spread = false;
    let cineTimers = [], sleighRAF = 0, gateMode = 'ready', started = false, cdTimer = 0;
    let soundOn = true; // son activé par défaut

    const later = (fn, ms) => timers.push(setTimeout(fn, reduceMotion ? ms * .25 : ms));
    const cineLater = (fn, ms) => cineTimers.push(setTimeout(fn, ms));
    function clear() {
      timers.forEach(clearTimeout);
      timers = [];
      if (typing) typing.cancel();
      typing = null;
    }
    function cineClear() {
      cineTimers.forEach(clearTimeout);
      cineTimers = [];
      cancelAnimationFrame(sleighRAF);
      sleigh.style.opacity = '0';
      Sky.cancelComet();
      if (window.Cinema) window.Cinema.stop();
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

    /* La « caméra » regarde le ciel (sans animation), prête pour le travelling */
    function camUp() {
      const b = document.body;
      b.classList.add('no-trans', 'cam-up');
      void b.offsetWidth;
      requestAnimationFrame(() => requestAnimationFrame(() => b.classList.remove('no-trans')));
    }

    function resetScene() {
      clear();
      if (refs && refs.stopVoice) refs.stopVoice();
      opened = false;
      envWrap.className = 'env-wrap waiting';
      env.className = 'envelope';
      card.classList.remove('show');
      glow.classList.remove('show');
      endActions.classList.remove('show');
    }

    function setup(d, o) {
      data = d;
      opts = o || {};
      resetScene();
      $('#env-to').textContent = d.to ? 'Pour ' + d.to : 'Pour toi';
      $('#env-title').textContent = d.f ? `${d.f} t'a envoyé une carte` : 'Tu as reçu une carte';
      refs = buildBook(tilt);
      fillBook(refs, d);
      refs.msg.textContent = '';
      updateSoundIcon();
      updateSpread();
      document.title = d.to ? `Une carte pour ${d.to} 🎄` : 'Une carte de Noël pour toi 🎄';
    }

    /* Compte à rebours d'une carte verrouillée */
    function runCountdown() {
      clearInterval(cdTimer);
      const tick = () => {
        const left = Math.max(0, data.unlockAt - Date.now());
        const sec = Math.floor(left / 1000);
        $('#cd-d').textContent = Math.floor(sec / 86400);
        $('#cd-h').textContent = pad(Math.floor(sec / 3600) % 24);
        $('#cd-m').textContent = pad(Math.floor(sec / 60) % 60);
        $('#cd-s').textContent = pad(sec % 60);
        if (left <= 0) {
          clearInterval(cdTimer);
          gateTitle.textContent = "C'est l'heure ! ✨";
          setTimeout(route, 1500);
        }
      };
      tick();
      cdTimer = setInterval(tick, 1000);
    }

    function gate(mode) {
      gateMode = mode;
      cineClear();
      clearInterval(cdTimer);
      cine.hidden = false;
      cine.className = mode === 'locked' ? 'cine gate locked' : 'cine gate';
      $('#countdown').hidden = mode !== 'locked';
      $('#gate-sub').hidden = mode !== 'locked';
      envWrap.classList.add('waiting');
      camUp();
      gateBox.classList.toggle('gate-loading', mode === 'loading');
      gateTitle.textContent =
        mode === 'loading' ? 'Chargement de ta carte…'
        : mode === 'error' ? "La carte n'a pas pu être chargée"
        : mode === 'locked' ? (data.to ? `${data.to}, ta carte arrive bientôt` : 'Ta carte arrive bientôt')
        : (data && data.to ? `${data.to}, une surprise t'attend` : "Une surprise t'attend");
      if (mode === 'locked') {
        $('#gate-sub').textContent = `Elle s'ouvrira le ${fmtWhen.format(data.unlockAt)}` + (data.f ? `, de la part de ${data.f}.` : '.');
        runCountdown();
      }
      gateBtn.textContent = mode === 'error' ? 'Réessayer' : 'Ouvrir ✨';
      gateNote.hidden = mode !== 'ready';
      if (mode !== 'loading' && mode !== 'locked') gateBtn.focus({ preventScroll: true });
    }

    function flySleigh() {
      const m = $('#moon').getBoundingClientRect();
      const [W] = Sky.size();
      const mx = m.left + m.width / 2, my = m.top + m.height / 2;
      const p0 = [-240, my + m.height * 1.3], p2 = [W + 240, my - m.height * .1];
      const p1 = [2 * mx - .5 * (p0[0] + p2[0]), 2 * my - .5 * (p0[1] + p2[1])];
      const sw = sleigh.getBoundingClientRect().width || 200, sh = sw * 80 / 240;
      const dur = 5200, t0 = performance.now();
      sleigh.style.opacity = '1';
      const step = now => {
        const p = Math.min(1, (now - t0) / dur), u = 1 - p;
        const x = u * u * p0[0] + 2 * u * p * p1[0] + p * p * p2[0];
        const y = u * u * p0[1] + 2 * u * p * p1[1] + p * p * p2[1] + Math.sin(p * 20) * 3;
        const dx = 2 * u * (p1[0] - p0[0]) + 2 * p * (p2[0] - p1[0]);
        const dy = 2 * u * (p1[1] - p0[1]) + 2 * p * (p2[1] - p1[1]);
        const a = Math.atan2(dy, dx);
        sleigh.style.transform = `translate(${(x - sw / 2).toFixed(1)}px, ${(y - sh / 2).toFixed(1)}px) rotate(${a.toFixed(3)}rad)`;
        const bx = x - Math.cos(a) * sw * .42, by = y - Math.sin(a) * sw * .42 + sh * .2;
        Sky.dust(bx, by);
        Sky.dust(bx, by);
        if (p < 1) sleighRAF = requestAnimationFrame(step);
        else sleigh.style.opacity = '0';
      };
      sleighRAF = requestAnimationFrame(step);
    }

    function runCinematic() {
      cineClear();
      cine.hidden = false;
      envWrap.classList.add('waiting');
      if (reduceMotion) { endCinematic(false); return; }
      camUp();
      Sky.setNear(false);
      if (data.ci !== 'lune' && window.Cinema && window.Cinema.kinds.includes(data.ci)) {
        cine.className = 'cine run bars';
        const sfx = soundOn ? {
          whoosh: d => Music.whoosh(d), chime: () => Music.chime(),
          swell: d => Music.swell(d), bells: d => Music.bells(d),
        } : null;
        window.Cinema.play(data.ci, data, { sfx, onEnd: () => endCinematic(true) });
        return;
      }
      cine.className = 'cine run veil bars';
      $('#cine-kicker').textContent = data.f ? `${data.f} a pensé à toi` : "Quelqu'un a pensé à toi";
      $('#cine-big').textContent = data.to ? `Pour ${data.to}` : 'Pour toi';
      cineLater(() => cine.classList.add('t1'), 600);
      cineLater(() => cine.classList.remove('t1'), 3100);
      cineLater(() => {
        cine.classList.remove('veil');
        document.body.classList.remove('cam-up');
      }, 3400);
      cineLater(flySleigh, 5000);
      cineLater(() => cine.classList.add('t2'), 6900);
      cineLater(() => cine.classList.remove('t2'), 9600);
      cineLater(() => {
        const [W, H] = Sky.size();
        if (soundOn) Music.whoosh(1.1);
        Sky.comet(W * .9, -40, W / 2, H * .47, 1150, () => endCinematic(true));
      }, 9700);
    }

    function endCinematic(flash) {
      cineClear();
      Sky.setNear(true);
      document.body.classList.remove('cam-up');
      envWrap.classList.remove('waiting');
      cine.className = flash ? 'cine flash' : 'cine';
      if (flash) {
        const [W, H] = Sky.size();
        Sky.burst(W / 2, H * .47, 90, { power: 9 });
        if (soundOn) Music.chime();
      }
      cineLater(() => { cine.hidden = true; cine.className = 'cine'; }, 1000);
    }

    function open() {
      if (opened || !data) return;
      opened = true;
      if (opts.track && opts.id) API.track('open', opts.id, 'carte');
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
        if (data.ph) refs.polaroid.classList.add('show');
        if (data.voice && soundOn) later(() => refs.playVoice(), 700);
        startTyping();
      }, 4100);
    }

    function finale() {
      const [W, H] = Sky.size();
      for (let i = 0; i < 7; i++) {
        later(() => Sky.firework(W * (.12 + Math.random() * .76), H * (.1 + Math.random() * .25),
          () => { if (soundOn) Music.pop(); }), i * 480);
      }
    }

    function startTyping() {
      const text = data.m.trim() || 'Joyeux Noël !';
      fitMsg(refs, text);
      typing = typeWriter(refs.msg, text, () => {
        refs.sign.classList.add('show');
        later(() => {
          replyBtn.hidden = false;
          endActions.classList.add('show');
          Sky.rain(60);
          finale();
        }, 1100);
      });
    }

    gateBtn.addEventListener('click', () => {
      if (gateMode === 'error') { route(); return; }
      if (gateMode !== 'ready') return;
      started = true;
      if (soundOn) Music.start();
      runCinematic();
    });
    $('#cine-skip').addEventListener('click', () => endCinematic(true));
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
      if (!soundOn) { Music.stop(); if (refs && refs.stopVoice) refs.stopVoice(); }
      else if (started) Music.start();
      updateSoundIcon();
    });
    replyBtn.addEventListener('click', () => Reply.open(data, opts.id));
    $('#replay').addEventListener('click', () => {
      setup(data, { ...opts, track: false });
      runCinematic();
    });
    $('#make-own').addEventListener('click', e => {
      e.preventDefault();
      history.pushState(null, '', location.pathname + location.search);
      route();
    });
    addEventListener('resize', updateSpread);

    return {
      loading() { data = null; resetScene(); Music.stop(); gate('loading'); },
      error() { gate('error'); },
      show(d, o) { setup(d, o); Music.stop(); started = false; gate(d.locked ? 'locked' : 'ready'); },
      stop() {
        clear();
        clearInterval(cdTimer);
        if (refs && refs.stopVoice) refs.stopVoice();
        cineClear();
        Music.stop();
        cine.hidden = true;
        document.body.classList.remove('cam-up');
      },
    };
  })();

  /* ------------------------------------------------------------
     Réponse du destinataire
     ------------------------------------------------------------ */
  const Reply = (() => {
    const modal = $('#reply-modal'), form = $('#reply-form'), box = $('#reactions');
    const msg = $('#reply-msg'), author = $('#reply-author'), send = $('#reply-send');
    let cardId = null, reaction = null, busy = false, lastFocus = null, sender = '', recipient = '', theme = 'nuit';

    box.replaceChildren(...REACTIONS.map(e => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = e;
      b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', 'Réaction ' + e);
      b.addEventListener('click', () => {
        reaction = reaction === e ? null : e;
        box.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.textContent === reaction)));
        if (reaction) { const [x, y] = centerOf(b); Sky.burst(x, y, 14, { power: 3, lift: 1.5 }); }
      });
      return b;
    }));

    function open(d, id) {
      cardId = id;
      sender = d.f || '';
      recipient = d.to || '';
      theme = d.th;
      reaction = null;
      box.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', 'false'));
      msg.value = '';
      author.value = d.to || '';
      $('#reply-title').textContent = sender ? `Répondre à ${sender}` : 'Répondre';
      $('#reply-step').hidden = false;
      $('#reply-done').hidden = true;
      lastFocus = document.activeElement;
      modal.hidden = false;
      box.querySelector('button').focus();
    }
    function close() {
      if (modal.hidden) return;
      modal.hidden = true;
      if (lastFocus) lastFocus.focus();
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (busy) return;
      if (!reaction && !msg.value.trim()) { toast('Choisis une réaction ou écris un petit mot 💌'); return; }
      busy = true;
      send.disabled = true;
      const text = replyText();
      // Copie dans le tableau de bord (si la carte vient de la base) ; un échec ne bloque pas l'envoi
      if (API.enabled && cardId) {
        try { await API.addReply(cardId, reaction, msg.value.trim(), author.value.trim()); } catch { /* ignoré */ }
      }
      busy = false;
      send.disabled = false;
      showShare(text);
    });

    // Texte de la réponse, prêt à être envoyé par message
    // Lien vers la carte-réponse animée + petit texte d'accompagnement
    function replyText() {
      const who = author.value.trim() || recipient;
      const link = siteBase() + '#r=' + encode({ to: sender, from: who, m: msg.value.trim(), re: reaction || '', th: theme });
      return { link, text: `💌 Ma réponse à ta carte de Noël ✨ ${link}` };
    }

    function showShare({ link, text }) {
      $('#reply-step').hidden = true;
      $('#reply-done').hidden = false;
      $('#reply-done-title').textContent = sender ? `Envoie ta réponse à ${sender}` : 'Envoie ta réponse';
      $('#reply-done-text').textContent = `Ta réponse devient une petite carte animée ✨ ${sender ? sender + ' la' : 'On la'} verra en ouvrant le lien.`;
      $('#reply-preview').textContent = [reaction, msg.value.trim()].filter(Boolean).join(' ');
      $('#reply-peek').href = link;
      $('#reply-wa').href = 'https://wa.me/?text=' + encodeURIComponent(text);
      $('#reply-sms').href = 'sms:?&body=' + encodeURIComponent(text);
      const nat = $('#reply-native');
      nat.hidden = !navigator.share;
      nat.onclick = () => navigator.share({ text: '💌 Ma réponse à ta carte de Noël ✨', url: link }).then(sent).catch(() => {});
      $('#reply-copy').onclick = async () => {
        try { await navigator.clipboard.writeText(text); toast('Lien copié, colle-le dans ta conversation 💌'); sent(); }
        catch { toast('Copie impossible, sélectionne le texte à la main.'); }
      };
      $('#reply-copy').textContent = 'Copier le lien';
      (navigator.share ? nat : $('#reply-wa')).focus();
    }

    function sent() {
      const [W, H] = Sky.size();
      Sky.burst(W / 2, H * .4, 90, { power: 9 });
      Music.chime();
      $('#reply-btn').textContent = '💌 Répondre encore';
    }
    $('#reply-wa').addEventListener('click', sent);
    $('#reply-sms').addEventListener('click', sent);
    $('#reply-edit').addEventListener('click', () => {
      $('#reply-done').hidden = true;
      $('#reply-step').hidden = false;
      msg.focus();
    });
    $('#reply-close').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

    return { open, close };
  })();

  /* ------------------------------------------------------------
     Carte-réponse animée (lien #r=…)
     ------------------------------------------------------------ */
  const ReplyView = (() => {
    const sec = $('#replyview'), gate = $('#rv-gate'), stage = $('#rv-stage'), card = $('#rv-card');
    const rain = $('#rv-rain'), actions = $('#rv-actions');
    let data = null, timers = [], typing = null;
    const later = (fn, ms) => timers.push(setTimeout(fn, reduceMotion ? ms * .2 : ms));
    function clear() {
      timers.forEach(clearTimeout);
      timers = [];
      if (typing) typing.cancel();
      typing = null;
      rain.replaceChildren();
    }

    function emojiRain(emoji, n = 36) {
      if (reduceMotion) return;
      const frag = document.createDocumentFragment();
      for (let i = 0; i < n; i++) {
        const sp = document.createElement('span');
        sp.textContent = emoji;
        sp.style.left = (Math.random() * 100) + 'vw';
        sp.style.fontSize = (18 + Math.random() * 34) + 'px';
        sp.style.animationDuration = (2.4 + Math.random() * 2.4) + 's';
        sp.style.animationDelay = (Math.random() * 1.2) + 's';
        sp.style.setProperty('--rot', ((Math.random() - .5) * 720) + 'deg');
        frag.append(sp);
      }
      rain.append(frag);
    }

    function reset() {
      clear();
      card.className = 'rv-card';
      $('#rv-sign').classList.remove('show');
      actions.classList.remove('show');
      $('#rv-msg').textContent = '';
      $('#rv-msg').style.fontSize = '';
    }

    function show(d) {
      data = d;
      reset();
      setTheme(d.th);
      sec.hidden = false;
      gate.hidden = false;
      stage.hidden = true;
      const who = d.from || 'Quelqu’un';
      $('#rv-title').textContent = d.to ? `${d.to}, ${who} t’a répondu` : `${who} t’a répondu`;
      $('#rv-emoji').textContent = d.re || '💌';
      $('#rv-greet').textContent = d.to ? d.to + ',' : 'Coucou,';
      $('#rv-sign').textContent = '— ' + who;
      document.title = `${who} t’a répondu 💌`;
      scrollTo(0, 0);
    }

    function play() {
      reset();
      gate.hidden = true;
      stage.hidden = false;
      Music.chime();
      requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('in')));
      later(() => {
        card.classList.add('flip');
        Music.swell(3.5);
      }, 1200);
      later(() => {
        const r = card.getBoundingClientRect();
        Sky.burst(r.left + r.width / 2, r.top, 90, { power: 9 });
        emojiRain(data.re || '✨');
      }, 2150);
      later(() => {
        const text = data.m.trim() || 'a réagi à ta carte ' + (data.re || '💌');
        const el = $('#rv-msg'), wrap = el.parentElement;
        el.textContent = text;
        let size = parseFloat(getComputedStyle(el).fontSize) || 16, guard = 0;
        while (wrap.scrollHeight > wrap.clientHeight + 1 && size > 10 && guard++ < 60) { size *= .94; el.style.fontSize = size + 'px'; }
        typing = typeWriter(el, text, () => {
          $('#rv-sign').classList.add('show');
          later(() => { actions.classList.add('show'); Sky.rain(50); }, 900);
        });
      }, 2600);
    }

    $('#rv-open').addEventListener('click', play);
    $('#rv-replay').addEventListener('click', play);
    card.addEventListener('click', () => { if (typing && !typing.done) typing.finish(); });
    $('#rv-make').addEventListener('click', e => {
      e.preventDefault();
      history.pushState(null, '', location.pathname + location.search);
      route();
    });

    return { show, hide() { clear(); sec.hidden = true; } };
  })();

  /* ------------------------------------------------------------
     Navigation
     ------------------------------------------------------------ */
  function parseHash() {
    const h = location.hash;
    let m = h.match(/[#&]k=([A-Za-z0-9_-]{6,32})/);
    if (m) return { kind: 'remote', id: m[1], notrack: /[#&]notrack\b/.test(h) };
    m = h.match(/[#&]r=([^&]+)/);
    if (m) {
      try { return { kind: 'reply', data: sanitizeReply(decode(m[1])) }; } catch { return { kind: 'invalid' }; }
    }
    if (/^#apercu\b/.test(h)) return previewData ? { kind: 'local', data: previewData, preview: true } : null;
    m = h.match(/[#&]c=([^&]+)/);
    if (m) {
      try { return { kind: 'local', data: sanitize(decode(m[1])) }; } catch { return { kind: 'invalid' }; }
    }
    return null;
  }

  function showViewer(theme) {
    ReplyView.hide();
    Share.close();
    Reply.close();
    $('#creator').hidden = true;
    $('#viewer').hidden = false;
    document.body.classList.add('v-mode');
    scrollTo(0, 0);
    if (theme) setTheme(theme);
    Sky.setNear(true);
  }

  let visitLogged = false;
  function showCreator() {
    ReplyView.hide();
    Viewer.stop();
    Reply.close();
    $('#viewer').hidden = true;
    $('#creator').hidden = false;
    document.body.classList.remove('v-mode');
    Sky.setNear(false);
    Creator.show();
    if (!visitLogged) { visitLogged = true; API.track('visit', null, 'atelier'); }
  }

  let routeSeq = 0;
  async function route() {
    const seq = ++routeSeq;
    const r = parseHash();
    if (r && r.kind === 'reply') {
      Share.close();
      Reply.close();
      Viewer.stop();
      $('#creator').hidden = true;
      $('#viewer').hidden = true;
      document.body.classList.remove('v-mode');
      Sky.setNear(true);
      ReplyView.show(r.data);
      API.track('visit', null, 'reponse');
      return;
    }
    if (r && r.kind === 'remote') {
      showViewer(null);
      Viewer.loading();
      if (!API.enabled) {
        toast("Ce site n'est pas encore relié à sa base de données.");
        history.replaceState(null, '', location.pathname + location.search);
        showCreator();
        return;
      }
      try {
        const d = await API.getCard(r.id);
        if (seq !== routeSeq) return;
        if (!d) {
          toast('Cette carte est introuvable 😕');
          history.replaceState(null, '', location.pathname + location.search);
          showCreator();
          return;
        }
        const track = !r.notrack && !API.mine.has(r.id);
        if (track) API.track('view', r.id, 'carte');
        setTheme(d.th);
        Viewer.show(d, { id: r.id, track });
      } catch {
        if (seq === routeSeq) Viewer.error();
      }
    } else if (r && r.kind === 'local') {
      showViewer(r.data.th);
      Viewer.show(r.data, {});
    } else {
      if (r && r.kind === 'invalid') toast('Ce lien de carte semble abîmé 😕');
      showCreator();
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

  /* Montagnes enneigées de la cinématique */
  (function mountains() {
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const f = n => n.toFixed(1);
    function range(cls, baseY, amp, step) {
      const pts = [[-60, baseY]];
      let x = -60;
      while (x < 1500) {
        x += step * (.5 + rnd() * .6);
        pts.push([x, baseY - amp * (.5 + rnd() * .5), true]);
        x += step * (.5 + rnd() * .6);
        pts.push([x, baseY - amp * rnd() * .3]);
      }
      let caps = '';
      for (let i = 1; i < pts.length - 1; i++) {
        if (!pts[i][2]) continue;
        const [px, py] = pts[i], [lx, ly] = pts[i - 1], [rx, ry] = pts[i + 1];
        const k = .26;
        const a = [px + (lx - px) * k, py + (ly - py) * k], b = [px + (rx - px) * k, py + (ry - py) * k];
        const mid = (a[1] + b[1]) / 2;
        caps += `<polygon class="m-cap" points="${f(px)},${f(py)} ${f(b[0])},${f(b[1])} ${f(px + (b[0] - px) * .45)},${f(mid - (mid - py) * .2)} ${f(px)},${f(mid + 4)} ${f(px + (a[0] - px) * .45)},${f(mid - (mid - py) * .25)} ${f(a[0])},${f(a[1])}"/>`;
      }
      const d = 'M' + pts.map(p => f(p[0]) + ' ' + f(p[1])).join(' L') + ' L1500 400 L-60 400Z';
      return `<path class="${cls}" d="${d}"/>${caps}`;
    }
    $('#mountains').innerHTML = range('m-far', 290, 200, 110) + range('m-near', 350, 140, 80);
  })();

  addEventListener('hashchange', route);
  addEventListener('popstate', route);
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(route, route);
})();
