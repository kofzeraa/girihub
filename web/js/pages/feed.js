import { el, icon, Avatar, NameLine, fmtNum, toast, modal, spinner, input } from '../ui.js';
import { get, post, del } from '../api.js';
import { state, setBalance, on } from '../state.js';
import { openComments } from './comments.js';

const TABS = [['foryou', 'Para você'], ['following', 'Seguindo'], ['trending', 'Em alta'], ['surprise', 'Surpresa']];
const store = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} } };
let muted = true; // vídeos começam sem som (exigência dos navegadores para autoplay); preferência vale na sessão

const needLogin = () => {
  toast('Entre na sua conta para continuar');
  location.hash = `#/login?next=${encodeURIComponent(location.hash.slice(1) || '/')}`;
};

export function render({ params }) {
  let tab = TABS.some(([k]) => k === store.get('girihub.tab')) ? store.get('girihub.tab') : 'foryou';
  let page = 0, hasMore = true, busy = false, active = -1, gen = 0, beatTimer = null;
  const seen = new Set();
  const reels = [];

  const scroller = el('div', { class: 'feed', tabindex: '-1' });
  const tabsBar = el('div', { class: 'feed-tabs', role: 'tablist', 'aria-label': 'Feed' });
  const muteBtn = el('button', { class: 'mute-btn', 'aria-label': 'Ativar ou desativar o som', onclick: () => setMuted(!muted) });
  const wrap = el('div', { class: 'feed-wrap' }, tabsBar, muteBtn, scroller);

  /* ----- abas ----- */
  function paintTabs() {
    tabsBar.replaceChildren(...TABS.map(([k, label]) =>
      el('button', { class: `tab${k === tab ? ' on' : ''}`, role: 'tab', 'aria-selected': String(k === tab), onclick: () => { if (k !== tab) { tab = k; store.set('girihub.tab', k); paintTabs(); reset(); } } }, label)));
  }
  function setMuted(m) {
    muted = m;
    reels.forEach((r) => (r.video.muted = m));
    muteBtn.replaceChildren(icon(m ? 'mute' : 'volume'));
  }

  /* ----- carregamento (infinito, em páginas) ----- */
  async function load() {
    if (busy || !hasMore) return;
    busy = true;
    const mine = gen;
    try {
      const q = new URLSearchParams({ tab, page });
      if (tab === 'surprise' && seen.size) q.set('exclude', [...seen].slice(-100).join(','));
      const data = await get(`/feed?${q}`);
      if (mine !== gen) return;
      page++;
      const fresh = data.items.filter((v) => !seen.has(v.id));
      hasMore = data.has_more && fresh.length > 0;
      fresh.forEach(addReel);
      if (!reels.length) showEmpty();
    } catch (e) {
      if (mine !== gen) return;
      hasMore = false;
      if (e.status === 401) showEmpty('Entre na sua conta para ver os vídeos de quem você segue.', true);
      else toast(e.message, 'error');
    } finally {
      busy = false;
    }
  }
  function reset() {
    gen++;
    stopBeat();
    reels.splice(0).forEach((r) => { io.unobserve(r.node); r.video.removeAttribute('src'); r.video.load(); });
    scroller.replaceChildren();
    page = 0; hasMore = true; active = -1; busy = false;
    seen.clear();
    load();
  }
  function showEmpty(msg, login) {
    const defaults = {
      following: 'Você ainda não segue ninguém que tenha publicado vídeos. Siga criadores para vê-los aqui.',
    };
    scroller.replaceChildren(el('div', { class: 'feed-empty' },
      el('h2', {}, 'GiriHub'),
      el('p', {}, msg || defaults[tab] || 'Ainda não há vídeos publicados por aqui.'),
      login ? el('a', { class: 'btn', href: '#/login?next=%2F' }, 'Entrar')
        : el('a', { class: 'btn', href: state.user ? '#/publish' : '#/register' }, state.user ? 'Publicar um vídeo' : 'Criar conta')));
  }

  /* ----- cada vídeo ----- */
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting && e.intersectionRatio >= 0.6) setActive(reels.findIndex((r) => r.node === e.target));
  }, { root: scroller, threshold: [0.6] });

  function addReel(v) {
    seen.add(v.id);
    scroller.querySelector('.feed-empty')?.remove();
    const video = el('video', { class: 'reel-video', loop: true, playsinline: true, preload: 'none', poster: v.poster_url || null, 'aria-label': v.caption || 'Vídeo' });
    video.muted = muted;
    const r = { v, video };
    const bar = el('i');
    r.bar = bar;
    const flash = el('div', { class: 'play-flash' }, icon('play', { size: '3.5rem', fill: true }));
    const err = el('div', { class: 'reel-error', hidden: true }, 'Não foi possível carregar este vídeo.');
    video.addEventListener('play', () => r.node.classList.remove('paused'));
    video.addEventListener('pause', () => r.node.classList.add('paused'));
    video.addEventListener('error', () => { if (video.getAttribute('src')) err.hidden = false; });
    video.addEventListener('playing', () => (err.hidden = true));

    const act = (name, ico, label, onclick) => {
      const count = el('span', {}, label);
      const b = el('button', { class: 'act', 'data-act': name, 'aria-label': name, onclick }, el('span', { class: 'ico' }, icon(ico, { size: '1.6rem', fill: name === 'like' })), count);
      return { b, count };
    };
    r.like = act('like', 'heart', '', () => toggleLike(r));
    r.comment = act('comentar', 'comment', '', () => openComments(v, (n) => { v.comments_count = n; paint(r); }));
    r.share = act('compartilhar', 'share', 'Compartilhar', () => share(v));

    const follow = el('button', { class: 'follow-plus', 'aria-label': `Seguir @${v.author.username}`, onclick: () => toggleFollow(r) }, icon('plus', { size: '0.9rem' }));
    r.follow = follow;
    const me = state.user?.id;
    const avatar = el('div', { class: 'act-avatar' }, el('a', { href: `#/u/${v.author.username}`, 'aria-label': `Perfil de @${v.author.username}` }, Avatar(v.author, 3)), me !== v.author.id && follow);

    const hint = !state.user ? el('a', { class: 'earn-hint', href: '#/login' }, '🪙 Entre para ganhar GiriCoins assistindo') : null;
    r.node = el('section', { class: 'reel paused', 'data-id': v.id },
      el('div', { class: 'reel-card' },
        video, err, flash,
        el('div', { class: 'reward-bar', 'aria-hidden': 'true' }, bar),
        el('div', { class: 'reel-tap', tabindex: '0', role: 'button', 'aria-label': 'Reproduzir ou pausar', onclick: () => togglePlay(r), ondblclick: () => !r.v.liked && toggleLike(r) }),
        el('div', { class: 'reel-info' },
          el('a', { class: 'author', href: `#/u/${v.author.username}` }, NameLine(v.author), el('small', {}, `@${v.author.username}`)),
          v.caption && el('p', { class: 'caption' }, v.caption),
          hint),
        el('div', { class: 'reel-actions' }, avatar, r.like.b, r.comment.b, r.share.b)));
    reels.push(r);
    scroller.append(r.node);
    io.observe(r.node);
    paint(r);
  }

  function paint(r) {
    const { v } = r;
    r.like.b.classList.toggle('on', v.liked);
    r.like.b.setAttribute('aria-pressed', String(v.liked));
    r.like.count.textContent = fmtNum(v.likes_count);
    r.comment.count.textContent = fmtNum(v.comments_count);
    r.follow.hidden = v.following;
  }

  /* ----- ações ----- */
  async function toggleLike(r) {
    if (!state.user) return needLogin();
    const was = r.v.liked;
    r.v.liked = !was;
    r.v.likes_count += was ? -1 : 1;
    paint(r);
    try {
      const d = await (was ? del : post)(`/videos/${r.v.id}/like`);
      r.v.liked = d.liked;
      r.v.likes_count = d.likes_count;
    } catch (e) {
      r.v.liked = was;
      r.v.likes_count += was ? 1 : -1;
      toast(e.message, 'error');
    }
    paint(r);
  }
  async function toggleFollow(r) {
    if (!state.user) return needLogin();
    try {
      await post(`/users/${r.v.author.username}/follow`);
      reels.filter((x) => x.v.author.id === r.v.author.id).forEach((x) => { x.v.following = true; paint(x); });
      toast(`Você agora segue @${r.v.author.username}`);
    } catch (e) { toast(e.message, 'error'); }
  }
  function share(v) {
    const url = `${location.origin}/#/v/${v.id}`;
    if (navigator.share) return navigator.share({ title: 'GiriHub', text: v.caption || 'Veja este vídeo no GiriHub', url }).catch(() => {});
    navigator.clipboard?.writeText(url).then(() => toast('Link copiado!', 'ok'), () => manual(url));
    if (!navigator.clipboard) manual(url);
  }
  function manual(url) {
    const i = input({ value: url, readonly: true, onfocus: (e) => e.target.select() });
    modal('Copie o link', i);
    i.select();
  }
  function togglePlay(r) {
    if (r.video.paused) play(r);
    else r.video.pause();
  }

  /* ----- reprodução automática e carregamento progressivo ----- */
  function attach(r, preload) {
    if (!r.video.getAttribute('src')) r.video.src = r.v.video_url;
    r.video.preload = preload;
  }
  function release(r) {
    if (r.video.getAttribute('src')) { r.video.pause(); r.video.removeAttribute('src'); r.video.load(); }
  }
  function play(r) {
    r.video.muted = muted;
    r.video.play()?.catch(() => r.node.classList.add('paused'));
  }
  function setActive(i) {
    if (i < 0 || i === active) return;
    reels[active]?.video.pause();
    stopBeat();
    active = i;
    const r = reels[i];
    attach(r, 'auto');
    play(r);
    [reels[i + 1], reels[i - 1]].forEach((n) => n && attach(n, 'metadata'));
    reels.forEach((x, idx) => { if (Math.abs(idx - i) > 2) release(x); });
    if (i >= reels.length - 2) load();
    startBeat(r);
  }

  /* ----- GiriCoins: o navegador só envia batimentos; o servidor mede o tempo e paga ----- */
  function stopBeat() { clearInterval(beatTimer); beatTimer = null; }
  function startBeat(r) {
    stopBeat();
    if (!state.user) return;
    beat(r);
    beatTimer = setInterval(() => beat(r), 2000);
  }
  async function beat(r) {
    if (document.hidden || r.video.paused || reels[active] !== r) return;
    try {
      const d = await post('/watch/heartbeat', { video_id: r.v.id });
      r.bar.style.width = `${Math.min(100, (d.accumulated_ms / d.required_ms) * 100)}%`;
      r.bar.classList.toggle('done', d.rewarded);
      if (d.newly_rewarded) { setBalance(d.balance); toast(`+${d.coins} GiriCoins`, 'coin'); }
      else if (d.reason === 'daily_cap' && !r.capShown) { r.capShown = true; toast('Você atingiu o limite diário de GiriCoins'); }
    } catch (e) {
      if (e.status === 401) stopBeat();
    }
  }

  /* ----- teclado (computador) ----- */
  function go(delta) {
    const t = reels[active + delta];
    if (t) t.node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (delta > 0) load();
  }
  function onKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.modal-back') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const r = reels[active];
    const tv = document.documentElement.classList.contains('tv');
    switch (e.key) {
      case 'ArrowDown': case 'j': go(1); break;
      case 'ArrowUp': case 'k': if (tv && active <= 0) return; go(-1); break;
      case ' ': if (e.target.closest('button,a')) return; r && togglePlay(r); break;
      case 'm': setMuted(!muted); break;
      case 'l': r && toggleLike(r); break;
      case 'c': r && r.comment.b.click(); break;
      default: return;
    }
    e.preventDefault();
  }
  const onVisibility = () => {
    const r = reels[active];
    if (!r) return;
    if (document.hidden) r.video.pause();
    else play(r);
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);
  const offUser = on('user', () => { const r = reels[active]; if (r) startBeat(r); });

  /* ----- início ----- */
  paintTabs();
  setMuted(muted);
  scroller.append(el('div', { class: 'feed-empty' }, spinner()));
  (async () => {
    if (params.id) {
      try {
        const { video } = await get(`/videos/${params.id}`);
        scroller.replaceChildren();
        addReel(video);
      } catch (e) { toast(e.message, 'error'); }
    }
    load();
  })();

  return {
    node: wrap,
    destroy() {
      gen++;
      stopBeat();
      io.disconnect();
      offUser();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      reels.forEach((r) => { r.video.pause(); r.video.removeAttribute('src'); });
    },
  };
}
