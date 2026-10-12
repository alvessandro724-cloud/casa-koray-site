// reveal.js | F1. Revelacao padrao (brief 11.3): UM IntersectionObserver compartilhado, uma vez por elemento.
// Marcacao: class="reveal" ou data-reveal="up|fade|img|scrub"; data-reveal-group no pai atribui --i (0 a 5) aos filhos.
// O visual vive em components.css e depende de html[data-motion]: full (translateY 16px + opacity), lite (fade 400 ms),
// none (nada). Estados ocultos so existem com html.js. scrub usa animation-timeline: view() quando o navegador tem
// (nesse caso o CSS cuida e este modulo nao observa o elemento).
import { motion, onMotion } from './motion.js';

const SEL = '.reveal,[data-reveal]';
const scrubCss = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('animation-timeline: view()');
let io = null;
let seen = new WeakSet();

function show(el) {
  el.classList.add('is-in');
  if (io) io.unobserve(el);
}

function observer() {
  if (io) return io;
  io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      // 20% do elemento, ou 20% da janela quando o elemento e mais alto que 5 janelas
      const tall = e.rootBounds && e.intersectionRect.height >= e.rootBounds.height * 0.2;
      if (e.intersectionRatio >= 0.2 || tall) show(e.target);
    }
  }, { threshold: [0, 0.2], rootMargin: '0px 0px -10% 0px' });
  return io;
}

function stagger(scope) {
  const groups = [];
  if (scope.matches && scope.matches('[data-reveal-group]')) groups.push(scope);
  scope.querySelectorAll('[data-reveal-group]').forEach((g) => groups.push(g));
  groups.forEach((g) => {
    let i = 0;
    for (const kid of g.children) {
      if (!kid.matches(SEL)) continue;
      if (!kid.style.getPropertyValue('--i')) kid.style.setProperty('--i', String(Math.min(i, 5)));
      i += 1;
    }
  });
}

// scan(raiz): registra os .reveal/[data-reveal] de uma raiz (chame depois de injetar HTML dinamico).
export function scan(scope = document) {
  stagger(scope);
  const els = [];
  if (scope.matches && scope.matches(SEL)) els.push(scope);
  scope.querySelectorAll(SEL).forEach((el) => els.push(el));
  const mode = motion();
  for (const el of els) {
    if (el.classList.contains('is-in') || seen.has(el)) continue;
    if (mode === 'none' || !('IntersectionObserver' in window)) { el.classList.add('is-in'); continue; }
    if (scrubCss && mode === 'full' && el.dataset.reveal === 'scrub') continue;
    seen.add(el);
    observer().observe(el);
  }
}

function revealAll() {
  if (io) io.disconnect();
  seen = new WeakSet();
  document.querySelectorAll(SEL).forEach((el) => el.classList.add('is-in'));
}

export function initReveal() {
  scan(document);
  onMotion((mode) => { if (mode === 'none') revealAll(); else scan(document); });
}

export const reveal = { scan };
