/* ============================================================
   Tableau de bord privé — lit les données Supabase après connexion
   ============================================================ */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const cfg = window.NOEL_CONFIG || {};
  const base = String(cfg.supabaseUrl || '').trim().replace(/\/+$/, '');
  const key = String(cfg.supabaseAnonKey || '').trim();
  const enabled = /^https:\/\/[^/]+$/.test(base) && key.length > 20;

  const THEME_LABEL = { nuit: 'Nuit étoilée', rouge: 'Rouge velours', foret: 'Forêt enneigée', givre: 'Givre' };
  const fmtDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
  const fmtDayLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  const nf = new Intl.NumberFormat('fr-FR');

  /* Petit utilitaire pour créer des éléments sans innerHTML */
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  }
  const svg = (tag, attrs = {}) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  function show(view) {
    for (const id of ['v-config', 'v-login', 'v-notadmin', 'v-dash']) $('#' + id).hidden = id !== view;
  }

  /* ---------------- Session ---------------- */
  let session = null;
  try { session = JSON.parse(sessionStorage.getItem('noel-admin') || 'null'); } catch { session = null; }
  const saveSession = () => { try { sessionStorage.setItem('noel-admin', JSON.stringify(session)); } catch { /* ignoré */ } };

  async function auth(grant, body) {
    const res = await fetch(`${base}/auth/v1/token?grant_type=${grant}`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(json.error_description || json.msg || 'auth'), { status: res.status });
    session = {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: Date.now() + (json.expires_in || 3600) * 1000,
      email: json.user && json.user.email,
      uid: json.user && json.user.id,
    };
    saveSession();
  }

  async function token() {
    if (!session) throw new Error('auth');
    if (Date.now() > session.expires_at - 60000) await auth('refresh_token', { refresh_token: session.refresh_token });
    return session.access_token;
  }

  async function api(path, opts = {}) {
    const t = await token();
    const res = await fetch(base + path, {
      ...opts,
      headers: { apikey: key, Authorization: 'Bearer ' + t, ...(opts.headers || {}) },
    });
    if (res.status === 401) { logout(); throw new Error('auth'); }
    if (!res.ok) throw new Error(path + ' ' + res.status);
    const txt = await res.text();
    return txt ? JSON.parse(txt) : null;
  }

  function logout() {
    session = null;
    try { sessionStorage.removeItem('noel-admin'); } catch { /* ignoré */ }
    show('v-login');
  }
  document.querySelectorAll('[data-logout]').forEach(b => b.addEventListener('click', logout));

  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#login-btn'), err = $('#login-err');
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Connexion…';
    try {
      await auth('password', { email: $('#email').value.trim(), password: $('#password').value });
      $('#password').value = '';
      await enter();
    } catch (ex) {
      err.textContent = ex.status === 400 ? 'E-mail ou mot de passe incorrect.' : 'Connexion impossible. Vérifie ta connexion internet.';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Se connecter';
    }
  });

  async function enter() {
    const isAdmin = await api('/rest/v1/rpc/is_admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!isAdmin) {
      $('#admin-sql').textContent = `insert into public.admins (user_id)\nvalues ('${session.uid}');`;
      show('v-notadmin');
      return;
    }
    show('v-dash');
    await load();
  }

  /* ---------------- Données ---------------- */
  let cards = [], events = [], days = 30;

  async function load() {
    $('#refresh').disabled = true;
    try {
      [cards, events] = await Promise.all([
        api('/rest/v1/cards?select=*&order=created_at.desc&limit=2000'),
        api('/rest/v1/events?select=id,created_at,type,card_id,visitor_id,page,referrer,user_agent,lang&order=created_at.desc&limit=10000'),
      ]);
      $('#updated').textContent = 'Mis à jour à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      render();
    } catch (ex) {
      if (ex.message !== 'auth') $('#updated').textContent = 'Erreur de chargement. Réessaie avec « Actualiser ».';
    } finally {
      $('#refresh').disabled = false;
    }
  }
  $('#refresh').addEventListener('click', load);

  document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
    days = Number(b.dataset.days);
    document.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    render();
  }));

  const since = () => (days ? Date.now() - days * 864e5 : 0);
  const inRange = r => new Date(r.created_at).getTime() >= since();

  function device(ua = '') {
    if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'Tablette';
    if (/Mobi|iPhone|Android/i.test(ua)) return 'Mobile';
    return 'Ordinateur';
  }
  function system(ua = '') {
    if (/iPhone|iPad/i.test(ua)) return 'iOS';
    if (/Android/i.test(ua)) return 'Android';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Mac OS X|Macintosh/i.test(ua)) return 'Mac';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'Autre';
  }
  function source(ref) {
    if (!ref) return 'Direct';
    try {
      const host = new URL(ref).hostname.replace(/^www\./, '');
      if (host === location.hostname) return 'Le site lui-même';
      if (/whatsapp/.test(host)) return 'WhatsApp';
      if (/facebook|fb\.|messenger/.test(host)) return 'Facebook / Messenger';
      if (/instagram/.test(host)) return 'Instagram';
      if (/google\./.test(host)) return 'Google';
      if (/snapchat/.test(host)) return 'Snapchat';
      if (/mail|outlook|gmail/.test(host)) return 'E-mail';
      return host;
    } catch { return 'Direct'; }
  }
  function ago(date) {
    const s = (new Date(date).getTime() - Date.now()) / 1000;
    const a = Math.abs(s);
    if (a < 60) return 'à l’instant';
    if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
    if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
    if (a < 86400 * 7) return rtf.format(Math.round(s / 86400), 'day');
    return fmtDate.format(new Date(date));
  }

  /* ---------------- Rendu ---------------- */
  function render() {
    const ev = events.filter(inRange);
    const cs = cards.filter(inRange);
    const visits = ev.filter(e => e.type === 'visit' || e.type === 'view');
    const visitors = new Set(visits.map(e => e.visitor_id).filter(Boolean));
    const openedCards = cs.filter(c => c.opens > 0).length;
    const opens = ev.filter(e => e.type === 'open').length;

    const kpi = (label, value, sub) => h('div', { class: 'kpi' },
      h('div', { class: 'label', text: label }),
      h('div', { class: 'value', text: value }),
      sub ? h('div', { class: 'sub', text: sub }) : null);
    $('#kpis').replaceChildren(
      kpi('Visiteurs uniques', nf.format(visitors.size), 'appareils différents'),
      kpi('Visites', nf.format(visits.length), 'pages ouvertes'),
      kpi('Cartes créées', nf.format(cs.length)),
      kpi('Cartes ouvertes', nf.format(openedCards), cs.length ? `sur ${nf.format(cs.length)} (${Math.round(openedCards / cs.length * 100)} %)` : '—'),
      kpi('Ouvertures', nf.format(opens), 'enveloppes ouvertes'),
    );

    renderChart(visits);

    // Répartition par visiteur unique
    const firstBy = new Map();
    for (const e of [...visits].reverse()) if (e.visitor_id && !firstBy.has(e.visitor_id)) firstBy.set(e.visitor_id, e);
    const uniq = [...firstBy.values()];
    renderRows('#devices', uniq.map(e => `${device(e.user_agent)} · ${system(e.user_agent)}`));
    renderRows('#sources', visits.map(e => source(e.referrer)));

    renderCards(cs);
    renderFeed(ev.slice(0, 60));
  }

  function renderRows(sel, labels) {
    const box = $(sel);
    if (!labels.length) { box.replaceChildren(h('p', { class: 'empty', text: 'Pas encore de données.' })); return; }
    const counts = new Map();
    labels.forEach(l => counts.set(l, (counts.get(l) || 0) + 1));
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = sorted[0][1];
    box.replaceChildren(...sorted.map(([label, n]) => {
      const meter = h('div', { class: 'meter' }, h('i'));
      meter.firstChild.style.width = (n / max * 100).toFixed(1) + '%';
      return h('div', { class: 'row-item' },
        h('span', { text: label }),
        h('span', { class: 'n', text: `${nf.format(n)} · ${Math.round(n / labels.length * 100)} %` }),
        meter);
    }));
  }

  function renderChart(visits) {
    const box = $('#chart');
    const n = days || Math.min(90, Math.max(7, Math.ceil((Date.now() - Math.min(Date.now(), ...visits.map(v => +new Date(v.created_at)))) / 864e5) + 1));
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (n - 1));
    const buckets = Array.from({ length: n }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return { d, v: 0 }; });
    for (const e of visits) {
      const t = new Date(e.created_at); t.setHours(0, 0, 0, 0);
      const i = Math.round((t - start) / 864e5);
      if (i >= 0 && i < n) buckets[i].v++;
    }
    if (!visits.length) { box.replaceChildren(h('p', { class: 'empty', text: 'Aucune visite sur cette période pour l’instant.' })); return; }

    const W = Math.max(320, box.clientWidth), H = 240, padL = 34, padB = 26, padT = 10;
    const max = Math.max(...buckets.map(b => b.v));
    const step = Math.max(1, Math.ceil(max / 4));
    const top = step * Math.ceil(max / step || 1);
    const cw = (W - padL) / n, bw = Math.max(2, Math.min(28, cw - 2));
    const y = v => padT + (H - padT - padB) * (1 - v / top);

    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Visites par jour' });
    const grid = svg('g', { class: 'grid' }), axis = svg('g', { class: 'axis' });
    for (let v = 0; v <= top; v += step) {
      grid.append(svg('line', { x1: padL, x2: W, y1: y(v), y2: y(v) }));
      const t = svg('text', { x: padL - 8, y: y(v) + 4, 'text-anchor': 'end' }); t.textContent = v; axis.append(t);
    }
    const every = Math.ceil(n / Math.max(2, Math.floor((W - padL) / 70)));
    buckets.forEach((b, i) => {
      if (i % every === 0 || i === n - 1) {
        const t = svg('text', { x: padL + cw * i + cw / 2, y: H - 6, 'text-anchor': 'middle' });
        t.textContent = fmtDay.format(b.d); axis.append(t);
      }
    });
    root.append(grid, axis);

    const tip = h('div', { class: 'tip', hidden: true });
    buckets.forEach((b, i) => {
      const x = padL + cw * i + (cw - bw) / 2, by = y(b.v), bh = H - padB - by;
      const hit = svg('rect', { class: 'hit', x: padL + cw * i, y: padT, width: cw, height: H - padT - padB });
      const r = Math.min(4, bw / 2, bh);
      const bar = svg('path', {
        class: 'bar',
        d: bh <= 0 ? '' : `M${x} ${H - padB} V${by + r} Q${x} ${by} ${x + r} ${by} H${x + bw - r} Q${x + bw} ${by} ${x + bw} ${by + r} V${H - padB} Z`,
      });
      hit.addEventListener('pointerenter', () => {
        tip.hidden = false;
        tip.replaceChildren(h('span', { text: fmtDayLong.format(b.d) + ' · ' }), h('b', { text: `${b.v} visite${b.v > 1 ? 's' : ''}` }));
        tip.style.left = (x + bw / 2) / W * 100 + '%';
        tip.style.top = (by / H * 240) + 'px';
      });
      hit.addEventListener('pointerleave', () => { tip.hidden = true; });
      root.append(hit, bar);
    });
    box.replaceChildren(root, tip);
  }

  function renderCards(cs) {
    const body = $('#cards');
    if (!cs.length) {
      body.replaceChildren(h('tr', {}, h('td', { colspan: 8, class: 'empty', text: 'Aucune carte créée sur cette période.' })));
      return;
    }
    body.replaceChildren(...cs.map(c => {
      const photo = c.photo_path ? `${base}/storage/v1/object/public/photos/${encodeURIComponent(c.photo_path)}` : null;
      const msg = h('div', { class: 'clamp', text: c.message, title: 'Afficher tout le message' });
      msg.addEventListener('click', () => msg.classList.toggle('full'));
      const del = h('button', { class: 'btn ghost sm danger', type: 'button', text: 'Supprimer' });
      let armed = null;
      del.addEventListener('click', async () => {
        if (!armed) {
          del.classList.add('armed'); del.textContent = 'Confirmer ?';
          armed = setTimeout(() => { armed = null; del.classList.remove('armed'); del.textContent = 'Supprimer'; }, 3500);
          return;
        }
        clearTimeout(armed);
        del.disabled = true; del.textContent = '…';
        try {
          if (c.photo_path) await api(`/storage/v1/object/photos/${encodeURIComponent(c.photo_path)}`, { method: 'DELETE' }).catch(() => {});
          await api(`/rest/v1/cards?id=eq.${encodeURIComponent(c.id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
          cards = cards.filter(x => x.id !== c.id);
          events = events.filter(x => x.card_id !== c.id);
          render();
        } catch {
          del.disabled = false; del.textContent = 'Erreur, réessayer'; armed = null; del.classList.remove('armed');
        }
      });
      return h('tr', {},
        h('td', { class: 'num', text: fmtDate.format(new Date(c.created_at)) }),
        h('td', { text: c.recipient || '—' }),
        h('td', { text: c.sender || '—' }),
        h('td', { class: 'msg' }, msg, h('div', { class: 'muted', text: `${THEME_LABEL[c.theme] || c.theme} · ${c.decor}` })),
        h('td', {}, photo ? h('a', { href: photo, target: '_blank', rel: 'noopener' }, h('img', { class: 'thumb', src: photo, alt: 'Photo', loading: 'lazy' })) : h('span', { class: 'muted', text: '—' })),
        h('td', {}, h('span', { class: 'pill' + (c.opens > 0 ? ' on' : ''), text: c.opens > 0 ? `${c.opens} fois` : 'pas encore' })),
        h('td', { class: 'muted', text: c.last_opened_at ? ago(c.last_opened_at) : '—' }),
        h('td', {}, h('div', { class: 'actions-cell' },
          h('a', { class: 'btn ghost sm', href: `./#k=${encodeURIComponent(c.id)}&notrack`, target: '_blank', rel: 'noopener', text: 'Voir' }),
          del)),
      );
    }));
  }

  function renderFeed(list) {
    const feed = $('#feed');
    if (!list.length) { feed.replaceChildren(h('li', { class: 'empty', text: 'Rien pour l’instant.' })); return; }
    const byId = new Map(cards.map(c => [c.id, c]));
    const ICON = { visit: '👀', view: '💌', open: '✉️', create: '🎁' };
    feed.replaceChildren(...list.map(e => {
      const c = e.card_id ? byId.get(e.card_id) : null;
      const who = c ? (c.recipient || 'quelqu’un') : '';
      const what = {
        visit: 'Visite de l’atelier',
        view: c ? `Carte pour ${who} affichée` : 'Carte affichée',
        open: c ? `${who} a ouvert sa carte` : 'Carte ouverte',
        create: c ? `Nouvelle carte pour ${who}${c.sender ? ' (de ' + c.sender + ')' : ''}` : 'Nouvelle carte',
      }[e.type] || e.type;
      const meta = e.type === 'create' ? '' : [device(e.user_agent), system(e.user_agent), source(e.referrer)].join(' · ');
      return h('li', {},
        h('span', { class: 'ico', text: ICON[e.type] || '•' }),
        h('div', { class: 'what' }, h('div', { text: what }), meta ? h('div', { class: 'meta', text: meta }) : null),
        h('span', { class: 'when', text: ago(e.created_at), title: fmtDate.format(new Date(e.created_at)) }));
    }));
  }

  let resizeT;
  addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (!$('#v-dash').hidden) render(); }, 200); });

  /* ---------------- Démarrage ---------------- */
  if (!enabled) show('v-config');
  else if (session) enter().catch(() => show('v-login'));
  else show('v-login');
})();
