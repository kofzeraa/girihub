// E-mail (transporte substituível) e conquistas automáticas de emblemas.
import { hooks } from '../core/misc.js';
import { get } from '../core/db.js';
import { awardBadgeByCode } from './users.js';

/* ---------- E-mail ----------
 * Sem servidor SMTP no MVP: por padrão a mensagem é escrita no console do servidor.
 * Para enviar de verdade, chame setMailTransport(async ({to, subject, text}) => {...}) em uma extensão. */
let transport = async ({ to, subject, text }) => console.log(`\n[e-mail → ${to}] ${subject}\n${text}\n`);
export const setMailTransport = (fn) => (transport = fn);
export const sendMail = (msg) => transport(msg);

/* ---------- Conquistas ---------- */
export function initAchievements() {
  hooks.on('video.published', ({ userId }) => awardBadgeByCode(userId, 'first_video'));
  hooks.on('watch.rewarded', ({ userId }) => {
    if (get("SELECT COUNT(*) AS n FROM wallet_tx WHERE user_id=? AND type='watch_reward'", userId).n >= 1) awardBadgeByCode(userId, 'first_reward');
  });
}
