'use strict';
// Estrutura principal: menu lateral, rotas, banner offline, tema, expiração de sessão.
const ROTAS = {
  home: { t: 'Início', i: '🏠', f: () => paginaHome },
  caderneta: { t: 'Caderneta Mestra', i: '📒', f: () => paginaCaderneta },
  plano: { t: 'Plano de Aula', i: '📝', f: () => paginaPlano },
  apresentacao: { t: 'Apresentação', i: '🖥️', f: () => paginaApresentacao },
  fichas: { t: 'Fichas e Testes', i: '📄', f: () => paginaFichas },
  biblioteca: { t: 'Biblioteca', i: '📚', f: () => paginaBiblioteca },
  voz: { t: 'Assistente de Voz', i: '🎙️', f: () => paginaVoz },
  director: { t: 'Dashboard do Director', i: '📊', f: () => paginaDirector },
  offline: { t: 'Central Offline', i: '☁️', f: () => paginaOffline },
  planos: { t: 'Planos Premium', i: '⭐', f: () => paginaPlanos },
  suporte: { t: 'Suporte', i: '💬', f: () => paginaSuporte },
};
const ADMIN_ROTAS = { adm_dash: 'Visão geral', adm_users: 'Utilizadores', adm_fila: 'Fila de pagamentos', adm_config: 'Números de pagamento', adm_inbox: 'Reclamações', adm_chat: 'Chat', adm_update: 'Actualizações', adm_logs: 'Logs' };

function tema(t) { document.documentElement.dataset.tema = t; try { localStorage.setItem('tema', t); } catch {} }
function fecharMenu() { $('.side')?.classList.remove('open'); $('#vel')?.classList.remove('on'); }
function ir(rota, ctx = {}) { E.rota = rota; E.ctx = ctx; desenhar(); }

async function iniciarApp() {
  E.info = E.user.papel === 'admin' ? null : await tentar(() => API('planos.info'));
  E.rota = E.user.papel === 'admin' ? 'adm_dash' : 'home';
  desenharCasca();
  desenhar();
}

function desenharCasca() {
  const u = E.user, adm = u.papel === 'admin';
  const itens = adm ? Object.entries(ADMIN_ROTAS).map(([k, t]) => [k, t, '🛠️']) : Object.entries(ROTAS).map(([k, r]) => [k, r.t, r.i]);
  const pk = E.info?.planoKey || 'gratis';
  $('#raiz').innerHTML = `<div class="app"><nav class="side"><div class="logo"><img src="logo.png" alt="">AulaPro</div>
    ${itens.map(([k, t, i]) => `<a data-r="${k}">${i} ${esc(t)}</a>`).join('')}<div class="grow"></div>
    ${adm ? '' : `<div class="plano"><b>Plano ${esc(E.info?.planos?.[pk]?.nome || 'Grátis')}</b><div class="mut" style="color:#AFC3EE">${pk === 'gratis' ? 'Recursos limitados' : 'Válido até ' + dataCurta(E.info.expira)}</div>${pk === 'gratis' ? '<button class="sm" id="up" style="margin-top:8px;width:100%;background:#fff;color:var(--az)">Assinar 299 MT/mês</button>' : ''}</div>`}
    <a id="sair" style="margin-top:8px">🚪 Sair</a></nav>
    <div id="vel" class="vel"></div><div class="main"><div id="off" class="off hide">Modo Offline activo — as alterações são guardadas localmente e sincronizadas quando voltar online.</div>
    <div class="top"><div class="row" style="flex-wrap:nowrap"><button class="mn" id="mn" aria-label="Menu">☰</button><div id="titulo" class="b"></div></div><div class="u"><button class="gh" id="tm" title="Tema">🌓</button><button class="gh" id="chtb" title="Mensagens">🔔<span id="nl" class="badge hide"></span></button>
    <div style="text-align:right"><div class="b">${esc(u.nome)}</div><div class="sm mut">${esc(adm ? 'Desenvolvedor' : (u.escola || (u.papel === 'director' ? 'Director' : 'Professor')))}</div></div><div class="av">${esc(iniciais(u.nome))}</div></div></div>
    <div id="pg" class="pg"></div></div></div>`;
  $$('[data-r]').forEach((a) => (a.onclick = () => { fecharMenu(); ir(a.dataset.r); }));
  $('#mn').onclick = () => { $('.side').classList.toggle('open'); $('#vel').classList.toggle('on'); };
  $('#vel').onclick = fecharMenu;
  $('#sair').onclick = async () => { await API('auth.sair'); E.user = null; mostrarAuth(); };
  $('#tm').onclick = () => tema(document.documentElement.dataset.tema === 'escuro' ? 'claro' : 'escuro');
  $('#chtb').onclick = () => ir(adm ? 'adm_chat' : 'suporte');
  if ($('#up')) $('#up').onclick = () => ir('planos');
  const modoRede = () => $('#off').classList.toggle('hide', navigator.onLine);
  window.addEventListener('online', modoRede); window.addEventListener('offline', modoRede); modoRede();
  if (!adm) verificarVersao();
}
async function verificarVersao() {
  const v = await API('app.versao').catch(() => null);
  if (v && v.publicada && v.publicada !== v.actual && v.changelog) toast(`Nova versão ${v.publicada}: ${v.changelog}`);
}

async function desenhar() {
  $$('[data-r]').forEach((a) => a.classList.toggle('on', a.dataset.r === E.rota));
  const alvo = $('#pg'); if (!alvo) return;
  const nome = ROTAS[E.rota]?.t || ADMIN_ROTAS[E.rota] || '';
  $('#titulo').textContent = nome;
  if (E.user.papel !== 'admin') E.info = (await API('planos.info').catch(() => E.info)) || E.info;
  const fn = ROTAS[E.rota] ? ROTAS[E.rota].f() : ADMIN_PAGINAS[E.rota];
  alvo.innerHTML = '<div class="mut">A carregar…</div>';
  try { await fn(alvo); } catch (e) { alvo.innerHTML = `<div class="card">Erro: ${esc(e.message)}</div>`; }
  if (E.user.papel !== 'admin') API('home.stats').then((s) => { const b = $('#nl'); if (b) { b.textContent = s.naoLidas; b.classList.toggle('hide', !s.naoLidas); } }).catch(() => {});
}

// Sessão: o processo principal expira após 30 min sem actividade; aqui avisamos o utilizador.
setInterval(async () => { if (E.user) { const u = await API('auth.eu').catch(() => null); if (!u) { E.user = null; toast('Sessão expirada por inactividade.', true); mostrarAuth(); } } }, 60000);

try { tema(localStorage.getItem('tema') || 'claro'); } catch {}
window.addEventListener('DOMContentLoaded', () => mostrarAuth());
