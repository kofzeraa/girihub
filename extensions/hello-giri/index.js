// Exemplo de extensão (servidor). Exporta register(api).
export function register(api) {
  // 1) Tabela própria, sempre com o prefixo ext_<id>_
  api.db.migrate([
    `CREATE TABLE ext_hello_giri_greetings(
       id INTEGER PRIMARY KEY,
       user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       created_at INTEGER NOT NULL
     )`,
  ]);

  // 2) Rota em /api/ext/hello-giri/hello (aparece automaticamente em /api/docs)
  api.router.post('/hello', { auth: true, desc: 'Registra uma saudação do usuário logado.' }, (ctx) => {
    api.db.run('INSERT INTO ext_hello_giri_greetings(user_id,created_at) VALUES(?,?)', ctx.user.id, Date.now());
    const n = api.db.get('SELECT COUNT(*) AS n FROM ext_hello_giri_greetings WHERE user_id=?', ctx.user.id).n;
    return { message: `Olá, ${ctx.user.display_name}!`, greetings: n };
  });

  // 3) Hook: reage a eventos do núcleo sem alterá-lo
  api.hooks.on('video.published', ({ userId, videoId }) => api.log(`usuário ${userId} publicou o vídeo ${videoId}`));
}
