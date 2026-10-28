'use strict';
// Núcleo da interface: utilitários, chamadas à API, avisos, janelas modais.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const API = (canal, ...a) => window.api.invocar(canal, ...a);
const MZ = new Intl.NumberFormat('pt-MZ');
const mt = (n) => `${MZ.format(n)} MT`;
const dataHora = (t) => (t ? new Date(t).toLocaleString('pt-MZ', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const dataCurta = (t) => (t ? new Date(t).toLocaleDateString('pt-MZ') : '—');
const bytes = (n) => (n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' GB' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

const E = { user: null, info: null, rota: 'home', ctx: {} };

function toast(msg, erro = false) {
  const t = document.createElement('div'); t.className = 'toast' + (erro ? ' err' : ''); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), erro ? 6000 : 3200);
}
// Executa uma acção, mostra erros; mensagens "LIMITE:" abrem o convite ao Premium.
async function tentar(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e) {
    const m = String(e.message || e).replace(/^Error invoking remote method '[^']+': Error: /, '');
    if (m === 'SESSAO_EXPIRADA') { toast('A sessão expirou por inactividade. Entre novamente.', true); E.user = null; mostrarAuth(); return undefined; }
    if (m.startsWith('LIMITE:')) { modalLimite(m.replace('LIMITE:', '').trim()); return undefined; }
    toast(m, true); return undefined;
  }
}
function modal(html, aoAbrir) {
  const ov = document.createElement('div'); ov.className = 'ov';
  ov.innerHTML = `<div class="md">${html}</div>`;
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
  const fechar = () => ov.remove();
  if (aoAbrir) aoAbrir(ov, fechar);
  return { ov, fechar };
}
function modalLimite(msg) {
  modal(`<h2>⭐ Recurso Premium</h2><p>${esc(msg)}</p>
    <div class="row sp"><button class="sec" data-f>Agora não</button><button data-up>Ver planos — a partir de 99 MT</button></div>`,
  (ov, f) => { $('[data-f]', ov).onclick = f; $('[data-up]', ov).onclick = () => { f(); ir('planos'); }; });
}
function pedir(titulo, campos, okTxt = 'Guardar') {
  return new Promise((res) => {
    const { ov, fechar } = modal(`<h2>${esc(titulo)}</h2>${campos.map((c) => `<label>${esc(c.rotulo)}</label>${
      c.tipo === 'area' ? `<textarea name="${c.nome}" placeholder="${esc(c.dica || '')}">${esc(c.valor || '')}</textarea>`
      : c.opcoes ? `<select name="${c.nome}">${c.opcoes.map((o) => `<option value="${esc(o.v ?? o)}">${esc(o.t ?? o)}</option>`).join('')}</select>`
      : `<input name="${c.nome}" type="${c.tipo || 'text'}" value="${esc(c.valor ?? '')}" placeholder="${esc(c.dica || '')}">`}`).join('')}
      <div class="row sp" style="margin-top:16px"><button class="sec" data-c>Cancelar</button><button data-o>${esc(okTxt)}</button></div>`);
    $('[data-c]', ov).onclick = () => { fechar(); res(null); };
    $('[data-o]', ov).onclick = () => { const o = {}; $$('[name]', ov).forEach((i) => (o[i.name] = i.value)); fechar(); res(o); };
    const p = $('[name]', ov); if (p) p.focus();
  });
}
const confirmar = (msg) => new Promise((res) => {
  const { ov, fechar } = modal(`<p>${esc(msg)}</p><div class="row sp"><button class="sec" data-n>Cancelar</button><button class="err" data-s>Confirmar</button></div>`);
  $('[data-n]', ov).onclick = () => { fechar(); res(false); }; $('[data-s]', ov).onclick = () => { fechar(); res(true); };
});
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const corClasse = (c) => ({ verde: 'verde', amarelo: 'amarelo', vermelho: 'vermelho' }[c] || 'neutro');
const num = (v) => (v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','));
const iniciais = (n) => String(n || '?').split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
const barra = (p) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, p))}%"></i></div>`;
