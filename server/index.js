import { config } from './core/config.js';
import { createApp } from './app.js';

const server = await createApp();
server.listen(config.port, config.host, () => {
  console.log(`\n  GiriHub rodando em ${config.publicUrl}`);
  console.log('  O primeiro usuário cadastrado vira administrador (ou use GIRIHUB_ADMIN_EMAIL).\n');
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
