// nav.js | F2. Cromo global: estado da nav (data-nav, data-hero, data-chapter) com UM IntersectionObserver, aria-current,
// menu em folha (<dialog> com showModal), barra fixa mobile e FAB de WhatsApp, ano do rodape.
// Carregado por main.js via data-module="nav" no <header>. Nenhum ouvinte de scroll; leituras de layout so dentro do observador.
//
// Como o estado e decidido: o observador usa como raiz a janela MENOS os 44 px de cima (a "linha de leitura", centro da pilula).
// Uma secao intersecta a raiz enquanto alguma parte dela estiver abaixo da linha; como as secoes ladrilham a pagina, a secao
// que cruza a linha e a PRIMEIRA (na ordem do documento) que intersecta. Elementos 100% acima da linha ficam com above=true.
// Assim nenhuma travessia de secao e perdida, mesmo em saltos de rolagem (uma faixa fina perderia). As sentinelas de 1 px
// do palco podem ser puladas num salto: para elas vale o estado do proprio modulo do palco (ver sentinelNight).

// A nav nao usa fotos: sobe assim que o idioma estiver resolvido, sem esperar photos.json (main.js)
export const needsPhotos = false;

const NAV_LINE = 44;            // px: centro vertical da pilula (12 de topo + metade da altura)
const KB_RATIO = 0.75;          // teclado virtual aberto quando visualViewport < 75% da janela
const VISIBLE_RATIO = 0.12;     // #reservar conta como visivel a partir de 12% (ou 30% da janela)

export default function init(root, ctx) {
  const doc = document;
  const win = window;
  const cleanups = [];
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };
  const setAttr = (el, name, value) => {
    if (!el) return;
    if (value === null) { if (el.hasAttribute(name)) el.removeAttribute(name); }
    else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  };

  const nav = root;
  const bar = doc.querySelector('.bar');
  const fab = doc.querySelector('.fab');
  const menu = doc.getElementById('menu');
  const menuBtn = nav.querySelector('[data-menu-open]');

  // A barra e o FAB nascem no 005 (antes do <main>); aqui vao para o fim do body, para a ordem de tabulacao seguir o
  // conteudo (primeiro a pagina, depois os atalhos fixos). Sem JS eles nem aparecem (ficam escondidos).
  [bar, fab].forEach((el) => { if (el) doc.body.append(el); });

  /* ---------------------------------------------------------------------- estado da nav */
  // Secoes da pagina (ordem do documento), sem as que estiverem aninhadas dentro de outra secao com id
  const sections = Array.from(doc.querySelectorAll('main section[id], #rodape')).filter((s) => !s.parentElement.closest('section[id]'));
  const hero = doc.getElementById('inicio');
  const heroCtas = doc.querySelector('[data-hero-ctas]');
  const heroExit = doc.querySelector('[data-hero-exit]');   // marca do fim da saida do texto do hero (so com a saida animada)
  const reservar = doc.getElementById('reservar');
  const footer = doc.getElementById('rodape');
  const sentinels = Array.from(doc.querySelectorAll('[data-nav-night]'));
  const sectionLinks = Array.from(doc.querySelectorAll('a[data-section]'));
  const seen = new Map();       // elemento -> { on, above, visible }
  const applied = { id: null, night: null, low: null };
  let kbOpen = false;

  const flag = (el) => seen.get(el) || null;

  // Noite dentro de uma secao com sentinela [data-nav-night] (o palco "Do dia a noite"). Quando o modulo da secao ja subiu,
  // a fonte e ele: stage.js (D) liga html[data-stage-night] com um observador cuja raiz e tudo acima da janela, o que
  // acerta tambem em saltos de rolagem (Fim, ancora, rolagem instantanea em reduced-motion), e avisa por "stage:night".
  // Sem o modulo (falhou ou ainda nao subiu), vale a travessia da sentinela vista por este observador.
  function sentinelNight(cur) {
    const own = sentinels.filter((s) => cur.contains(s));
    if (!own.length) return false;
    if (cur.dataset.moduleState === 'ready') return doc.documentElement.hasAttribute('data-stage-night');
    return own.some((s) => { const f = flag(s); return !!(f && f.above); });
  }

  function floaters() {
    const h = hero ? flag(hero) : null;
    const c = heroCtas ? flag(heroCtas) : h;
    const r = reservar ? flag(reservar) : null;
    const heroGone = hero ? !!(h && !h.on && h.above) : true;
    const x = heroExit ? flag(heroExit) : null;
    // Os CTAs do hero "saem" quando passam da linha da nav ou quando a saida animada ja os apagou (55 svh de rolagem)
    const ctasGone = heroCtas || hero ? !!((c && !c.on && c.above) || (x && !x.on && x.above)) : true;
    const reservarVisible = !!(r && r.on && r.visible);
    const f = footer ? flag(footer) : null;
    const footerVisible = !!(f && f.on && f.visible);
    if (bar) bar.classList.toggle('is-on', ctasGone && !reservarVisible && !kbOpen);
    // O FAB sai tambem com o rodape na tela: o rodape ja traz o WhatsApp e o botao cobriria o seletor de tema
    if (fab) fab.classList.toggle('is-on', heroGone && !reservarVisible && !footerVisible);
  }

  function update() {
    let cur = null;
    let last = null;              // a ultima secao que intersecta e a que esta na base da janela (barra e FAB moram la)
    for (const s of sections) {
      const f = flag(s);
      if (f && f.on) { if (!cur) cur = s; last = s; }
    }
    if (cur) {
      const night = cur.getAttribute('data-chapter') === 'night' || sentinelNight(cur);
      setAttr(nav, 'data-nav', cur.hasAttribute('data-nav-photo') ? 'photo' : 'surface');
      setAttr(nav, 'data-hero', cur === hero ? 'in' : 'out');
      if (night !== applied.night) {
        applied.night = night;
        setAttr(nav, 'data-chapter', night ? 'night' : null);
        if (ctx.theme && typeof ctx.theme.setChapter === 'function') ctx.theme.setChapter(night);
      }
      // Barra e FAB seguem o capitulo do que esta embaixo deles (a noite chega a base da janela antes de chegar a nav)
      const low = night || !!(last && last.getAttribute('data-chapter') === 'night');
      if (low !== applied.low) {
        applied.low = low;
        [bar, fab].forEach((el) => setAttr(el, 'data-chapter', low ? 'night' : null));
      }
      const id = cur.id || '';
      if (id !== applied.id) {
        applied.id = id;
        sectionLinks.forEach((a) => {
          if (a.dataset.section === id) a.setAttribute('aria-current', 'location');
          else a.removeAttribute('aria-current');
        });
      }
    }
    floaters();
  }

  let io = null;
  if ('IntersectionObserver' in win) {
    io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const rb = e.rootBounds;
        const top = rb ? rb.top : NAV_LINE;
        const box = e.boundingClientRect;
        const hasBox = box.width > 0 || box.height > 0;      // elemento sem caixa (display:none, ex.: sentinela do tier empilhado) nunca "passou"
        seen.set(e.target, {
          on: e.isIntersecting,
          above: hasBox && !e.isIntersecting && box.bottom <= top,
          visible: e.isIntersecting && (e.intersectionRatio >= VISIBLE_RATIO || (rb ? e.intersectionRect.height >= rb.height * 0.3 : true)),
        });
      }
      update();
    }, { rootMargin: `-${NAV_LINE}px 0px 0px 0px`, threshold: [0, VISIBLE_RATIO] });
    const targets = new Set(sections);
    if (heroCtas) targets.add(heroCtas);
    if (heroExit) targets.add(heroExit);
    sentinels.forEach((s) => targets.add(s));
    targets.forEach((t) => io.observe(t));
    cleanups.push(() => io.disconnect());
    cleanups.push(ctx.bus.on('stage:night', () => { if (seen.size) update(); }));
  } else {
    // Sem IntersectionObserver: nav de superficie, barra e FAB visiveis (nunca escondemos o caminho para Reservar)
    setAttr(nav, 'data-nav', 'surface');
    setAttr(nav, 'data-hero', 'out');
    if (bar) bar.classList.add('is-on');
    if (fab) fab.classList.add('is-on');
  }

  // Teclado virtual aberto: a barra sai da frente (resize do visualViewport, nao scroll)
  const vv = win.visualViewport;
  if (vv) {
    on(vv, 'resize', () => {
      const next = vv.height < win.innerHeight * KB_RATIO;
      if (next === kbOpen) return;
      kbOpen = next;
      floaters();
    });
  }

  /* ---------------------------------------------------------------------- menu em folha */
  let closing = false;
  let skipRestore = false;

  function openMenu() {
    if (!menu || menu.open || typeof menu.showModal !== 'function') return;
    menu.classList.remove('is-closing');
    closing = false;
    menu.showModal();
    setAttr(menuBtn, 'aria-expanded', 'true');
  }

  // closeMenu({ immediate, restoreFocus, then }). Animado por padrao (animationend, com rede de seguranca de tempo);
  // imediato em movimento "none" ou quando outra acao precisa acontecer logo em seguida (reserva).
  let finishClose = null;
  function closeMenu({ immediate = false, restoreFocus = true, then } = {}) {
    if (!menu || !menu.open) { if (then) then(); return; }
    skipRestore = !restoreFocus;
    if (closing) {                                  // ja fechando: so antecipa o fim quando pedirem imediato
      if (immediate && finishClose) finishClose();
      return;
    }
    let timer = 0;
    const onEnd = (ev) => { if (ev.target === menu) finish(); };
    const finish = () => {
      menu.removeEventListener('animationend', onEnd);
      clearTimeout(timer);
      finishClose = null;
      menu.classList.remove('is-closing');
      closing = false;
      if (menu.open) menu.close();
      if (then) then();
    };
    if (immediate || ctx.motion() === 'none') { finish(); return; }
    closing = true;
    finishClose = finish;
    menu.classList.add('is-closing');
    menu.addEventListener('animationend', onEnd);
    timer = setTimeout(finish, 400);
  }

  if (menu && menuBtn) {
    on(menuBtn, 'click', openMenu);
    menuBtn.setAttribute('data-menu-ready', '');
    if (menuBtn.hasAttribute('data-menu-queued')) {      // tocaram no botao antes deste modulo subir (ver o script do 005-chrome)
      menuBtn.removeAttribute('data-menu-queued');
      openMenu();
    }
    on(menu, 'cancel', (ev) => { ev.preventDefault(); closeMenu(); });
    on(menu, 'close', () => {
      setAttr(menuBtn, 'aria-expanded', 'false');
      if (!skipRestore) menuBtn.focus({ preventScroll: true });
      skipRestore = false;
      menu.classList.remove('is-closing');
      closing = false;
    });
    on(menu, 'click', (ev) => {
      const origin = ev.target instanceof Element ? ev.target : null;
      if (!origin) return;
      if (origin.closest('[data-menu-close]')) { closeMenu(); return; }
      const link = origin.closest('a[data-menu-link]');
      if (!link) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button > 0) return;   // nova aba: deixa o navegador
      if (link.hasAttribute('data-book')) {
        // main.js trata o clique logo depois (rola ate a reserva); a folha sai antes, sem animacao
        closeMenu({ immediate: true, restoreFocus: false });
        return;
      }
      const hash = link.getAttribute('href') || '';
      const target = hash.startsWith('#') && hash.length > 1 ? doc.querySelector(hash) : null;
      if (!target) return;
      ev.preventDefault();
      const fromKeyboard = ev.detail === 0;
      closeMenu({ restoreFocus: false, then: () => ctx.dom.scrollToEl(target, { focus: fromKeyboard }) });
    });
    // Voltou para o desktop com o menu aberto: ele nao existe mais naquele layout
    if (win.matchMedia) {
      const desk = win.matchMedia('(min-width:1024px)');
      const onDesk = (ev) => { if (ev.matches) closeMenu({ immediate: true }); };
      if (desk.addEventListener) { desk.addEventListener('change', onDesk); cleanups.push(() => desk.removeEventListener('change', onDesk)); }
    }
  }

  /* ---------------------------------------------------------------------- rodape */
  const year = String(new Date().getFullYear());
  doc.querySelectorAll('[data-year]').forEach((el) => { el.textContent = year; });

  return {
    destroy() {
      cleanups.splice(0).forEach((fn) => { try { fn(); } catch { /* ja removido */ } });
    },
  };
}
