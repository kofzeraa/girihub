import { all, get, run, tx } from '../core/db.js';
import { HttpError } from '../core/http.js';
import { v, page } from '../core/validate.js';
import { getSettings, setSetting } from '../core/misc.js';

const PAGE = 25;

/* Catálogos administráveis (CRUD genérico). O schema também é enviado ao frontend, que monta as telas sozinho. */
const yes = { name: 'active', label: 'Ativo', type: 'bool', default: 1 };
const CATALOG = {
  categories: { label: 'Categorias de vídeo', fields: [{ name: 'name', label: 'Nome', type: 'str', max: 40, required: true }, yes] },
  tags: { label: 'Tags', fields: [{ name: 'name', label: 'Nome', type: 'str', max: 40, required: true }, yes] },
  badges: {
    label: 'Emblemas',
    fields: [
      { name: 'name', label: 'Nome', type: 'str', max: 40, required: true },
      { name: 'icon', label: 'Ícone (emoji)', type: 'str', max: 8, required: true },
      { name: 'description', label: 'Descrição', type: 'str', max: 200 },
      { name: 'source', label: 'Como obter', type: 'enum', required: true, options: [{ value: 'achievable', label: 'Conquistável' }, { value: 'purchasable', label: 'Comprável' }, { value: 'admin', label: 'Concedido pela administração' }] },
      yes,
    ],
  },
  shop_categories: {
    label: 'Categorias da loja',
    order: 'sort, id',
    fields: [
      { name: 'name', label: 'Nome', type: 'str', max: 40, required: true },
      { name: 'slug', label: 'Slug (a-z, 0-9, -)', type: 'str', max: 40, required: true, pattern: /^[a-z0-9-]+$/ },
      { name: 'icon', label: 'Ícone (emoji)', type: 'str', max: 8 },
      { name: 'sort', label: 'Ordem', type: 'int', min: 0, max: 9999, default: 0 },
      yes,
    ],
  },
  products: {
    label: 'Produtos da loja',
    fields: [
      { name: 'name', label: 'Nome', type: 'str', max: 80, required: true },
      { name: 'category_id', label: 'Categoria', type: 'ref', ref: 'shop_categories', required: true },
      { name: 'price', label: 'Preço (GiriCoins)', type: 'int', min: 0, max: 10_000_000, required: true },
      { name: 'description', label: 'Descrição', type: 'str', max: 300 },
      { name: 'image_url', label: 'Imagem (URL)', type: 'url' },
      { name: 'badge_id', label: 'Emblema concedido (opcional)', type: 'ref', ref: 'badges' },
      { name: 'is_demo', label: 'Demonstrativo', type: 'bool', default: 0 },
      yes,
    ],
  },
};

function coerce(f, val) {
  switch (f.type) {
    case 'str': {
      const s = v.str(val ?? '', f.label, { min: f.required ? 1 : 0, max: f.max || 200 });
      if (f.pattern && !f.pattern.test(s)) throw new HttpError(400, `${f.label} inválido`);
      return s;
    }
    case 'int': return v.int(val, f.label, { min: f.min, max: f.max });
    case 'bool': return val ? 1 : 0;
    case 'enum': return v.oneOf(val, f.label, f.options.map((o) => o.value));
    case 'url': return v.url(val ?? '', f.label, { allowEmpty: true });
    case 'ref':
      if (val == null || val === '') {
        if (f.required) throw new HttpError(400, `${f.label} é obrigatório`);
        return null;
      }
      return v.int(val, f.label, { min: 1 });
  }
}

const entry = (ctx) => {
  const e = CATALOG[ctx.params.name];
  if (!e) throw new HttpError(404, 'Catálogo inexistente');
  return { table: ctx.params.name, ...e };
};

const SETTINGS = [
  { key: 'reward.enabled', label: 'Recompensas por visualização ativas', type: 'bool' },
  { key: 'reward.watch_seconds', label: 'Segundos assistidos para ganhar', type: 'int', min: 3, max: 300 },
  { key: 'reward.coins_per_view', label: 'GiriCoins por vídeo assistido', type: 'int', min: 0, max: 1000 },
  { key: 'reward.daily_cap', label: 'Limite diário de ganhos por usuário (GiriCoins)', type: 'int', min: 0, max: 100000 },
];

export function register(r) {
  r.get('/api/admin/stats', { perm: 'stats.view', desc: 'Resumo geral da plataforma.' }, () =>
    get(`SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM videos) AS videos, (SELECT COUNT(*) FROM comments) AS comments,
                (SELECT COALESCE(SUM(balance),0) FROM users) AS coins_in_circulation, (SELECT COUNT(*) FROM wallet_tx) AS transactions,
                (SELECT COUNT(*) FROM verification_requests WHERE status='pending') AS pending_verifications`),
  );

  /* ----- Usuários ----- */
  r.get('/api/admin/users', { perm: 'users.view', desc: 'Lista usuários (?q=busca &page=0).' }, (ctx) => {
    const q = `%${String(ctx.query.q || '').trim().replace(/[%_]/g, '')}%`;
    const rows = all(
      `SELECT id, username, email, display_name, role, verified, banned, balance, created_at FROM users
       WHERE username LIKE ? OR email LIKE ? OR display_name LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?`,
      q, q, q, PAGE + 1, page(ctx.query.page) * PAGE,
    );
    return { items: rows.slice(0, PAGE), has_more: rows.length > PAGE };
  });

  r.patch('/api/admin/users/:id', { perm: 'users.manage', desc: 'Altera role (user|moderator|admin), banned e verified.' }, async (ctx) => {
    const id = v.int(ctx.params.id, 'ID');
    const b = await ctx.body();
    if (id === ctx.user.id && (b.role !== undefined || b.banned !== undefined)) throw new HttpError(400, 'Você não pode alterar seu próprio papel ou suspensão');
    const sets = [], vals = [];
    if (b.role !== undefined) (sets.push('role=?'), vals.push(v.oneOf(b.role, 'Papel', ['user', 'moderator', 'admin'])));
    if (b.banned !== undefined) (sets.push('banned=?'), vals.push(b.banned ? 1 : 0));
    if (b.verified !== undefined) (sets.push('verified=?'), vals.push(b.verified ? 1 : 0));
    if (!sets.length) throw new HttpError(400, 'Nada para alterar');
    tx(() => {
      if (run(`UPDATE users SET ${sets.join(',')} WHERE id=?`, ...vals, id).changes === 0) throw new HttpError(404, 'Usuário não encontrado');
      if (b.banned) run('DELETE FROM sessions WHERE user_id=?', id);
    });
    return { ok: true };
  });

  r.get('/api/admin/users/:id/badges', { perm: 'catalog.manage', desc: 'Emblemas de um usuário.' }, (ctx) => ({
    items: all('SELECT b.id, b.name, b.icon FROM user_badges ub JOIN badges b ON b.id=ub.badge_id WHERE ub.user_id=?', v.int(ctx.params.id, 'ID')),
  }));
  r.post('/api/admin/users/:id/badges', { perm: 'catalog.manage', desc: 'Concede emblema {badge_id}.' }, async (ctx) => {
    run('INSERT OR IGNORE INTO user_badges VALUES(?,?,?)', v.int(ctx.params.id, 'ID'), v.int((await ctx.body()).badge_id, 'Emblema'), Date.now());
    return { ok: true };
  });
  r.delete('/api/admin/users/:id/badges/:badgeId', { perm: 'catalog.manage', desc: 'Remove emblema do usuário.' }, (ctx) => {
    run('DELETE FROM user_badges WHERE user_id=? AND badge_id=?', v.int(ctx.params.id, 'ID'), v.int(ctx.params.badgeId, 'Emblema'));
    return { ok: true };
  });

  /* ----- Vídeos (moderação) ----- */
  r.get('/api/admin/videos', { perm: 'videos.manage', desc: 'Lista vídeos para moderação (?status=published|hidden &page=0). Para remover use DELETE /api/videos/:id.' }, (ctx) => {
    const st = ctx.query.status ? v.oneOf(ctx.query.status, 'Status', ['published', 'hidden']) : null;
    const rows = all(
      `SELECT v.id, v.video_url, v.caption, v.status, v.views, v.likes_count, v.comments_count, v.created_at, u.username
       FROM videos v JOIN users u ON u.id=v.user_id WHERE (? IS NULL OR v.status=?) ORDER BY v.id DESC LIMIT ? OFFSET ?`,
      st, st, PAGE + 1, page(ctx.query.page) * PAGE,
    );
    return { items: rows.slice(0, PAGE), has_more: rows.length > PAGE };
  });
  r.patch('/api/admin/videos/:id', { perm: 'videos.manage', desc: 'Oculta ou republica vídeo {status}.' }, async (ctx) => {
    const st = v.oneOf((await ctx.body()).status, 'Status', ['published', 'hidden']);
    if (run('UPDATE videos SET status=? WHERE id=?', st, v.int(ctx.params.id, 'ID')).changes === 0) throw new HttpError(404, 'Vídeo não encontrado');
    return { ok: true };
  });

  /* ----- Verificação oficial ----- */
  r.get('/api/admin/verifications', { perm: 'verification.manage', desc: 'Pedidos de verificação (?status=pending|approved|rejected).' }, (ctx) => {
    const st = v.oneOf(ctx.query.status || 'pending', 'Status', ['pending', 'approved', 'rejected']);
    return {
      items: all(
        `SELECT q.id, q.message, q.status, q.note, q.created_at, u.id AS user_id, u.username, u.display_name FROM verification_requests q
         JOIN users u ON u.id=q.user_id WHERE q.status=? ORDER BY q.id DESC LIMIT 100`,
        st,
      ),
    };
  });
  r.post('/api/admin/verifications/:id', { perm: 'verification.manage', desc: 'Decide pedido {action: approve|reject, note?}. Aprovar marca a conta como verificada.' }, async (ctx) => {
    const b = await ctx.body();
    const action = v.oneOf(b.action, 'Ação', ['approve', 'reject']);
    const note = v.str(b.note ?? '', 'Nota', { max: 300 });
    tx(() => {
      const q = get("SELECT * FROM verification_requests WHERE id=? AND status='pending'", v.int(ctx.params.id, 'ID'));
      if (!q) throw new HttpError(404, 'Pedido não encontrado ou já decidido');
      run('UPDATE verification_requests SET status=?, note=?, reviewed_at=?, reviewed_by=? WHERE id=?', action === 'approve' ? 'approved' : 'rejected', note, Date.now(), ctx.user.id, q.id);
      if (action === 'approve') run('UPDATE users SET verified=1 WHERE id=?', q.user_id);
    });
    return { ok: true };
  });

  /* ----- Carteira / transações (somente consulta) ----- */
  r.get('/api/admin/wallet', { perm: 'wallet.view', desc: 'Transações de todos os usuários (?user=@usuario &page=0). Somente leitura.' }, (ctx) => {
    const uname = ctx.query.user ? String(ctx.query.user).replace(/^@/, '').toLowerCase() : null;
    const rows = all(
      `SELECT t.id, t.amount, t.balance_after, t.type, t.description, t.created_at, u.username FROM wallet_tx t JOIN users u ON u.id=t.user_id
       WHERE (? IS NULL OR u.username=?) ORDER BY t.id DESC LIMIT ? OFFSET ?`,
      uname, uname, PAGE + 1, page(ctx.query.page) * PAGE,
    );
    return { items: rows.slice(0, PAGE), has_more: rows.length > PAGE, balance: uname ? get('SELECT balance FROM users WHERE username=?', uname)?.balance ?? null : null };
  });

  /* ----- Regras de recompensa ----- */
  r.get('/api/admin/settings', { perm: 'settings.manage', desc: 'Regras de recompensa por visualização.' }, () => {
    const s = getSettings();
    return { items: SETTINGS.map((d) => ({ ...d, value: Number(s[d.key]) })) };
  });
  r.put('/api/admin/settings', { perm: 'settings.manage', desc: 'Atualiza regras {"reward.daily_cap": 50, ...}.' }, async (ctx) => {
    const b = await ctx.body();
    const clean = SETTINGS.filter((d) => b[d.key] !== undefined).map((d) => [d.key, d.type === 'bool' ? (b[d.key] ? 1 : 0) : v.int(b[d.key], d.label, { min: d.min, max: d.max })]);
    tx(() => clean.forEach(([k, val]) => setSetting(k, val)));
    return { ok: true };
  });

  /* ----- CRUD genérico dos catálogos ----- */
  r.get('/api/admin/schema', { perm: 'catalog.manage', desc: 'Descrição dos catálogos administráveis (campos, tipos, opções).' }, () => ({
    catalogs: Object.fromEntries(
      Object.entries(CATALOG).map(([name, e]) => [
        name,
        {
          label: e.label,
          fields: e.fields.map(({ pattern, ...f }) =>
            f.type === 'ref' ? { ...f, options: all(`SELECT id AS value, name AS label FROM ${f.ref} ORDER BY name`) } : f),
        },
      ]),
    ),
  }));

  r.get('/api/admin/catalog/:name', { perm: 'catalog.manage', desc: 'Lista registros do catálogo (categories, tags, badges, shop_categories, products).' }, (ctx) => {
    const e = entry(ctx);
    return { items: all(`SELECT * FROM ${e.table} ORDER BY ${e.order || 'id DESC'} LIMIT 500`) };
  });

  r.post('/api/admin/catalog/:name', { perm: 'catalog.manage', desc: 'Cria registro do catálogo.' }, async (ctx) => {
    const e = entry(ctx), b = await ctx.body();
    const cols = [], vals = [];
    for (const f of e.fields) {
      let val = b[f.name];
      if (val === undefined) {
        if (f.default !== undefined) val = f.default;
        else if (f.required) throw new HttpError(400, `${f.label} é obrigatório`);
        else continue;
      }
      cols.push(f.name);
      vals.push(coerce(f, val));
    }
    const id = Number(run(`INSERT INTO ${e.table}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`, ...vals).lastInsertRowid);
    return { id };
  });

  r.patch('/api/admin/catalog/:name/:id', { perm: 'catalog.manage', desc: 'Altera campos do registro.' }, async (ctx) => {
    const e = entry(ctx), b = await ctx.body();
    const fields = e.fields.filter((f) => b[f.name] !== undefined);
    if (!fields.length) throw new HttpError(400, 'Nada para alterar');
    const res = run(`UPDATE ${e.table} SET ${fields.map((f) => `${f.name}=?`).join(',')} WHERE id=?`, ...fields.map((f) => coerce(f, b[f.name])), v.int(ctx.params.id, 'ID'));
    if (!res.changes) throw new HttpError(404, 'Registro não encontrado');
    return { ok: true };
  });

  r.delete('/api/admin/catalog/:name/:id', { perm: 'catalog.manage', desc: 'Exclui registro (se estiver em uso, desative em vez de excluir).' }, (ctx) => {
    const e = entry(ctx);
    if (!run(`DELETE FROM ${e.table} WHERE id=?`, v.int(ctx.params.id, 'ID')).changes) throw new HttpError(404, 'Registro não encontrado');
    return { ok: true };
  });
}
