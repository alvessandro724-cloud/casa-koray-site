// i18n.js | F1. PT-BR e o HTML estatico (indexavel); EN vem de assets/data/i18n.en.json, carregado so quando preciso.
//
// Marcacao:
//   data-i18n="chave"                          troca textContent
//   data-i18n-html="chave"                     troca innerHTML (texto confiavel, ex.: nbsp, <em>)
//   data-i18n-attr="aria-label:chave;title:chave2"   troca atributos
// O original em PT e guardado (WeakMap) antes da primeira troca, entao voltar para PT restaura o HTML exato.
// Ordem de decisao do idioma: ?lang= > localStorage > navigator.languages (nunca por IP). Padrao: PT.
// Nos dinamicos: injete PT com data-i18n (o observador traduz sozinho enquanto o idioma for EN) OU use t() sem data-i18n
// e renderize de novo em onLang(). Nao misture os dois no mesmo no.
import { state } from './state.js';

const root = document.documentElement;
const KEY = 'koray-lang';
const LANGS = ['pt', 'en'];
const DICT_URL = new URL('../data/i18n.en.json', import.meta.url);
const SEL = '[data-i18n],[data-i18n-html],[data-i18n-attr]';
const BOT = /bot|crawl|spider|slurp|lighthouse|chrome-lighthouse/i;   // indexacao continua em PT

let lang = 'pt';
let dict = null;
let dictPromise = null;
let ptKeys = null;
let seq = 0;
let observer = null;
let applying = false;
const cache = new WeakMap();
const listeners = new Set();

const pairs = (spec) =>
  spec.split(';').map((s) => s.trim()).filter(Boolean).map((p) => {
    const i = p.indexOf(':');
    return i < 0 ? null : [p.slice(0, i).trim(), p.slice(i + 1).trim()];
  }).filter(Boolean);

function remember(el) {
  let rec = cache.get(el);
  if (rec) return rec;
  rec = {};
  if (el.hasAttribute('data-i18n')) rec.text = el.textContent;
  if (el.hasAttribute('data-i18n-html')) rec.html = el.innerHTML;
  if (el.hasAttribute('data-i18n-attr')) {
    rec.attrs = {};
    for (const [attr] of pairs(el.getAttribute('data-i18n-attr'))) rec.attrs[attr] = el.getAttribute(attr);
  }
  cache.set(el, rec);
  return rec;
}

function applyEl(el) {
  const rec = remember(el);
  const en = lang === 'en';
  if (rec.text !== undefined) {
    const v = en ? dict[el.getAttribute('data-i18n')] : rec.text;
    if (v !== undefined && el.textContent !== v) el.textContent = v;
  }
  if (rec.html !== undefined) {
    const v = en ? dict[el.getAttribute('data-i18n-html')] : rec.html;
    if (v !== undefined && el.innerHTML !== v) el.innerHTML = v;
  }
  if (rec.attrs) {
    for (const [attr, key] of pairs(el.getAttribute('data-i18n-attr'))) {
      const v = en ? dict[key] : rec.attrs[attr];
      if (v === undefined) continue;
      if (v === null) el.removeAttribute(attr);
      else if (el.getAttribute(attr) !== v) el.setAttribute(attr, v);
    }
  }
}

function applyAll(scope) {
  applying = true;
  if (scope.matches && scope.matches(SEL)) applyEl(scope);
  scope.querySelectorAll(SEL).forEach(applyEl);
  if (observer) observer.takeRecords();
  applying = false;
}

// Nos inseridos depois da troca (modulos que renderizam HTML com data-i18n) sao traduzidos na hora.
function watch() {
  if (observer || !document.body) return;
  observer = new MutationObserver((records) => {
    if (applying || lang !== 'en') return;
    const found = [];
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches(SEL)) found.push(n);
        n.querySelectorAll(SEL).forEach((x) => found.push(x));
      }
    }
    if (!found.length) return;
    applying = true;
    found.forEach(applyEl);
    observer.takeRecords();
    applying = false;
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function load() {
  if (dict) return Promise.resolve(dict);
  if (!dictPromise) {
    dictPromise = fetch(DICT_URL)
      .then((r) => { if (!r.ok) throw new Error(`i18n.en.json ${r.status}`); return r.json(); })
      .then((j) => { dict = j; return j; })
      .catch((err) => { dictPromise = null; throw err; });
  }
  return dictPromise;
}

const norm = (v) => (typeof v === 'string' ? v.slice(0, 2).toLowerCase() : '');

function fromNavigator() {
  for (const l of navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]) {
    const b = norm(l);
    if (b === 'pt' || b === 'en') return b;
  }
  return 'pt';
}

export function getLang() { return lang; }
export function locale() { return lang === 'en' ? 'en-US' : 'pt-BR'; }

export function onLang(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// setLang('en' | 'pt', { persist, url }) -> Promise<boolean>. Sem recarregar: troca <html lang>, <title>, meta description,
// aria-labels e todo data-i18n. persist grava localStorage; url grava ?lang=en (PT remove o parametro).
export async function setLang(next, { persist = true, url = true } = {}) {
  next = norm(next);
  if (!LANGS.includes(next)) return false;
  const ticket = ++seq;
  if (next === 'en') {
    try { await load(); } catch (err) {
      console.error('[koray] nao foi possivel carregar o dicionario EN', err);
      return false;
    }
    if (ticket !== seq) return false;
  }
  if (lang === 'pt') document.querySelectorAll(SEL).forEach(remember);   // guarda o PT antes da primeira troca
  const changed = next !== lang;
  lang = next;
  root.lang = next === 'en' ? 'en' : 'pt-BR';
  if (changed) applyAll(document);
  if (next === 'en') watch();
  if (persist) {
    try { localStorage.setItem(KEY, next); } catch { /* modo privado ou bloqueado */ }
  }
  if (url) state.set('lang', next === 'en' ? 'en' : null);
  if (changed) {
    listeners.forEach((cb) => {
      try { cb(next); } catch (err) { console.error('[koray] onLang', err); }
    });
  }
  return true;
}

export async function initI18n() {
  let want = norm(state.get('lang'));
  if (!LANGS.includes(want)) {
    want = '';
    try { want = norm(localStorage.getItem(KEY)); } catch { /* ignora */ }
  }
  if (!LANGS.includes(want)) want = BOT.test(navigator.userAgent) ? 'pt' : fromNavigator();
  if (want === 'en') await setLang('en', { persist: false, url: false });
  return lang;
}

// Indexa os textos PT originais por chave (para t(chave) em PT sem repetir o texto no JS).
function indexPT() {
  ptKeys = new Map();
  document.querySelectorAll(SEL).forEach((el) => {
    const rec = remember(el);
    if (rec.text !== undefined) ptKeys.set(el.getAttribute('data-i18n'), rec.text);
    if (rec.html !== undefined) ptKeys.set(el.getAttribute('data-i18n-html'), rec.html);
    if (rec.attrs) for (const [attr, key] of pairs(el.getAttribute('data-i18n-attr'))) if (rec.attrs[attr] != null) ptKeys.set(key, rec.attrs[attr]);
  });
}

// t(chave, fallbackPT): EN do dicionario; PT do proprio HTML (ou fallbackPT); nunca devolve vazio.
export function t(key, fallbackPT) {
  if (lang === 'en') {
    const v = dict && dict[key];
    return v !== undefined ? v : (fallbackPT !== undefined ? fallbackPT : key);
  }
  if (!ptKeys) indexPT();
  const v = ptKeys.get(key);
  return v !== undefined ? v : (fallbackPT !== undefined ? fallbackPT : key);
}

// pick({ pt, en }) -> texto no idioma atual (dados bilingues em JSON).
export function pick(obj) {
  if (obj == null) return '';
  if (typeof obj === 'string') return obj;
  const v = obj[lang];
  return v !== undefined ? v : (obj.pt !== undefined ? obj.pt : (obj.en !== undefined ? obj.en : ''));
}

// apply(raiz): traduz (ou apenas registra o PT) os nos marcados dentro de uma raiz inserida a mao.
export function apply(scope = document) {
  if (lang === 'pt') {
    if (scope.matches && scope.matches(SEL)) remember(scope);
    scope.querySelectorAll(SEL).forEach(remember);
    return;
  }
  applyAll(scope);
}

export const i18n = { lang: getLang, locale, setLang, t, pick, onLang, apply };
