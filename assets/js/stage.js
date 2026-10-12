// stage.js | D (midia). Controle do palco "Do dia a noite" (#dia-noite, brief 11.1).
//
// O pino e o scrub sao CSS puro (position:sticky + animation-timeline). Este modulo so faz o que o CSS nao sabe:
//   1. Sentinelas (1 px, posicionadas em % do percurso fixado) observadas por IntersectionObserver, SEM ouvinte de scroll:
//        35%  dia -> entardecer      69%  entardecer -> noite      40%  [data-nav-night]: o entorno terminou de escurecer
//      Escrevem section[data-phase] (o CSS usa nos tiers lite e full sem animation-timeline) e aria-current nos controles.
//   2. A 40% (ou no topo do bloco noturno empilhado): theme.setChapter(true) troca o <meta theme-color>, html[data-stage-night]
//      fica ligado e o bus emite "stage:night" {night} para a nav (F2) virar noite junto com o veu.
//   3. Os controles Dia / Entardecer / Noite rolam ate topoDaTrilha + (alturaDaTrilha - alturaDoPalco) * data-go
//      (o unico calculo de layout do palco: a altura da trilha; suave, instantaneo em reduced-motion).
const PHASES = ['dia', 'entardecer', 'noite'];

export default function init(root, ctx) {
  const track = root.querySelector('.stage__track');
  const stick = root.querySelector('.stage__stick');
  const buttons = Array.from(root.querySelectorAll('.stage__ctrl button[data-go]'));
  const sentinels = Array.from(root.querySelectorAll('.stage__sentinel'));
  const html = document.documentElement;
  const atOf = (el) => parseFloat(el.style.getPropertyValue('--at'));
  const bounds = sentinels.filter((el) => Number.isFinite(atOf(el)) && !el.hasAttribute('data-nav-night')).sort((a, b) => atOf(a) - atOf(b));
  const nightMarks = sentinels.filter((el) => el.hasAttribute('data-nav-night'));
  const passed = new Map();
  let phase = root.dataset.phase || 'dia';
  let night = false;

  function setPhase(next) {
    if (next === phase && root.dataset.phase === next) return;
    phase = next;
    root.dataset.phase = next;
    buttons.forEach((btn, i) => {
      const on = PHASES[i] === next;
      btn.classList.toggle('is-active', on);
      if (on) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    });
  }

  function setNight(next) {
    if (next === night) return;
    night = next;
    html.toggleAttribute('data-stage-night', night);
    ctx.theme.setChapter(night);                       // so a barra do navegador; Dia forcado desliga os capitulos noturnos
    ctx.bus.emit('stage:night', { night });
  }

  function evaluate() {
    let idx = 0;
    bounds.forEach((el, i) => { if (passed.get(el)) idx = i + 1; });
    setPhase(PHASES[Math.min(idx, PHASES.length - 1)]);
    setNight(nightMarks.some((el) => passed.get(el)));
  }

  // "Passou" = a sentinela esta ACIMA da borda de cima da janela. O observador usa como area de raiz tudo que fica acima
  // da janela (rootMargin: topo expandido, base encolhida em 100%), entao isIntersecting JA E o booleano "passou" e muda
  // tambem em saltos (ancora, Fim, rolagem rapida) em que a sentinela nunca chega a aparecer na janela. Elemento sem caixa
  // (display:none, tier empilhado) nunca intersecta, logo nao passou.
  const ABOVE = { rootMargin: '200000px 0px -100% 0px', threshold: 0 };
  const stops = sentinels.map((el) => ctx.inview(el, (entry) => {
    passed.set(el, entry.isIntersecting);
    evaluate();
  }, ABOVE));

  function onClick(ev) {
    const btn = ev.target instanceof Element ? ev.target.closest('button[data-go]') : null;
    if (!btn || !track || !stick) return;
    const go = parseFloat(btn.dataset.go);
    if (!Number.isFinite(go)) return;
    const range = track.offsetHeight - stick.offsetHeight;
    const top = track.getBoundingClientRect().top + window.scrollY;
    ctx.dom.scrollToY(top + range * Math.min(1, Math.max(0, go)));
  }
  root.addEventListener('click', onClick);

  return {
    destroy() {
      stops.forEach((stop) => stop());
      root.removeEventListener('click', onClick);
      html.removeAttribute('data-stage-night');
    },
  };
}
