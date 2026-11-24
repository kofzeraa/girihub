import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { get, run } from './db.js';
import { config } from './config.js';

const scrypt = promisify(crypto.scrypt);

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(pw, stored) {
  const [alg, s, k] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const key = await scrypt(pw, Buffer.from(s, 'hex'), 64);
  const expected = Buffer.from(k, 'hex');
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

/** Hash falso usado para igualar o tempo de resposta quando o usuário não existe. */
export const DUMMY_HASH = await hashPassword('girihub-dummy');

export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

export function createSession(userId) {
  const token = newToken();
  run('INSERT INTO sessions VALUES(?,?,?,?)', hashToken(token), userId, Date.now() + config.sessionDays * 864e5, Date.now());
  return token;
}

export const bearer = (req) => /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1] || null;

export function authenticate(req) {
  const t = bearer(req);
  if (!t) return null;
  return (
    get('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash=? AND s.expires_at>?', hashToken(t), Date.now()) ||
    null
  );
}
