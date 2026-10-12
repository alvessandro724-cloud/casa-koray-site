// img.js | F1. Fotos: catalogo (photos.json), pictureHTML() com a MESMA saida da macro <x-picture> do build,
// fade de entrada (.pic.is-loaded) e rede de seguranca para WebP ausente.
//
// Todo caminho de arquivo e resolvido a partir deste modulo (import.meta.url), nunca do documento: funciona em
// /index.html e em paginas de teste como /dev/f1.html. pictureHTML() emite caminhos relativos ao documento, como a macro.
const ROOT = new URL('../../', import.meta.url);   // raiz do site (assets/js/ -> raiz)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// URL absoluta de um arquivo do site: siteUrl('assets/data/suites.json')
export const siteUrl = (rel) => new URL(String(rel).replace(/^\.?\//, ''), ROOT).href;

// Prefixo relativo do documento ate a raiz do site: '' em /index.html, '../' em /dev/pagina.html.
function docPrefix() {
  const rootPath = ROOT.pathname;
  const docDir = location.pathname.replace(/[^/]*$/, '');
  if (!docDir.startsWith(rootPath)) return '';
  const depth = docDir.slice(rootPath.length).split('/').filter(Boolean).length;
  return '../'.repeat(depth);
}

let meta = { imgBase: 'assets/img/', optBase: 'assets/img/opt/' };
let db = null;
let dbPromise = null;

// Promise<{ list, byId }>; byId e um objeto { IMG_7448: {...} } (com .get(id) e .has(id) nao enumeraveis).
export function loadPhotos() {
  if (db) return Promise.resolve(db);
  if (!dbPromise) {
    dbPromise = fetch(siteUrl('assets/data/photos.json'))
      .then((r) => { if (!r.ok) throw new Error(`photos.json ${r.status}`); return r.json(); })
      .then((j) => {
        meta = { imgBase: j.imgBase || meta.imgBase, optBase: j.optBase || meta.optBase };
        const byId = {};
        for (const p of j.photos) byId[p.id] = p;
        Object.defineProperty(byId, 'get', { value: (id) => byId[id] });
        Object.defineProperty(byId, 'has', { value: (id) => Object.prototype.hasOwnProperty.call(byId, id) });
        db = { list: j.photos, byId };
        return db;
      })
      .catch((err) => { dbPromise = null; throw err; });
  }
  return dbPromise;
}

export const photoById = (id) => (db ? db.byId[id] : undefined);

// pictureHTML(fotoOuId, opts) -> string. opts espelham os atributos da macro:
// { sizes, class, imgClass, loading: 'lazy'|'eager', fetchpriority, pos, alt, altKey, noI18n, widths }.
// Difere da macro so em uma coisa: a macro lista apenas os WebP que existem em disco; aqui entram todos os
// widths do catalogo (o pipeline gera todos). Se faltar algum, o img.js remove os <source> e cai no JPG.
export function pictureHTML(photoOrId, o = {}) {
  const p = typeof photoOrId === 'string' ? photoById(photoOrId) : photoOrId;
  if (!p) return `<!-- foto desconhecida: ${esc(String(photoOrId))} -->`;
  const pre = docPrefix();
  const imgBase = pre + meta.imgBase;
  const optBase = pre + meta.optBase;
  const wanted = o.widths ? (Array.isArray(o.widths) ? o.widths : String(o.widths).split(',').map(Number)) : p.widths;
  const sizes = o.sizes || '100vw';
  const pos = o.pos || `${p.focal[0]}% ${p.focal[1]}%`;
  const altKey = o.altKey || o['alt-key'] || `photos.${p.id}.alt`;
  const alt = o.alt !== undefined ? o.alt : p.alt.pt;
  const imgClass = o.imgClass || o['img-class'];
  const picClass = ['pic', o.class].filter(Boolean).join(' ');
  const imgAttrs = [
    `src="${imgBase}${p.id}.jpg"`,
    `srcset="${imgBase}${p.id}-sm.jpg ${p.xl ? 1280 : 720}w, ${imgBase}${p.id}.jpg ${p.w}w"`,
    `sizes="${esc(sizes)}"`,
    `width="${p.w}" height="${p.h}"`,
    `alt="${esc(alt)}"`,
    o.noI18n || o['no-i18n'] !== undefined ? '' : `data-i18n-attr="alt:${altKey}"`,
    imgClass ? `class="${esc(imgClass)}"` : '',
    o.loading === 'eager' ? '' : 'loading="lazy"',
    o.fetchpriority ? `fetchpriority="${o.fetchpriority}"` : '',
    'decoding="async"',
    `style="object-position:${pos}"`,
  ].filter(Boolean).join(' ');
  const source = wanted.length
    ? `<source type="image/webp" srcset="${wanted.map((w) => `${optBase}${p.id}-${w}.webp ${w}w`).join(', ')}" sizes="${esc(sizes)}">`
    : '';
  return `<picture class="${picClass}" style="background-color:${p.dominant}">${source}<img ${imgAttrs}></picture>`;
}

/* ---------- fade de entrada e erros ---------- */
const picOf = (img) => {
  const parent = img.parentElement;
  return parent && parent.classList.contains('pic') ? parent : null;
};

function markLoaded(img) {
  const pic = picOf(img);
  if (pic) pic.classList.add('is-loaded');
}

function whenDecoded(img) {
  if (img.decode) img.decode().then(() => markLoaded(img), () => markLoaded(img));
  else markLoaded(img);
}

function failed(img) {
  const parent = img.parentElement;
  // WebP inexistente: remove os <source> e o navegador refaz a selecao com o JPG de contingencia do proprio <img>
  if (parent && parent.tagName === 'PICTURE' && !img.dataset.fallback && parent.querySelector('source')) {
    img.dataset.fallback = '1';
    parent.querySelectorAll('source').forEach((s) => s.remove());
    return;
  }
  const pic = picOf(img);
  if (pic) pic.classList.add('is-error');
}

export function initPictures() {
  document.addEventListener('load', (ev) => {
    if (ev.target instanceof HTMLImageElement) whenDecoded(ev.target);
  }, true);
  document.addEventListener('error', (ev) => {
    if (ev.target instanceof HTMLImageElement) failed(ev.target);
  }, true);
  document.querySelectorAll('.pic > img').forEach((img) => {
    if (!img.complete) return;
    if (img.naturalWidth) whenDecoded(img);
    else failed(img);
  });
}
