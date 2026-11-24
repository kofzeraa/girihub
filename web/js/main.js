import { api, auth, get, post, patch, put, del, uploadFile } from './api.js';
import { state, on, loadMe, setUser, hasPerm, isStaff } from './state.js';
import * as ui from './ui.js';
import { initTv } from './tv.js';

const { el, icon, Avatar, Coins, spinner, empty, toast } = ui;

/* ---------- Rotas (páginas são carregadas sob demanda) ---------- */
const routes = [];
function addRoute(pattern, load, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:([a-z]+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  routes.push({ re, keys, load, ...opts });
}
const page = (file, name = 'render') => async () => ({ render: (await import(`./pages/${file}.js`))[name] });

addRoute('/', page('feed'));
addRoute('/v/:id', page('feed'));
addRoute('/login', page('auth', 'login'));
addRoute('/register', page('auth', 'registerPage'));
addRoute('/forgot', page('auth', 'forgot'));
addRoute('/reset', page('auth', 'reset'));
addRoute('/u/:username', page('profile'));
addRoute('/publish', page('publish'), { auth: true });
addRoute('/wallet', page('wallet'), { auth: true });
addRoute('/settings', page('settings'), { auth: true });
addRoute('/shop', page('shop'));
addRoute('/shop/inventory', page('shop', 'inventory'), { auth: true });
addRoute('/admin', page('admin'), { staff: true });
addRoute('/admin/:section', page('admin'), { staff: true });
addRoute('/me', async () => ({ render: () => { location.replace(`#/u/${state.user.username}`); return el('div'); } }), { auth: true });

/* ---------- Layout base ---------- */
const extraNav = []; // itens adicionados por extensões
const navList = () => {
  const u = state.user;
  const items = [
    { href: '#/', label: 'Início', icon: 'home' },
    { href: '#/shop', label: 'Loja', icon: 'bag' },
    { href: u ? '#/publish' : '#/login', label: 'Publicar', icon: 'plus' },
    { href: u ? '#/wallet' : '#/login', label: 'Carteira', icon: 'wallet' },
    { href: u ? '#/me' : '#/login', label: u ? 'Perfil' : 'Entrar', icon: 'user' },
  ];
  if (isStaff()) items.push({ href: '#/admin', label: 'Admin', icon: 'shield' });
  return [...items, ...extraNav];
};

const app = document.getElementById('app');
const view = el('main', { id: 'view', tabindex: '-1' });
const side = el('nav', { class: 'sidenav', 'aria-label': 'Principal' });
const bottom = el('nav', { class: 'bottomnav', 'aria-label': 'Principal' });
const topRight = el('div', { class: 'top-right' });
const topbar = el('header', { class: 'topbar' },
  el('a', { class: 'logo', href: '#/', 'aria-label': 'GiriHub — início' }, el('img', { src: '/img/logo.svg', alt: '' }), el('span', {}, 'Giri', el('b', {}, 'Hub'))),
  topRight);
app.append(el('div', { class: 'shell' }, topbar, side, view, bottom));

function renderChrome() {
  const items = navList();
  const link = (it) => el('a', { class: 'nav-item', href: it.href, 'data-href': it.href }, icon(it.icon), el('span', {}, it.label));
  side.replaceChildren(...items.map(link));
  bottom.replaceChildren(...items.map(link));
  const u = state.user;
  topRight.replaceChildren(...(u
    ? [el('a', { class: 'coin-pill', id: 'coin-pill', href: '#/wallet', title: 'Sua carteira de GiriCoins' }, icon('coin', { size: '1.1rem' }), el('span', { id: 'coin-value' }, u.balance.toLocaleString('pt-BR'))),
       el('a', { href: '#/me', 'aria-label': 'Meu perfil' }, Avatar(u, 2.2)),
       el('button', { class: 'icon-btn', 'aria-label': 'Sair', title: 'Sair', onclick: logout }, icon('logout'))]
    : [el('a', { class: 'btn ghost small', href: '#/login' }, 'Entrar'), el('a', { class: 'btn small', href: '#/register' }, 'Criar conta')]));
  markActive();
}
function markActive() {
  const cur = location.hash || '#/';
  document.querySelectorAll('.nav-item').forEach((a) => {
    const h = a.dataset.href;
    a.classList.toggle('active', h === cur || (h !== '#/' && h !== '#/login' && cur.startsWith(h)) || (h === '#/me' && cur === `#/u/${state.user?.username}`));
  });
}
async function logout() {
  try { await post('/auth/logout'); } catch {}
  auth.clear();
  setUser(null);
  location.hash = '#/';
  toast('Você saiu da conta');
}
on('user', renderChrome);
on('balance', (b) => {
  const v = document.getElementById('coin-value');
  if (v) v.textContent = b.toLocaleString('pt-BR');
  const pill = document.getElementById('coin-pill');
  pill?.classList.remove('bump');
  void pill?.offsetWidth;
  pill?.classList.add('bump');
});

/* ---------- Navegação ---------- */
let current = null, ticket = 0;
function parseHash() {
  const raw = location.hash.slice(1) || '/';
  const [path, qs] = raw.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(qs || '')) };
}
async function navigate() {
  const my = ++ticket;
  const { path, query } = parseHash();
  current?.destroy?.();
  current = null;
  const route = routes.find((r) => r.re.test(path));
  view.replaceChildren(spinner());
  markActive();
  try {
    if (!route) return show(my, empty('Página não encontrada.', el('a', { class: 'btn', href: '#/' }, 'Voltar ao início')));
    if (route.auth && !state.user) return void location.replace(`#/login?next=${encodeURIComponent(path)}`);
    if (route.staff && !isStaff()) return show(my, empty('Você não tem acesso a esta área.'));
    const m = route.re.exec(path);
    const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const { render } = await route.load();
    const out = await render({ params, query });
    if (my !== ticket) return out?.destroy?.();
    current = out?.node ? out : { node: out };
    view.replaceChildren(current.node);
    if (!path.match(/^\/(v\/\d+)?$/)) view.scrollTop = 0;
    view.focus({ preventScroll: true });
  } catch (e) {
    if (my === ticket) show(my, empty(e.message || 'Algo deu errado.', el('button', { class: 'btn', onclick: navigate }, 'Tentar novamente')));
  }
}
function show(my, node) {
  if (my === ticket) view.replaceChildren(node);
}
window.addEventListener('hashchange', navigate);

/* ---------- API pública para extensões (veja docs/EXTENSIONS.md) ---------- */
window.GiriHub = {
  version: '0.1.0',
  api: { get, post, patch, put, del, upload: uploadFile },
  ui,
  state: { get user() { return state.user; }, on },
  routes: { add: (pattern, render, opts = {}) => addRoute(pattern, async () => ({ render }), opts) },
  nav: { add: (item) => { extraNav.push(item); renderChrome(); } },
  navigate: (hash) => { location.hash = hash; },
};

/* ---------- Início ---------- */
const params = new URLSearchParams(location.search);
if (params.has('tv')) try { localStorage.setItem('girihub.tv', params.get('tv') === '0' ? '0' : '1'); } catch {}
initTv();

await loadMe();
renderChrome();
try {
  for (const e of (await get('/extensions')).items) {
    if (e.ok && e.web) {
      try { (await import(e.web)).default?.(window.GiriHub); } catch (err) { console.error(`[extensão ${e.id}]`, err); }
    }
  }
} catch {}
navigate();
