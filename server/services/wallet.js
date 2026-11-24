// Única porta de entrada para alterar saldo de GiriCoins. Tudo é registrado no livro-razão (wallet_tx).
import { get, run, tx } from '../core/db.js';
import { HttpError } from '../core/http.js';

/**
 * Aplica um crédito (amount > 0) ou débito (amount < 0) de forma atômica.
 * - Nunca permite saldo negativo (checagem aqui + CHECK no banco).
 * - idemKey torna a operação idempotente por usuário (repetir não duplica).
 */
export function applyTx(userId, amount, { type, description = '', ref = '', idemKey = null }) {
  if (!Number.isInteger(amount) || amount === 0) throw new HttpError(400, 'Valor de transação inválido');
  return tx(() => {
    if (idemKey) {
      const ex = get('SELECT * FROM wallet_tx WHERE user_id=? AND idem_key=?', userId, idemKey);
      if (ex) return { tx: ex, duplicate: true };
    }
    const u = get('SELECT balance FROM users WHERE id=?', userId);
    if (!u) throw new HttpError(404, 'Usuário não encontrado');
    const next = u.balance + amount;
    if (next < 0) throw new HttpError(402, 'Saldo insuficiente de GiriCoins');
    const now = Date.now();
    run('UPDATE users SET balance=? WHERE id=?', next, userId);
    const r = run(
      'INSERT INTO wallet_tx(user_id,amount,balance_after,type,description,ref,idem_key,created_at) VALUES(?,?,?,?,?,?,?,?)',
      userId, amount, next, type, description, ref, idemKey, now,
    );
    return {
      tx: { id: Number(r.lastInsertRowid), user_id: userId, amount, balance_after: next, type, description, ref, created_at: now },
      duplicate: false,
    };
  });
}

export const balanceOf = (userId) => get('SELECT balance FROM users WHERE id=?', userId)?.balance ?? 0;
