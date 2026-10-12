// map.js | agente B. S13 "Localizacao": mapa-fachada. Nenhuma requisicao a terceiros antes do clique em "Carregar mapa";
// so entao o iframe do Google Maps e injetado (sem cookie de terceiro antes do clique, brief 9 S13).
// Estados: idle -> loading -> ready | error (erro: mensagem + Tentar de novo + link externo).
// O botao e a legenda aparecem com html[data-ready] (CSS, sem esperar este modulo: a secao nao muda de altura);
// sem JS ou com data-module-state="error" ficam ocultos e resta o link "Abrir no Google Maps".
// Contrato: export default init(root, ctx) -> { destroy() }. Nao usa fotos: sobe sem esperar photos.json.
export const needsPhotos = false;

const EMBED_SRC = 'https://www.google.com/maps?q=-12.5811867,-38.0082405&z=16&output=embed';
const EXTERNAL = 'https://maps.app.goo.gl/42TcQjgCMTYgv7oUA';
const TIMEOUT_MS = 15000;      // sem o evento load neste prazo, o mapa e dado como indisponivel
const FADE_MS = 520;           // tempo para o iframe aparecer antes de remover a fachada

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export default function init(root, ctx) {
  const frame = root.querySelector('[data-map]');
  const facade = root.querySelector('[data-map-facade]');
  const loadBtn = root.querySelector('[data-map-load]');
  const live = root.querySelector('[data-map-live]');
  if (!frame || !facade || !loadBtn) throw new Error('map: marcacao incompleta');   // vira data-module-state="error"
  const label = loadBtn.querySelector('.btn__label');

  const T = {
    load: () => ctx.t('core.intent.map.load', 'Carregar mapa'),
    title: () => ctx.t('localizacao.iframe', 'Mapa da localização da Casa Koray'),
    error: () => ctx.t('localizacao.error', 'Não foi possível carregar o mapa.'),
    ready: () => ctx.t('localizacao.ready', 'Mapa carregado.'),
    loading: () => ctx.t('core.ui.loading', 'Carregando…'),
    retry: () => ctx.t('core.ui.retry', 'Tentar de novo'),
    open: () => ctx.t('core.intent.map.open', 'Abrir no Google Maps'),
  };

  let phase = 'idle';
  let iframe = null;
  let errorEl = null;
  let timer = 0;
  let fadeTimer = 0;

  const say = (text) => { if (live) live.textContent = text; };

  function setBusy(on) {
    if (on) loadBtn.setAttribute('aria-busy', 'true');
    else loadBtn.removeAttribute('aria-busy');
    if (label) label.textContent = on ? T.loading() : T.load();
  }

  // A mensagem de erro cobre a fachada: enquanto ela existe, a fachada fica inerte e o foco (se estava no mapa)
  // passa para "Tentar de novo"; ao sair do erro, o foco volta para o botao de carregar.
  function clearError() {
    if (!errorEl) return;
    const hadFocus = errorEl.contains(document.activeElement);
    errorEl.remove();
    errorEl = null;
    facade.inert = false;
    if (hadFocus) loadBtn.focus({ preventScroll: true });
  }

  function renderError() {
    const focused = errorEl && errorEl.contains(document.activeElement)
      ? (document.activeElement.matches('[data-map-retry]') ? '[data-map-retry]' : 'a')
      : null;
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.className = 'status status--error localizacao__error';
      errorEl.setAttribute('role', 'alert');
      frame.append(errorEl);
      errorEl.addEventListener('click', (ev) => {
        if (ev.target instanceof Element && ev.target.closest('[data-map-retry]')) load();
      });
    }
    const sprite = ctx.url('assets/icons/sprite.svg#warning-circle');
    errorEl.innerHTML = `<svg class="icon status__icon" width="24" height="24" aria-hidden="true" focusable="false"><use href="${esc(sprite)}"></use></svg>
      <p class="status__title">${esc(T.error())}</p>
      <div class="status__actions">
        <button class="btn btn--secondary btn--plain" type="button" data-map-retry><span class="btn__label">${esc(T.retry())}</span></button>
        <a class="btn btn--text" href="${EXTERNAL}" target="_blank" rel="noopener"><span class="btn__label">${esc(T.open())}</span></a>
      </div>`;
    if (focused) errorEl.querySelector(focused)?.focus({ preventScroll: true });   // a troca de idioma redesenha sem perder o foco
  }

  function fail() {
    clearTimeout(timer);
    if (iframe) { iframe.remove(); iframe = null; }
    const hadFocus = frame.contains(document.activeElement);
    phase = 'error';
    setBusy(false);
    renderError();
    facade.inert = true;
    if (hadFocus) errorEl.querySelector('[data-map-retry]')?.focus({ preventScroll: true });
  }

  function onLoad() {
    clearTimeout(timer);
    const hadFocus = facade.contains(document.activeElement);   // ler antes do inert (inert tira o foco)
    phase = 'ready';
    setBusy(false);
    facade.inert = true;
    iframe.classList.add('is-ready');
    say(T.ready());
    if (hadFocus) iframe.focus({ preventScroll: true });     // o botao some: o foco segue para o mapa (nunca e roubado)
    fadeTimer = setTimeout(() => { facade.hidden = true; }, FADE_MS);
  }

  function load() {
    if (phase === 'loading' || phase === 'ready') return;
    clearError();
    if (navigator.onLine === false) { fail(); return; }
    phase = 'loading';
    setBusy(true);
    say(T.loading());
    iframe = document.createElement('iframe');
    iframe.title = T.title();
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.setAttribute('allowfullscreen', '');
    iframe.addEventListener('load', onLoad, { once: true });
    iframe.addEventListener('error', fail, { once: true });
    timer = setTimeout(fail, TIMEOUT_MS);
    iframe.src = EMBED_SRC;
    frame.append(iframe);
  }

  const onClick = () => load();
  loadBtn.addEventListener('click', onClick);

  const offLang = ctx.onLang(() => {
    if (iframe) iframe.title = T.title();
    if (errorEl) renderError();
    if (phase === 'loading' && label) label.textContent = T.loading();
  });

  return {
    destroy() {
      clearTimeout(timer);
      clearTimeout(fadeTimer);
      loadBtn.removeEventListener('click', onClick);
      offLang();
      if (iframe) iframe.remove();
      clearError();
      facade.inert = false;
      facade.hidden = false;
    },
  };
}
