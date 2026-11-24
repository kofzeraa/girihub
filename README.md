# GiriHub

Plataforma de vídeos curtos com GiriCoins. Versão **MVP 0.1** — somente o essencial.

## Rodar
Requer Node.js ≥ 22.13 (sem dependências para instalar).
```
npm start          # http://localhost:3000
npm test           # testes do backend
```
O **primeiro usuário cadastrado vira administrador** (ou defina `GIRIHUB_ADMIN_EMAIL`). Painel em `#/admin`.

Variáveis opcionais: `PORT`, `PUBLIC_URL`, `GIRIHUB_DB`, `GIRIHUB_UPLOADS`, `GIRIHUB_MAX_VIDEO_MB` (100), `GIRIHUB_SEED_DEMO=0` (não criar produtos demonstrativos), `TRUST_PROXY=1` (atrás de proxy reverso).

**TV:** abra `/?tv=1` (ou use o navegador da Smart TV, detectado automaticamente) → controle remoto com setas/OK/Voltar, foco grande. `/?tv=0` desativa.
**Computador:** ↑/↓ ou J/K trocam de vídeo · Espaço pausa · M som · L curtir · C comentários.

## Arquitetura (decisões)
```
server/core      infraestrutura: banco, rotas, auth, validação, extensões, hooks
server/services  regras de negócio compartilhadas (carteira, recompensas)
server/modules   rotas por domínio: auth, profiles, videos, wallet, shop, admin…
web/             frontend em JS puro (módulos ES), sem build; css/theme.css centraliza a identidade
extensions/      módulos plugáveis (veja docs/EXTENSIONS.md)
```
- **Node + SQLite embutido, zero dependências**: economiza recursos e instala em qualquer lugar. Troca de banco (ex.: PostgreSQL) fica isolada em `server/core/db.js`.
- **GiriCoins**: todo saldo muda só por `services/wallet.js` — transação atômica, livro-razão `wallet_tx`, saldo nunca negativo (também por `CHECK` no banco), idempotência por chave.
- **Antifraude**: o navegador só envia "batimentos"; o servidor mede o tempo (ignora batimentos rápidos demais, pausas > 15 s e abas simultâneas), paga uma vez por vídeo, não paga o próprio vídeo e respeita limite diário. Regras editáveis no admin.
- **Segurança**: senhas com scrypt, sessões com token hash, limite de tentativas, SQL parametrizado, CSP restritiva, upload validado pelos bytes reais do arquivo.
- **Tag × Emblema × Verificação**: tag = texto escolhido pelo usuário; emblema = ícone conquistado/comprado; selo azul = verificação oficial, só via aprovação do admin.
- **Permissões**: papéis `user`, `moderator`, `admin` mapeados a permissões em `server/core/misc.js`.

## Limitações conhecidas desta versão
- Recuperação de senha: sem SMTP, o link é impresso no console do servidor. Para enviar e-mails, uma extensão chama `setMailTransport` (em `server/services/misc.js`).
- Vídeos são servidos como enviados (sem transcodificação/HLS). O feed já carrega de forma progressiva (pré-carrega só o próximo e libera os distantes); transcodificação e CDN ficam para uma extensão/etapa futura.
- Produtos da loja são **demonstrativos** (marcados "DEMONSTRATIVO"); só os emblemas têm efeito real. Equipar molduras/temas/efeitos: em desenvolvimento.
- Não há dados de exemplo de vídeos nem usuários.
- Rate limit em memória (instância única).
