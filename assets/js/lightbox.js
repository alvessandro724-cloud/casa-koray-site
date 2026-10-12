// lightbox.js | D (midia). Galeria (#galeria): filtro por categoria e vista filtrada; Lightbox: <dialog id="lightbox"> modal
// com showModal(), setas, teclado, miniaturas, deslizar/pinca/toque duplo (sempre com botao equivalente), View Transitions
// (elemento compartilhado miniatura <-> foto grande, com fade de 240 ms como fallback) e historico (#foto-IMG_xxxx).
//
// Um unico controlador atende os dois elementos que declaram data-module="lightbox": a secao #galeria e o <dialog>.
// O <dialog> fechado e display:none, entao o IntersectionObserver do main.js nunca o "ve": quem o liga e a secao #galeria
// (ou load('lightbox') quando chega lightbox:open / #foto-IMG_xxxx). O controlador liga os dois onde quer que o init comece.
//
// Contrato: bus "lightbox:open" {id, list?, trigger?}; URL #foto-<id> (pushState ao abrir, replaceState ao navegar, Voltar fecha);
// filtro em ?g=<categoria> (replaceState), compartilhado entre a galeria e o lightbox.

// Ordem da narrativa "um dia inteiro": chegada, areas externas, salas, mesa, cinema, suites e, por fim, a noite.
const ORDER = [
  'IMG_7430', 'IMG_7441', 'IMG_7431', 'IMG_7429', 'IMG_7436', 'IMG_7438', 'IMG_7450', 'IMG_7452', 'IMG_7443', 'IMG_7444',
  'IMG_7445', 'IMG_7464', 'IMG_7465', 'IMG_7459', 'IMG_7460', 'IMG_7457', 'IMG_7463', 'IMG_7456', 'IMG_7458', 'IMG_7461',
  'IMG_7462', 'IMG_7424', 'IMG_7469', 'IMG_7466', 'IMG_7470', 'IMG_7467', 'IMG_7471', 'IMG_7447', 'IMG_7448', 'IMG_7440',
];
// Categorias do brief 11.4 (somam 30). O campo "cat" de photos.json difere em 7445; vale o brief.
const CATS = {
  externas: ['IMG_7429', 'IMG_7431', 'IMG_7436', 'IMG_7438', 'IMG_7441', 'IMG_7443', 'IMG_7444', 'IMG_7450', 'IMG_7452'],
  noite: ['IMG_7430', 'IMG_7440', 'IMG_7447', 'IMG_7448'],
  salas: ['IMG_7424', 'IMG_7445', 'IMG_7456', 'IMG_7457', 'IMG_7458', 'IMG_7459', 'IMG_7460', 'IMG_7461', 'IMG_7462', 'IMG_7463', 'IMG_7464', 'IMG_7465'],
  suites: ['IMG_7466', 'IMG_7467', 'IMG_7469', 'IMG_7470', 'IMG_7471'],
};
const FILTERS = ['todas', 'externas', 'noite', 'salas', 'suites'];
// Legendas que o brief reescreveu (13.2) e que photos.json ainda traz na versao antiga (palavra proibida em EN).
const CAPTION_FIX = { IMG_7462: { pt: 'Gourmet e sala integrados', en: 'Gourmet and living areas side by side' } };
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 1.5;
const TAP_MS = 350;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
// Em listas de chips que rolam (mobile), traz o chip ativo para a area visivel sem mexer na pagina.
function revealChip(row, chip, behavior) {
  if (!row || !chip || row.scrollWidth <= row.clientWidth + 1) return;
  row.scrollTo({ left: Math.max(0, chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2), behavior });
}
const fill = (text, vars) => String(text).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : ''));

let appPromise = null;

export default async function init(root, ctx) {
  if (!appPromise) appPromise = ctx.photos().then((db) => createApp(ctx, db));
  const app = await appPromise;
  if (root instanceof HTMLDialogElement) app.attachDialog(root);
  else app.attachGallery(root);
  const dialog = document.getElementById('lightbox');
  if (dialog) app.attachDialog(dialog);
  return { destroy() { /* o controlador vive com a pagina (ouvintes unicos de bus e state) */ } };
}

function createApp(ctx, db) {
  const byId = db.byId;
  const known = ORDER.filter((id) => byId[id]);
  const all = known.concat(db.list.map((p) => p.id).filter((id) => !known.includes(id)));
  const catIds = (g) => (g === 'todas' ? all : all.filter((id) => (CATS[g] || []).includes(id)));
  const validFilter = (g) => (FILTERS.includes(g) ? g : 'todas');
  const t = (key, pt) => ctx.t(key, pt);
  const caption = (p) => ctx.pick(CAPTION_FIX[p.id] || p.caption);
  const motionOn = () => ctx.motion() !== 'none';

  let filter = validFilter(ctx.state.get('g'));

  /* ====================================================================
     Galeria (#galeria): chips de categoria + vista filtrada
     ==================================================================== */
  const gal = { section: null, body: null, mosaic: null, flow: null, empty: null, chips: [] };

  function tileLabel(p) { return `${t('galeria.enlarge', 'Ampliar foto')}: ${caption(p)}`; }

  function flowTile(id) {
    const p = byId[id];
    const sizes = '(min-width:1024px) 30vw, (min-width:768px) 45vw, 100vw';
    return `<button type="button" class="galeria__tile galeria__tile--flow" data-lightbox="${id}" data-reveal="img" aria-label="${esc(tileLabel(p))}" style="--r:${(p.w / p.h).toFixed(4)}">${ctx.picture(p, { sizes })}</button>`;
  }

  function renderGallery() {
    if (!gal.section) return;
    const ids = catIds(filter);
    gal.chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.g === filter)));
    revealChip(gal.chips[0] && gal.chips[0].parentElement, gal.chips.find((c) => c.dataset.g === filter), motionOn() ? 'smooth' : 'auto');
    const first = ids[0] || all[0];
    gal.section.querySelectorAll('[data-gallery-all]').forEach((b) => { b.dataset.lightbox = first; });
    if (filter === 'todas') {
      gal.body.dataset.view = 'mosaic';
      gal.mosaic.hidden = false;
      gal.flow.hidden = true;
      if (gal.empty) gal.empty.hidden = true;
      gal.flow.replaceChildren();
      return;
    }
    gal.body.dataset.view = 'flow';
    gal.mosaic.hidden = true;
    if (!ids.length) {
      gal.flow.hidden = true;
      gal.flow.replaceChildren();
      if (gal.empty) gal.empty.hidden = false;
      return;
    }
    if (gal.empty) gal.empty.hidden = true;
    gal.flow.innerHTML = ids.map(flowTile).join('');
    gal.flow.hidden = false;
    ctx.reveal.scan(gal.flow);
  }

  function attachGallery(section) {
    if (section.__lbGallery) return;
    section.__lbGallery = true;
    gal.section = section;
    gal.body = section.querySelector('.galeria__body');
    gal.mosaic = section.querySelector('.galeria__mosaic');
    gal.flow = section.querySelector('.galeria__flow');
    gal.empty = section.querySelector('.galeria__empty');
    gal.chips = Array.from(section.querySelectorAll('.galeria__filters [data-g]'));
    if (!gal.body || !gal.mosaic || !gal.flow) return;
    gal.flow.setAttribute('data-reveal-group', '');
    section.addEventListener('click', (ev) => {
      const el = ev.target instanceof Element ? ev.target.closest('[data-g]') : null;
      if (el) setFilter(el.dataset.g);
    });
    renderGallery();
  }

  /* ====================================================================
     Filtro compartilhado (galeria e lightbox)
     ==================================================================== */
  function setFilter(g, opts = {}) {
    g = validFilter(g);
    if (!opts.fromUrl) ctx.state.set('g', g === 'todas' ? null : g);
    if (g === filter && !opts.force) return;
    filter = g;
    renderGallery();
    syncLbFilter();
  }

  /* ====================================================================
     Lightbox
     ==================================================================== */
  const lb = {
    dialog: null, view: null, zoom: null, ph: null, pic: null, caption: null, counter: null, live: null, thumbs: null,
    prev: null, next: null, chips: [], tools: [],
    thumbList: null, id: null, list: [], custom: null, trigger: null, openedId: null, closing: false, opening: false, justClosed: false,
  };
  const z = { s: 1, x: 0, y: 0 };
  const warm = new Map();                                // pre-carregamento: id -> Image

  const listNow = () => lb.custom || catIds(filter);

  function syncLbFilter() {
    if (!lb.dialog) return;
    lb.chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.g === filter)));
    revealChip(lb.chips[0] && lb.chips[0].parentElement, lb.chips.find((c) => c.dataset.g === filter), 'auto');
    if (!lb.custom) lb.list = catIds(filter);
    const set = new Set(lb.list);
    lb.dialog.querySelectorAll('.lightbox__thumb-list li').forEach((li) => { li.hidden = !set.has(li.firstElementChild.dataset.id); });
    if (lb.dialog.open && lb.id) {
      if (!set.has(lb.id) && lb.list.length) show(lb.list[0]);
      else refreshChrome();
    }
  }

  function srcsetFor(p) {
    return p.widths.map((w) => `${ctx.url(`assets/img/opt/${p.id}-${w}.webp`)} ${w}w`).join(', ');
  }
  function prefetch(id) {
    const p = byId[id];
    if (!p || warm.has(id)) return;
    const im = new Image();
    im.decoding = 'async';
    im.sizes = '100vw';
    im.srcset = srcsetFor(p);
    im.src = ctx.url(`assets/img/${id}.jpg`);
    warm.set(id, im);
    im.decode().catch(() => {});
    if (warm.size > 8) warm.delete(warm.keys().next().value);
  }

  async function decodeImg(img) {
    for (let n = 0; n < 3; n += 1) {
      try { await img.decode(); return true; } catch {
        await new Promise((r) => setTimeout(r, 250));                 // o img.js refaz a selecao se o WebP faltar
        if (img.complete && img.naturalWidth) return true;
      }
    }
    return false;
  }

  /* ---------- zoom e gestos ---------- */
  function applyZoom(animate) {
    const el = lb.zoom;
    el.style.transition = animate ? 'transform var(--dur-base) var(--ease-out)' : 'none';
    el.style.transform = z.s === 1 && !z.x && !z.y ? '' : `translate(${z.x}px, ${z.y}px) scale(${z.s})`;
    lb.view.dataset.zoomed = z.s > 1 ? 'true' : 'false';
    lb.tools.forEach((b) => {
      const out = b.dataset.lb === 'zoom-out';
      b.setAttribute('aria-disabled', String(out ? z.s <= 1 : z.s >= MAX_ZOOM));
    });
  }
  function clampPan() {
    const limX = Math.max(0, (lb.zoom.offsetWidth * z.s - lb.view.clientWidth) / 2);
    const limY = Math.max(0, (lb.zoom.offsetHeight * z.s - lb.view.clientHeight) / 2);
    z.x = clamp(z.x, -limX, limX);
    z.y = clamp(z.y, -limY, limY);
  }
  function zoomTo(next, px, py, animate = true) {
    next = clamp(next, 1, MAX_ZOOM);
    if (next < 1.05) next = 1;
    const r = lb.view.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const fx = (px === undefined ? cx : px) - cx;
    const fy = (py === undefined ? cy : py) - cy;
    const ratio = next / z.s;
    z.x = fx - (fx - z.x) * ratio;
    z.y = fy - (fy - z.y) * ratio;
    z.s = next;
    if (z.s === 1) { z.x = 0; z.y = 0; } else clampPan();
    applyZoom(animate);
  }
  function resetZoom() { z.s = 1; z.x = 0; z.y = 0; if (lb.zoom) applyZoom(false); }

  const ptrs = new Map();
  let gesture = null;
  let lastTap = null;
  let suppressClick = false;

  function bindGestures() {
    const view = lb.view;
    view.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      try { view.setPointerCapture(e.pointerId); } catch { /* ponteiro ja solto */ }
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      view.classList.add('is-dragging');
      suppressClick = false;
      if (ptrs.size === 2) {
        const [a, b] = Array.from(ptrs.values());
        gesture = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: z.s };
      } else if (ptrs.size === 1) {
        gesture = { type: z.s > 1 ? 'pan' : 'swipe', x0: e.clientX, y0: e.clientY, zx: z.x, zy: z.y, t0: e.timeStamp, moved: 0 };
      }
    });
    view.addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId);
      if (!p || !gesture) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (gesture.type === 'pinch' && ptrs.size >= 2) {
        const [a, b] = Array.from(ptrs.values());
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        zoomTo(gesture.s0 * (d / gesture.d), (a.x + b.x) / 2, (a.y + b.y) / 2, false);
        suppressClick = true;
        return;
      }
      const dx = e.clientX - gesture.x0;
      const dy = e.clientY - gesture.y0;
      gesture.moved = Math.max(gesture.moved, Math.hypot(dx, dy));
      if (gesture.moved > 8) suppressClick = true;
      if (gesture.type === 'pan') {
        z.x = gesture.zx + dx;
        z.y = gesture.zy + dy;
        clampPan();
        applyZoom(false);
      } else if (gesture.type === 'swipe' && Math.abs(dx) > Math.abs(dy)) {
        lb.zoom.style.transition = 'none';
        lb.zoom.style.transform = `translateX(${dx * 0.5}px)`;
      }
    });
    const end = (e) => {
      const g = gesture;
      ptrs.delete(e.pointerId);
      if (ptrs.size > 0) {                                    // sobrou um dedo depois da pinca: segue como arrasto, sem contar como toque
        const [p] = Array.from(ptrs.values());
        gesture = { type: z.s > 1 ? 'pan' : 'none', x0: p.x, y0: p.y, zx: z.x, zy: z.y, t0: e.timeStamp, moved: 99 };
        return;
      }
      view.classList.remove('is-dragging');
      gesture = null;
      if (!g) return;
      if (e.type === 'pointercancel') { applyZoom(true); return; }
      if (g.type === 'swipe') {
        const dx = e.clientX - g.x0;
        const dy = e.clientY - g.y0;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.2) { applyZoom(false); go(dx < 0 ? 1 : -1); return; }
        applyZoom(true);
      }
      if (g.moved < 8 && e.timeStamp - g.t0 < TAP_MS) {
        if (lastTap && e.timeStamp - lastTap.t < TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
          lastTap = null;
          if (z.s > 1) zoomTo(1, e.clientX, e.clientY); else zoomTo(MAX_ZOOM, e.clientX, e.clientY);   // toque duplo: ate 2,5x
        } else {
          lastTap = { t: e.timeStamp, x: e.clientX, y: e.clientY };
        }
      }
    };
    view.addEventListener('pointerup', end);
    view.addEventListener('pointercancel', end);
    // Toque ou clique no escuro, fora da foto, fecha (so sem arrasto e sem zoom). Durante o gesto os filhos ficam
    // inertes, entao o alvo do clique e sempre a area: a posicao decide se foi fora da foto.
    view.addEventListener('click', (e) => {
      if (suppressClick) { suppressClick = false; return; }
      if (z.s !== 1) return;
      const r = lb.zoom.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) closeLb();
    });
  }

  /* ---------- mostrar uma foto ---------- */
  function refreshChrome() {
    const total = lb.list.length;
    const n = Math.max(0, lb.list.indexOf(lb.id));
    const p = byId[lb.id];
    if (!p) return;
    const vars = { n: String(n + 1), total: String(total) };
    lb.counter.textContent = fill(t('lightbox.counter', '{n} de {total}'), vars);
    lb.live.textContent = `${fill(t('lightbox.announce', 'Foto {n} de {total}'), vars)}: ${caption(p)}`;
    lb.caption.textContent = caption(p);
    // Uma unica parada de Tab na tira (a miniatura atual); as setas trocam a foto e o foco acompanha a miniatura nova.
    const thumbFocused = lb.thumbs.contains(document.activeElement);
    lb.thumbs.querySelectorAll('.lightbox__thumb').forEach((b) => {
      const on = b.dataset.id === lb.id;
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      b.tabIndex = on ? 0 : -1;
    });
    const cur = lb.thumbs.querySelector(`.lightbox__thumb[data-id="${lb.id}"]`);
    if (cur && thumbFocused && document.activeElement !== cur) cur.focus({ preventScroll: true });
    if (cur && lb.thumbs.scrollWidth > lb.thumbs.clientWidth) {
      const li = cur.parentElement;
      lb.thumbs.scrollTo({ left: li.offsetLeft - (lb.thumbs.clientWidth - li.offsetWidth) / 2, behavior: motionOn() ? 'smooth' : 'auto' });
    }
    lb.prev.setAttribute('aria-disabled', total < 2 ? 'true' : 'false');
    lb.next.setAttribute('aria-disabled', total < 2 ? 'true' : 'false');
  }

  function show(id) {
    const p = byId[id];
    if (!p) return;
    if (!lb.list.includes(id)) lb.list = catIds('todas');
    lb.id = id;
    resetZoom();
    const zoom = lb.zoom;
    zoom.style.setProperty('--ratio', `${p.w} / ${p.h}`);
    zoom.style.setProperty('--rn', (p.w / p.h).toFixed(5));
    zoom.style.setProperty('--nw', String(p.w));
    zoom.style.backgroundColor = p.dominant;
    lb.ph.hidden = false;
    lb.ph.onerror = () => { lb.ph.onerror = null; lb.ph.src = ctx.url(`assets/img/${id}-sm.jpg`); };
    lb.ph.src = ctx.url(`assets/img/opt/${id}-${p.widths[0]}.webp`);            // miniatura desfocada, troca pela cheia ao decodificar
    lb.pic.classList.remove('is-ready');
    lb.pic.innerHTML = ctx.picture(p, { sizes: '100vw', class: 'pic--static lightbox__picture', imgClass: 'lightbox__img', loading: 'eager', alt: ctx.pick(p.alt), noI18n: true });
    const img = lb.pic.querySelector('img');
    if (img) decodeImg(img).then(() => { if (lb.id === id) lb.pic.classList.add('is-ready'); });
    refreshChrome();
    if (lb.dialog.open && !lb.opening) ctx.state.set('foto', id);   // replaceState: o Voltar fecha de uma vez
    const i = lb.list.indexOf(id);
    prefetch(lb.list[(i + 1) % lb.list.length]);
    prefetch(lb.list[(i - 1 + lb.list.length) % lb.list.length]);
  }

  function go(delta) {
    const n = lb.list.length;
    if (n < 2) return;
    const i = lb.list.indexOf(lb.id);
    show(lb.list[(i + delta + n) % n]);
  }
  function goIndex(i) {
    if (!lb.list.length) return;
    show(lb.list[clamp(i, 0, lb.list.length - 1)]);
  }

  /* ---------- View Transitions: foto compartilhada entre miniatura e lightbox ---------- */
  const canVT = () => typeof document.startViewTransition === 'function' && motionOn();
  const visibleEnough = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
  };
  const tilePicFor = (id) => {
    const tile = document.querySelector(`#galeria [data-lightbox="${id}"]:not([data-gallery-all])`);
    return tile && tile.querySelector('.pic');
  };

  function transition(fromEl, run) {
    if (!canVT() || !visibleEnough(fromEl)) { run(); return; }
    lb.dialog.dataset.vt = '1';
    fromEl.style.viewTransitionName = 'lb-photo';
    let vt;
    try {
      vt = document.startViewTransition(() => {
        fromEl.style.viewTransitionName = '';
        run();
      });
    } catch {
      fromEl.style.viewTransitionName = '';
      delete lb.dialog.dataset.vt;
      run();
      return;
    }
    const cleanup = () => { delete lb.dialog.dataset.vt; fromEl.style.viewTransitionName = ''; lb.zoom.style.viewTransitionName = ''; };
    vt.finished.then(cleanup, cleanup);
  }

  /* ---------- abrir e fechar ---------- */
  function openLb(id, o = {}) {
    if (!lb.dialog || !byId[id]) return;
    lb.custom = Array.isArray(o.list) && o.list.length ? o.list.filter((x) => byId[x]) : null;
    if (lb.custom && !lb.custom.includes(id)) lb.custom = null;
    if (!lb.custom && !catIds(filter).includes(id)) setFilter('todas');   // a foto nao pertence ao filtro atual
    lb.list = listNow();
    if (lb.dialog.open) { show(id); return; }
    lb.trigger = o.trigger instanceof Element ? o.trigger : document.activeElement;
    lb.openedId = id;
    lb.closing = false;
    const fromEl = o.trigger instanceof Element ? o.trigger.querySelector('.pic') : null;
    lb.opening = true;
    transition(fromEl, () => {
      try {
        show(id);
        if (!lb.dialog.open) lb.dialog.showModal();
        lb.zoom.style.viewTransitionName = lb.dialog.dataset.vt ? 'lb-photo' : '';
      } finally {
        lb.opening = false;
      }
    });
    if (!o.fromUrl) ctx.state.set('foto', id, { push: true });
  }

  function closeLb() {
    if (!lb.dialog || !lb.dialog.open || lb.closing) return;
    lb.closing = true;
    const target = tilePicFor(lb.id);
    if (!canVT() || !visibleEnough(target)) { lb.dialog.close(); return; }
    lb.dialog.dataset.vt = '1';
    lb.zoom.style.viewTransitionName = 'lb-photo';
    let vt;
    try {
      vt = document.startViewTransition(() => {
        lb.zoom.style.viewTransitionName = '';
        lb.dialog.close();
        target.style.viewTransitionName = 'lb-photo';
      });
    } catch {
      lb.zoom.style.viewTransitionName = '';
      delete lb.dialog.dataset.vt;
      lb.dialog.close();
      return;
    }
    const cleanup = () => { delete lb.dialog.dataset.vt; target.style.viewTransitionName = ''; lb.zoom.style.viewTransitionName = ''; };
    vt.finished.then(cleanup, cleanup);
  }

  function onClosed() {
    lb.closing = false;
    lb.justClosed = true;
    setTimeout(() => { lb.justClosed = false; }, 600);
    ptrs.clear();
    lb.view.classList.remove('is-dragging');
    resetZoom();
    if (ctx.state.get('foto') !== null) ctx.state.clear('foto');
    // Foco volta a tile de origem; se a pessoa navegou para outra foto, a tile dessa foto (quando existe na pagina)
    const pic = tilePicFor(lb.id);
    const back = pic ? pic.closest('button') : null;
    const same = lb.trigger && lb.trigger.isConnected && lb.openedId === lb.id;
    const tile = same ? lb.trigger : (back || lb.trigger);
    if (tile && tile.isConnected && typeof tile.focus === 'function') tile.focus({ preventScroll: true });
    lb.trigger = null;
  }

  /* ---------- ligar o <dialog> ---------- */
  function buildThumbs() {
    lb.thumbList.innerHTML = all.map((id) => {
      const p = byId[id];
      return `<li><button type="button" class="lightbox__thumb" data-id="${id}" tabindex="-1" aria-label="${esc(caption(p))}">${ctx.picture(p, { sizes: '64px', widths: [p.widths[0]], class: 'pic--static', loading: 'lazy', alt: '', noI18n: true })}</button></li>`;
    }).join('');
  }

  function attachDialog(dialog) {
    if (dialog.__lb) return;
    dialog.__lb = true;
    const q = (s) => dialog.querySelector(s);
    lb.dialog = dialog;
    lb.view = q('[data-lb-view]');
    lb.zoom = q('[data-lb-zoom]');
    lb.ph = q('.lightbox__ph');
    lb.pic = q('[data-lb-pic]');
    lb.caption = q('[data-lb-caption]');
    lb.counter = q('[data-lb-counter]');
    lb.live = q('[data-lb-live]');
    lb.thumbs = q('.lightbox__thumbs');
    lb.thumbList = q('[data-lb-thumbs]');
    lb.prev = q('[data-lb="prev"]');
    lb.next = q('[data-lb="next"]');
    lb.chips = Array.from(dialog.querySelectorAll('.lightbox__filters [data-g]'));
    lb.tools = Array.from(dialog.querySelectorAll('[data-lb="zoom-in"], [data-lb="zoom-out"]'));
    lb.list = catIds(filter);
    buildThumbs();
    syncLbFilter();
    bindGestures();

    dialog.addEventListener('click', (e) => {
      const el = e.target instanceof Element ? e.target.closest('[data-lb], [data-g], .lightbox__thumb') : null;
      if (!el) return;
      if (el.dataset.g) { setFilter(el.dataset.g); return; }
      if (el.classList.contains('lightbox__thumb')) { show(el.dataset.id); return; }
      switch (el.dataset.lb) {
        case 'close': closeLb(); break;
        case 'prev': go(-1); break;
        case 'next': go(1); break;
        case 'zoom-in': zoomTo(z.s * ZOOM_STEP); break;
        case 'zoom-out': zoomTo(z.s / ZOOM_STEP); break;
        default: break;
      }
    });
    dialog.addEventListener('keydown', (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      switch (e.key) {
        case 'ArrowLeft': go(-1); break;
        case 'ArrowRight': go(1); break;
        case 'Home': goIndex(0); break;
        case 'End': goIndex(lb.list.length - 1); break;
        case '+': case '=': zoomTo(z.s * ZOOM_STEP); break;
        case '-': case '_': zoomTo(z.s / ZOOM_STEP); break;
        case '0': zoomTo(1); break;
        default: return;
      }
      e.preventDefault();
    });
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); closeLb(); });     // Esc passa pelo mesmo caminho do botao Fechar
    dialog.addEventListener('close', onClosed);

    // Link profundo: #foto-IMG_xxxx abre ao carregar (main.js ja carregou este modulo)
    const wanted = ctx.state.get('foto');
    if (wanted && byId[wanted]) openLb(wanted, { fromUrl: true });
    else if (wanted) ctx.state.clear('foto');
  }

  /* ---------- ouvintes unicos ---------- */
  ctx.bus.on('lightbox:open', (d) => { if (d && d.id) openLb(d.id, { list: d.list, trigger: d.trigger }); });
  ctx.state.on('foto', (value, info) => {
    if (info.source === 'set' || !lb.dialog) return;
    if (value && byId[value]) { if (lb.dialog.open) show(value); else openLb(value, { fromUrl: true }); }
    else if (lb.dialog.open) closeLb();
  });
  ctx.state.on('g', (value, info) => {
    if (info.source === 'set') return;
    // Fechar o lightbox volta uma entrada do historico e leva ?g= junto: o filtro escolhido la dentro continua valendo.
    if (info.source === 'pop' && lb.dialog && (lb.dialog.open || lb.justClosed)) {
      ctx.state.set('g', filter === 'todas' ? null : filter);
      return;
    }
    setFilter(validFilter(value), { fromUrl: true });
  });
  ctx.onLang(() => {
    if (gal.flow) gal.flow.querySelectorAll('[data-lightbox]').forEach((b) => { b.setAttribute('aria-label', tileLabel(byId[b.dataset.lightbox])); });
    if (lb.dialog) {
      lb.thumbs.querySelectorAll('.lightbox__thumb').forEach((b) => b.setAttribute('aria-label', caption(byId[b.dataset.id])));
      if (lb.id) {
        const img = lb.pic.querySelector('img');
        if (img) img.alt = ctx.pick(byId[lb.id].alt);
        refreshChrome();
      }
    }
  });

  return { attachGallery, attachDialog };
}


