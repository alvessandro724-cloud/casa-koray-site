// state.js | F1. Estado de UI na URL (brief 8.5). Unico modulo que toca em history/location.
//
//   Chave      URL                                 Gravacao
//   lang       ?lang=en                            replaceState
//   checkin    ?checkin=2027-02-14                 replaceState
//   checkout   ?checkout=2027-02-19                replaceState
//   guests     ?guests=5                           replaceState
//   g          ?g=noite                            replaceState (filtro da galeria)
//   foto       #foto-IMG_7448                      pushState (Voltar fecha o lightbox)
//   filme      #filme-cinema                       replaceState
//   suite      #suite-4                            replaceState
//   faq        #faq-pets                           replaceState (id do <details>)
//
// Chaves de hash sao mutuamente exclusivas (a URL tem um unico hash). get() devolve string ou null.
// Safari limita replaceState a 100 chamadas em 30 s: quem
// grava a cada tecla deve usar debounce.
const QUERY = ['lang', 'checkin', 'checkout', 'guests', 'g'];
const HASH = { foto: 'foto-', filme: 'filme-', suite: 'suite-', faq: 'faq-' };
export const KEYS = [...QUERY, ...Object.keys(HASH)];

const SID = Math.random().toString(36).slice(2);   // entradas empilhadas por esta carga da pagina
const listeners = new Map();

const decode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

function parseHash(hash = location.hash) {
  const h = hash.replace(/^#/, '');
  if (!h) return null;
  for (const [key, prefix] of Object.entries(HASH)) {
    if (h.startsWith(prefix)) {
      const value = decode(h.slice(prefix.length));
      return value ? { key, value } : null;
    }
  }
  return null;
}

function read(key) {
  if (QUERY.includes(key)) {
    const v = new URLSearchParams(location.search).get(key);
    return v === '' ? null : v;
  }
  const parsed = parseHash();
  return parsed && parsed.key === key ? parsed.value : null;
}

const snapshot = () => Object.fromEntries(KEYS.map((k) => [k, read(k)]));
let last = snapshot();

function flush(source) {
  const now = snapshot();
  const before = last;
  last = now;
  for (const key of KEYS) {
    if (now[key] === before[key]) continue;
    const subs = listeners.get(key);
    if (!subs) continue;
    for (const cb of [...subs]) {
      try { cb(now[key], { source, prev: before[key] }); } catch (err) { console.error(`[koray] state "${key}"`, err); }
    }
  }
}

export function get(key) {
  return read(key);
}

export function getAll() {
  return snapshot();
}

// setMany({ checkin, checkout, guests }, { push }). Valor null/undefined/'' remove a chave
// Devolve true se a URL mudou.
export function setMany(values, opts = {}) {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(values)) {
    if (!KEYS.includes(key)) continue;
    const empty = value === null || value === undefined || value === false || value === '';
    if (QUERY.includes(key)) {
      if (empty) url.searchParams.delete(key);
      else url.searchParams.set(key, String(value));
    } else if (empty) {
      const current = parseHash(url.hash);
      if (current && current.key === key) url.hash = '';
    } else {
      url.hash = `${HASH[key]}${encodeURIComponent(value)}`;
    }
  }
  const next = url.pathname + url.search + url.hash;
  if (next === location.pathname + location.search + location.hash) return false;
  try {
    if (opts.push) history.pushState({ kk: Object.keys(values)[0], sid: SID }, '', next);
    else history.replaceState(history.state, '', next);
  } catch {
    return false;
  }
  flush('set');
  return true;
}

export function set(key, value, opts = {}) {
  return setMany({ [key]: value }, opts);
}

// Remove a chave. Se a entrada foi empilhada (pushState) por esta pagina, volta no historico em vez de
// deixar uma entrada morta; caso contrario troca a URL no lugar.
export function clear(key) {
  const st = history.state;
  if (st && st.sid === SID && st.kk === key && read(key) !== null) { history.back(); return; }
  set(key, null);
}

// on(key, cb) -> off. cb(valor, { source: 'set' | 'pop' | 'hash', prev }). Dispara tambem nas gravacoes
// feitas por set(): quem grava normalmente ignora source === 'set'.
export function on(key, cb) {
  let subs = listeners.get(key);
  if (!subs) { subs = new Set(); listeners.set(key, subs); }
  subs.add(cb);
  return () => subs.delete(cb);
}

window.addEventListener('popstate', () => flush('pop'));
window.addEventListener('hashchange', () => flush('hash'));

export const state = { get, getAll, set, setMany, clear, on };
