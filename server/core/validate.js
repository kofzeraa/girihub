import { HttpError } from './http.js';

const bad = (msg) => new HttpError(400, msg);
const UPLOAD_RE = /^\/uploads\/[a-f0-9]{24}\.(mp4|webm|jpg|png|webp)$/;

export const v = {
  str(val, name, { min = 0, max = 500, trim = true } = {}) {
    if (typeof val !== 'string') throw bad(`${name} inválido`);
    const s = trim ? val.trim() : val;
    if (s.length < min || s.length > max) throw bad(`${name} deve ter entre ${min} e ${max} caracteres`);
    return s;
  },
  int(val, name, { min = -Infinity, max = Infinity } = {}) {
    const n = typeof val === 'string' && val.trim() === '' ? NaN : Number(val);
    if (!Number.isInteger(n) || n < min || n > max) throw bad(`${name} inválido`);
    return n;
  },
  oneOf(val, name, list) {
    if (!list.includes(val)) throw bad(`${name} inválido`);
    return val;
  },
  /** Aceita upload local (/uploads/...) ou URL http(s). Vazio só se allowEmpty. */
  url(val, name, { allowEmpty = false } = {}) {
    if (val === '' || val == null) {
      if (allowEmpty) return '';
      throw bad(`${name} é obrigatório`);
    }
    if (typeof val !== 'string' || val.length > 500) throw bad(`${name} inválido`);
    if (UPLOAD_RE.test(val)) return val;
    try {
      const u = new URL(val);
      if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
    } catch {}
    throw bad(`${name} deve ser uma URL http(s) válida`);
  },
};

export const page = (q) => Math.min(Math.max(parseInt(q, 10) || 0, 0), 10_000);
