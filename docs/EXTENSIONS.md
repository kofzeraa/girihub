# Extensões do GiriHub

Uma extensão é uma pasta em `extensions/<id>/`. O núcleo a carrega na inicialização; se ela falhar, é ignorada e o resto do sistema segue funcionando. Veja `extensions/hello-giri/` como modelo.

## Instalar
1. Copie a pasta para `extensions/`.
2. Reinicie o servidor. O console mostra `[extensões] <id> carregada`.
3. Para desativar: `"enabled": false` no `extension.json` (ou apague a pasta).

> ⚠️ Extensões rodam com acesso ao banco. Instale apenas extensões de fontes confiáveis.

## Estrutura
```
extensions/meu-modulo/
  extension.json      id (= nome da pasta), name, version, description, server, web, enabled
  index.js            servidor: export function register(api)
  web/main.js         frontend: export default function (GiriHub)
```

## API do servidor — `register(api)`
| Recurso | Uso |
|---|---|
| `api.router.get/post/put/patch/delete(path, {auth, perm, desc}, handler)` | Rotas sempre sob `/api/ext/<id>/`. `auth: true` exige login; `perm: 'x'` exige permissão. `ctx` traz `user`, `params`, `query`, `body()`. |
| `api.db.migrate([sql, ...])` | Cria tabelas próprias (prefixo `ext_<id>_`). Passos já aplicados não rodam de novo; **só acrescente passos ao fim**. |
| `api.db.get/all/run/tx` | Consultas parametrizadas (`?`). Nunca monte SQL com texto do usuário. |
| `api.hooks.on(evento, fn)` | Eventos: `user.registered`, `video.published`, `watch.rewarded`, `purchase.completed`, `user.followed`. |
| `api.wallet.credit/debit(userId, valor, {description, idemKey})` | **Única** forma correta de mexer em GiriCoins: atômica, registrada no histórico, nunca negativa. Use `idemKey` para não pagar duas vezes. |
| `api.settings.get/set(chave)` | Configurações da extensão. |

Toda rota (do núcleo e das extensões) aparece em `GET /api/docs`.

## API do frontend — `default(GiriHub)`
- `GiriHub.routes.add('/caminho', render, {auth})` — `render({params, query})` retorna um elemento DOM.
- `GiriHub.nav.add({href, label, icon})` — item no menu.
- `GiriHub.api.get/post/patch/put/del/upload` — chamadas à API (já enviam o login).
- `GiriHub.ui` — componentes (`el`, `Avatar`, `Coins`, `toast`, `modal`, `devNotice`…). Use `el()`/`textContent`; evite `innerHTML` com dados de usuário.
- `GiriHub.state.user` — usuário logado (ou `null`).

## WordPress (integração futura)
O GiriHub **não depende** do WordPress. Um plugin WordPress deve ser um cliente comum da API REST (`/api/...`), autenticado com um usuário de serviço (token Bearer), ou uma extensão do GiriHub que exponha rotas/webhooks próprios em `/api/ext/<id>/`.
