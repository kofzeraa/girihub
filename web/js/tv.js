// Modo TV (Smart TV / controle remoto): escala maior, foco visível e navegação direcional entre elementos.
import { closeTopModal } from './ui.js';

const TV_UA = /SmartTV|SMART-TV|Tizen|Web0S|WebOS|HbbTV|NetCast|AppleTV|GoogleTV|Android TV|BRAVIA|CrKey|AFTT|AFTM|Roku/i;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]';

export const isTv = () => document.documentElement.classList.contains('tv');

function visible(n) {
  const r = n.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && getComputedStyle(n).visibility !== 'hidden';
}

/** Move o foco para o elemento mais próximo na direção pedida. */
function move(dir) {
  const scope = [...document.querySelectorAll('.modal-back')].pop() || document;
  const items = [...scope.querySelectorAll(FOCUSABLE)].filter(visible);
  const cur = document.activeElement;
  if (!items.includes(cur)) return void items[0]?.focus();
  const r = cur.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best = null, bestScore = Infinity;
  for (const it of items) {
    if (it === cur) continue;
    const b = it.getBoundingClientRect();
    const dx = b.left + b.width / 2 - cx, dy = b.top + b.height / 2 - cy;
    const ok = dir === 'left' ? dx < -4 : dir === 'right' ? dx > 4 : dir === 'up' ? dy < -4 : dy > 4;
    if (!ok) continue;
    const horiz = dir === 'left' || dir === 'right';
    const score = (horiz ? Math.abs(dx) : Math.abs(dy)) + (horiz ? Math.abs(dy) : Math.abs(dx)) * 2;
    if (score < bestScore) [best, bestScore] = [it, score];
  }
  best?.focus();
  best?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

const DIRS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
const BACK = new Set(['Escape', 'BrowserBack', 'GoBack', 'XF86Back']);

export function initTv() {
  let tv = false;
  try { tv = localStorage.getItem('girihub.tv'); } catch {}
  const on = tv === '1' || (tv !== '0' && TV_UA.test(navigator.userAgent));
  document.documentElement.classList.toggle('tv', on);

  // Voltar do controle: Escape também funciona em qualquer modo (fecha janelas).
  window.addEventListener('keydown', (e) => {
    const isBack = BACK.has(e.key) || e.keyCode === 10009 /* Tizen */ || e.keyCode === 461 /* webOS */ || (isTv() && e.key === 'Backspace' && !/INPUT|TEXTAREA/.test(e.target.tagName));
    if (isBack) {
      if (closeTopModal()) return e.preventDefault();
      if (isTv() && e.key !== 'Escape') { history.back(); return e.preventDefault(); }
      return;
    }
    if (!isTv() || e.defaultPrevented || !DIRS[e.key]) return;
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
    e.preventDefault();
    move(DIRS[e.key]);
  });

  // OK/Enter em elementos focáveis que não são botões nativos.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && isTv() && e.target.matches?.('[tabindex="0"]:not(button):not(a):not(input)')) e.target.click();
  });
}
