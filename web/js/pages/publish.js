import { el, field, input, toast, busy } from '../ui.js';
import { get, post, uploadFile } from '../api.js';

export async function render() {
  const { items: cats } = await get('/categories');
  const file = el('input', { class: 'input', type: 'file', accept: 'video/mp4,video/webm' });
  const url = input({ type: 'url', placeholder: 'https://… (opcional, no lugar do arquivo)' });
  const caption = el('textarea', { class: 'input', rows: '3', maxlength: '300', placeholder: 'Escreva uma legenda' });
  const cat = el('select', { class: 'input' }, el('option', { value: '' }, 'Sem categoria'), cats.map((c) => el('option', { value: c.id }, c.name)));
  const status = el('p', { class: 'muted', role: 'status' });
  const btn = el('button', { class: 'btn', type: 'submit' }, 'Publicar');

  const form = el('form', { class: 'card stack', onsubmit: (e) => {
    e.preventDefault();
    busy(btn, async () => {
      let videoUrl = url.value.trim();
      if (file.files[0]) {
        status.textContent = 'Enviando vídeo… não feche esta página.';
        videoUrl = await uploadFile(file.files[0], 'video');
      }
      if (!videoUrl) return toast('Escolha um arquivo de vídeo ou informe uma URL', 'error');
      status.textContent = 'Publicando…';
      const r = await post('/videos', { video_url: videoUrl, caption: caption.value, category_id: cat.value || null });
      toast('Vídeo publicado!', 'ok');
      location.hash = `#/v/${r.id}`;
    }).finally(() => (status.textContent = ''));
  } },
  el('h1', {}, 'Publicar vídeo'),
  field('Arquivo de vídeo', file, 'MP4 ou WebM. Vertical (9:16) fica melhor no feed.'),
  field('Ou URL do vídeo', url, 'Link direto para um arquivo .mp4 ou .webm.'),
  field('Legenda', caption),
  field('Categoria', cat),
  status, btn);
  return el('div', { class: 'page narrow' }, form);
}
