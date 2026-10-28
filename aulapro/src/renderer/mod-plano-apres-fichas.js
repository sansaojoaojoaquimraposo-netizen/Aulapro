'use strict';
// Módulo 2 (Plano de Aula), Módulo 3 (Apresentação 1-Clique), Módulo 4 (Fichas e Testes)
const listaHtml = (a) => `<ul style="margin:4px 0;padding-left:20px">${(a || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;

async function paginaPlano(el) {
  const [planos, modelos, fich] = await Promise.all([API('docs.listar', 'plano'), API('modelos.listar'), API('ficheiros.listar')]);
  const L = E.info.limites, uso = E.info.uso.plano, prem = E.info.planoKey !== 'gratis';
  const sel = new Set(E.ctx.sel || []); let atual = E.ctx.plano || null;
  el.innerHTML = `<div class="row sp"><div><h1>Plano de Aula Gerador</h1><div class="mut">Gere planos em segundos a partir dos seus materiais. ${L.planosMes ? `Este mês: ${uso}/${L.planosMes}` : 'Ilimitado'}</div></div></div>
  <div class="grid g21" style="margin-top:12px"><div>
   <div class="card"><h2>Informações da aula</h2><div class="grid g2">
     <div><label>Disciplina</label><input id="di" value="${esc(E.user.disciplina_principal || '')}"></div><div><label>Turma</label><input id="tu" placeholder="Ex.: 7ª Classe"></div>
     <div><label>Tema da aula</label><input id="te"></div><div><label>Duração</label><select id="du">${[30, 45, 50, 90].map((d) => `<option ${d === 50 ? 'selected' : ''}>${d}</option>`).join('')}</select></div></div>
     <label>Competência / objectivo curricular (opcional)</label><input id="co"></div>
   <div class="card" style="margin-top:12px"><h2>Material de base</h2>
     <div class="tabs"><button class="on" data-tb="texto">Texto</button><button data-tb="fich">PDF / Foto ${prem ? '' : '⭐'}</button><button data-tb="mod">Modelo ${prem ? '' : '⭐'}</button></div>
     <div id="tb-texto"><textarea id="tx" rows="6" placeholder="Cole aqui o conteúdo da matéria (o plano usa APENAS este material como base)…"></textarea></div>
     <div id="tb-fich" class="hide"><div class="drop"><div style="font-size:30px">⬆️</div><b>PDF até 25 MB · Foto JPG/PNG até 10 MB (OCR de manuscrito) · TXT · DOCX</b><br><button id="up" style="margin-top:10px">Seleccionar ficheiros</button></div>
       <div id="fl" style="margin-top:10px">${fich.map((f) => `<label style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" style="width:auto" data-f="${f.id}" ${sel.has(f.id) ? 'checked' : ''}> ${esc(f.nome)} <span class="mut sm">(${bytes(f.tamanho)})</span> <button class="gh sm" data-df="${f.id}">✕</button></label>`).join('') || '<span class="mut sm">Sem ficheiros carregados.</span>'}</div></div>
     <div id="tb-mod" class="hide"><label>Modelo de plano da escola</label><select id="md">${modelos.map((m) => `<option value="${m.id}">${esc(m.nome)}</option>`).join('')}</select>
       <button class="sec sm" id="nm" style="margin-top:8px">Guardar modelo da escola (colar estrutura)</button></div></div>
   <div class="card" style="margin-top:12px"><h2>Como devo organizar?</h2><input id="in" placeholder="Ex.: organiza em 3 partes com exemplo de machamba e 3 perguntas no fim">
     <div class="row" style="margin-top:12px"><button id="ger">✨ Gerar plano de aula</button><button class="sec" id="lim">Limpar</button></div></div></div>
  <div><div class="card"><h2>Meus planos (${planos.length}/500)</h2>${planos.map((p) => `<div class="row sp" style="padding:5px 0;border-bottom:1px solid var(--bd)"><a href="#" data-ab="${p.id}">${esc(p.titulo)}</a><button class="gh sm" data-dp="${p.id}">✕</button></div>`).join('') || '<span class="mut sm">Ainda sem planos guardados.</span>'}</div></div></div>
  <div id="res" style="margin-top:14px"></div>`;
  $$('[data-tb]', el).forEach((b) => (b.onclick = () => { $$('[data-tb]', el).forEach((x) => x.classList.toggle('on', x === b)); ['texto', 'fich', 'mod'].forEach((k) => $('#tb-' + k).classList.toggle('hide', k !== b.dataset.tb)); }));
  $('#up').onclick = async () => { const r = await tentar(() => API('ficheiros.carregar')); if (r?.length) { toast(`${r.length} ficheiro(s) carregado(s).`); E.ctx.sel = [...sel, ...r.map((x) => x.id)]; ir('plano', E.ctx); } };
  $$('[data-f]', el).forEach((c) => (c.onchange = () => (c.checked ? sel.add(Number(c.dataset.f)) : sel.delete(Number(c.dataset.f)))));
  $$('[data-df]', el).forEach((b) => (b.onclick = async (e) => { e.preventDefault(); await API('ficheiros.apagar', Number(b.dataset.df)); ir('plano'); }));
  $('#nm').onclick = async () => { const r = await pedir('Modelo da escola', [{ nome: 'n', rotulo: 'Nome do modelo' }, { nome: 't', rotulo: 'Cole as secções (uma por linha)', tipo: 'area' }]); if (r && await tentar(() => API('modelos.guardar', r.n, r.t), 'Modelo guardado.')) ir('plano'); };
  $('#lim').onclick = () => ir('plano');
  $$('[data-dp]', el).forEach((b) => (b.onclick = async () => { if (await confirmar('Apagar este plano?')) { await API('docs.apagar', Number(b.dataset.dp)); ir('plano'); } }));
  $$('[data-ab]', el).forEach((a) => (a.onclick = async (e) => { e.preventDefault(); const d = await API('docs.obter', Number(a.dataset.ab)); mostrarPlano(d.conteudo, d.id); }));
  const mostrarPlano = (p, id) => {
    const r = $('#res'); atual = { p, id };
    r.innerHTML = `<div class="card"><div class="row sp"><h2>${esc(p.titulo)} <span class="pill verde" style="font-size:11px">${esc(p.geradoPor || '')}</span></h2><div class="row">
      <button class="sec" id="s">💾 Guardar</button>${id ? '<button class="sec" id="x">⬇ Exportar PDF</button><button class="sec" id="ap">🖥️ Transformar em apresentação</button><button class="sec" id="fi">📄 Transformar em ficha</button>' : ''}</div></div>
      <div class="papel"><div class="sm mut">${esc(p.disciplina || '')} · ${esc(p.turma || '')} · ${esc(p.duracao || '')} min · Modelo: ${esc(p.modelo || '')}</div>
      <h3>1. Objectivos de aprendizagem</h3><div contenteditable data-k="objetivos">${listaHtml(p.objetivos)}</div><h3>2. Conteúdo</h3><div contenteditable data-k="conteudo">${listaHtml(p.conteudo)}</div>
      <h3>3. Metodologia</h3>${(p.metodologia || []).map((m) => `<div><b>${esc(m.fase)}</b> (${esc(m.minutos)} min): ${esc(m.descricao)}</div>`).join('')}
      <h3>4. Material</h3><div contenteditable data-k="material">${listaHtml(p.material)}</div><h3>5. Avaliação</h3><div contenteditable data-k="avaliacao">${listaHtml(p.avaliacao)}</div><h3>6. TPC</h3><div contenteditable data-k="tpc">${listaHtml(p.tpc)}</div></div></div>`;
    const recolher = () => { $$('[data-k]', r).forEach((d) => (p[d.dataset.k] = $$('li', d).map((l) => l.textContent.trim()).filter(Boolean))); };
    $('#s', r).onclick = async () => { recolher(); const i = await tentar(() => API('docs.guardar', 'plano', atual.id || null, p.titulo, p), 'Plano guardado.'); if (i) { atual.id = i; E.ctx.plano = null; mostrarPlano(p, i); } };
    if (id) { $('#x', r).onclick = async () => { recolher(); await API('docs.guardar', 'plano', id, p.titulo, p); const d = await tentar(() => API('plano.exportar', id)); if (d) toast('PDF guardado em ' + d); };
      $('#ap', r).onclick = () => ir('apresentacao', { plano: id }); $('#fi', r).onclick = () => ir('fichas', { plano: id }); }
    r.scrollIntoView({ behavior: 'smooth' });
  };
  $('#ger').onclick = async () => {
    const m = modelos.find((x) => String(x.id) === $('#md')?.value) || modelos[0];
    const bt = $('#ger'); bt.disabled = true; bt.textContent = 'A gerar…';
    const p = await tentar(() => API('plano.gerar', { disciplina: $('#di').value, turma: $('#tu').value, tema: $('#te').value, duracao: Number($('#du').value), competencia: $('#co').value,
      texto: $('#tx').value, instrucao: $('#in').value, ficheiros: [...sel], modelo: { nome: m?.nome, estrutura: m?.estrutura } }));
    bt.disabled = false; bt.textContent = '✨ Gerar plano de aula';
    if (p) { toast('Plano gerado. Reveja, edite e guarde.'); mostrarPlano(p, null); }
  };
  if (atual && typeof atual === 'number') API('docs.obter', atual).then((d) => mostrarPlano(d.conteudo, d.id));
}

// ---------------- Apresentação 1-Clique ----------------
async function paginaApresentacao(el) {
  const [planos, apres] = await Promise.all([API('docs.listar', 'plano'), API('docs.listar', 'apresentacao')]);
  const L = E.info.limites, marca = E.info.planoKey === 'gratis';
  el.innerHTML = `<h1>Apresentação 1-Clique</h1><div class="mut">Escolha um plano de aula e gere 3 a 10 slides. ${L.apresentacoesMes ? `Este mês: ${E.info.uso.apresentacao}/${L.apresentacoesMes}` : 'Ilimitado'}</div>
   <div class="card" style="margin:12px 0"><div class="row"><select id="pl" style="max-width:420px">${planos.map((p) => `<option value="${p.id}" ${E.ctx.plano === p.id ? 'selected' : ''}>${esc(p.titulo)}</option>`).join('') || '<option value="">(crie primeiro um plano de aula)</option>'}</select>
   <button id="g" ${planos.length ? '' : 'disabled'}>✨ Gerar slides</button></div>
   ${apres.length ? `<div class="sm mut" style="margin-top:10px">Guardadas: ${apres.map((a) => `<a href="#" data-a="${a.id}">${esc(a.titulo)}</a>`).join(' · ')}</div>` : ''}</div><div id="ed"></div>`;
  let slides = [], titulo = '', idx = 0, origem = null, docId = null;
  const desenharEd = () => {
    const s = slides[idx]; if (!s) return;
    $('#ed').innerHTML = `<div class="grid" style="grid-template-columns:200px 1fr 260px"><div class="thumbs">${slides.map((x, i) => `<div class="thumb ${i === idx ? 'on' : ''}" data-i="${i}"><b>${i + 1}.</b> ${esc(x.titulo)}</div>`).join('')}</div>
      <div><div class="slide ${s.tipo === 'titulo' ? 't' : ''}"><h3 contenteditable id="st">${esc(s.titulo)}</h3>${s.tipo === 'titulo' ? `<div contenteditable id="ss" style="font-size:clamp(12px,1.8vw,20px)">${esc(s.subtitulo)}</div>` : `<ul contenteditable id="sl">${(s.topicos || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`}
        <div style="position:absolute;right:12px;bottom:6px;font-size:10px;color:${marca ? '#C0392B' : '#7A8CA8'}">${marca ? 'Gerado com AulaPro Grátis - aula.pro' : 'AulaPro'}</div></div>
        <div class="row" style="margin-top:10px"><button class="sec sm" id="ad">+ Adicionar slide</button><button class="sec sm" id="rm">Remover slide</button><span class="sm mut">Slide ${idx + 1} de ${slides.length} · edite directamente o texto</span></div></div>
      <div class="card"><h3>Assistente 1-Clique</h3><div class="sm">✅ Objectivo da aula identificado<br>✅ Conteúdo estruturado<br>✅ ${slides.length} slides gerados</div>
        <div class="row" style="margin-top:12px;flex-direction:column;align-items:stretch"><button id="sv">💾 Guardar</button><button class="sec" id="px">Exportar PPTX</button><button class="sec" id="pf">Exportar PDF</button><button class="sec" id="pr">▶ Apresentar</button></div>
        ${marca ? '<div class="sm mut" style="margin-top:8px">Plano Grátis: marca de água. Premium: sem marca.</div>' : ''}</div></div>`;
    const grava = () => { const s2 = slides[idx]; s2.titulo = $('#st').textContent.trim(); if (s2.tipo === 'titulo') s2.subtitulo = $('#ss').textContent.trim(); else s2.topicos = $$('#sl li').map((l) => l.textContent.trim()).filter(Boolean); };
    $$('.thumb').forEach((t) => (t.onclick = () => { grava(); idx = Number(t.dataset.i); desenharEd(); }));
    $('#ad').onclick = () => { grava(); slides.splice(idx + 1, 0, { tipo: 'topicos', titulo: 'Novo slide', topicos: ['Ponto 1'] }); idx++; desenharEd(); };
    $('#rm').onclick = () => { if (slides.length > 3) { slides.splice(idx, 1); idx = Math.max(0, idx - 1); desenharEd(); } else toast('Mínimo de 3 slides.', true); };
    $('#sv').onclick = async () => { grava(); const i = await tentar(() => API('docs.guardar', 'apresentacao', docId, titulo, { titulo, slides, origem }, origem), 'Apresentação guardada.'); if (i) docId = i; };
    $('#px').onclick = async () => { grava(); const d = await tentar(() => API('apresentacao.exportar', slides, 'pptx', titulo)); if (d) toast('PPTX guardado em ' + d); };
    $('#pf').onclick = async () => { grava(); const d = await tentar(() => API('apresentacao.exportar', slides, 'pdf', titulo)); if (d) toast('PDF guardado em ' + d); };
    $('#pr').onclick = () => { grava(); apresentar(slides, marca); };
  };
  $('#g').onclick = async () => { const id = Number($('#pl').value); const r = await tentar(() => API('apresentacao.gerar', id)); if (r) { slides = r.slides; titulo = r.titulo; origem = id; docId = null; idx = 0; desenharEd(); } };
  $$('[data-a]', el).forEach((a) => (a.onclick = async (e) => { e.preventDefault(); const d = await API('docs.obter', Number(a.dataset.a)); slides = d.conteudo.slides; titulo = d.conteudo.titulo; origem = d.conteudo.origem; docId = d.id; idx = 0; desenharEd(); }));
  if (E.ctx.plano) { $('#g').click(); delete E.ctx.plano; }
}
function apresentar(slides, marca) {
  let i = 0; const ov = document.createElement('div'); ov.className = 'ov'; ov.style.padding = '0'; ov.style.background = '#000';
  const pinta = () => { const s = slides[i]; ov.innerHTML = `<div class="slide ${s.tipo === 'titulo' ? 't' : ''}" style="width:min(100vw,177vh);font-size:2vw"><h3 style="font-size:4vw">${esc(s.titulo)}</h3>${s.tipo === 'titulo' ? `<div style="font-size:2.4vw">${esc(s.subtitulo)}</div>` : `<ul style="font-size:2.6vw">${(s.topicos || []).map((t) => `<li style="margin-bottom:1vw">${esc(t)}</li>`).join('')}</ul>`}${marca ? '<div style="position:absolute;right:12px;bottom:8px;font-size:1.2vw;color:#C0392B">Gerado com AulaPro Grátis - aula.pro</div>' : ''}</div>`; };
  const tecla = (e) => { if (e.key === 'ArrowRight' || e.key === ' ') i = Math.min(slides.length - 1, i + 1); else if (e.key === 'ArrowLeft') i = Math.max(0, i - 1); else if (e.key === 'Escape') { document.removeEventListener('keydown', tecla); ov.remove(); return; } pinta(); };
  document.addEventListener('keydown', tecla); ov.onclick = () => { i = Math.min(slides.length - 1, i + 1); pinta(); }; document.body.appendChild(ov); pinta();
}

// ---------------- Fichas e Testes ----------------
async function paginaFichas(el) {
  const [planos, fichas] = await Promise.all([API('docs.listar', 'plano'), API('docs.listar', 'ficha')]);
  const prem = E.info.planoKey !== 'gratis';
  let f = { titulo: 'Novo teste', cabecalho: { escola: E.user.escola || '', professor: E.user.nome, disciplina: E.user.disciplina_principal || '', ano: '', data: '', duracao: '40 min' }, questoes: [], incluirGabarito: true, incluirCabecalho: true, espacoNome: true };
  let docId = null, aba = 'editor', sal = '';
  const letras = 'ABCD';
  const total = () => f.questoes.reduce((a, q) => a + Number(q.pontos || 0), 0);
  const sk = debounce(async () => { docId = (await API('docs.guardar', 'ficha', docId, f.titulo, f)) || docId; $('#as') && ($('#as').textContent = '✔ Guardado automaticamente · ' + new Date().toLocaleTimeString('pt-MZ', { timeStyle: 'short' })); }, 2000);
  const mudou = () => sk();
  const pinta = () => {
    el.innerHTML = `<div class="row sp"><div><h1>Gerador de Fichas e Testes</h1><div class="mut">Crie, edite e exporte fichas personalizadas. ${E.info.limites.fichasMes ? `Este mês: ${E.info.uso.ficha}/${E.info.limites.fichasMes}` : ''}</div></div>
      <div class="row"><select id="dp" style="width:auto"><option value="">Gerar a partir de um plano…</option>${planos.map((p) => `<option value="${p.id}">${esc(p.titulo)}</option>`).join('')}</select>${fichas.length ? `<select id="ab" style="width:auto"><option value="">Abrir ficha guardada…</option>${fichas.map((x) => `<option value="${x.id}">${esc(x.titulo)}</option>`).join('')}</select>` : ''}${prem ? '<button class="sec" id="bq">Banco de questões</button>' : ''}</div></div>
    <div class="tabs">${[['editor', 'Editor'], ['prev', 'Pré-visualização'], ['gab', 'Gabarito']].map(([k, t]) => `<button data-ab="${k}" class="${aba === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div class="grid g21"><div>${aba === 'editor' ? editor() : aba === 'prev' ? preview() : gabarito()}</div>
    <div><div class="card"><h2>Exportar</h2><button id="ep" style="width:100%">📄 Exportar PDF (pronto a imprimir)</button><button class="sec" id="ew" style="width:100%;margin-top:8px">📝 Exportar DOCX (Word) ${prem ? '' : '⭐'}</button>
      ${[['incluirGabarito', 'Incluir gabarito'], ['incluirCabecalho', 'Incluir cabeçalho com logo da escola'], ['espacoNome', 'Espaço para nome do aluno']].map(([k, t]) => `<label style="display:flex;gap:8px;align-items:center;font-weight:400;color:var(--tx)"><input type="checkbox" style="width:auto" data-o="${k}" ${f[k] ? 'checked' : ''}> ${t}</label>`).join('')}
      ${prem ? '' : '<div class="sm mut" style="margin-top:6px">Plano Grátis: só PDF, com marca de água, 5 fichas/mês.</div>'}</div>
      <div class="card" style="margin-top:12px"><div class="row sp"><b>${f.questoes.length} questões</b><b>${total()} pontos</b></div><div id="as" class="sm mut">${sal}</div><button class="sec" id="sv" style="width:100%;margin-top:8px">💾 Guardar agora</button></div></div></div>`;
    $$('[data-ab]').forEach((b) => (b.onclick = () => { aba = b.dataset.ab; pinta(); }));
    $$('[data-o]').forEach((c) => (c.onchange = () => { f[c.dataset.o] = c.checked; mudou(); }));
    $('#sv').onclick = async () => { docId = (await tentar(() => API('docs.guardar', 'ficha', docId, f.titulo, f), 'Ficha guardada.')) || docId; };
    $('#ep').onclick = async () => { const d = await tentar(() => API('ficha.exportar', f, 'pdf')); if (d) toast('PDF guardado em ' + d); };
    $('#ew').onclick = async () => { const d = await tentar(() => API('ficha.exportar', f, 'docx')); if (d) toast('DOCX guardado em ' + d); };
    $('#dp').onchange = async (e) => { if (!e.target.value) return; const r = await tentar(() => API('ficha.deplano', Number(e.target.value))); if (r) { f = r; docId = null; pinta(); mudou(); } };
    if ($('#ab')) $('#ab').onchange = async (e) => { if (!e.target.value) return; const d = await API('docs.obter', Number(e.target.value)); f = d.conteudo; docId = d.id; pinta(); };
    if ($('#bq')) $('#bq').onclick = async () => { const b = await tentar(() => API('banco.listar')); if (!b) return; const { ov, fechar } = modal(`<h2>Banco de questões (${b.length})</h2>${b.map((q, i) => `<div class="q sm">${esc(q.enunciado)} <button class="sm sec" data-u="${i}">Usar</button></div>`).join('') || '<span class="mut">O banco enche à medida que exporta fichas.</span>'}<button class="sec" data-c>Fechar</button>`);
      $('[data-c]', ov).onclick = fechar; $$('[data-u]', ov).forEach((x) => (x.onclick = () => { f.questoes.push({ ...b[Number(x.dataset.u)], id: Date.now() }); fechar(); pinta(); mudou(); })); };
    if (aba === 'editor') ligarEditor();
  };
  const editor = () => `<div class="card"><h2>Detalhes do teste</h2><div class="grid g2"><div><label>Título</label><input data-h="titulo" value="${esc(f.titulo)}"></div><div><label>Nome da escola</label><input data-c="escola" value="${esc(f.cabecalho.escola)}"></div>
    <div><label>Elaborado por Prof.</label><input data-c="professor" value="${esc(f.cabecalho.professor)}"></div><div><label>Disciplina</label><input data-c="disciplina" value="${esc(f.cabecalho.disciplina)}"></div>
    <div><label>Ano/Série</label><input data-c="ano" value="${esc(f.cabecalho.ano)}"></div><div><label>Data</label><input data-c="data" type="date" value="${esc(f.cabecalho.data)}"></div><div><label>Duração</label><input data-c="duracao" value="${esc(f.cabecalho.duracao)}"></div></div></div>
    <h2 style="margin-top:14px">Questões</h2>${f.questoes.map((q, i) => `<div class="q"><div class="row sp"><b>Questão ${i + 1} · ${{ mc: 'Múltipla escolha', vf: 'Verdadeiro/Falso', problema: 'Problema' }[q.tipo]}</b><span class="row"><input type="number" style="width:70px" data-p="${i}" value="${q.pontos}" title="Pontos"> pts <button class="gh sm" data-cp="${i}" title="Copiar">⧉</button><button class="gh sm" data-dq="${i}" title="Apagar">🗑</button></span></div>
      <textarea data-e="${i}" rows="2">${esc(q.enunciado)}</textarea>
      ${q.tipo === 'mc' ? q.opcoes.map((o, k) => `<div class="row" style="margin-top:4px"><input type="radio" style="width:auto" name="r${i}" data-r="${i}:${k}" ${q.correcta === k ? 'checked' : ''}> <b>${letras[k]})</b><input data-o2="${i}:${k}" value="${esc(o)}" style="flex:1"></div>`).join('') : q.tipo === 'vf' ? `<label style="display:flex;gap:8px;align-items:center;font-weight:400;color:var(--tx)"><input type="checkbox" style="width:auto" data-vf="${i}" ${q.correcta ? 'checked' : ''}> A afirmação é verdadeira</label>` : `<label>Resposta (gabarito)</label><input data-rs="${i}" value="${esc(q.resposta || '')}">`}</div>`).join('')}
    <div class="row"><button class="sec" data-nq="mc">+ Múltipla escolha</button><button class="sec" data-nq="vf">+ Verdadeiro/Falso</button><button class="sec" data-nq="problema">+ Problema</button></div>`;
  const preview = () => `<div class="papel"><div style="text-align:center;color:#0056D2;font-weight:700;font-size:18px">${esc(f.incluirCabecalho ? f.cabecalho.escola.toUpperCase() : '')}</div><h2 style="text-align:center">${esc(f.titulo)}</h2>
    <div class="sm">Disciplina: ${esc(f.cabecalho.disciplina)} · Ano/Série: ${esc(f.cabecalho.ano)} · Data: ${esc(f.cabecalho.data || '___/___/____')} · Duração: ${esc(f.cabecalho.duracao)}<br>Elaborado por Prof.: ${esc(f.cabecalho.professor)}</div>${f.espacoNome ? '<p>Nome do aluno: ____________________ Nº: ____</p>' : ''}
    ${f.questoes.map((q, i) => `<p><b>${i + 1}. [${q.pontos} pt]</b> ${esc(q.enunciado)}</p>${q.tipo === 'mc' ? q.opcoes.map((o, k) => `<div>&nbsp;&nbsp;${letras[k]}) ${esc(o)}</div>`).join('') : q.tipo === 'vf' ? '<div>&nbsp;&nbsp;( ) Verdadeiro &nbsp; ( ) Falso</div>' : '<div>&nbsp;&nbsp;__________________________________</div>'}`).join('')}
    <hr><div class="sm mut">Total: ${f.questoes.length} questões · ${total()} pontos</div></div>`;
  const gabarito = () => `<div class="card"><h2>Gabarito (chave de respostas)</h2>${f.questoes.map((q, i) => `<div>✅ ${i + 1}. ${q.tipo === 'mc' ? letras[q.correcta] + ') ' + esc(q.opcoes[q.correcta]) : q.tipo === 'vf' ? (q.correcta ? 'Verdadeiro' : 'Falso') : esc(q.resposta || '—')}</div>`).join('') || '<span class="mut">Sem questões.</span>'}</div>`;
  const ligarEditor = () => {
    $$('[data-h]').forEach((i) => (i.oninput = () => { f.titulo = i.value; mudou(); }));
    $$('[data-c]').forEach((i) => (i.oninput = () => { f.cabecalho[i.dataset.c] = i.value; mudou(); }));
    $$('[data-e]').forEach((i) => (i.oninput = () => { f.questoes[+i.dataset.e].enunciado = i.value; mudou(); }));
    $$('[data-p]').forEach((i) => (i.oninput = () => { f.questoes[+i.dataset.p].pontos = Number(i.value) || 0; mudou(); }));
    $$('[data-o2]').forEach((i) => (i.oninput = () => { const [a, b] = i.dataset.o2.split(':').map(Number); f.questoes[a].opcoes[b] = i.value; mudou(); }));
    $$('[data-r]').forEach((i) => (i.onchange = () => { const [a, b] = i.dataset.r.split(':').map(Number); f.questoes[a].correcta = b; mudou(); }));
    $$('[data-vf]').forEach((i) => (i.onchange = () => { f.questoes[+i.dataset.vf].correcta = i.checked; mudou(); }));
    $$('[data-rs]').forEach((i) => (i.oninput = () => { f.questoes[+i.dataset.rs].resposta = i.value; mudou(); }));
    $$('[data-dq]').forEach((b) => (b.onclick = () => { f.questoes.splice(+b.dataset.dq, 1); pinta(); mudou(); }));
    $$('[data-cp]').forEach((b) => (b.onclick = () => { f.questoes.splice(+b.dataset.cp + 1, 0, JSON.parse(JSON.stringify(f.questoes[+b.dataset.cp]))); pinta(); mudou(); }));
    $$('[data-nq]').forEach((b) => (b.onclick = () => { const t = b.dataset.nq; f.questoes.push(t === 'mc' ? { tipo: 'mc', pontos: 2, enunciado: 'Nova pergunta', opcoes: ['', '', '', ''], correcta: 0 } : t === 'vf' ? { tipo: 'vf', pontos: 1, enunciado: 'Nova afirmação', correcta: true } : { tipo: 'problema', pontos: 3, enunciado: 'Novo problema', resposta: '' }); pinta(); mudou(); }));
  };
  pinta();
  if (E.ctx.plano) { const id = E.ctx.plano; delete E.ctx.plano; const r = await tentar(() => API('ficha.deplano', id)); if (r) { f = r; pinta(); mudou(); } }
}
