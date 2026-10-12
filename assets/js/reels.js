// reels.js | D (midia). Motor de reel do brief 13: filmes feitos das fotos reais (Ken Burns, crossfade, legenda de subtitulo)
// dentro de um player de verdade, com slot para mp4 (13.4). Carregado sob demanda por data-module="reels" (main.js).
//
//   Tiers (html[data-motion]):  full  = autoplay mudo ao passar de 60% visivel, Ken Burns, corte em ripado entre filmes
//                               lite  = poster com "Assistir", crossfade sem Ken Burns
//                               none  = poster com "Assistir", avanco manual de plano, crossfade curto
//   Cada plano: <div.reels__shot><div.reels__frame><picture><img></picture></div></div>; o crossfade anima a opacidade do
//   .reels__shot e o movimento anima o <img> (so transform/opacity, Web Animations API). O relogio do plano e a propria
//   animacao do segmento de progresso (scaleX linear): pausar o relogio pausa o filme; ele termina e chama o proximo plano.
//   Um objeto "session" por selecao de filme guarda animacoes e timers: qualquer clique cancela tudo (interruptivel).
//
// Eventos/estado: bus "reels:open" {id}; URL #filme-<id> (state.set na escolha do usuario, state.on no Voltar/hash).

const ZOOMS = { push: [1, 1.07], pull: [1.07, 1], 'pan-l': [1.06, 1.06], 'pan-r': [1.06, 1.06], 'tilt-up': [1.06, 1.06], 'tilt-down': [1.06, 1.06] };
const PAN = 3;                                   // % de translacao nos pans e tilts (brief 13.1)
const STAGE_SIZES = '(min-width:1280px) 1280px, 100vw';
const CUT_STEP = 24;                             // ripado: 6 reguas x 180 ms + 5 x 24 ms = 300 ms para fechar e 300 ms para abrir
const CUT_DUR = 180;
const CUT_HOLD_MAX = 700;                        // reguas fechadas esperam no maximo isto pelo primeiro quadro do filme novo
const CAPTION_DELAY = 300;                       // a legenda entra 300 ms depois do inicio do plano (brief 13.1)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtTime = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const fill = (text, vars) => String(text).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : ''));

export default async function init(root, ctx) {
  const stage = root.querySelector('.reels__stage');
  if (!stage) return null;
  const html = document.documentElement;
  const q = (sel, scope = stage) => scope.querySelector(sel);
  const layerPoster = q('.reels__poster');
  const layerShots = q('.reels__shots');
  const progressEl = q('.reels__progress');
  const captionEl = q('.reels__caption');
  const ui = {
    toggle: q('[data-act="toggle"]'),
    fs: q('[data-act="fullscreen"]'),
    time: q('.reels__time'),
    end: q('.reels__end'),
    endTitle: q('.reels__end-title'),
    fail: q('.reels__fail'),
    watch: q('[data-act="watch"]'),
    cut: q('.reels__cut'),
    prevFilm: q('[data-act="prev-film"]'),
    nextFilm: q('.reels__bar [data-act="next-film"]'),
    endNext: q('.reels__end [data-act="next-film"]'),
    prevShot: q('[data-act="prev-shot"]'),
    nextShot: q('[data-act="next-shot"]'),
  };
  const live = root.querySelector('[data-reels-live]');
  const strip = root.querySelector('.reels__list');
  const chaps = Array.from(root.querySelectorAll('.reels__chap[data-film]'));
  const transcript = root.querySelector('.reels__transcript');
  const lines = root.querySelector('.reels__lines');

  const cleanups = [];
  const listen = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };
  const t = (key, pt) => ctx.t(key, pt);
  const motion = () => ctx.motion();
  const cssMs = (name, fallback) => {
    const v = getComputedStyle(html).getPropertyValue(name).trim();
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return fallback;
    return /ms$/.test(v) ? n : /s$/.test(v) ? n * 1000 : n;
  };
  const easing = () => getComputedStyle(html).getPropertyValue('--ease-inout').trim() || 'cubic-bezier(.65,0,.35,1)';

  let data = null;
  let db = null;
  let films = [];
  let shotMs = 5000;
  let current = -1;
  let status = 'idle';          // idle | loading | playing | paused | ended | error
  let pauseReason = null;       // 'user' | 'auto'
  let interacted = false;       // depois de qualquer gesto o filme nao comeca sozinho
  let onScreen = false;         // palco com qualquer parte visivel
  let visible = false;          // palco com >= 60% visivel
  let session = null;
  let selSeq = 0;
  let raf = 0;
  let captionTimer = 0;
  let destroyed = false;

  /* ---------- dados ---------- */
  async function loadData() {
    const [res, photos] = await Promise.all([fetch(ctx.url('assets/data/reels.json')), ctx.photos()]);
    if (!res.ok) throw new Error(`reels.json ${res.status}`);
    data = await res.json();
    db = photos;
    films = Array.isArray(data.films) ? data.films : [];
    shotMs = Number(data.shotMs) || cssMs('--shot', 5000);
  }

  const film = () => films[current];
  const modeOf = (f = film()) => (f && f.mp4 ? 'video' : motion() === 'none' ? 'manual' : 'auto');
  const xfadeMs = () => cssMs('--dur-xfade', Number(data && data.xfadeMs) || 900);
  const filmMs = (f) => (f.shots || []).length * shotMs;

  /* ---------- sessao: animacoes, timers e planos de UMA selecao ---------- */
  function endSession() {
    if (!session) return;
    const s = session;
    s.alive = false;
    s.anims.forEach((a) => { try { a.cancel(); } catch { /* ja finalizada */ } });
    s.anims.clear();
    s.timers.forEach((id) => clearTimeout(id));
    s.timers.clear();
    if (s.video) { try { s.video.pause(); } catch { /* sem video */ } s.video.removeAttribute('src'); s.video.remove(); }
    clearTimeout(captionTimer);
    cancelAnimationFrame(raf);
    raf = 0;
    session = null;
  }

  function newSession(index) {
    endSession();
    session = {
      index,
      alive: true,
      k: 0,
      anims: new Set(),
      timers: new Set(),
      prepared: new Map(),
      visible: new Set(Array.from(layerShots.children)),   // o que ja esta na tela sai depois do crossfade
      clock: null,
      video: null,
    };
    return session;
  }

  const track = (s, anim) => {
    s.anims.add(anim);
    anim.finished.then(() => s.anims.delete(anim), () => s.anims.delete(anim));
    return anim;
  };
  const later = (s, fn, ms) => {
    const id = setTimeout(() => { s.timers.delete(id); if (s.alive) fn(); }, ms);
    s.timers.add(id);
    return id;
  };

  /* ---------- planos ---------- */
  function keyframes(shot) {
    const [z0, z1] = shot.zoom || ZOOMS[shot.move] || [1, 1];
    let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
    switch (shot.move) {
      case 'pan-l': x0 = -PAN; x1 = PAN; break;
      case 'pan-r': x0 = PAN; x1 = -PAN; break;
      case 'tilt-up': y0 = -PAN; y1 = PAN; break;
      case 'tilt-down': y0 = PAN; y1 = -PAN; break;
      default: break;
    }
    const f = (x, y, z) => ({ transform: `translate(${x}%, ${y}%) scale(${z})` });
    return [f(x0, y0, z0), f(x1, y1, z1)];
  }

  async function decodeImg(img) {
    for (let n = 0; n < 3; n += 1) {
      try { await img.decode(); return; } catch {
        await sleep(250);                        // o img.js troca para o JPG se o WebP nao existir
        if (img.complete && img.naturalWidth) return;
      }
    }
    throw new Error('imagem nao carregou');
  }

  function buildShot(shot, k) {
    const photo = db.byId[shot.photo];
    if (!photo) throw new Error(`foto desconhecida ${shot.photo}`);
    const focal = shot.focal || photo.focal;
    const el = document.createElement('div');
    el.className = `reels__shot${shot.fit === 'contain' ? ' is-contain' : ''}`;
    el.style.setProperty('--ar', `${photo.w} / ${photo.h}`);
    el.__k = k;
    const frame = document.createElement('div');
    frame.className = 'reels__frame';
    frame.innerHTML = ctx.picture(photo, {
      sizes: STAGE_SIZES, class: 'pic--static', imgClass: 'reels__img', loading: 'eager',
      pos: `${focal[0]}% ${focal[1]}%`, alt: '', noI18n: true,
    });
    el.append(frame);
    const img = frame.querySelector('img');
    if (img) {
      const pivot = shot.move === 'push' || shot.move === 'pull' ? focal : [50, 50];      // zoom em direcao ao ponto focal
      img.style.transformOrigin = `${pivot[0]}% ${pivot[1]}%`;
    }
    return { el, img, shot, k, ready: null };
  }

  function prepare(k) {
    try {
      const s = session;
      if (!s || !s.alive) return Promise.reject(new Error('sem sessao'));
      const f = films[s.index];
      if (k < 0 || k >= f.shots.length) return Promise.resolve(null);
      let rec = s.prepared.get(k);
      if (!rec) {
        rec = buildShot(f.shots[k], k);
        s.prepared.set(k, rec);
        layerShots.append(rec.el);                // invisivel (opacity 0 no CSS) ate o plano comecar
        rec.ready = rec.img ? decodeImg(rec.img) : Promise.reject(new Error('sem imagem'));
        rec.ready.catch(() => {});                // o erro e tratado por quem espera
      }
      return rec.ready.then(() => rec);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  function updateSegments(k, complete) {
    const segs = Array.from(progressEl.children);
    segs.forEach((seg, i) => {
      const done = complete ? i <= k : i < k;
      seg.classList.toggle('is-done', done);
      const fillEl = seg.firstElementChild;
      if (fillEl && !done) fillEl.style.transform = '';
    });
  }

  function showCaption(s, shot, delay) {
    clearTimeout(captionTimer);
    captionEl.classList.remove('is-in');
    const text = ctx.pick(shot.caption);
    if (!text) return;
    const put = () => { if (s.alive) { captionEl.textContent = text; captionEl.classList.add('is-in'); } };
    if (delay <= 0) put();
    else captionTimer = later(s, put, delay);
  }

  // Comeca o plano k. opts.instant: sem crossfade (passo manual ou plano pausado). opts.manual: sem relogio nem movimento.
  function runShot(k, opts = {}) {
    const s = session;
    const rec = s.prepared.get(k);
    const f = films[s.index];
    const m = motion();
    const outgoing = Array.from(s.visible).filter((n) => n !== rec.el);
    s.k = k;
    s.visible = new Set([rec.el, ...outgoing]);
    layerShots.append(rec.el);                    // por cima de tudo
    if (s.clock) { try { s.clock.cancel(); } catch { /* nada */ } s.clock = null; }

    const fade = opts.instant ? 0 : (opts.fadeMs ?? xfadeMs());
    if (fade > 0) {
      const a = track(s, rec.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fade, easing: easing(), fill: 'forwards' }));
      a.finished.then(() => {
        if (!s.alive) return;
        rec.el.style.opacity = '1';
        a.cancel();
        outgoing.forEach((n) => { s.visible.delete(n); n.remove(); });
      }, () => {});
    } else {
      rec.el.style.opacity = '1';
      outgoing.forEach((n) => { s.visible.delete(n); n.remove(); });
    }

    const last = k === f.shots.length - 1;
    if (m === 'full' && !opts.manual && rec.img) {
      const dur = shotMs + (last ? 0 : xfadeMs());
      track(s, rec.img.animate(keyframes(rec.shot), { duration: dur, easing: easing(), fill: 'forwards' }));
    }

    updateSegments(k, !!opts.manual);
    if (!opts.manual) {
      const seg = progressEl.children[k];
      const fillEl = seg && seg.firstElementChild;
      if (fillEl) {
        const clock = fillEl.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: shotMs, easing: 'linear', fill: 'forwards' });
        s.clock = track(s, clock);
        clock.finished.then(() => {
          if (!s.alive || s.k !== k || s.clock !== clock) return;
          clock.cancel();
          seg.classList.add('is-done');
          advance(s, k);
        }, () => {});
      }
    }
    showCaption(s, rec.shot, opts.manual || opts.still ? 0 : CAPTION_DELAY);
    updateTime();
    if (k + 1 < f.shots.length) prepare(k + 1).catch(() => {});   // pre-carrega so o proximo plano
  }

  async function advance(s, k) {
    const f = films[s.index];
    if (k + 1 >= f.shots.length) { finish(); return; }
    try { await prepare(k + 1); } catch { if (s.alive) fail(); return; }
    if (!s.alive || s.k !== k || status === 'error') return;
    runShot(k + 1);
    if (status === 'paused') pauseAnims(s);
  }

  /* ---------- estados ---------- */
  const BAR_HIDDEN = ['idle', 'loading', 'ended', 'error'];
  function setStatus(next) {
    const active = document.activeElement;
    status = next;
    stage.dataset.state = next;
    stage.setAttribute('aria-busy', next === 'loading' ? 'true' : 'false');
    ui.end.hidden = next !== 'ended';
    ui.fail.hidden = next !== 'error';
    render();
    if (next === 'playing') startLoop();
    // Um controle focado que some com a troca de estado (Assistir, cartao final, erro, barra) devolve o foco ao palco.
    if (active && active !== stage && stage.contains(active)) {
      const gone = active.closest('[hidden]')
        || (ui.watch.contains(active) && next !== 'idle')
        || (BAR_HIDDEN.includes(next) && active.closest('.reels__bar'));
      if (gone) stage.focus({ preventScroll: true });
    }
  }

  function pauseAnims(s) {
    s.anims.forEach((a) => { if (a.playState === 'running') a.pause(); });
    if (s.video) s.video.pause();
  }
  function playAnims(s) {
    s.anims.forEach((a) => { if (a.playState === 'paused') a.play(); });
    if (s.video) s.video.play().catch(() => {});
  }

  function pause(reason) {
    if (status !== 'playing' || !session) return;
    pauseAnims(session);
    pauseReason = reason;
    setStatus('paused');
  }
  function resume() {
    if (status !== 'paused' || !session || modeOf() === 'manual') return;
    playAnims(session);
    pauseReason = null;
    setStatus('playing');
  }

  function finish() {
    const s = session;
    if (!s) return;
    const f = film();
    updateSegments(f.shots.length - 1, true);
    clearTimeout(captionTimer);
    captionEl.classList.remove('is-in');
    pauseReason = null;
    setStatus('ended');
    ui.endNext.hidden = current >= films.length - 1;
    announce(fill(t('filmes.live.ended', 'Fim do filme: {title}'), { title: ctx.pick(f.title) }));
    const first = ui.end.querySelector('button');
    if (first && stage.contains(document.activeElement)) first.focus({ preventScroll: true });
  }

  function fail() {
    clearTimeout(captionTimer);
    if (session) pauseAnims(session);
    setStatus('error');
  }

  function announce(text) {
    if (!live) return;
    live.textContent = '';
    live.textContent = text;
  }

  /* ---------- relogio e tempo ---------- */
  function elapsed() {
    const s = session;
    if (!s) return 0;
    if (s.video) return (s.video.currentTime || 0) * 1000;
    const clock = s.clock ? Number(s.clock.currentTime) || 0 : 0;
    return s.k * shotMs + Math.min(clock, shotMs);
  }

  function updateTime() {
    const f = film();
    if (!f) return;
    let text;
    const s = session;
    if (modeOf(f) === 'manual') {
      text = fill(t('filmes.shotcount', 'Plano {n} de {total}'), { n: String((s ? s.k : 0) + 1), total: String(f.shots.length) });
    } else if (s && s.video) {
      const d = Number.isFinite(s.video.duration) ? s.video.duration * 1000 : 0;
      text = `${fmtTime(elapsed())} / ${fmtTime(d)}`;
    } else {
      const now = status === 'ended' ? filmMs(f) : status === 'idle' ? 0 : elapsed();
      text = `${fmtTime(now)} / ${fmtTime(filmMs(f))}`;
    }
    if (ui.time.textContent !== text) ui.time.textContent = text;
  }

  function startLoop() {
    cancelAnimationFrame(raf);
    const tick = () => {
      raf = 0;
      if (status !== 'playing') return;
      updateTime();
      const s = session;
      if (s && s.video && s.video.duration) {
        const seg = progressEl.firstElementChild;
        const fillEl = seg && seg.firstElementChild;
        if (fillEl) fillEl.style.transform = `scaleX(${Math.min(1, s.video.currentTime / s.video.duration)})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  /* ---------- rotulos que dependem do idioma e do estado ---------- */
  function render() {
    const f = film();
    if (!f) return;
    const title = ctx.pick(f.title);
    stage.setAttribute('aria-label', `${t('filmes.region', 'Filme')}: ${title}`);
    const playing = status === 'playing';
    ui.toggle.setAttribute('aria-label', playing ? t('filmes.pause', 'Pausar') : t('filmes.play', 'Reproduzir'));
    ui.toggle.setAttribute('aria-pressed', playing ? 'true' : 'false');
    const inFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    ui.fs.setAttribute('aria-label', inFs ? t('filmes.fsexit', 'Sair da tela cheia') : t('filmes.fs', 'Tela cheia'));
    ui.endTitle.textContent = title;
    stage.dataset.mode = modeOf(f);
    ui.prevFilm.setAttribute('aria-disabled', current <= 0 ? 'true' : 'false');
    ui.nextFilm.setAttribute('aria-disabled', current >= films.length - 1 ? 'true' : 'false');
    const s = session;
    if (s && s.alive && s.index === current && f.shots && f.shots[s.k] && (status === 'playing' || status === 'paused') && captionEl.classList.contains('is-in')) {
      captionEl.textContent = ctx.pick(f.shots[s.k].caption);
    }
    updateTime();
  }

  function renderTranscript() {
    const f = film();
    if (!f || !lines) return;
    lines.replaceChildren(...(f.shots || []).map((shot) => {
      const li = document.createElement('li');
      li.textContent = ctx.pick(shot.caption);
      return li;
    }));
    lines.setAttribute('aria-label', ctx.pick(f.title));
    transcript.hidden = !(f.shots && f.shots.length);
  }

  /* ---------- montar um filme (poster, progresso, tira, transcricao) ---------- */
  function setPoster(f) {
    if (layerPoster.dataset.film === f.id) return;
    const p = f.poster || { photo: f.shots[0].photo, focal: null };
    const photo = db.byId[p.photo];
    if (!photo) return;
    const focal = p.focal || photo.focal;
    layerPoster.innerHTML = ctx.picture(photo, {
      sizes: STAGE_SIZES, class: 'pic--static reels__pic', loading: 'eager', pos: `${focal[0]}% ${focal[1]}%`, alt: '', noI18n: true,
    });
    layerPoster.dataset.film = f.id;
  }

  function mount(f) {
    stage.dataset.film = f.id;
    setPoster(f);
    layerShots.replaceChildren();
    clearTimeout(captionTimer);
    captionEl.classList.remove('is-in');
    captionEl.textContent = '';
    progressEl.replaceChildren(...(modeOf(f) === 'video' ? [0] : f.shots).map(() => {
      const li = document.createElement('li');
      li.append(document.createElement('b'));
      return li;
    }));
    chaps.forEach((b) => {
      if (b.dataset.film === f.id) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
    revealChap(chaps.find((b) => b.dataset.film === f.id));
    renderTranscript();
    pauseReason = null;
    setStatus('idle');
  }

  function revealChap(btn) {
    if (!btn || !strip || strip.scrollWidth <= strip.clientWidth + 1) return;
    const li = btn.closest('li');
    if (!li) return;
    strip.scrollTo({ left: li.offsetLeft - (strip.clientWidth - li.offsetWidth) / 2, behavior: motion() === 'none' ? 'auto' : 'smooth' });
  }

  /* ---------- corte em ripado entre filmes (terceiro uso sancionado do ripado) ---------- */
  // fill "both": durante o atraso escalonado de cada regua ela segura o estado inicial (fechada ao abrir), sem piscar.
  const rulers = Array.from(ui.cut ? ui.cut.children : []);
  let cutClosing = null;          // Promise enquanto as reguas fecham ou estao fechadas
  let cutHeld = [];
  function cutClose() {
    if (cutClosing) return cutClosing;
    cutHeld.forEach((a) => { try { a.cancel(); } catch { /* nada */ } });
    cutHeld = rulers.map((r, i) => r.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: CUT_DUR, delay: i * CUT_STEP, easing: easing(), fill: 'both' }));
    cutClosing = Promise.all(cutHeld.map((a) => a.finished.catch(() => {}))).then(() => undefined);
    return cutClosing;
  }
  // Abre as reguas (revela o filme novo). Seguro de chamar sem ter fechado antes.
  function cutOpen() {
    if (!cutClosing) return;
    const closing = cutClosing;
    cutClosing = null;
    closing.then(() => {
      const held = cutHeld;
      const anims = rulers.map((r, i) => r.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0)' }], { duration: CUT_DUR, delay: i * CUT_STEP, easing: easing(), fill: 'both' }));
      held.forEach((a) => { try { a.cancel(); } catch { /* nada */ } });
      cutHeld = anims;
      Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(() => {
        if (cutHeld === anims) { anims.forEach((a) => { try { a.cancel(); } catch { /* nada */ } }); cutHeld = []; }
      });
    });
  }

  /* ---------- selecionar e tocar ---------- */
  async function select(index, opts = {}) {
    const f = films[index];
    if (!f) return;
    const my = ++selSeq;
    const changing = index !== current;
    const cutting = changing && current >= 0 && onScreen && motion() === 'full' && !opts.quiet;
    if (cutting) {
      await cutClose();
      if (my !== selSeq || destroyed) return;     // outra escolha chegou: ela abre as reguas
    }
    if (changing) {
      endSession();
      current = index;
      mount(f);
      if (opts.user) ctx.state.set('filme', f.id);
      if (opts.user) announce(fill(t('filmes.live.selected', 'Filme selecionado: {title}'), { title: ctx.pick(f.title) }));
    }
    if (cutting) {
      // Atras das reguas fechadas: decodifica o poster e, se for tocar, o primeiro plano; o corte revela o filme novo pronto.
      const ready = [posterReady()];
      if (opts.play && !f.mp4) { newSession(current); ready.push(prepare(0).catch(() => {})); }
      await Promise.race([Promise.all(ready), sleep(CUT_HOLD_MAX)]);
      if (my !== selSeq || destroyed) return;
    }
    cutOpen();
    if (opts.play) start(0, { user: !!opts.user, cut: cutting });
    else warm();
  }

  function posterReady() {
    const img = layerPoster.querySelector('img');
    return img ? decodeImg(img).catch(() => {}) : Promise.resolve();
  }

  // Aquece o primeiro plano enquanto o poster esta parado (so em movimento completo e sem dados poupados).
  function warm() {
    const f = film();
    if (!f || f.mp4 || motion() !== 'full' || status !== 'idle') return;
    if (!session || session.index !== current) newSession(current);
    prepare(0).catch(() => {});
  }

  async function start(from = 0, opts = {}) {
    const f = film();
    if (!f) return;
    if (opts.user) interacted = true;
    if (f.mp4) { startVideo(f); return; }
    const hadSession = session && session.index === current && session.alive;
    const s = hadSession && status === 'idle' ? session : newSession(current);
    pauseReason = null;
    setStatus('loading');
    try { await prepare(from); } catch { if (s.alive && session === s) fail(); return; }
    if (!s.alive || session !== s) return;
    const m = modeOf(f);
    if (m === 'manual') {
      setStatus('paused');                      // passo a passo: nada anda sozinho
      runShot(from, { manual: true, fadeMs: xfadeMs() });
    } else {
      setStatus('playing');
      runShot(from, { instant: !!opts.cut });     // depois do corte em ripado o primeiro plano ja esta na tela, sem crossfade
      // Autoplay cujo primeiro plano terminou de decodificar depois que o palco saiu da tela (rolagem rapida), com a aba
      // oculta ou com um dialogo aberto: fica pausado e retoma quando o palco voltar a 60% visivel.
      if (!opts.user && (!visible || document.hidden || html.hasAttribute('data-dialog-open'))) { pause('auto'); return; }
    }
    announce(fill(t('filmes.live.playing', 'Reproduzindo: {title}'), { title: ctx.pick(f.title) }));
  }

  async function goShot(k, userAction = true) {
    const s = session;
    const f = film();
    if (!s || !f || f.mp4 || status === 'loading') return;
    if (userAction) interacted = true;
    const m = modeOf(f);
    if (k >= f.shots.length) { if (m === 'manual') finish(); return; }
    if (k < 0) k = 0;
    if (status === 'ended' || status === 'idle' || status === 'error') { await start(k, { user: userAction }); return; }
    try { await prepare(k); } catch { if (s.alive) fail(); return; }
    if (!s.alive || session !== s) return;
    const wasPaused = status === 'paused';
    if (m === 'manual') { runShot(k, { manual: true, fadeMs: Math.min(xfadeMs(), 400) }); return; }
    runShot(k, { instant: wasPaused, still: wasPaused, fadeMs: Math.min(xfadeMs(), 400) });
    if (wasPaused) pauseAnims(s);
  }

  function togglePlay() {
    interacted = true;
    if (modeOf() === 'manual' && (status === 'paused' || status === 'playing')) { stepShot(1); return; }   // reduced-motion: Espaco avanca um plano
    if (status === 'playing') { pause('user'); announce(t('filmes.live.paused', 'Pausado')); return; }
    if (status === 'paused') { resume(); announce(fill(t('filmes.live.playing', 'Reproduzindo: {title}'), { title: ctx.pick(film().title) })); return; }
    if (status === 'idle' || status === 'ended') { start(0, { user: true }); return; }
    if (status === 'error') retry();
  }

  function retry() {
    interacted = true;
    const f = film();
    // o botao Tentar de novo some com o quadro de erro: o foco passa ao palco, que tem os atalhos do player
    if (ui.fail.contains(document.activeElement)) stage.focus({ preventScroll: true });
    if (!f) { boot().then(() => { if (film() && status === 'idle') start(0, { user: true }); }); return; }   // o pedido era assistir
    endSession();
    layerShots.replaceChildren();
    setStatus('idle');
    start(0, { user: true });
  }

  const nextFilm = () => { interacted = true; if (current < films.length - 1) select(current + 1, { play: true, user: true }); };
  const prevFilm = () => { interacted = true; if (current > 0) select(current - 1, { play: true, user: true }); };

  /* ---------- slot de mp4 real (13.4) ---------- */
  function startVideo(f) {
    const s = newSession(current);
    setStatus('loading');
    const v = document.createElement('video');
    v.className = 'reels__video';
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;
    v.preload = 'metadata';
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    const posterPhoto = db.byId[(f.poster && f.poster.photo) || f.shots[0].photo];
    if (posterPhoto) v.poster = ctx.url(`assets/img/${posterPhoto.id}.jpg`);
    if (f.webm) { const w = document.createElement('source'); w.src = ctx.url(f.webm); w.type = 'video/webm'; v.append(w); }
    const src = document.createElement('source');
    src.src = ctx.url(f.mp4);
    src.type = 'video/mp4';
    v.append(src);
    if (f.vtt) {
      const tr = document.createElement('track');
      tr.kind = 'captions';
      tr.srclang = 'pt';
      tr.label = 'Português';
      tr.src = ctx.url(f.vtt);
      tr.default = true;
      v.append(tr);
    }
    s.video = v;
    layerShots.replaceChildren(v);
    v.addEventListener('playing', () => { if (s.alive && status === 'loading') setStatus('playing'); });
    v.addEventListener('ended', () => { if (s.alive) finish(); });
    v.addEventListener('error', () => { if (s.alive) fail(); }, true);
    v.addEventListener('loadedmetadata', updateTime);
    v.play().catch((err) => {
      if (!s.alive) return;
      if (err && err.name === 'NotAllowedError') setStatus('paused');
      else fail();
    });
  }

  function seekVideo(delta) {
    const v = session && session.video;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + delta));
    updateTime();
  }

  /* ---------- visibilidade ---------- */
  function autoPause() { if (status === 'playing') pause('auto'); }
  function maybeResume() {
    if (document.hidden || html.hasAttribute('data-dialog-open')) return;
    if (status === 'paused' && pauseReason === 'auto' && modeOf() !== 'manual') resume();
    else if (status === 'idle' && !interacted && current === 0 && motion() === 'full') start(0);   // autoplay mudo: so no tier full
  }

  /* ---------- tela cheia ---------- */
  const fsAvailable = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  if (fsAvailable) ui.fs.hidden = false;
  function toggleFullscreen() {
    if (!fsAvailable) return;
    const active = document.fullscreenElement || document.webkitFullscreenElement;
    if (active) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
    if (req) { const p = req.call(stage); if (p && p.catch) p.catch(() => {}); }
  }
  const onFsChange = () => {
    const inFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    stage.dataset.fullscreen = inFs ? 'true' : 'false';
    render();
  };
  listen(document, 'fullscreenchange', onFsChange);
  listen(document, 'webkitfullscreenchange', onFsChange);

  /* ---------- entradas do usuario ---------- */
  listen(stage, 'click', (ev) => {
    const el = ev.target instanceof Element ? ev.target.closest('[data-act]') : null;
    if (el) {
      switch (el.dataset.act) {
        case 'watch': interacted = true; start(0, { user: true }); break;
        case 'toggle': togglePlay(); break;
        case 'prev-film': prevFilm(); break;
        case 'next-film': nextFilm(); break;
        case 'prev-shot': stepShot(-1); break;
        case 'next-shot': stepShot(1); break;
        case 'fullscreen': toggleFullscreen(); break;
        case 'replay': interacted = true; start(0, { user: true }); break;
        case 'retry': retry(); break;
        default: break;
      }
      return;
    }
    if (ev.target instanceof Element && ev.target.closest('button, a, .reels__bar, .reels__end, .reels__fail')) return;
    if (modeOf() === 'auto' && (status === 'playing' || status === 'paused')) togglePlay();   // clicar no quadro pausa e retoma
  });

  function stepShot(dir) {
    interacted = true;
    const s = session;
    if (!s || status === 'idle' || status === 'ended' || status === 'error') { if (dir > 0 && status !== 'loading') start(0, { user: true }); return; }
    if (s.video) { seekVideo(dir * 5); return; }
    goShot(s.k + dir);
  }

  listen(stage, 'keydown', (ev) => {
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const onControl = ev.target instanceof Element && ev.target !== stage && ev.target.closest('button, a, input, summary');
    switch (ev.key) {
      case ' ':
        if (onControl) return;
        ev.preventDefault();
        togglePlay();
        break;
      case 'k': case 'K':
        ev.preventDefault();
        togglePlay();
        break;
      case 'ArrowRight':
        ev.preventDefault();
        if (ev.shiftKey) nextFilm(); else stepShot(1);
        break;
      case 'ArrowLeft':
        ev.preventDefault();
        if (ev.shiftKey) prevFilm(); else stepShot(-1);
        break;
      case 'f': case 'F':
        ev.preventDefault();
        toggleFullscreen();
        break;
      default: break;
    }
  });

  listen(root.querySelector('.reels__chaps'), 'click', (ev) => {
    const btn = ev.target instanceof Element ? ev.target.closest('.reels__chap[data-film]') : null;
    if (!btn) return;
    interacted = true;
    const i = films.findIndex((f) => f.id === btn.dataset.film);
    if (i < 0) return;
    if (i === current) {
      if (status === 'paused') resume();
      else if (status === 'idle' || status === 'ended' || status === 'error') start(0, { user: true });
      return;
    }
    select(i, { play: true, user: true });
  });

  /* ---------- ambiente: visibilidade, aba, dialogos, idioma, movimento, URL, bus ---------- */
  const stopView = ctx.inview(stage, (entry) => {
    onScreen = entry.isIntersecting;
    const ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
    if (ratio >= 0.6) { visible = true; maybeResume(); }
    else if (ratio < 0.2) { visible = false; autoPause(); }
  }, { threshold: [0, 0.2, 0.6] });

  listen(document, 'visibilitychange', () => { if (document.hidden) autoPause(); else if (visible) maybeResume(); });
  const dialogWatch = new MutationObserver(() => {
    if (html.hasAttribute('data-dialog-open')) autoPause();
    else if (visible) maybeResume();
  });
  dialogWatch.observe(html, { attributes: true, attributeFilter: ['data-dialog-open'] });

  const offLang = ctx.onLang(() => { render(); renderTranscript(); });
  const offMotion = ctx.onMotion((m) => {
    if (m === 'none' && status === 'playing') pause('auto');
    render();
  });
  const offState = ctx.state.on('filme', (value, info) => {
    if (info.source === 'set') return;
    const i = films.findIndex((f) => f.id === value);
    if (i >= 0 && i !== current) select(i, { play: false, quiet: true });
  });
  const offBus = ctx.bus.on('reels:open', (detail) => {
    const i = films.findIndex((f) => f.id === (detail && detail.id));
    if (i < 0) return;
    ctx.dom.scrollToEl(root);
    select(i, { play: true, user: true });
  });

  /* ---------- arranque ---------- */
  async function boot() {
    try {
      await loadData();
    } catch (err) {
      console.error('[koray] reels', err);
      current = Math.max(current, 0);
      stage.dataset.state = 'error';
      ui.fail.hidden = false;
      ui.watch.hidden = true;
      return;
    }
    ui.watch.hidden = false;
    const wanted = films.findIndex((f) => f.id === ctx.state.get('filme'));
    const first = wanted >= 0 ? wanted : 0;
    current = -1;
    await select(first, { quiet: true, announce: false });
    if (visible) maybeResume();
  }
  await boot();

  return {
    destroy() {
      destroyed = true;
      endSession();
      cleanups.forEach((fn) => fn());
      dialogWatch.disconnect();
      stopView();
      offLang();
      offMotion();
      offState();
      offBus();
    },
  };
}
