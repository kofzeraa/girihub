import { el, icon, Avatar, NameLine, Tag, BadgeIcon, fmtNum, modal, spinner, toast, empty, explainIdentity } from '../ui.js';
import { get, post, del } from '../api.js';
import { state } from '../state.js';

function userList(title, path) {
  let page = 0;
  const list = el('div', { class: 'user-list' });
  const more = el('button', { class: 'btn ghost small', hidden: true, onclick: load }, 'Carregar mais');
  const m = modal(title, [list, el('div', { class: 'center' }, more)]);
  async function load() {
    try {
      const d = await get(`${path}?page=${page++}`);
      d.items.forEach((u) => list.append(el('a', { class: 'user-row', href: `#/u/${u.username}`, onclick: () => m.close() }, Avatar(u, 2.4), el('div', {}, NameLine(u), el('small', { class: 'muted' }, `@${u.username}`)))));
      if (!list.children.length) list.append(el('p', { class: 'muted center' }, 'Ninguém por aqui ainda.'));
      more.hidden = !d.has_more;
    } catch (e) { toast(e.message, 'error'); }
  }
  load();
}

export async function render({ params }) {
  const uname = params.username;
  const d = await get(`/users/${encodeURIComponent(uname)}`);
  const u = d.user;
  const stats = { ...d.stats };
  let following = d.is_following;

  const followers = el('b', {}, fmtNum(stats.followers));
  const followBtn = el('button', { class: 'btn', onclick: async () => {
    if (!state.user) { location.hash = `#/login?next=${encodeURIComponent(`/u/${u.username}`)}`; return; }
    try {
      const r = await (following ? del : post)(`/users/${u.username}/follow`);
      following = r.following;
      stats.followers = r.followers;
      paint();
    } catch (e) { toast(e.message, 'error'); }
  } });
  function paint() {
    followBtn.textContent = following ? 'Seguindo' : 'Seguir';
    followBtn.classList.toggle('ghost', following);
    followers.textContent = fmtNum(stats.followers);
  }
  paint();

  const grid = el('div', { class: 'vgrid' });
  const more = el('button', { class: 'btn ghost', hidden: true, onclick: () => loadVideos() }, 'Carregar mais vídeos');
  let page = 0;
  async function loadVideos() {
    more.disabled = true;
    try {
      const r = await get(`/users/${encodeURIComponent(uname)}/videos?page=${page++}`);
      grid.querySelector('.spinner')?.remove();
      r.items.forEach((v) => grid.append(el('a', { class: 'vthumb', href: `#/v/${v.id}`, 'aria-label': v.caption || 'Vídeo' },
        el('video', { src: `${v.video_url}#t=0.1`, preload: 'metadata', muted: true, playsinline: true, tabindex: '-1' }),
        el('span', { class: 'vviews' }, icon('play', { size: '0.8rem', fill: true }), fmtNum(v.views)))));
      if (!grid.children.length) grid.replaceWith(empty(d.is_me ? 'Você ainda não publicou vídeos.' : 'Nenhum vídeo publicado ainda.', d.is_me && el('a', { class: 'btn', href: '#/publish' }, 'Publicar vídeo')));
      more.hidden = !r.has_more;
    } catch (e) { toast(e.message, 'error'); }
    more.disabled = false;
  }
  grid.append(spinner());
  loadVideos();

  return el('div', { class: 'page profile' },
    el('div', { class: 'cover' }, u.cover_url && el('img', { src: u.cover_url, alt: '' })),
    el('div', { class: 'profile-head' },
      Avatar(u, 6),
      el('div', { class: 'grow' },
        el('h1', {}, NameLine(u)),
        el('p', { class: 'muted' }, `@${u.username}`)),
      d.is_me ? el('a', { class: 'btn ghost', href: '#/settings' }, icon('edit', { size: '1.1rem' }), 'Editar perfil') : followBtn),
    u.bio && el('p', { class: 'bio' }, u.bio),
    el('div', { class: 'identity' },
      d.tags.map(Tag),
      d.badges.length > 0 && el('span', { class: 'badges' }, d.badges.map(BadgeIcon)),
      el('button', { class: 'icon-btn small', 'aria-label': 'Entenda a diferença entre tags, emblemas e verificação', title: 'Tags, emblemas e verificação', onclick: explainIdentity }, icon('info', { size: '1.1rem' }))),
    el('div', { class: 'stats' },
      el('button', { class: 'stat', onclick: () => userList('Seguidores', `/users/${u.username}/followers`) }, followers, el('span', {}, 'seguidores')),
      el('button', { class: 'stat', onclick: () => userList('Seguindo', `/users/${u.username}/following`) }, el('b', {}, fmtNum(stats.following)), el('span', {}, 'seguindo')),
      el('div', { class: 'stat' }, el('b', {}, fmtNum(stats.videos)), el('span', {}, 'vídeos')),
      el('div', { class: 'stat' }, el('b', {}, fmtNum(stats.likes)), el('span', {}, 'curtidas'))),
    grid, el('div', { class: 'center' }, more));
}
