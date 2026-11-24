// Utilitários pequenos do núcleo: hooks, rate limit, permissões e configurações.
import { HttpError } from './http.js';
import { all, get, run } from './db.js';

/* ---------- Hooks (pontos de extensão por eventos) ---------- */
const listeners = new Map();
export const hooks = {
  on(name, fn) {
    if (!listeners.has(name)) listeners.set(name, []);
    listeners.get(name).push(fn);
  },
  /** Dispara ouvintes sem bloquear o fluxo principal; erros de extensões nunca derrubam o núcleo. */
  emit(name, payload) {
    for (const fn of listeners.get(name) || []) {
      queueMicrotask(async () => {
        try { await fn(payload); } catch (e) { console.error(`[hook ${name}]`, e.message); }
      });
    }
  },
};

/* ---------- Rate limit em memória (por chave) ---------- */
const buckets = new Map();
export function limit(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) buckets.set(key, (b = { n: 0, reset: now + windowMs }));
  if (++b.n > max) throw new HttpError(429, 'Muitas tentativas. Aguarde um pouco e tente novamente.');
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60_000).unref();

/* ---------- Permissões por papel ---------- */
const ROLE_PERMS = {
  user: [],
  moderator: ['stats.view', 'users.view', 'videos.manage', 'verification.manage'],
  admin: ['*'],
};
export const permissionsOf = (u) => ROLE_PERMS[u?.role] || [];
export const can = (u, perm) => {
  const l = permissionsOf(u);
  return l.includes('*') || l.includes(perm);
};

/* ---------- Configurações (tabela settings) ---------- */
export const DEFAULT_SETTINGS = {
  'reward.enabled': 1,
  'reward.watch_seconds': 10,
  'reward.coins_per_view': 1,
  'reward.daily_cap': 50,
};
export function getSettings() {
  const o = { ...DEFAULT_SETTINGS };
  for (const r of all('SELECT key, value FROM settings')) o[r.key] = r.value;
  return o;
}
export const getSetting = (key) => get('SELECT value FROM settings WHERE key=?', key)?.value ?? DEFAULT_SETTINGS[key] ?? null;
export const setSetting = (key, value) =>
  run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, String(value));
