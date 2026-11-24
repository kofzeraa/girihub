import { el, icon, Coins, fmtDate, toast, spinner, empty, confirmDialog, busy } from '../ui.js';
import { get, post } from '../api.js';
import { state, setBalance } from '../state.js';

const tabs = (cur) => el('div', { class: 'subtabs' },
  el('a', { class: cur === 'shop' ? 'on' : '', href: '#/shop' }, icon('bag', { size: '1.1rem' }), 'Loja'),
  el('a', { class: cur === 'inv' ? 'on' : '', href: state.user ? '#/shop/inventory' : '#/login' }, icon('box', { size: '1.1rem' }), 'Meu inventário'));

const thumb = (p) => el('div', { class: 'p-thumb' }, p.image_url ? el('img', { src: p.image_url, alt: '', loading: 'lazy' }) : el('span', {}, p.category_icon));
const demoTag = (p) => p.is_demo && el('span', { class: 'demo-flag', title: 'Produto demonstrativo: sem efeito real nesta versão' }, 'DEMONSTRATIVO');

export async function render() {
  const { items: cats } = await get('/shop/categories');
  let slug = '', page = 0;
  const grid = el('div', { class: 'pgrid' });
  const more = el('button', { class: 'btn ghost', hidden: true, onclick: () => load() }, 'Carregar mais');
  const chips = el('div', { class: 'chips scroll' });

  function paintChips() {
    chips.replaceChildren(...[{ slug: '', name: 'Todos', icon: '🛍️' }, ...cats].map((c) =>
      el('button', { class: `chip${c.slug === slug ? ' on' : ''}`, onclick: () => { slug = c.slug; page = 0; grid.replaceChildren(); paintChips(); load(); } }, `${c.icon} ${c.name}`)));
  }

  function card(p) {
    const btn = el('button', { class: 'btn small', onclick: () => buy(p, btn, node) }, Coins(p.price), ' Comprar');
    if (p.owned) { btn.disabled = true; btn.replaceChildren('Você já possui'); }
    const node = el('article', { class: 'pcard' }, thumb(p), demoTag(p),
      el('div', { class: 'p-body' }, el('h3', {}, p.name), el('p', { class: 'muted' }, p.description || 'Sem descrição.'), btn));
    return node;
  }
  async function buy(p, btn) {
    if (!state.user) { location.hash = '#/login?next=%2Fshop'; return; }
    if (!(await confirmDialog(`Comprar "${p.name}" por ${p.price.toLocaleString('pt-BR')} GiriCoins?`, 'Comprar'))) return;
    await busy(btn, async () => {
      const r = await post('/shop/buy', { product_id: p.id });
      setBalance(r.balance);
      p.owned = true;
      btn.replaceChildren('Você já possui');
      btn.disabled = true;
      toast(r.badge_granted ? 'Compra feita! Emblema adicionado ao seu perfil.' : 'Compra feita! Item no seu inventário.', 'ok');
    });
  }
  async function load() {
    more.disabled = true;
    try {
      const d = await get(`/shop/products?page=${page++}${slug ? `&category=${encodeURIComponent(slug)}` : ''}`);
      grid.querySelector('.spinner')?.remove();
      d.items.forEach((p) => grid.append(card(p)));
      if (!grid.children.length) grid.append(empty('Nenhum produto cadastrado nesta categoria ainda.'));
      more.hidden = !d.has_more;
    } catch (e) { toast(e.message, 'error'); }
    more.disabled = false;
  }

  paintChips();
  grid.append(spinner());
  load();
  return el('div', { class: 'page stack' }, el('h1', {}, 'Loja de GiriCoins'), tabs('shop'), chips, grid, el('div', { class: 'center' }, more));
}

export async function inventory() {
  const { items } = await get('/shop/inventory');
  return el('div', { class: 'page stack' }, el('h1', {}, 'Meu inventário'), tabs('inv'),
    items.length
      ? el('div', { class: 'pgrid' }, items.map((p) => el('article', { class: 'pcard' }, thumb(p), demoTag(p),
        el('div', { class: 'p-body' }, el('h3', {}, p.name), el('small', { class: 'muted' }, `${p.category} · ${fmtDate(p.created_at)} · pago ${p.price_paid.toLocaleString('pt-BR')} GiriCoins`),
          el('small', { class: p.grants_badge ? 'ok-text' : 'muted' }, p.grants_badge ? '✔ Emblema ativo no seu perfil' : 'Uso/equipar deste item: em desenvolvimento')))))
      : empty('Você ainda não comprou nada.', el('a', { class: 'btn', href: '#/shop' }, 'Ver a loja')));
}
