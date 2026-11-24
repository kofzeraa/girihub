import { el, field, input, toast, busy, Avatar, Tag, fmtDate, icon, explainIdentity } from '../ui.js';
import { get, patch, post, uploadFile } from '../api.js';
import { state, setUser } from '../state.js';

/** Campo de imagem: escolhe arquivo, envia ao servidor e guarda a URL num input escondido. */
function imageField(label, name, current, round) {
  const hidden = el('input', { type: 'hidden', name, value: current || '' });
  const preview = el('div', { class: `img-preview${round ? ' round' : ''}` });
  const paint = () => preview.replaceChildren(hidden.value ? el('img', { src: hidden.value, alt: '' }) : el('span', { class: 'muted' }, 'Sem imagem'));
  const file = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true, onchange: async () => {
    const f = file.files[0];
    if (!f) return;
    try { hidden.value = await uploadFile(f, 'image'); paint(); } catch (e) { toast(e.message, 'error'); }
  } });
  paint();
  return el('div', { class: 'field' }, el('span', {}, label), preview, hidden, file,
    el('div', { class: 'row' },
      el('button', { class: 'btn ghost small', type: 'button', onclick: () => file.click() }, 'Escolher imagem'),
      el('button', { class: 'btn ghost small', type: 'button', onclick: () => { hidden.value = ''; paint(); } }, 'Remover')),
    el('small', {}, 'JPG, PNG ou WebP até 5 MB.'));
}

export async function render() {
  const me = state.user;
  const [{ items: allTags }, { items: mine }, { request }] = await Promise.all([get('/tags'), get('/me/tags'), get('/me/verification')]);
  const chosen = new Set(mine.map((t) => t.id));

  const tagBox = el('div', { class: 'chips' }, allTags.map((t) => {
    const cb = el('input', { type: 'checkbox', checked: chosen.has(t.id) || null, onchange: () => {
      if (cb.checked && chosen.size >= 3) { cb.checked = false; return toast('Escolha até 3 tags'); }
      cb.checked ? chosen.add(t.id) : chosen.delete(t.id);
    } });
    return el('label', { class: 'chip-check' }, cb, el('span', {}, t.name));
  }));

  const save = el('button', { class: 'btn', type: 'submit' }, 'Salvar perfil');
  const form = el('form', { class: 'card stack', onsubmit: (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    busy(save, async () => {
      const r = await patch('/me', { display_name: f.display_name, bio: f.bio, avatar_url: f.avatar_url, cover_url: f.cover_url, tag_ids: [...chosen] });
      setUser({ ...state.user, ...r.user });
      toast('Perfil salvo', 'ok');
    });
  } },
  el('h2', {}, 'Perfil'),
  field('Nome de exibição', input({ name: 'display_name', value: me.display_name, maxlength: '40', required: true })),
  field('Bio', el('textarea', { class: 'input', name: 'bio', maxlength: '300', rows: '3' }, me.bio || '')),
  imageField('Foto de perfil', 'avatar_url', me.avatar_url, true),
  imageField('Capa', 'cover_url', me.cover_url, false),
  el('div', { class: 'field' }, el('span', {}, 'Tags de identificação (até 3)'), tagBox,
    el('small', {}, 'Tags dizem quem você é; não são verificação. ', el('button', { class: 'link', type: 'button', onclick: explainIdentity }, 'Entenda a diferença'))),
  save);

  /* Verificação oficial */
  let ver;
  if (me.verified) ver = el('p', {}, 'Sua conta é ', el('b', {}, 'verificada oficialmente'), '.');
  else if (request?.status === 'pending') ver = el('p', {}, 'Seu pedido enviado em ', fmtDate(request.created_at), ' está em análise.');
  else {
    const ta = el('textarea', { class: 'input', rows: '3', maxlength: '500', placeholder: 'Conte por que sua conta deve ser verificada (quem você é, links, etc.)', required: true });
    const send = el('button', { class: 'btn', type: 'submit' }, 'Solicitar verificação');
    ver = el('form', { class: 'stack', onsubmit: (e) => {
      e.preventDefault();
      busy(send, async () => { await post('/me/verification', { message: ta.value }); toast('Pedido enviado!', 'ok'); location.reload(); });
    } },
    request?.status === 'rejected' && el('p', { class: 'form-error' }, `Seu último pedido foi recusado${request.note ? `: ${request.note}` : '.'} Você pode enviar um novo.`),
    ta, send);
  }

  return el('div', { class: 'page narrow stack' },
    el('h1', {}, 'Configurações'),
    form,
    el('section', { class: 'card stack' }, el('h2', {}, 'Verificação oficial'), el('p', { class: 'muted' }, 'A verificação é concedida pela administração do GiriHub após análise.'), ver),
    el('section', { class: 'card stack' }, el('h2', {}, 'Conta'), el('p', { class: 'muted' }, `${me.email} · @${me.username}`)));
}
