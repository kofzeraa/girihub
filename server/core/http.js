export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

export function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) tooBig = true;
      else chunks.push(c);
    });
    req.on('error', reject);
    req.on('end', () => {
      if (tooBig) return reject(new HttpError(413, 'Corpo da requisição muito grande'));
      if (!size) return resolve({});
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error();
        resolve(v);
      } catch {
        reject(new HttpError(400, 'JSON inválido'));
      }
    });
  });
}
