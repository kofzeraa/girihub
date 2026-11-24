import { loaded } from '../core/extensions.js';

export function register(r) {
  r.get('/api/health', { desc: 'Verificação de saúde do servidor.' }, () => ({ ok: true, name: 'GiriHub' }));

  r.get('/api/extensions', { desc: 'Extensões instaladas (o frontend carrega o script "web" de cada uma).' }, () => ({ items: loaded }));

  r.get('/api/docs', { desc: 'Documentação das rotas da API (gerada automaticamente a partir do código, inclui extensões).' }, () => ({
    items: r.docs(),
  }));
}
