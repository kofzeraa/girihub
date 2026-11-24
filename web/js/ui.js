// Componentes reutilizáveis. O DOM é sempre construído com textContent (nunca innerHTML com dados) — seguro contra XSS.
const SVG = 'http://www.w3.org/2000/svg';

export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style' && typeof v === 'object') for (const [p, x] of Object.entries(v)) (p.startsWith('--') ? n.style.setProperty(p, x) : (n.style[p] = x));
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  append(n, kids);
  return n;
}
export function append(n, kids) {
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
}

/* ---------- Ícones ---------- */
const ICONS = {
  home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  bag: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
  wallet: 'M3 7a2 2 0 0 1 2-2h14v4M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-1zM16 13.5h.01',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  plus: 'M12 5v14M5 12h14',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z',
  comment: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
  volume: 'M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14',
  mute: 'M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  check: 'M20 6 9 17l-5-5',
  close: 'M18 6 6 18M6 6l12 12',
  play: 'M6 3l14 9-14 9z',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  coin: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
};
export function icon(name, { size = '1.4rem', fill = false } = {}) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('fill', fill ? 'currentColor' : 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', ICONS[name] || '');
  s.append(p);
  return s;
}

/* ---------- Formatação ---------- */
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
export const fmtNum = (n) => (n < 1000 ? String(n) : compact.format(n));
export const fmtDate = (ts) => new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
export const fmtCoins = (n) => `${n.toLocaleString('pt-BR')}`;
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/* ---------- Identidade: avatar, tag, emblema e selo (visualmente distintos) ---------- */
export function Avatar(u, size = 2.6) {
  const n = el('span', { class: 'avatar', style: { '--s': `${size}rem` } });
  if (u.avatar_url) n.append(el('img', { src: u.avatar_url, alt: '', loading: 'lazy' }));
  else {
    n.textContent = (u.display_name || u.username || '?').trim().charAt(0).toUpperCase();
    n.style.background = `hsl(${hash(u.username) % 360} 55% 36%)`;
  }
  return n;
}
/** Selo OFICIAL de verificação (aprovado pela administração). */
export const Seal = () => el('span', { class: 'seal', title: 'Conta verificada oficialmente pelo GiriHub', role: 'img', 'aria-label': 'Conta verificada oficialmente' }, icon('check', { size: '0.7rem' }));
/** Tag de identificação (escolhida pelo usuário): pílula de texto. */
export const Tag = (t) => el('span', { class: 'tag' }, t.name);
/** Emblema (conquistado ou comprado): ícone redondo. */
export const BadgeIcon = (b) => el('span', { class: 'badge-ico', title: `${b.name}${b.description ? ' — ' + b.description : ''}`, role: 'img', 'aria-label': `Emblema: ${b.name}` }, b.icon);
export const NameLine = (u) => el('span', { class: 'name-line' }, el('span', { class: 'name' }, u.display_name), u.verified && Seal());
export const Coins = (n) => el('span', { class: 'coins' }, icon('coin', { size: '1em' }), fmtCoins(n));

/** Explica a diferença entre tag, emblema e verificação oficial. */
export function explainIdentity() {
  modal('Tags, emblemas e verificação', el('div', { class: 'stack' },
    el('p', {}, el('span', { class: 'tag' }, 'Tag'), ' descreve quem a pessoa é (ex.: Gamer, Empresa). Cada usuário escolhe as suas — não é uma garantia de nada.'),
    el('p', {}, BadgeIcon({ name: 'Emblema', icon: '🏅', description: '' }), ' é conquistado por atividades ou comprado com GiriCoins. É um item de coleção.'),
    el('p', {}, Seal(), ' é a verificação OFICIAL: só a administração concede, depois de analisar o pedido. É o único sinal de autenticidade.'),
  ));
}

/* ---------- Feedback ---------- */
export function toast(msg, kind = 'info') {
  const host = document.getElementById('toasts');
  const t = el('div', { class: `toast ${kind}`, role: 'status' }, msg);
  host.append(t);
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}
/** Para botões cujo recurso ainda não existe: sempre avisa, nunca fica mudo. */
export const devNotice = (what) => toast(`${what}: em desenvolvimento`, 'info');

export const spinner = () => el('div', { class: 'spinner', role: 'status', 'aria-label': 'Carregando' });
export const empty = (msg, action) => el('div', { class: 'empty' }, el('p', {}, msg), action);

export function modal(title, content, { sheet = false, onClose } = {}) {
  const prev = document.activeElement;
  const close = () => {
    back.remove();
    onClose?.();
    if (prev?.isConnected) prev.focus?.();
  };
  const back = el('div', { class: 'modal-back', onclick: (e) => e.target === back && close() });
  const box = el('div', { class: `modal${sheet ? ' sheet' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el('header', {}, el('h3', {}, title), el('button', { class: 'icon-btn', 'aria-label': 'Fechar', onclick: close }, icon('close'))),
    el('div', { class: 'modal-body' }, content));
  back.append(box);
  document.body.append(back);
  box.querySelector('input,textarea,select,button.btn')?.focus({ preventScroll: true });
  return { close, node: box };
}
export const closeTopModal = () => {
  const m = [...document.querySelectorAll('.modal-back')].pop();
  m?.querySelector('header button')?.click();
  return !!m;
};

export const confirmDialog = (msg, okLabel = 'Confirmar') =>
  new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); m.close(); };
    const m = modal('Confirmar', el('div', { class: 'stack' }, el('p', {}, msg),
      el('div', { class: 'row end' }, el('button', { class: 'btn ghost', onclick: () => finish(false) }, 'Cancelar'), el('button', { class: 'btn', onclick: () => finish(true) }, okLabel))), { onClose: () => finish(false) });
  });

/* ---------- Formulários ---------- */
export const input = (props = {}) => el('input', { class: 'input', ...props });
export const field = (label, control, hint) => el('label', { class: 'field' }, el('span', {}, label), control, hint && el('small', {}, hint));
export const button = (label, { onclick, variant = '', type = 'button', ico } = {}) => el('button', { class: `btn ${variant}`.trim(), type, onclick }, ico && icon(ico, { size: '1.1rem' }), label);

/** Executa fn desabilitando o botão e mostrando erros como toast. */
export async function busy(btn, fn) {
  btn.disabled = true;
  try { return await fn(); } catch (e) { toast(e.message, 'error'); } finally { btn.disabled = false; }
}
