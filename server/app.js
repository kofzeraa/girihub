import http from 'node:http';
import path from 'node:path';
import { config } from './core/config.js';
import { migrate } from './core/db.js';
import { coreMigrations } from './core/schema.js';
import { seed } from './core/seed.js';
import { Router } from './core/router.js';
import { HttpError, readJson, sendJson } from './core/http.js';
import { authenticate, bearer } from './core/auth.js';
import { can } from './core/misc.js';
import { loadExtensions, loaded } from './core/extensions.js';
import { resolveSafe, serveFile } from './core/static.js';
import { initAchievements } from './services/misc.js';
import * as authMod from './modules/auth.js';
import * as profiles from './modules/profiles.js';
import * as videos from './modules/videos.js';
import * as uploads from './modules/uploads.js';
import * as wallet from './modules/wallet.js';
import * as shop from './modules/shop.js';
import * as admin from './modules/admin.js';
import * as system from './modules/system.js';

const CSP = "default-src 'self'; img-src 'self' https: data: blob:; media-src 'self' https: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

const clientIp = (req) =>
  (process.env.TRUST_PROXY === '1' && (req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';

async function handleApi(req, res, url, router) {
  const m = router.match(req.method === 'HEAD' ? 'GET' : req.method, url.pathname);
  if (!m) throw new HttpError(404, 'Rota não encontrada');
  const { route, params } = m;
  const o = route.opts;
  const user = o.auth || o.perm ? authenticate(req) : null;
  if ((o.auth === true || o.perm) && !user) throw new HttpError(401, 'Faça login para continuar');
  if (user?.banned) throw new HttpError(403, 'Conta suspensa');
  if (o.perm && !can(user, o.perm)) throw new HttpError(403, 'Sem permissão para esta ação');
  const ctx = {
    req, res, params, user, token: bearer(req), ip: clientIp(req),
    query: Object.fromEntries(url.searchParams),
    _body: null,
    body() { return (this._body ??= readJson(req, config.maxJsonBytes)); },
  };
  const out = await route.handler(ctx);
  if (out === undefined) { res.writeHead(204); res.end(); return; }
  sendJson(res, 200, out);
}

function fail(res, e) {
  if (res.headersSent) return res.destroy();
  let status = e.status || 500, msg = e.message;
  if (!e.status) {
    const t = String(e.message || '');
    if (/UNIQUE constraint/.test(t)) [status, msg] = [409, 'Já existe um registro com esses dados'];
    else if (/FOREIGN KEY constraint/.test(t)) [status, msg] = [409, 'Registro em uso por outros dados; desative em vez de excluir'];
    else if (/CHECK constraint/.test(t)) [status, msg] = [400, 'Valor inválido'];
    else { console.error(e); msg = 'Erro interno do servidor'; }
  }
  sendJson(res, status, { error: msg });
}

export async function createApp() {
  migrate('core', coreMigrations);
  seed();
  const router = new Router();
  for (const mod of [authMod, profiles, videos, uploads, wallet, shop, admin, system]) mod.register(router);
  await loadExtensions(router);
  initAchievements();

  return http.createServer(async (req, res) => {
    try {
      res.setHeader('Content-Security-Policy', CSP);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'same-origin');
      res.setHeader('X-Frame-Options', 'DENY');
      const url = new URL(req.url, 'http://localhost');
      const p = url.pathname;
      if (p.startsWith('/api/')) return await handleApi(req, res, url, router);
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Método não permitido');

      if (p.startsWith('/uploads/')) {
        const f = resolveSafe(config.uploadDir, p.slice(9));
        if (f && !path.basename(f).startsWith('.') && serveFile(req, res, f, { maxAge: 2592000 })) return;
        throw new HttpError(404, 'Arquivo não encontrado');
      }
      const ext = /^\/ext\/([a-z0-9-]+)\/(.+)$/.exec(p);
      if (ext) {
        const f = loaded.some((x) => x.id === ext[1] && x.ok) && resolveSafe(path.join(config.extDir, ext[1], 'web'), ext[2]);
        if (f && serveFile(req, res, f)) return;
        throw new HttpError(404, 'Arquivo não encontrado');
      }
      const f = resolveSafe(config.webDir, p === '/' ? 'index.html' : p.slice(1));
      if (f && serveFile(req, res, f)) return;
      if (!path.extname(p) && serveFile(req, res, path.join(config.webDir, 'index.html'))) return;
      throw new HttpError(404, 'Não encontrado');
    } catch (e) {
      fail(res, e);
    }
  });
}
