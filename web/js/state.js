import { auth, get } from './api.js';

export const state = { user: null };

const bus = new EventTarget();
export const on = (name, fn) => {
  const h = (e) => fn(e.detail);
  bus.addEventListener(name, h);
  return () => bus.removeEventListener(name, h);
};
const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

export function setUser(u) {
  state.user = u;
  emit('user', u);
}

export function setBalance(balance) {
  if (!state.user) return;
  state.user.balance = balance;
  emit('balance', balance);
}

export async function loadMe() {
  if (!auth.token) return setUser(null);
  try {
    setUser((await get('/auth/me')).user);
  } catch (e) {
    if (e.status === 401 || e.status === 403) auth.clear();
    setUser(null);
  }
}

export const hasPerm = (p) => !!state.user && (state.user.permissions.includes('*') || state.user.permissions.includes(p));
export const isStaff = () => !!state.user && state.user.permissions.length > 0;
