// Acesso ao SQLite (node:sqlite, embutido no Node). Todas as consultas são parametrizadas.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

if (config.dbFile !== ':memory:') fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
export const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');

const cache = new Map();
const stmt = (sql) => {
  let s = cache.get(sql);
  if (!s) cache.set(sql, (s = db.prepare(sql)));
  return s;
};
const norm = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? +v : v));

export const get = (sql, ...p) => stmt(sql).get(...norm(p));
export const all = (sql, ...p) => stmt(sql).all(...norm(p));
export const run = (sql, ...p) => stmt(sql).run(...norm(p));

let depth = 0;
/** Executa fn dentro de uma transação (aninhamentos reaproveitam a externa). */
export function tx(fn) {
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}

/** Aplica migrações em ordem, registrando cada passo por escopo ('core' ou 'ext:<id>'). */
export function migrate(scope, steps) {
  db.exec('CREATE TABLE IF NOT EXISTS _migrations(scope TEXT NOT NULL, step INTEGER NOT NULL, applied_at INTEGER NOT NULL, PRIMARY KEY(scope, step))');
  steps.forEach((sql, i) => {
    if (get('SELECT 1 FROM _migrations WHERE scope=? AND step=?', scope, i)) return;
    tx(() => {
      db.exec(sql);
      run('INSERT INTO _migrations VALUES(?,?,?)', scope, i, Date.now());
    });
  });
}
