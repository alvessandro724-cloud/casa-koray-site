// bookbar.js | Barra fixa "Reserve sua estada" (>= 1024 px), no estilo do Fasano.
// Nao envia nada: leva datas e hospedes para o cartao de reserva (#reservar) pelo evento `book` do bus;
// o booking.js preenche, valida (minimo de 4 diarias, ate 25 hospedes) e monta a mensagem do WhatsApp.
// A barra some quando o proprio cartao de reserva esta na tela (main.js ja rola ate ele no evento `book`).

const MIN_NIGHTS = 4;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (isoDate, n) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return iso(new Date(y, m - 1, d + n));
};
const isISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

export default function init(form, ctx) {
  const checkin = form.elements.namedItem('checkin');
  const checkout = form.elements.namedItem('checkout');
  const guests = form.elements.namedItem('guests');
  const today = iso(new Date());

  const syncMin = () => {
    checkin.min = today;
    checkout.min = addDays(isISO(checkin.value) ? checkin.value : today, MIN_NIGHTS);
    if (isISO(checkin.value) && isISO(checkout.value) && checkout.value < checkout.min) checkout.value = checkout.min;
  };

  // Comeca com o que ja estiver na URL (?checkin&checkout&guests), se houver
  const s = ctx.state;
  if (isISO(s.get('checkin'))) checkin.value = s.get('checkin');
  if (isISO(s.get('checkout'))) checkout.value = s.get('checkout');
  if (/^\d+$/.test(s.get('guests') || '')) guests.value = s.get('guests');
  syncMin();

  const onCheckin = () => {
    syncMin();
    if (isISO(checkin.value) && !checkout.value) checkout.value = addDays(checkin.value, MIN_NIGHTS);
  };
  checkin.addEventListener('change', onCheckin);

  const onSubmit = (ev) => {
    ev.preventDefault();
    const n = Math.min(25, Math.max(1, parseInt(guests.value, 10) || 1));
    guests.value = String(n);
    ctx.bus.emit('book', {
      checkin: isISO(checkin.value) ? checkin.value : undefined,
      checkout: isISO(checkout.value) ? checkout.value : undefined,
      guests: String(n),
      trigger: form,
    });
  };
  form.addEventListener('submit', onSubmit);

  // Some enquanto o cartao de reserva (ou o rodape) esta visivel: evita dois formularios lado a lado
  const targets = ['reservar', 'rodape'].map((id) => document.getElementById(id)).filter(Boolean);
  const visible = new Set();
  let io = null;
  if ('IntersectionObserver' in window && targets.length) {
    io = new IntersectionObserver((entries) => {
      for (const e of entries) (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target));
      form.classList.toggle('is-off', visible.size > 0);
    }, { rootMargin: '0px 0px -20% 0px' });
    targets.forEach((t) => io.observe(t));
  }

  return {
    destroy() {
      checkin.removeEventListener('change', onCheckin);
      form.removeEventListener('submit', onSubmit);
      if (io) io.disconnect();
    },
  };
}
