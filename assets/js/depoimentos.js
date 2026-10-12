// depoimentos.js | agente B. S10 "Depoimentos": "Ler depoimento completo" abre o integral no lugar do trecho (aria-expanded).
// O CSS ja mostra trecho + botao com html[data-ready] (sem esperar este modulo: a secao nao muda de altura quando ele sobe).
// Sem JS, ou se este modulo falhar (data-module-state="error"), o integral aparece e o botao some.
// Contrato: export default init(root, ctx) -> { destroy() }. Nao usa fotos: sobe sem esperar photos.json.
export const needsPhotos = false;

export default function init(root) {
  const cleanups = [];

  root.querySelectorAll('[data-depo]').forEach((item) => {
    const button = item.querySelector('[data-depo-toggle]');
    if (!button) return;
    const onClick = () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      item.classList.toggle('is-open', open);
    };
    button.addEventListener('click', onClick);
    cleanups.push(() => {
      button.removeEventListener('click', onClick);
      button.setAttribute('aria-expanded', 'false');
      item.classList.remove('is-open');
    });
  });

  return {
    destroy() {
      cleanups.forEach((fn) => fn());
    },
  };
}
