// main.js | F1. Boot do site: monta window.Koray (ctx), carrega modulos de secao sob demanda (um unico
// IntersectionObserver), liga os ganchos declarativos globais e o roteamento de links profundos.
// O contrato completo (ctx, eventos, atributos data-*) esta em docs/css-api.md e docs/BUILD-CONTRACT.md secao 4.
import { bus as rawBus } from './bus.js';
import { initMotion, motion, onMotion } from './motion.js';
import { initTheme, theme } from './theme.js';
import { state } from './state.js';
import { i18n, initI18n } from './i18n.js';
import { loadPhotos, pictureHTML, initPictures, siteUrl } from './img.js';
import { initReveal, reveal } from './reveal.js';
import * as dom from './dom.js';

const root = document.documentElement;
const WA_NUMBER = '5571999859929';
const WA_DEFAULT_PT = 'Olá! Vi o site da Casa Koray e gostaria de saber mais sobre a casa.';   // brief 8.2

/* ---------- contexto compartilhado ---------- */
// Eventos que precisam de um modulo de secao ainda nao carregado: o emit espera o modulo subir antes de entregar.
const EVENT_MODULE = { 'lightbox:open': 'lightbox', book: 'booking', 'reels:open': 'reels' };
const ready = new Set();
const bus = {
  emit(name, detail) {
    if (name === 'book') dom.scrollToEl('#reservar');                       // a rolagem nao espera o modulo
    const mod = EVENT_MODULE[name];
    if (mod && !ready.has(mod)) load(mod).then(() => rawBus.emit(name, detail));
    else rawBus.emit(name, detail);
  },
  on: rawBus.on,
  once: rawBus.once,
};

function whatsappUrl(message) {
  const text = message || i18n.t('core.wa.default', WA_DEFAULT_PT);
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
}

let photosReady = Promise.resolve(null);
let i18nReady = Promise.resolve('pt');

const ctx = {
  lang: i18n.lang,
  locale: i18n.locale,
  t: i18n.t,
  pick: i18n.pick,
  onLang: i18n.onLang,
  motion,
  onMotion,
  photos: loadPhotos,
  picture: pictureHTML,
  state,
  bus,
  whatsappUrl,
  inview: dom.inview,
  url: siteUrl,
  load,
  setLang: (lang) => i18n.setLang(lang),
  i18n,
  theme,
  dom,
  reveal,
  syncWhatsApp,
  observeModules,
};

/* ---------- modulos de secao (data-module) ---------- */
// O import do modulo corre em paralelo com photos.json e o dicionario. Por padrao init() so roda com os dois prontos
// (ctx.picture e ctx.t ja funcionam). Um modulo que nao usa fotos (menu, nav) exporta `needsPhotos = false` e sobe
// assim que o idioma estiver resolvido, sem esperar o catalogo.
function initModule(el, name) {
  if (!/^[\w/-]+$/.test(name)) return Promise.resolve(null);
  const bag = el.__kmods || (el.__kmods = {});
  if (bag[name]) return bag[name];
  bag[name] = (async () => {
    try {
      const mod = await import(`./${name}.js`);
      await (mod.needsPhotos === false ? i18nReady : Promise.all([photosReady, i18nReady]));
      const init = mod.default || mod.init;
      const instance = typeof init === 'function' ? await init(el, ctx) : null;
      el.dataset.moduleState = 'ready';
      return instance || null;
    } catch (err) {
      el.dataset.moduleState = 'error';
      console.error(`[koray] modulo "${name}"`, err);
      return null;
    }
  })();
  return bag[name];
}

const namesOf = (el) => String(el.dataset.module || '').split(/\s+/).filter(Boolean);

// Carrega (uma vez) o modulo "name" em todos os elementos [data-module~=name]. Resolve com a primeira instancia.
function load(name) {
  const els = Array.from(document.querySelectorAll('[data-module]')).filter((el) => namesOf(el).includes(name));
  return Promise.all(els.map((el) => initModule(el, name))).then((all) => {
    if (els.length) ready.add(name);
    return all[0] || null;
  });
}

// Cada elemento sobe quando chega a 200% da janela (um observador compartilhado, em dom.inview).
function observeModules(scope = document) {
  scope.querySelectorAll('[data-module]').forEach((el) => {
    if (el.__kobserved) return;
    el.__kobserved = true;
    dom.inview(el, () => namesOf(el).forEach((n) => initModule(el, n)), { rootMargin: '200% 0px', once: true });
  });
}

/* ---------- ganchos declarativos ---------- */
function syncLangButtons() {
  const current = i18n.lang();
  document.querySelectorAll('[data-lang-set]').forEach((el) => {
    const attr = el.getAttribute('role') === 'radio' ? 'aria-checked' : 'aria-pressed';
    el.setAttribute(attr, String(el.dataset.langSet === current));
  });
}

// data-whatsapp (+ data-whatsapp-msg="chave" e data-whatsapp-text="PT"): PT sai do atributo, EN do dicionario.
function syncWhatsApp(scope = document) {
  scope.querySelectorAll('[data-whatsapp]').forEach((el) => {
    const key = el.dataset.whatsappMsg;
    const message = key ? i18n.t(key, el.dataset.whatsappText || '') : '';
    const url = whatsappUrl(message);
    if (el.tagName === 'A') {
      el.href = url;
      el.target = '_blank';
      el.rel = 'noopener';
    } else {
      el.dataset.whatsappHref = url;
    }
  });
}

function onClick(ev) {
  const origin = ev.target instanceof Element ? ev.target : null;
  if (!origin) return;
  const hit = (selector) => origin.closest(selector);
  const plainLink = (el) => el.tagName === 'A' && (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button > 0);
  let el;

  if ((el = hit('[data-lang-set]'))) { ev.preventDefault(); i18n.setLang(el.dataset.langSet); return; }
  if ((el = hit('[data-theme-set]'))) { ev.preventDefault(); theme.set(el.dataset.themeSet); return; }
  if ((el = hit('[data-lightbox]'))) {
    if (plainLink(el)) return;
    ev.preventDefault();
    const list = el.dataset.lightboxList;
    bus.emit('lightbox:open', { id: el.dataset.lightbox, list: list ? list.split(',').map((s) => s.trim()).filter(Boolean) : undefined, trigger: el });
    return;
  }
  if ((el = hit('[data-book]'))) {
    if (plainLink(el)) return;
    ev.preventDefault();
    const { checkin, checkout, guests } = el.dataset;
    bus.emit('book', { checkin, checkout, guests, trigger: el });
    return;
  }
  if ((el = hit('[data-scroll-to]'))) {
    if (plainLink(el)) return;
    const target = el.dataset.scrollTo ? document.querySelector(el.dataset.scrollTo) : null;
    if (!target) return;
    ev.preventDefault();
    dom.scrollToEl(target, { focus: ev.detail === 0 });   // detail 0 = teclado; no toque nao se foca (teclado virtual)
    return;
  }
  if ((el = hit('[data-whatsapp]')) && el.tagName !== 'A') {
    ev.preventDefault();
    window.open(el.dataset.whatsappHref || whatsappUrl(), '_blank', 'noopener');
  }
}

/* ---------- links profundos (brief 8.5) ---------- */
// Abrir um item fecha o outro do mesmo grupo (<details name>) com a animacao de ::details-content (--dur-slow):
// o conteudo acima encolhe depois da primeira rolagem, entao o pouso e refeito quando a transicao termina.
function openFaq(id) {
  const item = document.getElementById(`faq-${id}`);
  if (!item || item.tagName !== 'DETAILS') return;
  const wasOpen = item.open;
  item.open = true;
  dom.scrollToEl(item);
  if (wasOpen) return;
  const settle = parseFloat(getComputedStyle(root).getPropertyValue('--dur-slow')) || 0;
  if (settle > 20) setTimeout(() => dom.scrollToEl(item), settle + 80);
}

function whenSettled(fn) {
  if (document.readyState === 'complete') fn();
  else window.addEventListener('load', fn, { once: true });
}

function routeDeepLinks() {
  if (state.get('foto')) load('lightbox');                                   // o modulo le state.get('foto') ao subir
  if (state.get('faq')) whenSettled(() => openFaq(state.get('faq')));
  if (state.get('filme')) whenSettled(() => dom.scrollToEl('#filmes', { behavior: 'auto' }));
  if (state.get('suite')) whenSettled(() => dom.scrollToEl('#suites', { behavior: 'auto' }));

  state.on('faq', (value, info) => { if (value && info.source !== 'set') openFaq(value); });
}

/* ---------- boot ---------- */
window.Koray = ctx;
initMotion();
initTheme();
i18nReady = initI18n().catch(() => 'pt');
photosReady = loadPhotos().catch((err) => { console.error('[koray] photos.json', err); return null; });
initPictures();
initReveal();
dom.watchDialogs();
dom.initRoving();
syncLangButtons();
syncWhatsApp();
i18n.onLang(() => { syncLangButtons(); syncWhatsApp(); });
i18nReady.then(() => { syncLangButtons(); syncWhatsApp(); });
document.addEventListener('click', onClick);
observeModules();
routeDeepLinks();
root.dataset.ready = 'true';   // desliga o failsafe de CSS: se o JS nao subir, o que a revelacao/fade oculta reaparece sozinho apos 4 s
rawBus.emit('ready', { ctx });
