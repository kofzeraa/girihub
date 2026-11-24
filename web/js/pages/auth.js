import { el, field, input, toast } from '../ui.js';
import { auth, post } from '../api.js';
import { setUser } from '../state.js';

/** Formulário de autenticação reutilizável pelas 4 telas. */
function authCard({ title, sub, fields, submit, onSubmit, footer }) {
  const err = el('p', { class: 'form-error', role: 'alert' });
  const btn = el('button', { class: 'btn block', type: 'submit' }, submit);
  const form = el('form', { class: 'auth-card', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    err.textContent = '';
    btn.disabled = true;
    try { await onSubmit(Object.fromEntries(new FormData(form))); } catch (ex) { err.textContent = ex.message; } finally { btn.disabled = false; }
  } },
  el('h1', {}, title), sub && el('p', { class: 'muted' }, sub),
  fields.map((f) => field(f.label, input({ name: f.name, type: f.type || 'text', autocomplete: f.autocomplete, required: true, placeholder: f.placeholder, maxlength: f.max || 120, minlength: f.min }), f.hint)),
  err, btn, footer && el('div', { class: 'auth-footer' }, footer));
  return el('div', { class: 'auth-wrap' }, form);
}

const nextPath = (q) => (q.next && q.next.startsWith('/') && !q.next.startsWith('//') ? q.next : '/');
async function enter(res, q) {
  auth.set(res.token);
  setUser(res.user);
  location.hash = `#${nextPath(q)}`;
}

export function login({ query }) {
  return authCard({
    title: 'Entrar no GiriHub', sub: 'Use seu e-mail ou @usuário.',
    fields: [{ label: 'E-mail ou usuário', name: 'login', autocomplete: 'username' }, { label: 'Senha', name: 'password', type: 'password', autocomplete: 'current-password', max: 200 }],
    submit: 'Entrar',
    onSubmit: async (v) => enter(await post('/auth/login', v), query),
    footer: [el('a', { href: '#/forgot' }, 'Esqueci minha senha'), el('span', {}, ' · '), el('a', { href: `#/register${query.next ? `?next=${encodeURIComponent(query.next)}` : ''}` }, 'Criar conta')],
  });
}

export function registerPage({ query }) {
  return authCard({
    title: 'Criar conta', sub: 'É grátis e leva um minuto.',
    fields: [
      { label: 'Nome de exibição', name: 'display_name', autocomplete: 'name', max: 40 },
      { label: 'Usuário', name: 'username', autocomplete: 'username', placeholder: 'sem espaços', hint: 'Letras, números e _ (3 a 20).', max: 20 },
      { label: 'E-mail', name: 'email', type: 'email', autocomplete: 'email' },
      { label: 'Senha', name: 'password', type: 'password', autocomplete: 'new-password', hint: 'Mínimo de 8 caracteres.', max: 200, min: 8 },
    ],
    submit: 'Criar conta',
    onSubmit: async (v) => { await enter(await post('/auth/register', v), query); toast('Conta criada! Bem-vindo ao GiriHub', 'ok'); },
    footer: [el('span', {}, 'Já tem conta? '), el('a', { href: '#/login' }, 'Entrar')],
  });
}

export function forgot() {
  return authCard({
    title: 'Recuperar senha', sub: 'Informe seu e-mail para receber o link de redefinição.',
    fields: [{ label: 'E-mail', name: 'email', type: 'email', autocomplete: 'email' }],
    submit: 'Enviar link',
    onSubmit: async (v) => {
      const d = await post('/auth/forgot', v);
      toast(d.message, 'ok');
    },
    footer: [el('small', { class: 'muted' }, 'Nesta versão ainda não há servidor de e-mail configurado: o link é registrado no console do servidor até que um transporte de e-mail seja instalado (veja o README).'), el('a', { href: '#/login' }, 'Voltar')],
  });
}

export function reset({ query }) {
  return authCard({
    title: 'Nova senha', sub: 'Escolha uma senha nova para sua conta.',
    fields: [{ label: 'Nova senha', name: 'password', type: 'password', autocomplete: 'new-password', hint: 'Mínimo de 8 caracteres.', max: 200, min: 8 }],
    submit: 'Salvar senha',
    onSubmit: async (v) => {
      await post('/auth/reset', { token: query.token || '', password: v.password });
      toast('Senha alterada. Entre com a nova senha.', 'ok');
      location.hash = '#/login';
    },
  });
}
