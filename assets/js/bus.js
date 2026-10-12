// bus.js | F1. Barramento de eventos entre modulos: CustomEvents em window com o prefixo "koray:".
// Ex.: bus.emit('lightbox:open', { id: 'IMG_7448' }) dispara window "koray:lightbox:open".
const PREFIX = 'koray:';

export function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(PREFIX + name, { detail }));
}

// Retorna a funcao que cancela a assinatura. O callback recebe (detail, evento).
export function on(name, cb) {
  const handler = (ev) => {
    try { cb(ev.detail, ev); } catch (err) { console.error(`[koray] bus "${name}"`, err); }
  };
  window.addEventListener(PREFIX + name, handler);
  return () => window.removeEventListener(PREFIX + name, handler);
}

export function once(name, cb) {
  const off = on(name, (detail, ev) => { off(); cb(detail, ev); });
  return off;
}

export const bus = { emit, on, once };
