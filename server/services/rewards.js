// Recompensa por assistir. O NAVEGADOR APENAS ENVIA "batimentos"; quem mede o tempo é o servidor.
import { get, run, tx } from '../core/db.js';
import { HttpError } from '../core/http.js';
import { getSettings, hooks } from '../core/misc.js';
import { applyTx } from './wallet.js';

export function getRules() {
  const s = getSettings();
  return {
    enabled: Number(s['reward.enabled']) === 1,
    watchSeconds: Number(s['reward.watch_seconds']),
    coins: Number(s['reward.coins_per_view']),
    dailyCap: Number(s['reward.daily_cap']),
    minBeatMs: 1500, // batimentos mais rápidos que isso são ignorados
    maxGapMs: 15000, // intervalo maior que isso (pausa/aba em segundo plano) não conta como assistido
  };
}

const utcDayStart = (now) => now - (now % 864e5);
export const earnedToday = (userId, now = Date.now()) =>
  get("SELECT COALESCE(SUM(amount),0) AS n FROM wallet_tx WHERE user_id=? AND type='watch_reward' AND created_at>=?", userId, utcDayStart(now)).n;

/** Último batimento aceito por usuário (em qualquer vídeo): impede somar tempo em várias abas/vídeos ao mesmo tempo. */
const lastAny = new Map();

export function heartbeat(userId, videoId, now = Date.now()) {
  const rules = getRules();
  const video = get("SELECT id, user_id FROM videos WHERE id=? AND status='published'", videoId);
  if (!video) throw new HttpError(404, 'Vídeo não encontrado');
  const requiredMs = rules.watchSeconds * 1000;

  const result = tx(() => {
    let s = get('SELECT * FROM watch_sessions WHERE user_id=? AND video_id=?', userId, videoId);
    if (!s) {
      run('INSERT INTO watch_sessions(user_id,video_id,accumulated_ms,last_beat) VALUES(?,?,0,?)', userId, videoId, now);
      run('UPDATE videos SET views=views+1 WHERE id=?', videoId);
      lastAny.set(userId, now);
      s = { accumulated_ms: 0, rewarded: 0 };
      return { acc: 0, rewarded: s.rewarded, newly: false, reason: null };
    }
    const delta = now - s.last_beat;
    let acc = s.accumulated_ms;
    if (delta >= rules.minBeatMs) {
      const sinceAny = now - (lastAny.get(userId) ?? 0);
      const add = delta <= rules.maxGapMs ? Math.max(0, Math.min(delta, sinceAny)) : 0;
      acc += add;
      lastAny.set(userId, now);
      run('UPDATE watch_sessions SET accumulated_ms=?, last_beat=? WHERE user_id=? AND video_id=?', acc, now, userId, videoId);
    }
    let newly = false, reason = null;
    if (!s.rewarded) {
      if (!rules.enabled || rules.coins <= 0) reason = 'disabled';
      else if (video.user_id === userId) reason = 'own_video';
      else if (acc >= requiredMs) {
        if (earnedToday(userId, now) + rules.coins > rules.dailyCap) reason = 'daily_cap';
        else {
          applyTx(userId, rules.coins, { type: 'watch_reward', description: 'Recompensa por assistir vídeo', ref: `video:${videoId}`, idemKey: `watch:${videoId}` });
          run('UPDATE watch_sessions SET rewarded=1 WHERE user_id=? AND video_id=?', userId, videoId);
          newly = true;
        }
      }
    }
    return { acc, rewarded: newly || !!s.rewarded, newly, reason };
  });

  if (result.newly) hooks.emit('watch.rewarded', { userId, videoId, coins: rules.coins });
  return {
    accumulated_ms: Math.min(result.acc, requiredMs),
    required_ms: requiredMs,
    rewarded: result.rewarded,
    newly_rewarded: result.newly,
    coins: result.newly ? rules.coins : 0,
    reason: result.reason,
    balance: get('SELECT balance FROM users WHERE id=?', userId).balance,
  };
}
