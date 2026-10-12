// booking.js | C (reserva). Cartao de reserva do #reservar: brief secao 10 (formulario, regras, mensagem, aceite) e 11.5
// (reserva viva). Nenhum dado pessoal e coletado: so datas e numero de hospedes, que viajam na URL (?checkin&checkout&guests,
// via state.js), em sessionStorage (so neste navegador) e no texto pronto do WhatsApp. Nada vai a servidor.
//
// Contrato: data-module="booking" na secao #reservar. O evento `book` do bus (botoes data-book do hero, da nav e da barra)
// ja rola ate a secao (main.js); aqui ele preenche os campos e, com ponteiro fino, foca o primeiro campo vazio.
//
// As funcoes puras (validate, buildMessage, waUrl, formatBRL...) sao exportadas para teste em Node.

// O cartao nao usa o catalogo de fotos (a IMG_7440 e HTML estatico): sobe assim que o idioma estiver resolvido.
export const needsPhotos = false;

/* ---------- configuracao ---------- */
const SHOW_ESTIMATE = true;   // brief 10.1 item 3: [CONFIRMAR] que R$ 13.000 e a diaria da casa inteira. false esconde a linha de referencia.
const MIN_NIGHTS = 4;
const MAX_GUESTS = 25;
const DEFAULT_GUESTS = 2;
const RATE = 13000;
const WA = '5571999859929';
const STORE_KEY = 'koray-booking';
const FIELDS = ['checkin', 'checkout', 'guests'];
const DAY = 864e5;
const ISO = /^(\d{4,6})-(\d{2})-(\d{2})$/;
const SUCCESS_MS = 4000;   // brief 10.2: mensagem de sucesso por 4 s
const BUSY_MS = 1200;      // tempo do estado "Abrindo o WhatsApp…" depois que a aba abre
const WRITE_MS = 300;      // debounce da gravacao na URL (Safari limita replaceState a 100 chamadas em 30 s)

/* ---------- datas (tudo em UTC: a data escolhida nunca "anda" um dia) ---------- */
const pad = (n, w = 2) => String(n).padStart(w, '0');

export function toUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(0);
  t.setUTCFullYear(y, m - 1, d);   // setUTCFullYear evita o mapeamento de anos 0 a 99 para 1900 a 1999 de Date.UTC
  return t.getTime();
}
export const nights = (a, b) => Math.round((toUTC(b) - toUTC(a)) / DAY);
export const toISO = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
export const addDays = (iso, n) => toISO(toUTC(iso) + n * DAY);
export const localToday = (now = new Date()) => `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
export const isISODate = (s) => typeof s === 'string' && ISO.test(s) && toISO(toUTC(s)) === s;
// Digitar o ano no campo nativo passa por datas validas como 0002-02-14: so reagimos quando o ano tem 4 digitos.
const yearReady = (iso) => isISODate(iso) && Number(iso.split('-')[0]) >= 1000;

/* ---------- regras (brief 10.3) ---------- */
// Devolve { campo: 'codigo' }; vazio = valido. O primeiro campo com erro recebe o foco.
export function validate({ checkin, checkout, guests }, today) {
  const e = {};
  if (!checkin) e.checkin = 'checkinEmpty';
  else if (toUTC(checkin) < toUTC(today)) e.checkin = 'checkinPast';
  if (!checkout) e.checkout = 'checkoutEmpty';
  else if (checkin) {
    const n = nights(checkin, checkout);
    if (n <= 0) e.checkout = 'checkoutOrder';
    else if (n < MIN_NIGHTS) e.checkout = 'minNights';
  }
  if (!(Number.isInteger(guests) && guests >= 1 && guests <= MAX_GUESTS)) e.guests = guests > MAX_GUESTS ? 'maxGuests' : 'guestsRange';
  return e;
}

const DATE_OPTS = {
  pt: { day: '2-digit', month: '2-digit', year: 'numeric' },
  en: { month: 'short', day: 'numeric', year: 'numeric' },
};
export function dateFormatter(lang) {
  const l = lang === 'en' ? 'en' : 'pt';
  return new Intl.DateTimeFormat(l === 'en' ? 'en-US' : 'pt-BR', { timeZone: 'UTC', ...DATE_OPTS[l] });
}

// "R$" + nbsp + numero por Intl (inteiro, sem centavos): pt-BR "R$ 65.000", en-US "R$ 65,000".
export function formatBRL(value, locale) {
  return `R$ ${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)}`;
}

// Texto exato enviado ao WhatsApp (e mostrado na previa). Uma linha por item.
export function buildMessage(s, lang, fmt) {
  const n = nights(s.checkin, s.checkout);
  const L = lang === 'en'
    ? ['Hello! I would like to book Casa Koray.', 'Check-in', 'Check-out', 'nights', 'Guests']
    : ['Olá! Quero reservar a Casa Koray.', 'Check-in', 'Check-out', 'diárias', 'Hóspedes'];
  return [
    L[0],
    `${L[1]}: ${fmt.format(toUTC(s.checkin))}`,
    `${L[2]}: ${fmt.format(toUTC(s.checkout))} (${n} ${L[3]})`,
    `${L[4]}: ${s.guests}`,
  ].join('\n');
}
export function waUrl(s, lang, fmt) {
  return `https://wa.me/${WA}?text=${encodeURIComponent(buildMessage(s, lang, fmt))}`;
}

/* ---------- textos: PT e o padrao aqui, EN vem de en.reservar.json (chaves reservar.*) ---------- */
//   (espaco nao separavel) entre numero e unidade na tela (brief 0.4); a mensagem do WhatsApp usa espaco comum.
const PT = {
  'err.checkinEmpty': 'Escolha a data de check-in.',
  'err.checkinPast': 'Escolha uma data a partir de hoje.',
  'err.checkoutEmpty': 'Escolha a data de check-out.',
  'err.checkoutOrder': 'Escolha um check-out depois do check-in.',
  'err.minNights': 'A estadia mínima é de {min} diárias. Escolha um check-out a partir de {date}.',
  'err.guestsRange': 'Informe de 1 a {max} hóspedes.',
  'err.maxGuests': 'O limite da casa é de {max} hóspedes.',
  estimate: 'Referência: {n} diárias, a partir de {price}. Valor final e disponibilidade confirmados pelo WhatsApp.',
  'status.opened': 'Abrimos o WhatsApp com a sua mensagem.',
  'status.blocked': 'Não abriu? Toque aqui para abrir o WhatsApp.',
  'preview.empty': 'Preencha as datas e os hóspedes para ver a mensagem.',
  'sr.guests': 'Hóspedes: {n}',
};
const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && k in p ? p[k] : m));

/* ---------- armazenamento da sessao (sempre em try/catch) ---------- */
function readStore() {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeStore(values) {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(values)); } catch { /* modo privado ou bloqueado */ }
}

/* ---------- modulo ---------- */
export default function init(root, ctx) {
  const $ = (sel) => root.querySelector(sel);
  const form = $('#res-form');
  const card = $('#res-card');
  const inputs = { checkin: $('#res-checkin'), checkout: $('#res-checkout'), guests: $('#res-guests') };
  const send = $('#res-send');
  const ref = $('#res-ref');
  const status = $('#res-status');
  const msg = $('#res-msg');
  const sr = $('#res-sr');
  const dec = $('[data-step="-1"]');
  const inc = $('[data-step="1"]');
  if (!form || !send || !FIELDS.every((f) => inputs[f])) return null;

  const labelIdle = send.querySelector('.btn__label:not([hidden])');
  const labelBusy = send.querySelector('.btn__label[hidden]');
  const stepper = inputs.guests.closest('.stepper');
  const errBox = {};
  for (const f of FIELDS) {
    const box = $(`#res-${f}-err`);
    errBox[f] = box ? { box, text: box.querySelector('[data-err-text]') } : null;
  }

  const lang = () => (ctx.lang() === 'en' ? 'en' : 'pt');
  const tr = (key, params) => fill(ctx.t(`reservar.${key}`, PT[key]), { min: MIN_NIGHTS, max: MAX_GUESTS, ...params });
  const fmts = {};
  const fmt = () => fmts[lang()] || (fmts[lang()] = dateFormatter(lang()));
  const fmtDate = (iso) => fmt().format(toUTC(iso));

  const touched = new Set();   // campos cujo erro ja pode aparecer (mudou, saiu do campo ou tentou enviar)
  const dirty = new Set();     // campos que a pessoa editou
  const cleanups = [];
  let busy = false;
  let statusKind = '';
  let statusUrl = '';
  let statusTimer = 0;
  let busyTimer = 0;
  let writeTimer = 0;
  let lastRef = '';

  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };

  /* ----- leitura e desenho ----- */
  function read() {
    const raw = inputs.guests.value.trim();
    return { checkin: inputs.checkin.value, checkout: inputs.checkout.value, guests: raw === '' ? NaN : Number(raw) };
  }

  function paintError(f, code, v) {
    const e = errBox[f];
    const input = inputs[f];
    if (!e) return;
    if (code) {
      const date = code === 'minNights' ? fmtDate(addDays(v.checkin, MIN_NIGHTS)) : '';
      const text = tr(`err.${code}`, { date });
      if (e.text.textContent !== text) {
        // "check-in" e "check-out" nao quebram no hifen (o texto vem do dicionario e de Intl, sem entrada do usuario)
        e.text.innerHTML = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/check-(?:in|out)/gi, '<span class="nowrap">$&</span>');
      }
      e.box.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      if (f === 'guests' && stepper) stepper.classList.add('is-invalid');
    } else {
      e.box.hidden = true;
      if (e.text.textContent) e.text.textContent = '';
      input.removeAttribute('aria-invalid');
      if (f === 'guests' && stepper) stepper.classList.remove('is-invalid');
    }
  }

  function paintRef(show, v) {
    let html = '';
    if (SHOW_ESTIMATE && show) {
      const n = nights(v.checkin, v.checkout);
      const price = formatBRL(n * RATE, ctx.locale());
      html = tr('estimate', { n, price: `<strong class="num">${price}</strong>` });
    }
    if (html === lastRef) return;
    lastRef = html;
    ref.innerHTML = html;
  }

  const setDisabled = (btn, off) => { if (btn) btn.setAttribute('aria-disabled', String(off)); };

  // Escrever min/max num <input type="date"> reconstroi o campo e apaga os segmentos que a pessoa esta digitando:
  // so mexe quando o valor realmente mudou.
  const setMin = (input, value) => { if (input.min !== value) input.min = value; };
  // Enquanto o ano esta sendo digitado (0002, 0020, 0202…), o campo focado ainda nao tem uma data de verdade: sem erro.
  const typingYear = (f) => (f === 'checkin' || f === 'checkout') && !!inputs[f].value && !yearReady(inputs[f].value) && document.activeElement === inputs[f];

  function render() {
    const v = read();
    const today = localToday();
    const errs = validate(v, today);
    setMin(inputs.checkin, today);
    setMin(inputs.checkout, addDays(isISODate(v.checkin) ? v.checkin : today, MIN_NIGHTS));
    for (const f of FIELDS) paintError(f, touched.has(f) && !typingYear(f) ? errs[f] : undefined, v);
    paintRef(!!v.checkin && !!v.checkout && !errs.checkin && !errs.checkout, v);
    const text = Object.keys(errs).length ? tr('preview.empty') : buildMessage(v, lang(), fmt());
    if (msg && msg.textContent !== text) msg.textContent = text;
    const g = Number.isFinite(v.guests) ? v.guests : 0;
    setDisabled(dec, g <= 1);
    setDisabled(inc, g >= MAX_GUESTS);
  }

  /* ----- estado compartilhado: URL (state.js) e sessionStorage ----- */
  function fromUrl() {
    const out = {};
    const ci = ctx.state.get('checkin');
    const co = ctx.state.get('checkout');
    const g = ctx.state.get('guests');
    if (isISODate(ci)) out.checkin = ci;
    if (isISODate(co)) out.checkout = co;
    if (g && /^\d{1,2}$/.test(g) && Number(g) >= 1 && Number(g) <= MAX_GUESTS) out.guests = Number(g);
    return out;
  }

  function fromStore() {
    const s = readStore();
    if (!s || typeof s !== 'object') return null;
    const out = {};
    const today = localToday();
    if (isISODate(s.checkin) && toUTC(s.checkin) >= toUTC(today)) {
      out.checkin = s.checkin;
      if (isISODate(s.checkout)) out.checkout = s.checkout;
    }
    if (Number.isInteger(s.guests) && s.guests >= 1 && s.guests <= MAX_GUESTS) out.guests = s.guests;
    return Object.keys(out).length ? out : null;
  }

  function apply(values) {
    if ('checkin' in values) inputs.checkin.value = values.checkin || '';
    if ('checkout' in values) inputs.checkout.value = values.checkout || '';
    if ('guests' in values) inputs.guests.value = String(values.guests);
  }

  function persist(immediate) {
    clearTimeout(writeTimer);
    const run = () => {
      const v = read();
      const values = {
        checkin: yearReady(v.checkin) ? v.checkin : null,
        checkout: yearReady(v.checkout) ? v.checkout : null,
        guests: Number.isInteger(v.guests) && v.guests >= 1 && v.guests <= MAX_GUESTS ? v.guests : null,
      };
      ctx.state.setMany(values);
      writeStore(values);
    };
    if (immediate) run();
    else writeTimer = setTimeout(run, WRITE_MS);
  }

  /* ----- feedback ----- */
  function pulse(input) {
    if (ctx.motion() !== 'full') return;
    input.classList.remove('is-pulse');
    requestAnimationFrame(() => {
      input.classList.add('is-pulse');
      input.addEventListener('animationend', () => input.classList.remove('is-pulse'), { once: true });
    });
  }

  function renderStatus() {
    status.textContent = '';
    if (statusKind === 'opened') {
      status.textContent = tr('status.opened');
    } else if (statusKind === 'blocked') {
      const a = document.createElement('a');
      a.className = 'link';
      a.href = statusUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = tr('status.blocked');
      status.append(a);
    }
  }
  function setStatus(kind, url = '') {
    clearTimeout(statusTimer);
    statusKind = kind;
    statusUrl = url;
    renderStatus();
    if (kind === 'opened') statusTimer = setTimeout(() => setStatus(''), SUCCESS_MS);
  }
  const clearStatus = () => { if (statusKind) setStatus(''); };

  function setBusy(on) {
    busy = on;
    if (on) send.setAttribute('aria-busy', 'true');
    else send.removeAttribute('aria-busy');
    if (labelIdle) labelIdle.hidden = on;
    if (labelBusy) labelBusy.hidden = !on;
  }

  /* ----- ações ----- */
  // Ao escolher o check-in, o check-out vira check-in + 4 dias se estiver vazio ou antes disso (brief 10.2).
  function autoCheckout() {
    const ci = inputs.checkin.value;
    if (!yearReady(ci)) return;
    const min = addDays(ci, MIN_NIGHTS);
    const co = inputs.checkout.value;
    if (!isISODate(co) || toUTC(co) < toUTC(min)) {
      inputs.checkout.value = min;
      pulse(inputs.checkout);
    }
  }

  function afterEdit() {
    clearStatus();
    render();
    persist();
  }

  function onDate(f) {
    dirty.add(f);
    if (f === 'checkin') autoCheckout();
    afterEdit();
  }

  function step(delta) {
    const btn = delta < 0 ? dec : inc;
    if (!btn || btn.getAttribute('aria-disabled') === 'true') return;
    const cur = parseInt(inputs.guests.value, 10);
    const next = Math.min(MAX_GUESTS, Math.max(1, (Number.isFinite(cur) ? cur : 0) + delta));
    inputs.guests.value = String(next);
    dirty.add('guests');
    touched.add('guests');
    afterEdit();
    if (sr) sr.textContent = tr('sr.guests', { n: next });
  }

  function open(url) {
    // window.open com "noopener" devolve sempre null, entao nao daria para saber se foi bloqueado:
    // abrimos normalmente e cortamos o vinculo com opener logo em seguida (a aba ainda e about:blank).
    let win = null;
    try { win = window.open(url, '_blank'); } catch { win = null; }
    if (win) {
      try { win.opener = null; } catch { /* ja desvinculada */ }
      // "Abrindo o WhatsApp…" enquanto a aba abre; so depois vem a confirmacao (4 s)
      busyTimer = setTimeout(() => { setBusy(false); setStatus('opened'); }, BUSY_MS);
    } else {
      setBusy(false);
      setStatus('blocked', url);
      location.href = url;   // brief 10.3: pop-up bloqueado, segue na mesma aba e o link de contingencia fica na tela
    }
  }

  function onSubmit(ev) {
    ev.preventDefault();
    if (busy) return;
    FIELDS.forEach((f) => touched.add(f));
    const v = read();
    const errs = validate(v, localToday());
    render();
    const first = FIELDS.find((f) => errs[f]);
    if (first) {
      clearStatus();
      inputs[first].focus();
      return;
    }
    persist(true);
    clearStatus();
    setBusy(true);
    open(waUrl(v, lang(), fmt()));
  }

  // A rolagem suave de main.js mira a posicao que a secao tinha no clique. Secoes acima que montam conteudo no caminho
  // (galeria, suites) a empurram, e a rolagem pode parar longe. Quando assenta, confere o alvo e corrige uma vez, sem
  // animacao. Qualquer gesto da pessoa cancela a correcao.
  let settleOff = null;
  function settleScroll() {
    if (settleOff) settleOff();
    const html = document.documentElement;
    const timers = [];
    const gestures = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
    const off = () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('scrollend', aim);
      gestures.forEach((g) => window.removeEventListener(g, off));
      settleOff = null;
    };
    function aim() {
      // topo esperado da secao na janela: scroll-padding-top do <html> + scroll-margin-top da secao (negativo)
      const want = (parseFloat(getComputedStyle(html).scrollPaddingTop) || 0) + (parseFloat(getComputedStyle(root).scrollMarginTop) || 0);
      if (Math.abs(root.getBoundingClientRect().top - want) <= 48) return;
      const prev = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';   // sobrepoe o scroll-behavior: smooth do <html>
      root.scrollIntoView({ block: 'start' });
      html.style.scrollBehavior = prev;
    }
    gestures.forEach((g) => window.addEventListener(g, off, { passive: true }));
    window.addEventListener('scrollend', aim, { once: true });
    timers.push(setTimeout(aim, 1100), setTimeout(() => { aim(); off(); }, 2400));
    settleOff = off;
  }

  // Evento `book` do bus: preenche (se vier algo), e com ponteiro fino foca o primeiro campo vazio (sem rolar de novo).
  function onBook(detail) {
    settleScroll();
    const d = detail || {};
    const values = {};
    if (isISODate(d.checkin)) values.checkin = d.checkin;
    if (isISODate(d.checkout)) values.checkout = d.checkout;
    const g = Number.parseInt(d.guests, 10);
    if (Number.isInteger(g) && g >= 1 && g <= MAX_GUESTS) values.guests = g;
    if (Object.keys(values).length) {
      apply(values);
      if (values.checkin) autoCheckout();
      clearStatus();
      render();
      persist(true);
    }
    if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
      const target = FIELDS.map((f) => inputs[f]).find((i) => !i.value) || send;
      target.focus({ preventScroll: true });
    }
  }

  // Voltar/avancar no historico: a URL manda; a sessao acompanha para um recarregamento sem query nao trazer datas antigas.
  function syncFromUrl() {
    const v = fromUrl();
    apply({ checkin: v.checkin || '', checkout: v.checkout || '', guests: v.guests || DEFAULT_GUESTS });
    render();
    writeStore({ checkin: v.checkin || null, checkout: v.checkout || null, guests: v.guests || DEFAULT_GUESTS });
  }

  /* ----- ligacoes ----- */
  for (const f of ['checkin', 'checkout']) {
    on(inputs[f], 'input', () => onDate(f));
    on(inputs[f], 'change', () => { touched.add(f); onDate(f); });
  }
  on(inputs.guests, 'input', () => { dirty.add('guests'); afterEdit(); });
  on(inputs.guests, 'change', () => { touched.add('guests'); afterEdit(); });
  on(form, 'focusout', (ev) => {
    const f = FIELDS.find((name) => inputs[name] === ev.target);
    if (f && dirty.has(f)) { touched.add(f); render(); }
  });
  on(form, 'click', (ev) => {
    const btn = ev.target instanceof Element ? ev.target.closest('[data-step]') : null;
    if (btn) step(Number(btn.dataset.step));
  });
  on(form, 'submit', onSubmit);

  cleanups.push(ctx.bus.on('book', onBook));
  cleanups.push(ctx.onLang(() => { render(); renderStatus(); }));
  for (const f of FIELDS) cleanups.push(ctx.state.on(f, (_value, info) => { if (info.source !== 'set') syncFromUrl(); }));

  // Altura do cartao em --res-card-h: o CSS usa para o sticky nao esconder o fim de um cartao mais alto que a janela
  // (erros, referencia de valor e previa aberta o fazem crescer). Um unico ResizeObserver, sem leitura de layout.
  if (card && 'ResizeObserver' in window) {
    let lastH = 0;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0].borderBoxSize && entries[0].borderBoxSize[0];
      const h = Math.round(box ? box.blockSize : entries[0].contentRect.height);
      if (Math.abs(h - lastH) < 2) return;
      lastH = h;
      card.style.setProperty('--res-card-h', `${h}px`);
    });
    ro.observe(card);
    cleanups.push(() => ro.disconnect());
  }

  /* ----- estado inicial: URL > sessionStorage > padrao ----- */
  const fromQuery = fromUrl();
  let initial = fromQuery;
  let restored = false;
  if (!Object.keys(fromQuery).length) {
    const saved = fromStore();
    if (saved) { initial = saved; restored = true; }
  }
  apply(initial);
  render();
  if (restored) persist(true);   // a URL passa a refletir o estado e fica compartilhavel

  return {
    destroy() {
      if (settleOff) settleOff();
      clearTimeout(statusTimer);
      clearTimeout(busyTimer);
      clearTimeout(writeTimer);
      cleanups.forEach((fn) => { try { fn(); } catch { /* ja removido */ } });
    },
  };
}
