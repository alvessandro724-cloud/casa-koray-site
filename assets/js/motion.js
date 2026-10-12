// motion.js | F1. Camadas de movimento html[data-motion="full|lite|none"] (brief 8.4 e 11.6).
// Fonte unica da verdade: o atributo no <html>. O script inline do <head> escreve o valor inicial; aqui
// ele e recalculado quando o sistema muda (reduced-motion, economia de dados, conexao) e todo mundo e
// avisado, inclusive quando alguem forca o atributo a mao (testes).
const root = document.documentElement;
const listeners = new Set();
let current = null;

const mq = (query) => (window.matchMedia ? window.matchMedia(query) : { matches: false });

// Mesma regra do script do <head>.
export function computeTier() {
  const c = navigator.connection || {};
  if (mq('(prefers-reduced-motion: reduce)').matches) return 'none';
  if (
    c.saveData ||
    mq('(prefers-reduced-data: reduce)').matches ||
    (mq('(pointer: coarse)').matches && (navigator.hardwareConcurrency || 8) <= 4 && (navigator.deviceMemory || 8) <= 3)
  ) return 'lite';
  return 'full';
}

export function motion() {
  return root.dataset.motion || 'full';
}

export function onMotion(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function listen(query, handler) {
  const m = window.matchMedia && window.matchMedia(query);
  if (!m) return;
  if (m.addEventListener) m.addEventListener('change', handler);
  else if (m.addListener) m.addListener(handler);
}

export function initMotion() {
  root.classList.add('js');
  const recompute = () => {
    const tier = computeTier();
    if (root.dataset.motion !== tier) root.dataset.motion = tier;
  };
  if (!root.dataset.motion) recompute();
  current = motion();

  ['(prefers-reduced-motion: reduce)', '(prefers-reduced-data: reduce)', '(pointer: coarse)'].forEach((q) => listen(q, recompute));
  const conn = navigator.connection;
  if (conn && conn.addEventListener) conn.addEventListener('change', recompute);

  new MutationObserver(() => {
    const next = motion();
    if (next === current) return;
    current = next;
    listeners.forEach((cb) => {
      try { cb(next); } catch (err) { console.error('[koray] onMotion', err); }
    });
  }).observe(root, { attributes: true, attributeFilter: ['data-motion'] });
}
