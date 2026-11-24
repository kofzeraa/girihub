// Roteador mínimo. Cada rota carrega metadados (auth/perm/desc) que alimentam GET /api/docs.
export class Router {
  constructor(prefix = '', routes = []) {
    this.prefix = prefix;
    this.routes = routes;
  }

  add(method, path, opts, handler) {
    if (typeof opts === 'function') [handler, opts] = [opts, {}];
    const full = this.prefix + path;
    const keys = [];
    const re = new RegExp('^' + full.replace(/:([a-zA-Z_]+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
    this.routes.push({ method, path: full, re, keys, opts, handler });
  }
  get(...a) { this.add('GET', ...a); }
  post(...a) { this.add('POST', ...a); }
  put(...a) { this.add('PUT', ...a); }
  patch(...a) { this.add('PATCH', ...a); }
  delete(...a) { this.add('DELETE', ...a); }

  /** Roteador com prefixo que compartilha a mesma tabela de rotas (usado pelas extensões). */
  scoped(prefix) {
    return new Router(this.prefix + prefix, this.routes);
  }

  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(pathname);
      if (!m) continue;
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { route: r, params };
    }
    return null;
  }

  docs() {
    return this.routes.map(({ method, path, opts }) => ({
      method,
      path,
      acesso: opts.perm ? `permissão: ${opts.perm}` : opts.auth === true ? 'login' : opts.auth === 'optional' ? 'login opcional' : 'público',
      descricao: opts.desc || '',
    }));
  }
}
