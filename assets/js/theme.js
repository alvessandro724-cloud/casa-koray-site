// theme.js | F1. Tema: preferencia (auto | day | night) e tema resolvido (day | night) no <html>.
//   html[data-theme-pref]  escolha do usuario (o <head> ja escreve antes da primeira pintura)
//   html[data-theme]       resolvido; com "auto" acompanha prefers-color-scheme ao vivo
// Controles: qualquer [data-theme-set="auto|day|night"] (aria-pressed, ou aria-checked se role="radio").
// <meta name="theme-color"> acompanha o fundo; capitulos noturnos podem pedi-lo via setChapter().
const root = document.documentElement;
const KEY = 'koray-theme';
const PREFS = ['auto', 'day', 'night'];
const CHROME = { day: '#F6F7F2', night: '#0F1B35' };   // = --pedra-50 e --mare-900
const listeners = new Set();
const dark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false };
let chapterNight = false;

const resolve = (pref) => (pref === 'auto' ? (dark.matches ? 'night' : 'day') : pref);

export function getPref() {
  const p = root.dataset.themePref;
  return PREFS.includes(p) ? p : 'day';
}

export function getTheme() {
  return root.dataset.theme === 'night' ? 'night' : 'day';
}

export function onTheme(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function syncControls() {
  const pref = getPref();
  document.querySelectorAll('[data-theme-set]').forEach((el) => {
    const on = String(el.dataset.themeSet) === pref;
    el.setAttribute(el.getAttribute('role') === 'radio' ? 'aria-checked' : 'aria-pressed', String(on));
  });
}

// Uma unica meta theme-color, sem media: o JS passa a ser dono dela (a escolha do usuario nao segue o sistema).
function syncChrome() {
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  if (!metas.length) return;
  const night = getTheme() === 'night' || (chapterNight && getPref() !== 'day');
  const [keep, ...extra] = metas;
  keep.removeAttribute('media');
  keep.setAttribute('content', night ? CHROME.night : CHROME.day);
  extra.forEach((m) => m.remove());
}

function notify() {
  syncControls();
  syncChrome();
  listeners.forEach((cb) => {
    try { cb(getPref(), getTheme()); } catch (err) { console.error('[koray] onTheme', err); }
  });
}

export function setPref(pref, { persist = true } = {}) {
  if (!PREFS.includes(pref)) return false;
  root.dataset.themePref = pref;
  root.dataset.theme = resolve(pref);
  if (persist) {
    try { localStorage.setItem(KEY, pref); } catch { /* modo privado ou bloqueado */ }
  }
  notify();
  return true;
}

// Capitulo noturno na tela (palco "Do dia a noite", secoes finais): so a barra do navegador muda.
// Tema forcado em Dia desliga os capitulos noturnos.
export function setChapter(isNight) {
  chapterNight = !!isNight;
  syncChrome();
}

export function initTheme() {
  let pref = getPref();
  if (!root.dataset.themePref) {
    try { pref = localStorage.getItem(KEY) || 'day'; } catch { pref = 'day'; }
    if (!PREFS.includes(pref)) pref = 'day';
    root.dataset.themePref = pref;
    root.dataset.theme = resolve(pref);
  }
  const onSystem = () => {
    if (getPref() !== 'auto') return;
    root.dataset.theme = resolve('auto');
    notify();
  };
  if (dark.addEventListener) dark.addEventListener('change', onSystem);
  else if (dark.addListener) dark.addListener(onSystem);
  // outra aba mudou a escolha
  window.addEventListener('storage', (ev) => {
    if (ev.key === KEY && PREFS.includes(ev.newValue)) setPref(ev.newValue, { persist: false });
  });
  syncControls();
  syncChrome();
}

export const theme = {
  pref: getPref,
  resolved: getTheme,
  set: setPref,
  onChange: onTheme,
  setChapter,
  sync() { syncControls(); syncChrome(); },   // depois de injetar [data-theme-set] a mao
};
