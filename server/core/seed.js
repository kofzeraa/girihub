// Dados iniciais ESTRUTURAIS (categorias, tags, emblemas, configurações). Não há usuários nem vídeos falsos.
// Produtos de loja demonstrativos (1 por categoria) são marcados is_demo=1 e rotulados "[DEMO]";
// desative com GIRIHUB_SEED_DEMO=0.
import { get, run, tx } from './db.js';
import { DEFAULT_SETTINGS } from './misc.js';

const empty = (table) => !get(`SELECT 1 FROM ${table} LIMIT 1`);

export function seed() {
  tx(() => {
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) run('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)', k, String(v));

    if (empty('tags'))
      for (const n of ['Criador de conteúdo', 'Influenciador', 'Empresa', 'Artista', 'Gamer', 'Streamer', 'Parceiro']) run('INSERT INTO tags(name) VALUES(?)', n);

    if (empty('categories'))
      for (const n of ['Humor', 'Música', 'Games', 'Educação', 'Esportes', 'Lifestyle']) run('INSERT INTO categories(name) VALUES(?)', n);

    if (empty('badges'))
      for (const b of [
        ['first_video', 'Primeiro vídeo', '🎬', 'achievable', 'Publicou o primeiro vídeo'],
        ['first_reward', 'Primeiros GiriCoins', '🪙', 'achievable', 'Ganhou GiriCoins assistindo vídeos'],
        ['founder', 'Fundador', '🏆', 'admin', 'Concedido pela administração'],
        ['neon_glow', 'Brilho Neon', '✨', 'purchasable', 'Disponível na loja'],
        ['purple_star', 'Estrela Roxa', '⭐', 'purchasable', 'Disponível na loja'],
      ])
        run('INSERT INTO badges(code,name,icon,source,description) VALUES(?,?,?,?,?)', ...b);

    if (empty('shop_categories'))
      [
        ['emblemas', 'Emblemas', '🏅'], ['molduras', 'Molduras de perfil', '🖼️'], ['temas', 'Temas', '🎨'],
        ['efeitos', 'Efeitos', '✨'], ['itens-de-perfil', 'Itens de perfil', '🧩'], ['destaques', 'Destaques', '📌'],
        ['personalizacoes', 'Personalizações', '🛠️'], ['presentes', 'Presentes virtuais', '🎁'], ['beneficios', 'Benefícios', '💎'],
      ].forEach(([slug, name, icon], i) => run('INSERT INTO shop_categories(slug,name,icon,sort) VALUES(?,?,?,?)', slug, name, icon, i));

    if (process.env.GIRIHUB_SEED_DEMO !== '0' && empty('products')) {
      const cat = (slug) => get('SELECT id FROM shop_categories WHERE slug=?', slug).id;
      const badge = (code) => get('SELECT id FROM badges WHERE code=?', code).id;
      const note = 'Produto demonstrativo: sem efeito real nesta versão.';
      [
        ['emblemas', '[DEMO] Emblema Brilho Neon', 'Concede o emblema "Brilho Neon" ao seu perfil. ' + note, 150, badge('neon_glow')],
        ['emblemas', '[DEMO] Emblema Estrela Roxa', 'Concede o emblema "Estrela Roxa" ao seu perfil. ' + note, 300, badge('purple_star')],
        ['molduras', '[DEMO] Moldura Neon', note, 200, null],
        ['temas', '[DEMO] Tema Roxo Profundo', note, 250, null],
        ['efeitos', '[DEMO] Efeito Faíscas', note, 180, null],
        ['itens-de-perfil', '[DEMO] Item de Perfil', note, 100, null],
        ['destaques', '[DEMO] Destaque de Vídeo', note, 400, null],
        ['personalizacoes', '[DEMO] Personalização', note, 120, null],
        ['presentes', '[DEMO] Presente Virtual', note, 50, null],
        ['beneficios', '[DEMO] Benefício', note, 500, null],
      ].forEach(([slug, name, desc, price, badgeId]) =>
        run('INSERT INTO products(category_id,name,description,price,badge_id,is_demo) VALUES(?,?,?,?,?,1)', cat(slug), name, desc, price, badgeId));
    }
  });
}
