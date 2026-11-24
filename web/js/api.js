const KEY = 'girihub.token';

export const auth = {
  get token() { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(t) { try { localStorage.setItem(KEY, t); } catch {} },
  clear() { try { localStorage.removeItem(KEY); } catch {} },
};

/** Chamada à API. Lança Error com .status quando a resposta não é OK. */
export async function api(path, { method = 'GET', body, raw = false, headers = {} } = {}) {
  const h = { ...headers };
  if (auth.token) h.Authorization = `Bearer ${auth.token}`;
  let payload = body;
  if (body !== undefined && !raw) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch('/api' + path, { method, headers: h, body: payload });
  } catch {
    throw Object.assign(new Error('Sem conexão com o servidor'), { status: 0 });
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.error || `Erro ${res.status}`), { status: res.status });
  return data;
}

export const get = (p) => api(p);
export const post = (p, body = {}) => api(p, { method: 'POST', body });
export const patch = (p, body) => api(p, { method: 'PATCH', body });
export const put = (p, body) => api(p, { method: 'PUT', body });
export const del = (p) => api(p, { method: 'DELETE' });

/** Envia um arquivo (vídeo ou imagem) e retorna a URL pública. */
export async function uploadFile(file, kind) {
  const { url } = await api(`/uploads?kind=${kind}`, { method: 'POST', body: file, raw: true, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
  return url;
}
