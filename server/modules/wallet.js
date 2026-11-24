import { all, get } from '../core/db.js';
import { v } from '../core/validate.js';
import { limit } from '../core/misc.js';
import { earnedToday, getRules, heartbeat } from '../services/rewards.js';

export function register(r) {
  r.get('/api/wallet', { auth: true, desc: 'Carteira: saldo, ganhos de hoje e regras públicas de recompensa.' }, (ctx) => {
    const rules = getRules();
    return {
      balance: get('SELECT balance FROM users WHERE id=?', ctx.user.id).balance,
      earned_today: earnedToday(ctx.user.id),
      rules: { enabled: rules.enabled, watch_seconds: rules.watchSeconds, coins_per_view: rules.coins, daily_cap: rules.dailyCap },
    };
  });

  r.get('/api/wallet/transactions', { auth: true, desc: 'Histórico de ganhos e gastos (?before=<id> para paginar).' }, (ctx) => {
    const n = 20;
    const before = ctx.query.before ? v.int(ctx.query.before, 'before', { min: 1 }) : Number.MAX_SAFE_INTEGER;
    const rows = all('SELECT id, amount, balance_after, type, description, ref, created_at FROM wallet_tx WHERE user_id=? AND id<? ORDER BY id DESC LIMIT ?', ctx.user.id, before, n + 1);
    return { items: rows.slice(0, n), has_more: rows.length > n };
  });

  r.post('/api/watch/heartbeat', { auth: true, desc: 'Batimento de visualização {video_id}. O servidor mede o tempo e credita GiriCoins conforme as regras (antifraude).' }, async (ctx) => {
    limit(`beat:${ctx.user.id}`, 120, 60e3);
    return heartbeat(ctx.user.id, v.int((await ctx.body()).video_id, 'video_id', { min: 1 }));
  });
}
