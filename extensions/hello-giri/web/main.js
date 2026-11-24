// Exemplo de extensão (frontend). Exporta default(GiriHub).
export default function (G) {
  const { el } = G.ui;

  G.routes.add('/hello', () =>
    el('div', { class: 'page narrow stack' },
      el('h1', {}, 'Hello Giri'),
      el('p', { class: 'muted' }, 'Página criada por uma extensão, sem tocar no núcleo.'),
      el('button', { class: 'btn', onclick: async (e) => {
        try {
          const r = await G.api.post('/ext/hello-giri/hello');
          G.ui.toast(`${r.message} (${r.greetings}ª saudação)`, 'ok');
        } catch (err) { G.ui.toast(err.message, 'error'); }
      } }, 'Dizer olá')),
  { auth: true });

  G.nav.add({ href: '#/hello', label: 'Hello', icon: 'heart' });
}
