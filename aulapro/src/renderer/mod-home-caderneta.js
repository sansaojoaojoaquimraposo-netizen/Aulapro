'use strict';
// Início + Módulo 1 (Caderneta Mestra)
async function paginaHome(el) {
  const s = await API('home.stats');
  const pk = E.info?.planoKey || 'gratis';
  const primeiroNome = s.nome.trim().split(/\s+/)[0] || s.nome;
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const modulos = [
    ['caderneta', '📒', 'Caderneta de Notas', 'Gerir turmas, alunos e médias', 'verde'],
    ['plano', '📝', 'Plano de Aula Gerador', 'Preparar aulas a partir dos seus materiais', 'lilas'],
    ['apresentacao', '🖥️', 'Apresentação 1-Clique', 'Transformar planos em apresentações', 'laranja'],
    ['fichas', '📄', 'Documentos e Fichas', 'Criar fichas, testes e documentos', 'azul'],
    ['biblioteca', '📚', 'Biblioteca de Recursos', 'Encontrar livros e materiais de apoio', 'amarelo'],
    ['voz', '🎙️', 'Assistente de Voz', 'Preparar aulas falando com o assistente', 'menta'],
    ['offline', '☁️', 'Central Offline', 'Gerir conteúdos disponíveis sem internet', 'oceano'],
    ['planos', '⭐', 'Planos Premium', 'Ver planos, pagamentos e recursos', 'rosa'],
    ['suporte', '💬', 'Mensagens e Suporte', 'Falar com a equipa AulaPro', 'violeta'],
  ];
  if (E.user.papel === 'director' || pk === 'escola') {
    modulos.push(['director', '📊', 'Dashboard do Director', 'Acompanhar resultados da escola', 'azul-escuro']);
  }
  const simbolos = { plano: '📝', apresentacao: '🖥️', ficha: '📄' };
  el.innerHTML = `<section class="home-welcome">
    <div class="home-brand"><img src="logo.png" alt=""><div><strong>AulaPro</strong><span>Plataforma de Gestão Pedagógica · Moçambique</span></div></div>
    <div class="home-greeting"><div><h1>${saudacao}, ${E.user.papel === 'director' ? 'Director' : 'Prof.'} ${esc(primeiroNome)}! 👋</h1>
      <p class="mut">${new Date().toLocaleDateString('pt-MZ', { dateStyle: 'full' })} · Vamos organizar o seu trabalho de hoje.</p></div>
      <div class="home-profile"><div class="av">${esc(iniciais(s.nome))}</div><div><b>${esc(s.nome)}</b><span>${esc(E.user.escola || (E.user.papel === 'director' ? 'Director' : 'Professor'))}</span></div></div>
    </div>
  </section>
  <div class="grid home-stats">
    <div class="card home-stat stat-classes"><span class="home-stat-icon">🏫</span><div><b>${s.turmas} ${s.turmas === 1 ? 'Turma Activa' : 'Turmas Activas'}</b><span>Turmas registadas</span></div></div>
    <div class="card home-stat stat-students"><span class="home-stat-icon">👥</span><div><b>${s.estudantes} ${s.estudantes === 1 ? 'Aluno' : 'Alunos'}</b><span>Nas suas turmas</span></div></div>
    <div class="card home-stat stat-average"><span class="home-stat-icon">📈</span><div><b>${s.mediaGeral === null ? '—' : num(s.mediaGeral)}${s.mediaGeral === null ? '' : ' / 20'}</b><span>${s.mediaGeral === null ? 'A média aparece após lançar notas' : 'Média geral das notas finais'}</span></div></div>
  </div>
  <div class="row sp home-section-title"><div><h2>Módulos AulaPro</h2><p class="mut sm">Aceda rapidamente às ferramentas de que precisa.</p></div><button data-n>+ Criar novo</button></div>
  <div class="grid home-modules">${modulos.map(([rota, icone, titulo, descricao, cor]) => `<button class="home-module ${cor}" data-ir="${rota}" type="button">
    <span class="home-module-icon">${icone}</span><span class="home-module-text"><b>${titulo}</b><span>${descricao}</span></span><span class="home-module-arrow" aria-hidden="true">›</span>
  </button>`).join('')}</div>
  ${pk === 'gratis' ? `<div class="banner home-upgrade"><div><div class="b">Conheça o AulaPro Premium</div><div class="sm">Mais recursos para simplificar o seu trabalho pedagógico.</div></div><button data-ir="planos">Ver planos</button></div>` : ''}
  <section class="home-recent"><div class="row sp"><div><h2>Actividade Recente</h2><p class="mut sm">Acompanhe o trabalho guardado na sua conta.</p></div></div>
    <div class="card">${s.recentes.length ? s.recentes.map((d) => `<div class="home-activity"><span class="home-activity-icon">${simbolos[d.tipo] || '•'}</span><span class="home-activity-title">${esc(d.titulo)}</span><span class="sm mut">${dataHora(d.actualizado_em)}</span></div>`).join('')
      : `<div class="home-empty"><span aria-hidden="true">✨</span><div><b>A sua actividade aparecerá aqui</b><p class="sm mut">${s.turmas ? 'Crie um plano, apresentação ou ficha para começar.' : 'Crie a sua primeira turma ou prepare um plano de aula.'}</p></div>${s.turmas ? '' : '<button class="sec" data-ir="caderneta">Criar primeira turma</button>'}</div>`}</div>
  </section>`;
  $$('[data-ir]', el).forEach((c) => (c.onclick = () => ir(c.dataset.ir, c.dataset.t ? { turma: Number(c.dataset.t) } : {})));
  $('[data-n]', el).onclick = async () => {
    const r = await pedir('Criar novo módulo', [{ nome: 'm', rotulo: 'O que pretende criar?', opcoes: [{ v: 'caderneta', t: 'Nova turma (Caderneta)' }, { v: 'plano', t: 'Novo plano de aula' }, { v: 'fichas', t: 'Nova ficha / teste' }] }], 'Continuar');
    if (r) ir(r.m, { novo: true });
  };
}
function tabelaComparativa() {
  const l = [['Caderneta', '1 turma, 35 alunos, Regra A', 'Turmas ilimitadas, Regra A+B, simulador de exame'], ['Plano de aula', '20/mês, só texto, 1 modelo', 'Ilimitado, PDF/Foto, 5 modelos, voz'],
    ['Apresentação', '5/mês com marca de água', 'Ilimitado, sem marca'], ['Fichas/Testes', '5/mês, só PDF com marca', 'Ilimitado, PDF+DOCX, banco de questões'],
    ['Biblioteca', '3 downloads/mês', 'Ilimitado'], ['Voz', '5 usos/mês, 1 min', 'Ilimitado, 10 min por gravação'], ['Offline', '500 MB', '8 GB + backup na nuvem'], ['Suporte', 'Email 72h', 'WhatsApp 24/7 prioritário']];
  return `<div class="card"><table><tr><th></th><th>Grátis</th><th class="az">Premium</th></tr>${l.map((r) => `<tr><td class="b">${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</table></div>`;
}

// ---------------- Caderneta Mestra ----------------
async function paginaCaderneta(el) {
  const turmas = await API('turmas.listar');
  if (E.ctx.novo || !turmas.length) { delete E.ctx.novo; if (await novaTurma()) return paginaCaderneta(el); if (!turmas.length) { el.innerHTML = '<div class="card">Crie uma turma para começar. <button id="nt">Nova turma</button></div>'; $('#nt').onclick = async () => { if (await novaTurma()) ir('caderneta'); }; return; } }
  const tl = await API('turmas.listar');
  const tid = tl.find((t) => t.id === E.ctx.turma)?.id || tl[0].id; E.ctx.turma = tid;
  const c = await API('caderneta.obter', tid); const t = c.turma, r = c.resumo; const premium = E.info.planoKey !== 'gratis';
  const pct = (n) => (r.total ? (n / r.total * 100).toFixed(1).replace('.', ',') + '%' : '—');
  const tri = E.ctx.tri || 1; const cel = (l, tr, campo) => { const v = tr === 0 ? l.exame : l.notas[tr]?.[campo]; return `<td class="c"><input class="nota" data-a="${l.id}" data-t="${tr}" data-c="${campo}" value="${num(v)}" inputmode="decimal"></td>`; };
  el.innerHTML = `<div class="row sp"><div><h1>Caderneta Mestra — ${esc(t.disciplina)}</h1><div class="mut">${esc(t.nome)} · Ano lectivo ${t.ano_lectivo} · ${esc(E.user.escola || '')}</div></div>
    <div class="row"><select id="sel" style="width:auto">${tl.map((x) => `<option value="${x.id}" ${x.id === tid ? 'selected' : ''}>${esc(x.disciplina)} · ${esc(x.nome)}</option>`).join('')}</select>
    <button class="sec" id="nt">+ Turma</button><button class="sec" id="ex1">Exportar PDF</button><button class="sec" id="ex2">Exportar CSV</button></div></div>
  <div class="grid g4" style="margin:14px 0"><div class="card kpi"><div class="mut sm">Total de alunos</div><div class="n">${r.total}</div></div>
    <div class="card kpi v"><div class="mut sm">Aprovados</div><div class="n">${r.aprovados}</div><div class="sm mut">${pct(r.aprovados)}</div></div>
    <div class="card kpi a"><div class="mut sm">Recuperação</div><div class="n">${r.recuperacao}</div><div class="sm mut">${pct(r.recuperacao)}</div></div>
    <div class="card kpi r"><div class="mut sm">Reprovados</div><div class="n">${r.reprovados}</div><div class="sm mut">${pct(r.reprovados)}</div></div></div>
  <div class="card" style="margin-bottom:14px"><div class="row sp"><div><b>Sistema de avaliação</b>
    <div class="sm">Média ACS = (ACS1+ACS2+ACS3)/3 · ${t.regra === 'A' ? 'Regra A: Média T = (2×Média ACS + AT)/3' : 'Regra B: Média T = (2×AT + Média ACS)/3'} · Média Anual = (T1+T2+T3)/3
    ${t.tem_exame ? `· Final = ${t.opcao_exame === 1 ? '(2×Exame + Média Anual)/3' : '(2×Média Anual + Exame)/3'}` : ''}</div><div class="sm mut">Critério de aprovação: classificação final ≥ 10 valores (escala 0–20).</div></div>
    <div class="row"><label style="margin:0">Regra</label><select id="rg" style="width:auto"><option value="A" ${t.regra === 'A' ? 'selected' : ''}>A (padrão Sofala)</option><option value="B" ${t.regra === 'B' ? 'selected' : ''}>B ${premium ? '' : '⭐'}</option></select>
    <label style="margin:0"><input type="checkbox" id="ce" style="width:auto" ${t.tem_exame ? 'checked' : ''}> Com exame (10ª/12ª)</label>
    ${t.tem_exame ? `<select id="oe" style="width:auto"><option value="1" ${t.opcao_exame === 1 ? 'selected' : ''}>Opção 1</option><option value="2" ${t.opcao_exame === 2 ? 'selected' : ''}>Opção 2</option></select>` : ''}</div></div></div>
  <div class="row sp" style="margin-bottom:8px"><input id="q" placeholder="🔍 Pesquisar aluno pelo nome…" style="max-width:320px"><div class="row">
    <div class="tabs" style="margin:0">${[1, 2, 3].map((i) => `<button data-tr="${i}" class="${tri === i ? 'on' : ''}">${i}º Trimestre</button>`).join('')}</div>
    <button class="sec" id="ad">+ Aluno</button><button class="sec" id="im">Importar lista (CSV)</button>${premium ? '<button class="sec" id="sim">Simulador de exame</button>' : ''}</div></div>
  <div class="card" style="padding:0;overflow:auto"><table id="tb"><thead><tr><th>Nº</th><th>Estudante</th><th class="c">ACS1</th><th class="c">ACS2</th><th class="c">ACS3</th><th class="c">AT</th><th class="c">Média T${tri}</th>
    <th class="c">T1</th><th class="c">T2</th><th class="c">T3</th><th class="c">M. Anual</th>${t.tem_exame ? '<th class="c">Exame</th>' : ''}<th class="c">Final</th><th>Resultado</th><th></th></tr></thead><tbody>
    ${c.linhas.map((l) => `<tr data-n="${esc(l.nome.toLowerCase())}"><td>${String(l.numero).padStart(2, '0')}</td><td>${esc(l.nome)}</td>${['acs1', 'acs2', 'acs3', 'at'].map((k) => cel(l, tri, k)).join('')}
      <td class="c nv ${corClasse(l['t' + tri] === null ? null : l['t' + tri] >= 10 ? 'verde' : l['t' + tri] >= 8 ? 'amarelo' : 'vermelho')}">${num(l['t' + tri])}</td>
      ${[1, 2, 3].map((i) => `<td class="c">${num(l['t' + i])}</td>`).join('')}<td class="c b">${num(l.anual)}</td>
      ${t.tem_exame ? cel(l, 0, 'exame') : ''}<td class="c nv ${l.cor}">${num(l.final)}</td>
      <td><span class="pill ${l.cor}">${esc(l.resultado.toUpperCase())}</span></td><td><button class="gh sm" data-del="${l.id}" title="Remover">✕</button></td></tr>`).join('') || '<tr><td colspan="15" class="mut">Sem alunos. Adicione ou importe a lista da turma.</td></tr>'}</tbody></table></div>
  <div class="sm mut" style="margin-top:8px">Legenda: ACS = Avaliação Contínua Sistemática · AT = Avaliação Trimestral · Cores: ≥10 verde, 8 a 9,9 amarelo, &lt;8 vermelho · Classificação arredondada a 1 casa decimal.</div>`;
  $('#sel').onchange = (e) => ir('caderneta', { turma: Number(e.target.value), tri });
  $('#nt').onclick = async () => { if (await novaTurma()) ir('caderneta'); };
  $$('[data-tr]', el).forEach((b) => (b.onclick = () => ir('caderneta', { turma: tid, tri: Number(b.dataset.tr) })));
  const cfg = () => tentar(() => API('turmas.config', tid, { regra: $('#rg').value, temExame: $('#ce').checked, opcaoExame: Number($('#oe')?.value || t.opcao_exame) })).then((ok) => ir('caderneta', { turma: tid, tri }));
  $('#rg').onchange = cfg; $('#ce').onchange = cfg; if ($('#oe')) $('#oe').onchange = cfg;
  $('#q').oninput = (e) => $$('#tb tbody tr').forEach((tr) => tr.classList.toggle('hide', !(tr.dataset.n || '').includes(e.target.value.toLowerCase())));
  $$('.nota', el).forEach((i) => (i.onchange = async () => {
    const v = i.value.trim().replace(',', '.');
    const ok = await tentar(() => API('notas.gravar', Number(i.dataset.a), Number(i.dataset.t), i.dataset.c, v));
    if (ok) ir('caderneta', { turma: tid, tri }); else i.value = '';
  }));
  $$('[data-del]', el).forEach((b) => (b.onclick = async () => { if (await confirmar('Remover este aluno e as suas notas?')) { await tentar(() => API('alunos.apagar', Number(b.dataset.del))); ir('caderneta', { turma: tid, tri }); } }));
  $('#ad').onclick = async () => { const r = await pedir('Adicionar alunos', [{ nome: 'n', rotulo: 'Nomes (um por linha)', tipo: 'area' }]); if (r && await tentar(() => API('alunos.adicionar', tid, r.n.split(/\n/)))) ir('caderneta', { turma: tid, tri }); };
  $('#im').onclick = async () => { const n = await tentar(() => API('alunos.importar', tid)); if (n) { toast(`${n} alunos importados.`); ir('caderneta', { turma: tid, tri }); } };
  $('#ex1').onclick = async () => { const d = await tentar(() => API('caderneta.exportar', tid, 'pdf')); if (d) toast('PDF guardado em ' + d); };
  $('#ex2').onclick = async () => { const d = await tentar(() => API('caderneta.exportar', tid, 'csv')); if (d) toast('CSV guardado em ' + d); };
  if ($('#sim')) $('#sim').onclick = async () => {
    const r = await pedir('Simulador de exame', [{ nome: 'a', rotulo: 'Aluno', opcoes: c.linhas.filter((l) => l.anual !== null).map((l) => ({ v: l.id, t: `${l.numero}. ${l.nome} (M. anual ${num(l.anual)})` })) }, { nome: 'e', rotulo: 'Nota de exame hipotética (0–20)', tipo: 'number', valor: 10 }], 'Simular');
    if (!r) return; const s = await tentar(() => API('caderneta.simular', tid, Number(r.a), Number(r.e)));
    if (s) modal(`<h2>Resultado da simulação</h2><p>Opção 1: <b>${num(s.opcao1)}</b><br>Opção 2: <b>${num(s.opcao2)}</b></p><p class="mut">Nota mínima de exame para chegar a 10 na opção escolhida: <b>${s.minimoParaPassar ?? 'impossível'}</b></p>`);
  };
}
async function novaTurma() {
  const r = await pedir('Nova turma', [{ nome: 'nome', rotulo: 'Turma', dica: 'Ex.: 10ª Classe - Turma A' }, { nome: 'disciplina', rotulo: 'Disciplina', dica: 'Ex.: Matemática', valor: E.user.disciplina_principal || '' },
    { nome: 'ano', rotulo: 'Ano lectivo', tipo: 'number', valor: new Date().getFullYear() }], 'Criar turma');
  if (!r) return false; const id = await tentar(() => API('turmas.criar', r)); if (id) { E.ctx.turma = id; return true; } return false;
}
