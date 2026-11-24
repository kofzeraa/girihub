import { all, get, run, tx } from '../core/db.js';
import { HttpError } from '../core/http.js';
import { v, page } from '../core/validate.js';
import { hooks, limit } from '../core/misc.js';
import { badgesFor, publicUser, selfUser, tagsFor } from '../services/users.js';

const PAGE = 30;

const findUser = (username) => {
  const u = get('SELECT * FROM users WHERE username=? AND banned=0', String(username).toLowerCase());
  if (!u) throw new HttpError(404, 'Perfil não encontrado');
  return u;
};
const followersCount = (id) => get('SELECT COUNT(*) AS n FROM follows WHERE followee_id=?', id).n;

export function register(r) {
  r.get('/api/tags', { desc: 'Tags de identificação disponíveis (Criador de conteúdo, Gamer, ...).' }, () => ({
    items: all('SELECT id, name FROM tags WHERE active=1 ORDER BY name'),
  }));

  r.get('/api/users/:username', { auth: 'optional', desc: 'Perfil público: dados, tags, emblemas, estatísticas e relação com o usuário logado.' }, (ctx) => {
    const u = findUser(ctx.params.username);
    const s = get(
      `SELECT (SELECT COUNT(*) FROM follows WHERE followee_id=?) AS followers,
              (SELECT COUNT(*) FROM follows WHERE follower_id=?) AS following,
              (SELECT COUNT(*) FROM videos WHERE user_id=? AND status='published') AS videos,
              (SELECT COALESCE(SUM(likes_count),0) FROM videos WHERE user_id=? AND status='published') AS likes`,
      u.id, u.id, u.id, u.id,
    );
    const me = ctx.user?.id;
    return {
      user: { ...publicUser(u), bio: u.bio, cover_url: u.cover_url, created_at: u.created_at },
      tags: tagsFor(u.id),
      badges: badgesFor(u.id),
      stats: s,
      is_me: me === u.id,
      is_following: !!me && !!get('SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?', me, u.id),
    };
  });

  const list = (col, other) => (ctx) => {
    const u = findUser(ctx.params.username);
    const rows = all(
      `SELECT u.* FROM follows f JOIN users u ON u.id=f.${other} WHERE f.${col}=? AND u.banned=0 ORDER BY f.created_at DESC LIMIT ? OFFSET ?`,
      u.id, PAGE + 1, page(ctx.query.page) * PAGE,
    );
    return { items: rows.slice(0, PAGE).map(publicUser), has_more: rows.length > PAGE };
  };
  r.get('/api/users/:username/followers', { desc: 'Lista de seguidores (paginada: ?page=0).' }, list('followee_id', 'follower_id'));
  r.get('/api/users/:username/following', { desc: 'Lista de quem o usuário segue (paginada).' }, list('follower_id', 'followee_id'));

  r.post('/api/users/:username/follow', { auth: true, desc: 'Seguir usuário.' }, (ctx) => {
    const t = findUser(ctx.params.username);
    if (t.id === ctx.user.id) throw new HttpError(400, 'Você não pode seguir a si mesmo');
    limit(`follow:${ctx.user.id}`, 60, 3600e3);
    const added = run('INSERT OR IGNORE INTO follows VALUES(?,?,?)', ctx.user.id, t.id, Date.now()).changes > 0;
    if (added) hooks.emit('user.followed', { followerId: ctx.user.id, followeeId: t.id });
    return { following: true, followers: followersCount(t.id) };
  });

  r.delete('/api/users/:username/follow', { auth: true, desc: 'Deixar de seguir.' }, (ctx) => {
    const t = findUser(ctx.params.username);
    run('DELETE FROM follows WHERE follower_id=? AND followee_id=?', ctx.user.id, t.id);
    return { following: false, followers: followersCount(t.id) };
  });

  r.patch('/api/me', { auth: true, desc: 'Edita o próprio perfil: display_name, bio, avatar_url, cover_url, tag_ids (máx. 3).' }, async (ctx) => {
    const b = await ctx.body();
    const sets = [], vals = [];
    const put = (col, val) => (sets.push(`${col}=?`), vals.push(val));
    if (b.display_name !== undefined) put('display_name', v.str(b.display_name, 'Nome', { min: 1, max: 40 }));
    if (b.bio !== undefined) put('bio', v.str(b.bio, 'Bio', { max: 300 }));
    if (b.avatar_url !== undefined) put('avatar_url', v.url(b.avatar_url, 'Foto', { allowEmpty: true }));
    if (b.cover_url !== undefined) put('cover_url', v.url(b.cover_url, 'Capa', { allowEmpty: true }));
    tx(() => {
      if (sets.length) run(`UPDATE users SET ${sets.join(',')} WHERE id=?`, ...vals, ctx.user.id);
      if (b.tag_ids !== undefined) {
        if (!Array.isArray(b.tag_ids) || b.tag_ids.length > 3) throw new HttpError(400, 'Escolha até 3 tags');
        const ids = [...new Set(b.tag_ids.map((x) => v.int(x, 'Tag')))];
        for (const id of ids) if (!get('SELECT 1 FROM tags WHERE id=? AND active=1', id)) throw new HttpError(400, 'Tag inválida');
        run('DELETE FROM user_tags WHERE user_id=?', ctx.user.id);
        for (const id of ids) run('INSERT INTO user_tags VALUES(?,?)', ctx.user.id, id);
      }
    });
    return { user: selfUser(get('SELECT * FROM users WHERE id=?', ctx.user.id)), tags: tagsFor(ctx.user.id) };
  });

  r.get('/api/me/tags', { auth: true, desc: 'Tags escolhidas pelo usuário logado.' }, (ctx) => ({ items: tagsFor(ctx.user.id) }));

  r.get('/api/me/verification', { auth: true, desc: 'Último pedido de verificação oficial do usuário logado.' }, (ctx) => ({
    request: get('SELECT id,status,note,created_at,reviewed_at FROM verification_requests WHERE user_id=? ORDER BY id DESC LIMIT 1', ctx.user.id) || null,
  }));

  r.post('/api/me/verification', { auth: true, desc: 'Solicita verificação oficial (aprovada manualmente pela administração).' }, async (ctx) => {
    const b = await ctx.body();
    const message = v.str(b.message, 'Mensagem', { min: 10, max: 500 });
    if (ctx.user.verified) throw new HttpError(400, 'Sua conta já é verificada');
    if (get("SELECT 1 FROM verification_requests WHERE user_id=? AND status='pending'", ctx.user.id)) throw new HttpError(409, 'Você já tem um pedido em análise');
    run('INSERT INTO verification_requests(user_id,message,created_at) VALUES(?,?,?)', ctx.user.id, message, Date.now());
    return { ok: true };
  });
}
