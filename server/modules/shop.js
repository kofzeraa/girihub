import { all, get, run, tx } from '../core/db.js';
import { HttpError } from '../core/http.js';
import { v, page } from '../core/validate.js';
import { hooks, limit } from '../core/misc.js';
import { applyTx } from '../services/wallet.js';
import { awardBadge } from '../services/users.js';

const PAGE = 12;

export function register(r) {
  r.get('/api/shop/categories', { desc: 'Categorias da loja com quantidade de produtos ativos.' }, () => ({
    items: all(
      `SELECT c.id, c.slug, c.name, c.icon, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.active=1) AS products
       FROM shop_categories c WHERE c.active=1 ORDER BY c.sort, c.id`,
    ),
  }));

  r.get('/api/shop/products', { auth: 'optional', desc: 'Produtos ativos. ?category=<slug> &page=0. Inclui "owned" para o usuário logado.' }, (ctx) => {
    const me = ctx.user?.id ?? 0;
    const cat = ctx.query.category ? String(ctx.query.category) : null;
    const rows = all(
      `SELECT p.id, p.name, p.description, p.image_url, p.price, p.is_demo, p.badge_id, c.slug AS category, c.icon AS category_icon,
              EXISTS(SELECT 1 FROM purchases u WHERE u.user_id=? AND u.product_id=p.id) AS owned
       FROM products p JOIN shop_categories c ON c.id=p.category_id
       WHERE p.active=1 AND c.active=1 AND (? IS NULL OR c.slug=?) ORDER BY p.id DESC LIMIT ? OFFSET ?`,
      me, cat, cat, PAGE + 1, page(ctx.query.page) * PAGE,
    );
    return { items: rows.slice(0, PAGE).map((p) => ({ ...p, is_demo: !!p.is_demo, owned: !!p.owned, grants_badge: p.badge_id != null })), has_more: rows.length > PAGE };
  });

  r.post('/api/shop/buy', { auth: true, desc: 'Compra {product_id} com GiriCoins (débito atômico no servidor). Emblemas são concedidos na hora.' }, async (ctx) => {
    limit(`buy:${ctx.user.id}`, 30, 600e3);
    const id = v.int((await ctx.body()).product_id, 'product_id', { min: 1 });
    const out = tx(() => {
      const p = get('SELECT p.* FROM products p JOIN shop_categories c ON c.id=p.category_id WHERE p.id=? AND p.active=1 AND c.active=1', id);
      if (!p) throw new HttpError(404, 'Produto indisponível');
      if (get('SELECT 1 FROM purchases WHERE user_id=? AND product_id=?', ctx.user.id, id)) throw new HttpError(409, 'Você já possui este item');
      const t = p.price > 0 ? applyTx(ctx.user.id, -p.price, { type: 'purchase', description: `Compra: ${p.name}`, ref: `product:${id}`, idemKey: `purchase:${id}` }).tx : null;
      run('INSERT INTO purchases(user_id,product_id,price_paid,tx_id,created_at) VALUES(?,?,?,?,?)', ctx.user.id, id, p.price, t?.id ?? null, Date.now());
      if (p.badge_id) awardBadge(ctx.user.id, p.badge_id);
      return { product: p, balance: get('SELECT balance FROM users WHERE id=?', ctx.user.id).balance };
    });
    hooks.emit('purchase.completed', { userId: ctx.user.id, productId: id, price: out.product.price });
    return { ok: true, balance: out.balance, badge_granted: out.product.badge_id != null };
  });

  r.get('/api/shop/inventory', { auth: true, desc: 'Inventário e histórico de compras do usuário.' }, (ctx) => ({
    items: all(
      `SELECT u.id, u.price_paid, u.created_at, p.id AS product_id, p.name, p.description, p.image_url, p.is_demo, p.badge_id, c.icon AS category_icon, c.name AS category
       FROM purchases u JOIN products p ON p.id=u.product_id JOIN shop_categories c ON c.id=p.category_id
       WHERE u.user_id=? ORDER BY u.id DESC`,
      ctx.user.id,
    ).map((p) => ({ ...p, is_demo: !!p.is_demo, grants_badge: p.badge_id != null })),
  }));
}
