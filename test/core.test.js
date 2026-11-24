import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.GIRIHUB_DB = ':memory:';
process.env.GIRIHUB_UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), 'girihub-up-'));

const { createApp } = await import('../server/app.js');
const { applyTx } = await import('../server/services/wallet.js');
const { heartbeat } = await import('../server/services/rewards.js');
const { run, get } = await import('../server/core/db.js');

let server, base;
before(async () => {
  server = await createApp();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const call = async (method, url, { token, body, raw, headers } = {}) => {
  const res = await fetch(base + url, {
    method,
    headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { 'Content-Type': 'application/json' }), ...headers },
    body: raw ?? (body && JSON.stringify(body)),
  });
  return { status: res.status, data: res.status === 204 ? null : await res.json().catch(() => null) };
};

const S = {};
test('cadastro: primeiro usuário é admin, segundo é usuário comum; login valida senha', async () => {
  const a = await call('POST', '/api/auth/register', { body: { email: 'alice@x.com', username: 'alice', password: 'senha-forte-1' } });
  assert.equal(a.status, 200);
  assert.equal(a.data.user.role, 'admin');
  S.alice = a.data;
  const b = await call('POST', '/api/auth/register', { body: { email: 'bob@x.com', username: 'bob', password: 'senha-forte-2' } });
  assert.equal(b.data.user.role, 'user');
  S.bob = b.data;
  assert.equal((await call('POST', '/api/auth/register', { body: { email: 'bob@x.com', username: 'bob2', password: 'senha-forte-2' } })).status, 409);
  assert.equal((await call('POST', '/api/auth/login', { body: { login: 'bob', password: 'errada-errada' } })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { body: { login: 'bob', password: 'senha-forte-2' } })).status, 200);
});

test('permissões: usuário comum não acessa admin; feed "seguindo" exige login', async () => {
  assert.equal((await call('GET', '/api/admin/stats', { token: S.bob.token })).status, 403);
  assert.equal((await call('GET', '/api/admin/stats', { token: S.alice.token })).status, 200);
  assert.equal((await call('GET', '/api/admin/stats')).status, 401);
  assert.equal((await call('GET', '/api/feed?tab=following')).status, 401);
  assert.equal((await call('GET', '/api/feed?tab=surprise')).status, 200);
});

test('carteira: nunca fica negativa e é idempotente', () => {
  const id = S.bob.user.id;
  assert.throws(() => applyTx(id, -5, { type: 't' }), /insuficiente/);
  applyTx(id, 10, { type: 't', idemKey: 'k1' });
  const again = applyTx(id, 10, { type: 't', idemKey: 'k1' });
  assert.equal(again.duplicate, true);
  assert.equal(get('SELECT balance FROM users WHERE id=?', id).balance, 10);
  assert.throws(() => run('UPDATE users SET balance=-1 WHERE id=?', id)); // CHECK no banco
});

test('publicar vídeo, curtir e comentar', async () => {
  const v = await call('POST', '/api/videos', { token: S.alice.token, body: { video_url: 'https://example.com/a.mp4', caption: 'oi' } });
  assert.equal(v.status, 200);
  S.video = v.data.id;
  assert.equal((await call('POST', '/api/videos', { token: S.alice.token, body: { video_url: 'javascript:alert(1)' } })).status, 400);
  assert.equal((await call('POST', `/api/videos/${S.video}/like`, { token: S.bob.token })).data.likes_count, 1);
  assert.equal((await call('POST', `/api/videos/${S.video}/like`, { token: S.bob.token })).data.likes_count, 1); // idempotente
  assert.equal((await call('POST', `/api/videos/${S.video}/comments`, { token: S.bob.token, body: { body: 'legal' } })).data.comments_count, 1);
  const feed = await call('GET', '/api/feed?tab=foryou', { token: S.bob.token });
  assert.equal(feed.data.items[0].liked, true);
});

test('antifraude de recompensa: tempo medido no servidor, pago uma vez, respeita limite diário', () => {
  const bob = S.bob.user.id, T = Date.now() + 10 * 864e5; // dia limpo (sem ganhos anteriores)
  const before = get('SELECT balance FROM users WHERE id=?', bob).balance;
  heartbeat(bob, S.video, T);
  assert.equal(heartbeat(bob, S.video, T + 300).accumulated_ms, 0); // rápido demais: ignorado
  let r;
  for (let t = 2000; t <= 9000; t += 2000) r = heartbeat(bob, S.video, T + t);
  assert.equal(r.rewarded, false); // ~8s < 10s
  r = heartbeat(bob, S.video, T + 11000);
  assert.equal(r.newly_rewarded, true);
  assert.equal(heartbeat(bob, S.video, T + 13000).newly_rewarded, false); // não paga de novo
  assert.equal(get('SELECT balance FROM users WHERE id=?', bob).balance, before + 1);
  // pausa longa (> 15 s) não conta como tempo assistido
  const v2 = Number(run("INSERT INTO videos(user_id,video_url,created_at) VALUES(?,?,?)", S.alice.user.id, 'https://example.com/b.mp4', Date.now()).lastInsertRowid);
  heartbeat(bob, v2, T + 20000);
  assert.equal(heartbeat(bob, v2, T + 60000).accumulated_ms, 0);
  // autor não ganha com o próprio vídeo
  heartbeat(S.alice.user.id, S.video, T);
  assert.equal(heartbeat(S.alice.user.id, S.video, T + 20000).reason, 'own_video');
});

test('antifraude: limite diário de ganhos bloqueia nova recompensa', async () => {
  const c = (await call('POST', '/api/auth/register', { body: { email: 'carol@x.com', username: 'carol', password: 'senha-forte-3' } })).data.user.id;
  run("UPDATE settings SET value='1' WHERE key='reward.daily_cap'");
  applyTx(c, 1, { type: 'watch_reward', description: 'já ganhou hoje' });
  const v3 = Number(run("INSERT INTO videos(user_id,video_url,created_at) VALUES(?,?,?)", S.alice.user.id, 'https://example.com/c.mp4', Date.now()).lastInsertRowid);
  const T = Date.now();
  let r = heartbeat(c, v3, T);
  for (let t = 2000; t <= 12000; t += 2000) r = heartbeat(c, v3, T + t);
  assert.equal(r.reason, 'daily_cap');
  assert.equal(r.rewarded, false);
});

test('loja: saldo insuficiente, compra com emblema, item duplicado', async () => {
  const prods = (await call('GET', '/api/shop/products?category=emblemas', { token: S.bob.token })).data.items;
  assert.ok(prods.length && prods.every((p) => p.is_demo));
  const emblem = prods.find((p) => p.grants_badge);
  assert.equal((await call('POST', '/api/shop/buy', { token: S.bob.token, body: { product_id: emblem.id } })).status, 402);
  applyTx(S.bob.user.id, 1000, { type: 'test' });
  const ok = await call('POST', '/api/shop/buy', { token: S.bob.token, body: { product_id: emblem.id } });
  assert.equal(ok.data.badge_granted, true);
  assert.equal((await call('POST', '/api/shop/buy', { token: S.bob.token, body: { product_id: emblem.id } })).status, 409);
  const prof = await call('GET', '/api/users/bob');
  assert.ok(prof.data.badges.some((b) => b.source === 'purchasable'));
  const hist = await call('GET', '/api/wallet/transactions', { token: S.bob.token });
  assert.ok(hist.data.items.some((t) => t.type === 'purchase' && t.amount < 0));
});

test('upload: aceita formato real e rejeita arquivo falso', async () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
  const ok = await call('POST', '/api/uploads?kind=image', { token: S.bob.token, raw: png, headers: { 'Content-Type': 'image/png' } });
  assert.equal(ok.status, 200);
  const file = await fetch(base + ok.data.url);
  assert.equal(file.headers.get('content-type'), 'image/png');
  const bad = await call('POST', '/api/uploads?kind=image', { token: S.bob.token, raw: Buffer.from('<script>alert(1)</script>'), headers: { 'Content-Type': 'image/png' } });
  assert.equal(bad.status, 415);
});

test('estáticos: SPA responde e path traversal é bloqueado', async () => {
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/%2e%2e/package.json')).status, 404);
  assert.equal((await fetch(base + '/uploads/..%2f..%2fpackage.json')).status, 404);
});
