import { el, field, input, toast, busy, confirmDialog, fmtDate, spinner, empty, modal } from '../ui.js';
import { get, post, patch, put, del } from '../api.js';
import { hasPerm, state } from '../state.js';

/* Seções do painel. Cada uma exige uma permissão; o servidor valida de novo em cada chamada. */
const SECTIONS = [
  { id: 'overview', label: 'Resumo', perm: 'stats.view', view: overview },
  { id: 'users', label: 'Usuários', perm: 'users.view', view: users },
  { id: 'videos', label: 'Vídeos', perm: 'videos.manage', view: videos },
  { id: 'verifications', label: 'Verificações', perm: 'verification.manage', view: verifications },
  { id: 'wallet', label: 'Carteira', perm: 'wallet.view', view: walletView },
  { id: 'rewards', label: 'Recompensas', perm: 'settings.manage', view: rewards },
  { id: 'cat:products', label: 'Produtos', perm: 'catalog.manage', view: catalog },
  { id: 'cat:shop_categories', label: 'Categorias da loja', perm: 'catalog.manage', view: catalog },
  { id: 'cat:categories', label: 'Categorias de vídeo', perm: 'catalog.manage', view: catalog },
  { id: 'cat:tags', label: 'Tags', perm: 'catalog.manage', view: catalog },
  { id: 'cat:badges', label: 'Emblemas', perm: 'catalog.manage', view: catalog },
];

const table = (cols, rows) => el('div', { class: 'table-wrap' }, el('table', { class: 'table' },
  el('thead', {}, el('tr', {}, cols.map((c) => el('th', {}, c)))),
  el('tbody', {}, rows.length ? rows : el('tr', {}, el('td', { colspan: cols.length, class: 'muted' }, 'Nada por aqui.')))));
const td = (...c) => el('td', {}, ...c);
const small = (label, fn, variant = 'ghost') => el('button', { class: `btn small ${variant}`, onclick: fn }, label);

export async function render({ params }) {
  const allowed = SECTIONS.filter((s) => hasPerm(s.perm));
  const sec = allowed.find((s) => s.id === params.section) || allowed[0];
  if (!sec) return empty('Sem permissões administrativas.');
  const body = el('div', { class: 'admin-body' }, spinner());
  (async () => {
    try { body.replaceChildren(await sec.view(sec.id.split(':')[1])); } catch (e) { body.replaceChildren(empty(e.message)); }
  })();
  return el('div', { class: 'page admin' },
    el('h1', {}, 'Administração'),
    el('nav', { class: 'chips scroll', 'aria-label': 'Seções do painel' }, allowed.map((s) => el('a', { class: `chip${s === sec ? ' on' : ''}`, href: `#/admin/${s.id}` }, s.label))),
    body);
}

async function overview() {
  const s = await get('/admin/stats');
  const cards = [['Usuários', s.users], ['Vídeos', s.videos], ['Comentários', s.comments], ['GiriCoins em circulação', s.coins_in_circulation], ['Transações', s.transactions], ['Verificações pendentes', s.pending_verifications]];
  return el('div', { class: 'stat-cards' }, cards.map(([l, n]) => el('div', { class: 'card' }, el('b', {}, Number(n).toLocaleString('pt-BR')), el('span', { class: 'muted' }, l))));
}

async function users() {
  const holder = el('div', { class: 'stack' });
  const q = input({ type: 'search', placeholder: 'Buscar por @usuário, nome ou e-mail', onkeydown: (e) => e.key === 'Enter' && load() });
  async function load() {
    const d = await get(`/admin/users?q=${encodeURIComponent(q.value)}`);
    const canManage = hasPerm('users.manage');
    const act = (u, body, label) => small(label, async () => {
      if (!(await confirmDialog(`${label} @${u.username}?`))) return;
      try { await patch(`/admin/users/${u.id}`, body); toast('Atualizado', 'ok'); load(); } catch (e) { toast(e.message, 'error'); }
    });
    holder.replaceChildren(table(['Usuário', 'E-mail', 'Papel', 'Saldo', 'Status', 'Ações'], d.items.map((u) => el('tr', {},
      td(el('a', { href: `#/u/${u.username}` }, `@${u.username}`)), td(u.email), td(u.role), td(u.balance.toLocaleString('pt-BR')),
      td([u.verified && 'verificado', u.banned && 'suspenso'].filter(Boolean).join(', ') || 'ativo'),
      td(canManage && el('div', { class: 'row wrap' },
        u.id !== state.user.id && act(u, { banned: !u.banned }, u.banned ? 'Reativar' : 'Suspender'),
        act(u, { verified: !u.verified }, u.verified ? 'Remover selo' : 'Dar selo'),
        u.id !== state.user.id && el('select', { class: 'input small', 'aria-label': `Papel de @${u.username}`, onchange: async (e) => {
          try { await patch(`/admin/users/${u.id}`, { role: e.target.value }); toast('Papel atualizado', 'ok'); } catch (x) { toast(x.message, 'error'); load(); }
        } }, ['user', 'moderator', 'admin'].map((r) => el('option', { value: r, selected: r === u.role || null }, r))),
        el('button', { class: 'btn small ghost', onclick: () => userBadges(u) }, 'Emblemas')))))));
  }
  await load();
  return el('div', { class: 'stack' }, el('div', { class: 'row' }, q, small('Buscar', load, '')), holder);
}

async function userBadges(u) {
  const [{ items: cur }, { items: all }] = await Promise.all([get(`/admin/users/${u.id}/badges`), get('/admin/catalog/badges')]);
  const m = modal(`Emblemas de @${u.username}`, null);
  const body = m.node.querySelector('.modal-body');
  const have = new Set(cur.map((b) => b.id));
  body.append(el('div', { class: 'stack' }, all.map((b) => {
    const on = have.has(b.id);
    return el('div', { class: 'row between' }, el('span', {}, `${b.icon} ${b.name}`),
      small(on ? 'Remover' : 'Conceder', async function () {
        try {
          if (on) await del(`/admin/users/${u.id}/badges/${b.id}`); else await post(`/admin/users/${u.id}/badges`, { badge_id: b.id });
          m.close(); toast('Emblemas atualizados', 'ok');
        } catch (e) { toast(e.message, 'error'); }
      }, on ? 'ghost' : ''));
  })));
}

async function videos() {
  const d = await get('/admin/videos');
  const canRemove = true;
  const rows = d.items.map((v) => {
    const tr = el('tr', {}, td(el('a', { href: `#/v/${v.id}` }, `#${v.id}`)), td(`@${v.username}`), td(v.caption.slice(0, 50) || '—'), td(v.views, ' vis.'), td(v.status),
      td(el('div', { class: 'row wrap' },
        small(v.status === 'published' ? 'Ocultar' : 'Publicar', async () => { try { await patch(`/admin/videos/${v.id}`, { status: v.status === 'published' ? 'hidden' : 'published' }); location.reload(); } catch (e) { toast(e.message, 'error'); } }),
        small('Excluir', async () => { if (await confirmDialog('Excluir este vídeo definitivamente?', 'Excluir')) try { await del(`/videos/${v.id}`); tr.remove(); } catch (e) { toast(e.message, 'error'); } }))));
    return tr;
  });
  return table(['Vídeo', 'Autor', 'Legenda', 'Views', 'Status', 'Ações'], rows);
}

async function verifications() {
  const holder = el('div', { class: 'stack' });
  async function load(status) {
    const d = await get(`/admin/verifications?status=${status}`);
    holder.replaceChildren(el('div', { class: 'chips' }, ['pending', 'approved', 'rejected'].map((s) => el('button', { class: `chip${s === status ? ' on' : ''}`, onclick: () => load(s) }, { pending: 'Pendentes', approved: 'Aprovados', rejected: 'Recusados' }[s]))),
      d.items.length ? d.items.map((q) => el('div', { class: 'card stack' },
        el('div', { class: 'row between' }, el('a', { href: `#/u/${q.username}` }, el('b', {}, q.display_name), ` @${q.username}`), el('small', { class: 'muted' }, fmtDate(q.created_at))),
        el('p', {}, q.message), q.note && el('small', { class: 'muted' }, `Nota: ${q.note}`),
        status === 'pending' && el('div', { class: 'row' }, ...['approve', 'reject'].map((a) => el('button', { class: `btn small${a === 'reject' ? ' ghost' : ''}`, onclick: async () => {
          const note = a === 'reject' ? prompt('Motivo (opcional, o usuário verá):') ?? null : '';
          if (note === null) return;
          try { await post(`/admin/verifications/${q.id}`, { action: a, note }); toast('Decisão registrada', 'ok'); load('pending'); } catch (e) { toast(e.message, 'error'); }
        } }, a === 'approve' ? 'Aprovar' : 'Recusar'))))) : empty('Nenhum pedido nesta lista.'));
  }
  await load('pending');
  return holder;
}

async function walletView() {
  const holder = el('div', { class: 'stack' });
  const q = input({ placeholder: 'Filtrar por @usuário', onkeydown: (e) => e.key === 'Enter' && load() });
  async function load() {
    const d = await get(`/admin/wallet?user=${encodeURIComponent(q.value)}`);
    holder.replaceChildren(d.balance != null && el('p', {}, 'Saldo atual: ', el('b', {}, d.balance.toLocaleString('pt-BR'))),
      table(['Quando', 'Usuário', 'Tipo', 'Valor', 'Saldo após', 'Descrição'], d.items.map((t) => el('tr', {}, td(fmtDate(t.created_at)), td(`@${t.username}`), td(t.type), td(el('span', { class: t.amount > 0 ? 'plus' : 'minus' }, (t.amount > 0 ? '+' : '') + t.amount)), td(t.balance_after), td(t.description)))),
      el('small', { class: 'muted' }, 'Somente consulta: o livro-razão não pode ser editado, garantindo rastreabilidade.'));
  }
  await load();
  return el('div', { class: 'stack' }, el('div', { class: 'row' }, q, small('Filtrar', load, '')), holder);
}

async function rewards() {
  const { items } = await get('/admin/settings');
  const save = el('button', { class: 'btn', type: 'submit' }, 'Salvar regras');
  const form = el('form', { class: 'card stack', onsubmit: (e) => {
    e.preventDefault();
    const body = {};
    items.forEach((s) => { const i = form.elements[s.key]; body[s.key] = s.type === 'bool' ? i.checked : Number(i.value); });
    busy(save, async () => { await put('/admin/settings', body); toast('Regras salvas', 'ok'); });
  } }, el('p', { class: 'muted' }, 'Valem imediatamente. O tempo assistido é medido no servidor.'),
  items.map((s) => s.type === 'bool'
    ? el('label', { class: 'chip-check' }, el('input', { type: 'checkbox', name: s.key, checked: s.value ? true : null }), el('span', {}, s.label))
    : field(s.label, input({ name: s.key, type: 'number', value: s.value, min: s.min, max: s.max, required: true }))),
  save);
  return form;
}

/* CRUD genérico: campos, tipos e opções vêm de GET /api/admin/schema */
async function catalog(name) {
  const [{ catalogs }, { items }] = await Promise.all([get('/admin/schema'), get(`/admin/catalog/${name}`)]);
  const def = catalogs[name];
  const show = def.fields.filter((f) => f.type !== 'str' || f.name === 'name' || f.name === 'slug').slice(0, 5);
  const fmt = (f, row) => {
    const v = row[f.name];
    if (f.type === 'bool') return v ? 'sim' : 'não';
    if (f.type === 'ref') return f.options.find((o) => o.value === v)?.label ?? '—';
    if (f.type === 'enum') return f.options.find((o) => o.value === v)?.label ?? v;
    return v ?? '';
  };

  function edit(row) {
    const m = modal(row ? 'Editar' : 'Novo registro', null);
    const controls = def.fields.map((f) => {
      const val = row ? row[f.name] : f.default;
      let c;
      if (f.type === 'bool') c = el('input', { type: 'checkbox', name: f.name, checked: val ? true : null });
      else if (f.type === 'enum' || f.type === 'ref') c = el('select', { class: 'input', name: f.name }, f.type === 'ref' && !f.required && el('option', { value: '' }, '— nenhum —'), f.options.map((o) => el('option', { value: o.value, selected: String(o.value) === String(val) || null }, o.label)));
      else c = input({ name: f.name, type: f.type === 'int' ? 'number' : 'text', value: val ?? '', maxlength: f.max, min: f.min, max: f.max, required: f.required || null });
      return f.type === 'bool' ? el('label', { class: 'chip-check' }, c, el('span', {}, f.label)) : field(f.label, c);
    });
    const save = el('button', { class: 'btn', type: 'submit' }, 'Salvar');
    const form = el('form', { class: 'stack', onsubmit: (e) => {
      e.preventDefault();
      const body = {};
      def.fields.forEach((f) => { const i = form.elements[f.name]; body[f.name] = f.type === 'bool' ? i.checked : f.type === 'int' ? Number(i.value) : f.type === 'ref' ? (i.value === '' ? null : Number(i.value)) : i.value; });
      busy(save, async () => {
        if (row) await patch(`/admin/catalog/${name}/${row.id}`, body); else await post(`/admin/catalog/${name}`, body);
        m.close(); toast('Salvo', 'ok'); location.reload();
      });
    } }, controls, save);
    m.node.querySelector('.modal-body').append(form);
  }

  const rows = items.map((row) => el('tr', {}, show.map((f) => td(String(fmt(f, row)))), td(el('div', { class: 'row wrap' },
    small('Editar', () => edit(row)),
    small('Excluir', async () => {
      if (!(await confirmDialog('Excluir este registro? Se estiver em uso, desative-o em vez de excluir.', 'Excluir'))) return;
      try { await del(`/admin/catalog/${name}/${row.id}`); toast('Excluído', 'ok'); location.reload(); } catch (e) { toast(e.message, 'error'); }
    })))));
  return el('div', { class: 'stack' }, el('div', { class: 'row between' }, el('h2', {}, def.label), el('button', { class: 'btn small', onclick: () => edit(null) }, '+ Novo')),
    table([...show.map((f) => f.label), 'Ações'], rows));
}
