import { el, Avatar, NameLine, modal, toast, spinner, fmtDate, busy, confirmDialog } from '../ui.js';
import { get, post, del } from '../api.js';
import { state } from '../state.js';
import { hasPerm } from '../state.js';

/** Painel de comentários de um vídeo. onCount recebe a nova contagem quando algo muda. */
export function openComments(video, onCount) {
  let page = 0, count = video.comments_count;
  const list = el('div', { class: 'comment-list' });
  const more = el('button', { class: 'btn ghost small', hidden: true, onclick: () => load() }, 'Carregar mais');
  const m = modal(`Comentários`, null, { sheet: true });
  const body = m.node.querySelector('.modal-body');

  const row = (c) => {
    const mine = state.user?.id === c.author.id;
    const node = el('div', { class: 'comment' },
      el('a', { href: `#/u/${c.author.username}`, onclick: () => m.close() }, Avatar(c.author, 2.2)),
      el('div', { class: 'grow' },
        el('div', { class: 'meta' }, NameLine(c.author), el('small', {}, fmtDate(c.created_at))),
        el('p', {}, c.body)),
      (mine || hasPerm('videos.manage')) && el('button', { class: 'btn ghost small', onclick: async () => {
        if (!(await confirmDialog('Excluir este comentário?', 'Excluir'))) return;
        try { await del(`/comments/${c.id}`); node.remove(); onCount(--count); } catch (e) { toast(e.message, 'error'); }
      } }, 'Excluir'));
    return node;
  };

  async function load() {
    more.disabled = true;
    try {
      const d = await get(`/videos/${video.id}/comments?page=${page++}`);
      list.querySelector('.spinner')?.remove();
      d.items.forEach((c) => list.append(row(c)));
      if (!list.children.length) list.append(el('p', { class: 'muted center' }, 'Nenhum comentário ainda. Seja o primeiro!'));
      more.hidden = !d.has_more;
    } catch (e) { toast(e.message, 'error'); }
    more.disabled = false;
  }

  let form;
  if (state.user) {
    const ta = el('input', { class: 'input', name: 'body', maxlength: '300', placeholder: 'Adicione um comentário…', autocomplete: 'off', required: true });
    const send = el('button', { class: 'btn', type: 'submit' }, 'Enviar');
    form = el('form', { class: 'comment-form', onsubmit: async (e) => {
      e.preventDefault();
      const text = ta.value.trim();
      if (!text) return;
      await busy(send, async () => {
        const d = await post(`/videos/${video.id}/comments`, { body: text });
        ta.value = '';
        list.querySelector('.muted')?.remove();
        list.prepend(row({ id: d.id, body: text, created_at: Date.now(), author: state.user }));
        count = d.comments_count;
        onCount(count);
      });
    } }, ta, send);
  } else {
    form = el('a', { class: 'btn', href: '#/login', onclick: () => m.close() }, 'Entre para comentar');
  }
  body.append(list, el('div', { class: 'center' }, more), form);
  list.append(spinner());
  load();
}
