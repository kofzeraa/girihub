import { el, icon, Coins, fmtDate, toast } from '../ui.js';
import { get } from '../api.js';
import { state, setBalance } from '../state.js';

const TYPES = { watch_reward: 'Recompensa por assistir', purchase: 'Compra na loja' };

export async function render() {
  const w = await get('/wallet');
  setBalance(w.balance);
  const r = w.rules;
  const list = el('div', { class: 'tx-list' });
  const more = el('button', { class: 'btn ghost', hidden: true, onclick: () => load() }, 'Carregar mais');
  let last = null;

  async function load() {
    more.disabled = true;
    try {
      const d = await get(`/wallet/transactions${last ? `?before=${last}` : ''}`);
      d.items.forEach((t) => {
        last = t.id;
        list.append(el('div', { class: 'tx' },
          el('div', { class: 'grow' }, el('b', {}, t.description || TYPES[t.type] || t.type), el('small', { class: 'muted' }, fmtDate(t.created_at))),
          el('div', { class: `amount ${t.amount > 0 ? 'plus' : 'minus'}` }, `${t.amount > 0 ? '+' : '−'}${Math.abs(t.amount).toLocaleString('pt-BR')}`, el('small', { class: 'muted' }, `saldo ${t.balance_after.toLocaleString('pt-BR')}`))));
      });
      if (!list.children.length) list.append(el('p', { class: 'muted center' }, 'Nenhuma transação ainda. Assista a vídeos para ganhar GiriCoins!'));
      more.hidden = !d.has_more;
    } catch (e) { toast(e.message, 'error'); }
    more.disabled = false;
  }
  load();

  const pct = r.daily_cap > 0 ? Math.min(100, (w.earned_today / r.daily_cap) * 100) : 0;
  return el('div', { class: 'page narrow stack' },
    el('section', { class: 'balance-card' },
      el('span', { class: 'muted' }, 'Seu saldo'),
      el('div', { class: 'balance' }, icon('coin', { size: '2.2rem' }), w.balance.toLocaleString('pt-BR'), el('small', {}, 'GiriCoins')),
      el('a', { class: 'btn', href: '#/shop' }, 'Ir para a loja')),
    el('section', { class: 'card stack' },
      el('h2', {}, 'Como ganhar'),
      r.enabled
        ? el('p', {}, `Assista a um vídeo por ${r.watch_seconds} segundos para ganhar `, Coins(r.coins_per_view), '. Cada vídeo rende uma vez. Você não ganha com os seus próprios vídeos.')
        : el('p', { class: 'muted' }, 'As recompensas por assistir estão pausadas no momento.'),
      r.enabled && el('div', {}, el('div', { class: 'meter' }, el('i', { style: { width: `${pct}%` } })), el('small', { class: 'muted' }, `Hoje: ${w.earned_today.toLocaleString('pt-BR')} de ${r.daily_cap.toLocaleString('pt-BR')} GiriCoins (limite diário)`))),
    el('section', { class: 'stack' }, el('h2', {}, 'Histórico'), list, el('div', { class: 'center' }, more)));
}
