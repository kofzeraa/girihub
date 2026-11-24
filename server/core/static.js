import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
};

/** Resolve rel dentro de root, impedindo path traversal. Retorna null se inválido. */
export function resolveSafe(root, rel) {
  try {
    const p = path.resolve(root, '.' + path.sep + decodeURIComponent(rel));
    return p.startsWith(path.resolve(root) + path.sep) ? p : null;
  } catch {
    return null;
  }
}

/** Serve um arquivo com suporte a Range (necessário para vídeo). Retorna false se não for arquivo. */
export function serveFile(req, res, file, { maxAge = 0 } = {}) {
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return false;
  }
  if (!st.isFile()) return false;
  const headers = {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  };
  let start = 0, end = st.size - 1, status = 200;
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m && st.size > 0) {
    if (m[1] === '' && m[2] !== '') start = Math.max(0, st.size - Number(m[2]));
    else {
      start = Number(m[1]);
      if (m[2] !== '') end = Math.min(Number(m[2]), end);
    }
    if (start > end || start >= st.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
      res.end();
      return true;
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
  }
  headers['Content-Length'] = st.size === 0 ? 0 : end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || st.size === 0) res.end();
  else fs.createReadStream(file, { start, end }).pipe(res);
  return true;
}
