import { get, run, tx } from '../core/db.js';
import { config } from '../core/config.js';
import { HttpError } from '../core/http.js';
import { v } from '../core/validate.js';
import { limit, hooks } from '../core/misc.js';
import { DUMMY_HASH, bearer, createSession, hashPassword, hashToken, newToken, verifyPassword } from '../core/auth.js';
import { selfUser } from '../services/users.js';
import { sendMail } from '../services/misc.js';

const password = (val) => v.str(val, 'Senha', { min: 8, max: 200, trim: false });

export function register(r) {
  r.post('/api/auth/register', { desc: 'Cria conta. O primeiro usuário (ou GIRIHUB_ADMIN_EMAIL) vira administrador. Retorna {token, user}.' }, async (ctx) => {
    limit(`register:${ctx.ip}`, 10, 3600e3);
    const b = await ctx.body();
    const email = v.str(b.email, 'E-mail', { min: 5, max: 120 }).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'E-mail inválido');
    const username = v.str(b.username, 'Usuário', { min: 3, max: 20 }).toLowerCase();
    if (!/^[a-z0-9_]+$/.test(username)) throw new HttpError(400, 'Usuário: use apenas letras, números e _');
    const display = b.display_name ? v.str(b.display_name, 'Nome', { min: 1, max: 40 }) : username;
    const hash = await hashPassword(password(b.password));
    if (get('SELECT 1 FROM users WHERE email=? OR username=?', email, username)) throw new HttpError(409, 'E-mail ou usuário já cadastrado');
    const id = tx(() => {
      const first = !get('SELECT 1 FROM users LIMIT 1');
      const role = first || (config.adminEmail && email === config.adminEmail) ? 'admin' : 'user';
      return Number(run('INSERT INTO users(email,username,display_name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)', email, username, display, hash, role, Date.now()).lastInsertRowid);
    });
    hooks.emit('user.registered', { userId: id });
    return { token: createSession(id), user: selfUser(get('SELECT * FROM users WHERE id=?', id)) };
  });

  r.post('/api/auth/login', { desc: 'Login por e-mail ou @usuário. Retorna {token, user}.' }, async (ctx) => {
    limit(`login:${ctx.ip}`, 15, 600e3);
    const b = await ctx.body();
    const login = v.str(b.login, 'Login', { min: 1, max: 120 }).toLowerCase();
    const pw = v.str(b.password, 'Senha', { min: 1, max: 200, trim: false });
    const u = get('SELECT * FROM users WHERE email=? OR username=?', login, login);
    const ok = await verifyPassword(pw, u ? u.password_hash : DUMMY_HASH);
    if (!u || !ok) throw new HttpError(401, 'Credenciais inválidas');
    if (u.banned) throw new HttpError(403, 'Conta suspensa');
    return { token: createSession(u.id), user: selfUser(u) };
  });

  r.post('/api/auth/logout', { auth: true, desc: 'Encerra a sessão atual.' }, (ctx) => {
    run('DELETE FROM sessions WHERE token_hash=?', hashToken(bearer(ctx.req)));
    return { ok: true };
  });

  r.get('/api/auth/me', { auth: true, desc: 'Usuário logado (inclui saldo e permissões).' }, (ctx) => ({ user: selfUser(ctx.user) }));

  r.post('/api/auth/forgot', { desc: 'Solicita recuperação de senha. Resposta sempre genérica; o link é enviado pelo transporte de e-mail.' }, async (ctx) => {
    limit(`forgot:${ctx.ip}`, 5, 3600e3);
    const b = await ctx.body();
    const email = String(b.email || '').trim().toLowerCase();
    const u = get('SELECT id, email FROM users WHERE email=?', email);
    if (u) {
      const t = newToken();
      run('INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES(?,?,?)', hashToken(t), u.id, Date.now() + 3600e3);
      await sendMail({ to: u.email, subject: 'GiriHub — redefinição de senha', text: `Redefina sua senha em: ${config.publicUrl}/#/reset?token=${t}\nO link vale por 1 hora.` });
    }
    return { ok: true, message: 'Se o e-mail estiver cadastrado, enviaremos as instruções.' };
  });

  r.post('/api/auth/reset', { desc: 'Define nova senha com o token recebido por e-mail.' }, async (ctx) => {
    limit(`reset:${ctx.ip}`, 10, 3600e3);
    const b = await ctx.body();
    const pw = password(b.password);
    const hash = await hashPassword(pw);
    tx(() => {
      const row = get('SELECT * FROM password_resets WHERE token_hash=? AND used=0 AND expires_at>?', hashToken(String(b.token || '')), Date.now());
      if (!row) throw new HttpError(400, 'Link inválido ou expirado');
      run('UPDATE password_resets SET used=1 WHERE token_hash=?', row.token_hash);
      run('UPDATE users SET password_hash=? WHERE id=?', hash, row.user_id);
      run('DELETE FROM sessions WHERE user_id=?', row.user_id); // encerra todas as sessões
    });
    return { ok: true };
  });
}
