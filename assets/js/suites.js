// suites.js | agente B. S7 "Suites": matriz seletora (radiogroup com roving tabindex) + painel de detalhe com crossfade.
// Fonte unica: assets/data/suites.json (dados + textos PT/EN em "labels"). Estado na URL: #suite-N (replaceState).
// O HTML ja traz (tools/gen-suites.mjs) a matriz e o painel da suite 1 com a mesma marcacao daqui: com o JS ativo o CSS
// mostra os dois desde o inicio e este modulo so os substitui pelos interativos, sem mudar a altura da secao.
// Sem JS, ou se este modulo falhar (main.js marca data-module-state="error"), o CSS volta para a lista de <details>.
// Contrato: export default init(root, ctx) -> { destroy() }.

const FLOORS = ['upper', 'ground'];     // linhas da matriz, de cima para baixo
const VIEWS = ['ocean', 'inner'];       // grupos de cada linha, da esquerda para a direita
const SWAP_FALLBACK_MS = 800;           // rede de seguranca para remover a camada que saiu (animationend pode nao vir)

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export default async function init(root, ctx) {
  const slot = root.querySelector('[data-suites-matrix]');
  const stage = root.querySelector('[data-suites-stage]');
  const live = root.querySelector('[data-suites-live]');
  if (!slot || !stage) throw new Error('suites: marcacao incompleta');

  // Falha ao ler os dados: o erro sobe para o main.js (data-module-state="error") e o CSS mostra a lista sem JS.
  const res = await fetch(ctx.url('assets/data/suites.json'));
  if (!res.ok) throw new Error(`suites.json ${res.status}`);
  const data = await res.json();
  let photoDb = null;
  try { photoDb = await ctx.photos(); } catch { /* sem catalogo: o painel mostra so os dados */ }

  const byN = new Map(data.suites.map((s) => [s.n, s]));
  const parse = (value) => {
    const n = Number.parseInt(value, 10);
    return byN.has(n) ? n : null;
  };
  const L = (key) => ctx.pick(data.labels[key]);
  const lower = (text) => text.toLocaleLowerCase(ctx.locale());
  const rowKey = (floor) => (floor === 'upper' ? 'rowUpper' : 'rowGround');
  const groupKey = (view) => (view === 'ocean' ? 'groupOcean' : 'groupInner');
  const viewKey = (s) => (s.view === 'ocean' ? (s.balcony ? 'viewOceanBalcony' : 'viewOcean') : 'viewInner');
  const capKey = (s) => `cap${s.floor === 'upper' ? 'Upper' : 'Ground'}${s.view === 'ocean' ? 'Ocean' : 'Inner'}`;

  let current = parse(ctx.state.get('suite')) || data.suites[0].n;
  let layer = null;
  let swapTimer = 0;

  /* ---------- matriz ---------- */
  const group = document.createElement('div');
  group.className = 'suites__matrix';
  group.setAttribute('role', 'radiogroup');
  slot.replaceChildren(group);                               // troca a matriz estatica pela interativa (mesma altura)

  function matrixHTML() {
    return FLOORS.map((floor) => {
      const groups = VIEWS.map((view) => {
        const list = data.suites.filter((s) => s.floor === floor && s.view === view);
        if (!list.length) return '';
        const buttons = list.map((s) => {
          const name = `${L('word')} ${s.n}, ${lower(L(rowKey(floor)))}, ${lower(L(groupKey(view)))}`;
          return `<button type="button" role="radio" class="suites__radio" data-n="${s.n}" aria-checked="${s.n === current}" tabindex="${s.n === current ? 0 : -1}" aria-label="${esc(name)}">${s.n}</button>`;
        }).join('');
        return `<div class="suites__group"><span class="suites__grouplabel" aria-hidden="true">${esc(L(groupKey(view)))}</span><div class="suites__btns">${buttons}</div></div>`;
      }).join('');
      return `<div class="suites__row"><p class="suites__floor" aria-hidden="true">${esc(L(rowKey(floor)))}</p><div class="suites__groups">${groups}</div></div>`;
    }).join('');
  }

  function renderMatrix() {
    const hadFocus = group.contains(document.activeElement);
    group.setAttribute('aria-label', L('choose'));
    group.innerHTML = matrixHTML();
    roving.sync();
    if (hadFocus) {
      const active = group.querySelector('[aria-checked="true"]');
      if (active) active.focus({ preventScroll: true });
    }
  }

  /* ---------- painel ---------- */
  function pictureFor(id, opts) {
    const photo = photoDb && photoDb.byId[id];
    const alt = (data.photoAlt && data.photoAlt[id]) || (photo && photo.alt);
    return ctx.picture(id, { ...opts, alt: alt ? ctx.pick(alt) : '', noI18n: true });
  }

  function panelHTML(s) {
    const word = L('word');
    // Suites sem foto propria mostram uma foto real do que fica junto delas, com legenda propria ("Na foto: ...")
    const caption = s.caption ? ctx.pick(s.caption) : s.photo_confirmed ? `${word} ${s.n}` : L(capKey(s));
    const includes = ctx.pick(s.balcony ? data.includesBalcony : data.includes);
    const limit = L('limit').replace('{n}', data.houseLimit);
    const photo = pictureFor(s.photo, { sizes: '(min-width:1024px) 50vw, 100vw', class: 'pic--framed suites__pic' });
    const bath = pictureFor(data.bathroomPhoto, { sizes: '96px', class: 'pic--framed suites__bpic', widths: [480] });
    return `<article class="suites__panel" data-n="${s.n}">
      <figure class="suites__fig">${photo}<figcaption>${esc(caption)}</figcaption></figure>
      <h3 class="suites__title">${esc(word)}&nbsp;${s.n}</h3>
      <div class="suites__data">
        <dl class="suites__facts">
          <div><dt>${esc(L('floor'))}</dt><dd>${esc(L(s.floor === 'upper' ? 'floorUpper' : 'floorGround'))}</dd></div>
          <div><dt>${esc(L('view'))}</dt><dd>${esc(L(viewKey(s)))}</dd></div>
          <div><dt>${esc(L('guests'))}</dt><dd>${s.guests}</dd></div>
          <div><dt>${esc(L('beds'))}</dt><dd>${esc(ctx.pick(s.beds))}</dd></div>
        </dl>
        <figure class="suites__bath">${bath}<figcaption>${esc(L('bath'))}</figcaption></figure>
      </div>
      <p class="suites__includes">${esc(includes)}</p>
      <p class="suites__limit">${esc(limit)}</p>
    </article>`;
  }

  const buildLayer = (s) => {
    const tpl = document.createElement('template');
    tpl.innerHTML = panelHTML(s).trim();
    return tpl.content.firstElementChild;
  };

  function dropStale() {
    clearTimeout(swapTimer);
    stage.querySelectorAll('.suites__panel').forEach((el) => { if (el !== layer) el.remove(); });
  }

  // Troca a camada visivel. animate: crossfade de 480 ms (full: com 16 px de deslocamento; lite: so fade; none: troca seca).
  function showPanel(n, animate) {
    const next = buildLayer(byN.get(n));
    const prev = layer;
    dropStale();
    layer = next;
    stage.append(next);
    if (!prev) return;
    if (!animate || ctx.motion() === 'none') { prev.remove(); return; }
    prev.classList.add('is-leaving');
    prev.setAttribute('aria-hidden', 'true');
    prev.inert = true;
    next.classList.add('is-entering');
    const drop = () => { if (prev.isConnected && layer !== prev) prev.remove(); };
    prev.addEventListener('animationend', (ev) => { if (ev.target === prev) drop(); }, { once: true });
    next.addEventListener('animationend', (ev) => { if (ev.target === next) next.classList.remove('is-entering'); }, { once: true });
    swapTimer = setTimeout(drop, SWAP_FALLBACK_MS);
  }

  function announce(s) {
    if (!live) return;
    const parts = [
      `${L('word')} ${s.n}`,
      `${L('floor')}: ${L(s.floor === 'upper' ? 'floorUpper' : 'floorGround')}`,
      `${L('view')}: ${L(viewKey(s))}`,
      `${L('guests')}: ${s.guests}`,
      `${L('beds')}: ${ctx.pick(s.beds)}`,
    ];
    live.textContent = `${parts.join('. ')}.`;
  }

  /* ---------- selecao ---------- */
  function select(n, { user = false, animate = true } = {}) {
    if (!byN.has(n)) return;
    const changed = n !== current || !layer;
    current = n;
    group.querySelectorAll('[role="radio"]').forEach((btn) => {
      btn.setAttribute('aria-checked', String(Number(btn.dataset.n) === n));
    });
    if (changed) showPanel(n, animate);
    if (user) {
      ctx.state.set('suite', n);
      announce(byN.get(n));
    }
  }

  const onClick = (ev) => {
    const btn = ev.target instanceof Element ? ev.target.closest('[role="radio"]') : null;
    if (!btn || !group.contains(btn)) return;
    select(Number(btn.dataset.n), { user: true });
  };
  group.addEventListener('click', onClick);

  // setas, Home e End movem a selecao na ordem visual (1 2 3 6 7 / 4 5 8 9 10); uma unica parada de Tab
  const roving = ctx.dom.roving(group);

  const offState = ctx.state.on('suite', (value, info) => {
    if (info.source === 'set') return;                       // quem gravou foi este modulo
    const n = parse(value);
    if (n) select(n, { animate: true });
  });

  const offLang = ctx.onLang(() => {
    renderMatrix();
    const s = byN.get(current);
    const fresh = buildLayer(s);
    dropStale();
    if (layer) layer.remove();
    layer = fresh;
    stage.append(fresh);
  });

  /* ---------- primeiro desenho ---------- */
  renderMatrix();
  layer = buildLayer(byN.get(current));
  stage.replaceChildren(layer);                              // troca o painel estatico (suite 1) pelo da suite atual

  return {
    destroy() {
      clearTimeout(swapTimer);
      group.removeEventListener('click', onClick);
      roving.destroy();
      offState();
      offLang();
    },
  };
}
