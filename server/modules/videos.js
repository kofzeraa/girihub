import fs from 'node:fs';
import path from 'node:path';
import { all, get, run, tx } from '../core/db.js';
import { config } from '../core/config.js';
import { HttpError } from '../core/http.js';
import { v, page } from '../core/validate.js';
import { can, hooks, limit } from '../core/misc.js';

// Campos do vídeo + autor + "curtiu"/"segue" para o usuário logado (2 parâmetros: me, me).
const SELECT = `SELECT v.id, v.user_id, v.video_url, v.poster_url, v.caption, v.category_id, v.status, v.views, v.likes_count, v.comments_count, v.created_at,
  u.username, u.display_name, u.avatar_url, u.verified,
  EXISTS(SELECT 1 FROM video_likes l WHERE l.video_id=v.id AND l.user_id=?) AS liked,
  EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=? AND f.followee_id=v.user_id) AS following
  FROM videos v JOIN users u ON u.id=v.user_id`;

export const shapeVideo = (r) => ({
  id: r.id, video_url: r.video_url, poster_url: r.poster_url, caption: r.caption, category_id: r.category_id,
  views: r.views, likes_count: r.likes_count, comments_count: r.comments_count, created_at: r.created_at,
  liked: !!r.liked, following: !!r.following,
  author: { id: r.user_id, username: r.username, display_name: r.display_name, avatar_url: r.avatar_url, verified: !!r.verified },
});

const TABS = ['foryou', 'following', 'trending', 'surprise'];

function removeFile(url) {
  const m = /^\/uploads\/([a-f0-9]{24}\.\w+)$/.exec(url);
  if (m) fs.rm(path.join(config.uploadDir, m[1]), { force: true }, () => {});
}

export function register(r) {
  r.get('/api/categories', { desc: 'Categorias de vídeo ativas.' }, () => ({ items: all('SELECT id, name FROM categories WHERE active=1 ORDER BY name') }));

  r.get('/api/feed', { auth: 'optional', desc: 'Feed paginado. ?tab=foryou|following|trending|surprise &page=0 (surprise usa &exclude=1,2,3).' }, (ctx) => {
    const tab = v.oneOf(ctx.query.tab || 'foryou', 'Aba', TABS);
    const me = ctx.user?.id ?? 0;
    const n = config.pageSize;
    let where = "v.status='published' AND u.banned=0", order = 'v.created_at DESC', extra = [], off = page(ctx.query.page) * n;
    if (tab === 'following') {
      if (!ctx.user) throw new HttpError(401, 'Entre para ver os vídeos de quem você segue');
      where += ' AND v.user_id IN (SELECT followee_id FROM follows WHERE follower_id=?)';
      extra = [me];
    } else if (tab === 'trending') {
      // pontuação de engajamento com decaimento por idade (horas)
      order = '((v.likes_count*3 + v.comments_count*2 + v.views + 1) * 1.0 / ((? - v.created_at) / 3600000.0 + 2)) DESC, v.created_at DESC';
    } else if (tab === 'surprise') {
      const ids = String(ctx.query.exclude || '').split(',').map(Number).filter(Number.isInteger).slice(0, 100);
      if (ids.length) where += ` AND v.id NOT IN (${ids.map(() => '?').join(',')})`;
      extra = ids;
      order = 'RANDOM()';
      off = 0;
    }
    const orderParams = tab === 'trending' ? [Date.now()] : [];
    const rows = all(`${SELECT} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, me, me, ...extra, ...orderParams, n + 1, off);
    return { items: rows.slice(0, n).map(shapeVideo), has_more: rows.length > n };
  });

  r.get('/api/users/:username/videos', { auth: 'optional', desc: 'Vídeos publicados por um usuário (?page=0).' }, (ctx) => {
    const u = get('SELECT id FROM users WHERE username=? AND banned=0', String(ctx.params.username).toLowerCase());
    if (!u) throw new HttpError(404, 'Perfil não encontrado');
    const me = ctx.user?.id ?? 0, n = 12;
    const rows = all(`${SELECT} WHERE v.user_id=? AND v.status='published' ORDER BY v.created_at DESC LIMIT ? OFFSET ?`, me, me, u.id, n + 1, page(ctx.query.page) * n);
    return { items: rows.slice(0, n).map(shapeVideo), has_more: rows.length > n };
  });

  r.get('/api/videos/:id', { auth: 'optional', desc: 'Detalhes de um vídeo.' }, (ctx) => {
    const me = ctx.user?.id ?? 0;
    const row = get(`${SELECT} WHERE v.id=? AND v.status='published' AND u.banned=0`, me, me, v.int(ctx.params.id, 'ID'));
    if (!row) throw new HttpError(404, 'Vídeo não encontrado');
    return { video: shapeVideo(row) };
  });

  r.post('/api/videos', { auth: true, desc: 'Publica vídeo: {video_url (upload em /uploads ou https), caption, category_id?, poster_url?}.' }, async (ctx) => {
    limit(`publish:${ctx.user.id}`, 10, 3600e3);
    const b = await ctx.body();
    const url = v.url(b.video_url, 'Vídeo');
    const poster = v.url(b.poster_url ?? '', 'Capa', { allowEmpty: true });
    const caption = v.str(b.caption ?? '', 'Legenda', { max: 300 });
    let cat = null;
    if (b.category_id != null && b.category_id !== '') {
      cat = v.int(b.category_id, 'Categoria');
      if (!get('SELECT 1 FROM categories WHERE id=? AND active=1', cat)) throw new HttpError(400, 'Categoria inválida');
    }
    const id = Number(run('INSERT INTO videos(user_id,video_url,poster_url,caption,category_id,created_at) VALUES(?,?,?,?,?,?)', ctx.user.id, url, poster, caption, cat, Date.now()).lastInsertRowid);
    hooks.emit('video.published', { userId: ctx.user.id, videoId: id });
    return { id };
  });

  r.delete('/api/videos/:id', { auth: true, desc: 'Remove vídeo (dono ou moderação).' }, (ctx) => {
    const row = get('SELECT user_id, video_url FROM videos WHERE id=?', v.int(ctx.params.id, 'ID'));
    if (!row) throw new HttpError(404, 'Vídeo não encontrado');
    if (row.user_id !== ctx.user.id && !can(ctx.user, 'videos.manage')) throw new HttpError(403, 'Sem permissão');
    run('DELETE FROM videos WHERE id=?', ctx.params.id);
    removeFile(row.video_url);
    return { ok: true };
  });

  const setLike = (on) => (ctx) => {
    const id = v.int(ctx.params.id, 'ID');
    if (!get("SELECT 1 FROM videos WHERE id=? AND status='published'", id)) throw new HttpError(404, 'Vídeo não encontrado');
    limit(`like:${ctx.user.id}`, 300, 3600e3);
    return tx(() => {
      const changed = on
        ? run('INSERT OR IGNORE INTO video_likes VALUES(?,?,?)', ctx.user.id, id, Date.now()).changes
        : run('DELETE FROM video_likes WHERE user_id=? AND video_id=?', ctx.user.id, id).changes;
      if (changed) run('UPDATE videos SET likes_count=likes_count+? WHERE id=?', on ? 1 : -1, id);
      return { liked: on, likes_count: get('SELECT likes_count FROM videos WHERE id=?', id).likes_count };
    });
  };
  r.post('/api/videos/:id/like', { auth: true, desc: 'Curtir vídeo.' }, setLike(true));
  r.delete('/api/videos/:id/like', { auth: true, desc: 'Remover curtida.' }, setLike(false));

  r.get('/api/videos/:id/comments', { desc: 'Comentários (mais recentes primeiro, ?page=0).' }, (ctx) => {
    const n = 20;
    const rows = all(
      `SELECT c.id, c.body, c.created_at, c.user_id, u.username, u.display_name, u.avatar_url, u.verified
       FROM comments c JOIN users u ON u.id=c.user_id WHERE c.video_id=? ORDER BY c.id DESC LIMIT ? OFFSET ?`,
      v.int(ctx.params.id, 'ID'), n + 1, page(ctx.query.page) * n,
    );
    return {
      items: rows.slice(0, n).map((c) => ({
        id: c.id, body: c.body, created_at: c.created_at,
        author: { id: c.user_id, username: c.username, display_name: c.display_name, avatar_url: c.avatar_url, verified: !!c.verified },
      })),
      has_more: rows.length > n,
    };
  });

  r.post('/api/videos/:id/comments', { auth: true, desc: 'Comentar: {body (1–300)}.' }, async (ctx) => {
    const id = v.int(ctx.params.id, 'ID');
    const body = v.str((await ctx.body()).body, 'Comentário', { min: 1, max: 300 });
    if (!get("SELECT 1 FROM videos WHERE id=? AND status='published'", id)) throw new HttpError(404, 'Vídeo não encontrado');
    limit(`comment:${ctx.user.id}`, 20, 60e3);
    return tx(() => {
      const cid = Number(run('INSERT INTO comments(video_id,user_id,body,created_at) VALUES(?,?,?,?)', id, ctx.user.id, body, Date.now()).lastInsertRowid);
      run('UPDATE videos SET comments_count=comments_count+1 WHERE id=?', id);
      return { id: cid, comments_count: get('SELECT comments_count FROM videos WHERE id=?', id).comments_count };
    });
  });

  r.delete('/api/comments/:id', { auth: true, desc: 'Remove comentário (autor ou moderação).' }, (ctx) => {
    const c = get('SELECT video_id, user_id FROM comments WHERE id=?', v.int(ctx.params.id, 'ID'));
    if (!c) throw new HttpError(404, 'Comentário não encontrado');
    if (c.user_id !== ctx.user.id && !can(ctx.user, 'videos.manage')) throw new HttpError(403, 'Sem permissão');
    tx(() => {
      run('DELETE FROM comments WHERE id=?', ctx.params.id);
      run('UPDATE videos SET comments_count=MAX(comments_count-1,0) WHERE id=?', c.video_id);
    });
    return { ok: true };
  });
}
