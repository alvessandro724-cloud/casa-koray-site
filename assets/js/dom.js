// dom.js | F1. Utilitarios compartilhados: inview (IntersectionObserver unico por configuracao),
// foco (trap/restore), rolagem com deslocamento, leitura de <dialog> abertos, grupos com roving tabindex.
// Nenhum ouvinte de scroll; nenhuma leitura de layout em laco.
import { motion } from './motion.js';

/* ---------- inview ---------- */
const pool = new Map();

function poolFor(opts) {
  const rootMargin = opts.rootMargin || '0px';
  const threshold = opts.threshold === undefined ? 0 : opts.threshold;
  const key = `${rootMargin}|${[].concat(threshold).join(',')}`;
  let shared = pool.get(key);
  if (shared) return shared;
  shared = { subs: new Map(), io: null };
  shared.io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const list = shared.subs.get(entry.target);
      if (!list) continue;
      for (const sub of [...list]) {
        if (sub.once && !entry.isIntersecting) continue;
        try { sub.cb(entry); } catch (err) { console.error('[koray] inview', err); }
        if (sub.once) sub.stop();
      }
    }
  }, { rootMargin, threshold });
  pool.set(key, shared);
  return shared;
}

// inview(el, cb, { rootMargin, threshold, once }) -> stop(). cb(entry) recebe o IntersectionObserverEntry
// (a primeira chamada ja traz o estado atual). Com once:true, so dispara na primeira entrada visivel.
export function inview(el, cb, opts = {}) {
  if (!el) return () => {};
  if (!('IntersectionObserver' in window)) {
    const t = setTimeout(() => cb({ isIntersecting: true, intersectionRatio: 1, target: el }), 0);
    return () => clearTimeout(t);
  }
  const shared = poolFor(opts);
  let list = shared.subs.get(el);
  if (!list) { list = new Set(); shared.subs.set(el, list); shared.io.observe(el); }
  const sub = {
    cb,
    once: !!opts.once,
    stop() {
      list.delete(sub);
      if (!list.size && shared.subs.get(el) === list) { shared.subs.delete(el); shared.io.unobserve(el); }
    },
  };
  list.add(sub);
  return sub.stop;
}

/* ---------- foco ---------- */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

export function focusables(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    (el) => !el.closest('[hidden],[inert]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
  );
}

export function restoreFocus(el) {
  if (el && el.isConnected && typeof el.focus === 'function') el.focus({ preventScroll: true });
}

// trapFocus(root, { initial, restore = true, onEscape }) -> { release() }
// <dialog> modal ja prende o foco sozinho: use isto em paineis que nao sao dialog (menu, HUD, folhas).
export function trapFocus(root, opts = {}) {
  const opener = document.activeElement;
  const ownTabindex = !root.hasAttribute('tabindex');
  if (ownTabindex) root.setAttribute('tabindex', '-1');
  const onKey = (ev) => {
    if (ev.key === 'Escape' && opts.onEscape) { ev.stopPropagation(); opts.onEscape(ev); return; }
    if (ev.key !== 'Tab') return;
    const items = focusables(root);
    if (!items.length) { ev.preventDefault(); root.focus({ preventScroll: true }); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (ev.shiftKey && (active === first || !root.contains(active))) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && (active === last || !root.contains(active))) { ev.preventDefault(); first.focus(); }
  };
  root.addEventListener('keydown', onKey);
  (opts.initial || focusables(root)[0] || root).focus({ preventScroll: true });
  return {
    release() {
      root.removeEventListener('keydown', onKey);
      if (ownTabindex) root.removeAttribute('tabindex');
      if (opts.restore !== false) restoreFocus(opener);
    },
  };
}

/* ---------- rolagem ---------- */
const smoothBehavior = () => (motion() === 'none' ? 'auto' : 'smooth');

export function scrollToY(top, behavior) {
  window.scrollTo({ top: Math.max(0, top), behavior: behavior || smoothBehavior() });
}

// scrollToEl(el|seletor, { offset, behavior, focus }). Sem offset numerico usa scrollIntoView, que honra
// scroll-margin-top das secoes e scroll-padding do html (nav fixa nao cobre o titulo). focus:true move o foco
// para o alvo (so para quem navega por teclado; no toque nao se foca para nao abrir o teclado virtual).
export function scrollToEl(target, opts = {}) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return false;
  const behavior = opts.behavior || smoothBehavior();
  if (typeof opts.offset === 'number') {
    scrollToY(el.getBoundingClientRect().top + window.scrollY - opts.offset, behavior);
  } else {
    el.scrollIntoView({ behavior, block: 'start' });
  }
  if (opts.focus) {
    if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(el.tagName)) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  }
  return true;
}

/* ---------- dialogs ---------- */
export function dialogsOpen() {
  return Array.from(document.querySelectorAll('dialog[open]'));
}

function syncDialogs() {
  document.documentElement.toggleAttribute('data-dialog-open', dialogsOpen().length > 0);
}

let watching = false;
// Mantem html[data-dialog-open] enquanto houver <dialog> aberto (FAB e barra mobile usam para se esconder).
export function watchDialogs() {
  if (watching) return;
  watching = true;
  const proto = window.HTMLDialogElement && window.HTMLDialogElement.prototype;
  if (proto) {
    ['showModal', 'show', 'close', 'requestClose'].forEach((name) => {
      const original = proto[name];
      if (typeof original !== 'function') return;
      proto[name] = function patched(...args) {
        const result = original.apply(this, args);
        syncDialogs();
        return result;
      };
    });
  }
  document.addEventListener('close', syncDialogs, true);
  document.addEventListener('cancel', syncDialogs, true);
  new MutationObserver(syncDialogs).observe(document.documentElement, { attributes: true, attributeFilter: ['open'], subtree: true });
  syncDialogs();
}

/* ---------- roving tabindex ---------- */
// <div role="radiogroup" data-roving> com filhos [role="radio"] (ou [data-roving-item]): uma parada de Tab,
// setas/Home/End movem e selecionam (click), conforme o padrao WAI-ARIA para radio.
export function roving(group, selector = '[role="radio"],[data-roving-item]') {
  const items = () => Array.from(group.querySelectorAll(selector)).filter((el) => !el.disabled);
  const isOn = (el) => ['aria-checked', 'aria-pressed', 'aria-current'].some((a) => el.getAttribute(a) === 'true');
  const sync = () => {
    const list = items();
    const current = list.find(isOn) || list[0];
    list.forEach((el) => { el.tabIndex = el === current ? 0 : -1; });
  };
  group.addEventListener('keydown', (ev) => {
    const list = items();
    const i = list.indexOf(document.activeElement);
    if (i < 0) return;
    let next = null;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = list[(i + 1) % list.length];
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') next = list[(i - 1 + list.length) % list.length];
    else if (ev.key === 'Home') next = list[0];
    else if (ev.key === 'End') next = list[list.length - 1];
    else return;
    ev.preventDefault();
    next.focus();
    next.click();
  });
  const mo = new MutationObserver(sync);
  mo.observe(group, { subtree: true, attributes: true, attributeFilter: ['aria-checked', 'aria-pressed', 'aria-current', 'disabled'] });
  sync();
  return { sync, destroy: () => mo.disconnect() };
}

export function initRoving(root = document) {
  root.querySelectorAll('[data-roving]').forEach((group) => {
    if (group.__roving) return;
    group.__roving = roving(group);
  });
}

/* ---------- pequenos ---------- */
export function onIdle(fn, timeout = 1500) {
  if ('requestIdleCallback' in window) return window.requestIdleCallback(fn, { timeout });
  return setTimeout(fn, 120);
}

export function debounce(fn, ms = 150) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
