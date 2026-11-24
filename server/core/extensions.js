// Carregador de extensões. Cada pasta em extensions/<id>/ com extension.json é um módulo independente.
// Extensões são código CONFIÁVEL (têm acesso ao banco): instale apenas extensões de fontes confiáveis.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import * as database from './db.js';
import { hooks, getSetting, setSetting } from './misc.js';
import { applyTx } from '../services/wallet.js';

export const loaded = []; // { id, name, version, description, enabled, ok, web, error }

function buildApi(m, router) {
  const id = m.id;
  return {
    id,
    manifest: m,
    router: router.scoped(`/api/ext/${id}`), // rotas ficam sempre sob /api/ext/<id>/
    db: {
      ...database,
      migrate: (steps) => database.migrate(`ext:${id}`, steps), // tabelas devem usar o prefixo ext_<id>_
    },
    hooks: { on: hooks.on, emit: (name, payload) => hooks.emit(`ext.${id}.${name}`, payload) },
    settings: { get: (k) => getSetting(`ext.${id}.${k}`), set: (k, v) => setSetting(`ext.${id}.${k}`, v) },
    wallet: {
      credit: (userId, amount, o = {}) => applyTx(userId, Math.abs(amount), { type: `ext:${id}`, ...o }),
      debit: (userId, amount, o = {}) => applyTx(userId, -Math.abs(amount), { type: `ext:${id}`, ...o }),
    },
    log: (...a) => console.log(`[ext:${id}]`, ...a),
    config: { publicUrl: config.publicUrl },
  };
}

export async function loadExtensions(router) {
  if (!fs.existsSync(config.extDir)) return;
  for (const d of fs.readdirSync(config.extDir, { withFileTypes: true })) {
    if (!d.isDirectory() || /^[._]/.test(d.name)) continue;
    const base = path.join(config.extDir, d.name);
    const manifestFile = path.join(base, 'extension.json');
    if (!fs.existsSync(manifestFile)) continue;
    const info = { id: d.name, name: d.name, version: '', description: '', enabled: true, ok: false, web: null, error: null };
    try {
      const m = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      Object.assign(info, { name: m.name || m.id, version: m.version || '', description: m.description || '', enabled: m.enabled !== false });
      if (m.id !== d.name || !/^[a-z0-9-]+$/.test(m.id)) throw new Error('"id" deve ser igual ao nome da pasta (a-z, 0-9, -)');
      if (info.enabled) {
        const serverFile = path.join(base, m.server || 'index.js');
        if (fs.existsSync(serverFile)) {
          const mod = await import(pathToFileURL(serverFile).href);
          if (typeof mod.register !== 'function') throw new Error('o módulo de servidor deve exportar register(api)');
          await mod.register(buildApi(m, router));
        }
        if (m.web) info.web = `/ext/${m.id}/${m.web}`;
        info.ok = true;
        console.log(`[extensões] ${m.id} ${m.version || ''} carregada`);
      }
    } catch (e) {
      info.error = e.message;
      console.error(`[extensões] ${d.name} ignorada: ${e.message}`);
    }
    loaded.push(info);
  }
}
