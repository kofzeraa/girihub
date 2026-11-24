import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { config } from '../core/config.js';
import { HttpError } from '../core/http.js';
import { limit } from '../core/misc.js';

const KINDS = {
  video: { max: config.maxVideoBytes, types: ['mp4', 'webm'] },
  image: { max: config.maxImageBytes, types: ['jpg', 'png', 'webp'] },
};

/** Detecta o formato real pelos primeiros bytes (não confia no Content-Type nem na extensão enviados). */
function sniff(b) {
  if (b.length < 12) return null;
  if (b.toString('latin1', 4, 8) === 'ftyp') return 'mp4';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

async function saveUpload(req, kind) {
  const spec = KINDS[kind];
  if (!spec) throw new HttpError(400, 'kind deve ser video ou image');
  const len = Number(req.headers['content-length'] || 0);
  if (!len) throw new HttpError(411, 'Envie o arquivo como corpo da requisição (Content-Length obrigatório)');
  if (len > spec.max) throw new HttpError(413, `Arquivo maior que ${Math.round(spec.max / 1048576)} MB`);

  fs.mkdirSync(config.uploadDir, { recursive: true });
  const tmp = path.join(config.uploadDir, `.tmp-${crypto.randomUUID()}`);
  const out = fs.createWriteStream(tmp);
  let size = 0, head = Buffer.alloc(0), ext = null;
  const check = () => {
    ext = sniff(head);
    if (!ext || !spec.types.includes(ext)) throw new HttpError(415, 'Formato não suportado');
  };
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > spec.max) throw new HttpError(413, 'Arquivo muito grande');
      if (!ext && head.length < 12) {
        head = Buffer.concat([head, chunk]);
        if (head.length >= 12) check();
      }
      if (!out.write(chunk)) await once(out, 'drain');
    }
    if (!ext) check();
    await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
    const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
    fs.renameSync(tmp, path.join(config.uploadDir, name));
    return `/uploads/${name}`;
  } catch (e) {
    out.destroy();
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

export function register(r) {
  r.post('/api/uploads', { auth: true, desc: 'Envia arquivo cru no corpo. ?kind=video (mp4/webm) ou image (jpg/png/webp). Retorna {url}.' }, async (ctx) => {
    limit(`upload:${ctx.user.id}`, 30, 3600e3);
    return { url: await saveUpload(ctx.req, ctx.query.kind) };
  });
}
