'use strict';
// Módulo 5 (Biblioteca), 6 (Assistente de Voz), 8 (Central Offline)
async function paginaBiblioteca(el) {
  const f = E.ctx.f || { q: '', tipo: 'Todos', categoria: '' };
  const [d, fontes] = await Promise.all([API('biblioteca.listar', f), API('biblioteca.fontes')]);
  const L = E.info.limites;
  el.innerHTML = `<div class="row sp"><div><h1>Biblioteca · Base de Pesquisa</h1><div class="mut">Só conteúdo de licença aberta ou domínio público. ${L.downloadsMes ? `Downloads este mês: ${E.info.uso.download}/${L.downloadsMes}` : 'Downloads ilimitados'}</div></div><button id="add">＋ Adicionar PDF à biblioteca</button></div>
  <div class="grid g3" style="margin:12px 0"><div class="card kpi"><div class="mut sm">Recursos disponíveis</div><div class="n">${d.total}</div></div><div class="card kpi v"><div class="mut sm">Categorias</div><div class="n">${d.categorias.length}</div></div><div class="card kpi a"><div class="mut sm">Seus downloads</div><div class="n">${d.downloads}</div></div></div>
  <div class="grid" style="grid-template-columns:240px 1fr"><div class="card"><h3>Pesquisar</h3><input id="q" value="${esc(f.q)}" placeholder="Livros, artigos, PDFs…"><h3 style="margin-top:12px">Tipo</h3>
    <div class="tabs">${['Todos', 'PDF', 'Livro', 'Artigo'].map((t) => `<button class="sm ${f.tipo === t ? 'on' : ''}" data-t="${t}">${t}</button>`).join('')}</div><h3>Categorias</h3>
    ${d.categorias.map((c) => `<label style="display:flex;gap:8px;font-weight:400;color:var(--tx)"><input type="radio" name="cat" style="width:auto" value="${esc(c.categoria)}" ${f.categoria === c.categoria ? 'checked' : ''}> ${esc(c.categoria)} (${c.n})</label>`).join('') || '<span class="sm mut">Sem categorias.</span>'}
    <button class="sec sm" id="lf" style="margin-top:8px">Limpar filtros</button></div>
   <div><div class="grid g2">${d.itens.map((b) => `<div class="card"><div class="b">${esc(b.titulo)}</div><div class="sm mut">${esc(b.autor || '—')}${b.ano ? ' · ' + b.ano : ''} · ${esc(b.licenca)}</div><span class="pill neutro">${esc(b.categoria)} · ${esc(b.tipo)}</span>
      <div class="row" style="margin-top:10px"><button class="sm" data-l="${b.id}">👁 Ler</button><button class="sec sm" data-r="${b.id}">Resumir para o plano</button></div></div>`).join('') || '<div class="card mut" style="grid-column:1/-1">A biblioteca está vazia. Adicione PDFs descarregados das fontes abertas abaixo — ficam logo disponíveis nos módulos Plano de Aula e Fichas.</div>'}</div>
   <h2 style="margin-top:18px">Pesquisar nas fontes abertas</h2><div class="card"><div class="sm mut" style="margin-bottom:8px">Abre no seu navegador. O AulaPro não indexa conteúdo pirateado: use apenas material com licença aberta (Creative Commons) ou domínio público.</div>
    ${fontes.map((s) => `<div class="row sp" style="padding:6px 0;border-bottom:1px solid var(--bd)"><div><b>${esc(s.nome)}</b> <span class="sm mut">· ${esc(s.licenca)}</span></div><button class="sec sm" data-u="${esc(s.url)}">Abrir ↗</button></div>`).join('')}</div></div></div>`;
  const novo = (p) => ir('biblioteca', { f: { ...f, ...p } });
  $('#q').onkeydown = (e) => e.key === 'Enter' && novo({ q: e.target.value });
  $$('[data-t]', el).forEach((b) => (b.onclick = () => novo({ tipo: b.dataset.t })));
  $$('[name=cat]', el).forEach((r) => (r.onchange = () => novo({ categoria: r.value })));
  $('#lf').onclick = () => ir('biblioteca', { f: { q: '', tipo: 'Todos', categoria: '' } });
  $$('[data-u]', el).forEach((b) => (b.onclick = () => tentar(() => API('biblioteca.abrir', b.dataset.u))));
  $$('[data-l]', el).forEach((b) => (b.onclick = () => tentar(() => API('biblioteca.ler', Number(b.dataset.l)))));
  $$('[data-r]', el).forEach((b) => (b.onclick = async () => { const r = await tentar(() => API('biblioteca.resumir', Number(b.dataset.r))); if (r) modal(`<h2>Resumo: ${esc(r.titulo)}</h2>${listaHtml(r.resumo)}<div class="row sp"><button class="sec" data-c>Fechar</button><button data-p>Usar no plano de aula</button></div>`, (ov, fc) => { $('[data-c]', ov).onclick = fc; $('[data-p]', ov).onclick = () => { fc(); navigator.clipboard?.writeText(r.resumo.join('\n')); toast('Resumo copiado. Cole-o no Plano de Aula (separador Texto).'); ir('plano'); }; }); }));
  $('#add').onclick = async () => {
    const r = await pedir('Adicionar à biblioteca', [{ nome: 'titulo', rotulo: 'Título' }, { nome: 'autor', rotulo: 'Autor' }, { nome: 'ano', rotulo: 'Ano', tipo: 'number' }, { nome: 'categoria', rotulo: 'Categoria', dica: 'Ciências, História, Matemática…' },
      { nome: 'tipo', rotulo: 'Tipo', opcoes: ['PDF', 'Livro', 'Artigo'] }, { nome: 'licenca', rotulo: 'Licença', opcoes: ['Domínio público', 'Creative Commons', 'Recurso aberto', 'Material próprio'] }], 'Escolher PDF…');
    if (r && await tentar(() => API('biblioteca.adicionar', r), 'Adicionado à biblioteca e disponível nos módulos 2 e 4.')) ir('biblioteca');
  };
}

// ---------------- Assistente de Voz ----------------
async function paginaVoz(el) {
  const L = E.info.limites; const NAT = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() ? window.Capacitor.Plugins.SpeechRecognition : null; const RC = NAT ? true : (window.SpeechRecognition || window.webkitSpeechRecognition); let rec = null, texto = '', plano = null, t0 = 0, timer = null;
  el.innerHTML = `<h1>Assistente de Voz Inteligente</h1><div class="mut">Grave a sua voz para gerar planos de aula. ${L.vozUsosMes ? `Usos este mês: ${E.info.uso.voz}/${L.vozUsosMes} · máx. ${L.vozMaxSeg}s` : `Ilimitado · máx. ${Math.round(L.vozMaxSeg / 60)} min por gravação`}</div>
  <div class="grid g3" style="margin-top:12px"><div class="card" style="text-align:center"><h3>Controlo de voz</h3><button class="mic" id="mic">🎤</button><div id="est" class="b">Clique para falar</div>
    <div class="sm mut" style="margin-top:8px">${RC ? 'Reconhecimento de voz do sistema (pt-MZ/pt-BR). Pode precisar de internet.' : 'Reconhecimento de voz indisponível neste sistema — escreva o comando abaixo.'}</div>
    <h3 style="margin-top:14px;text-align:left">Comandos</h3><div class="sm" style="text-align:left">🎙 Gerar plano de aula<br>✨ Resumir transcrição<br>➕ Adicionar actividades<br>⬇ Exportar PDF</div></div>
   <div class="card"><div class="row sp"><h3>Transcrição</h3><span id="cr" class="sm mut"></span></div><textarea id="tr" rows="9" placeholder="Ex.: Crie plano sobre fotossíntese 7 ano com atividade prática 30min"></textarea>
    <div class="row" style="margin-top:8px"><button class="sec sm" id="rs">Resumir transcrição</button><button class="sec sm" id="la">Limpar</button></div></div>
   <div class="card"><h3>Plano de aula gerado</h3><div id="pl" class="mut sm">O plano aparece aqui.</div></div></div>
  <div class="row" style="margin-top:12px"><button id="gp">✨ Gerar plano completo</button><button class="sec" id="sr">💾 Salvar rascunho</button><button class="sec" id="xp">⬇ Exportar PDF</button></div>`;
  const parar = () => { try { rec?.stop(); } catch {} clearInterval(timer); $('#mic').classList.remove('rec'); $('#est').textContent = 'Clique para falar'; rec = null; };
  $('#mic').onclick = async () => {
    if (rec) return parar();
    if (!RC) return toast('Reconhecimento de voz indisponível: escreva o comando na caixa de texto.', true);
    const u = await tentar(() => API('voz.registarUso')); if (!u) return;
    if (NAT) { // Android: reconhecimento de voz do sistema (plugin Capacitor)
      const perm = await NAT.requestPermissions(); if (perm.speechRecognition !== 'granted') return toast('Permita o microfone nas definições do Android.', true);
      await NAT.removeAllListeners(); NAT.addListener('partialResults', (d) => { $('#tr').value = (d.matches || [])[0] || ''; });
      rec = { stop: () => NAT.stop() }; NAT.start({ language: 'pt-PT', partialResults: true, popup: false });
      $('#mic').classList.add('rec'); $('#est').textContent = 'A ouvir… (toque para parar)'; t0 = Date.now();
      timer = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); $('#cr').textContent = s + 's'; if (u.maxSeg && s >= u.maxSeg) { parar(); toast(`Limite de ${u.maxSeg}s atingido.`); } }, 500);
      return;
    }
    rec = new RC(); rec.lang = 'pt-MZ'; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e) => { let s = ''; for (const r of e.results) s += r[0].transcript + ' '; $('#tr').value = s.trim(); };
    rec.onerror = (e) => { toast('Erro de voz: ' + e.error, true); parar(); };
    rec.onend = () => { if (rec) parar(); };
    rec.start(); $('#mic').classList.add('rec'); $('#est').textContent = 'A ouvir… (clique para parar)'; t0 = Date.now();
    timer = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); $('#cr').textContent = s + 's'; if (u.maxSeg && s >= u.maxSeg) { parar(); toast(`Limite de ${u.maxSeg}s atingido.`); } }, 500);
  };
  $('#la').onclick = () => { $('#tr').value = ''; };
  $('#rs').onclick = () => { const fr = $('#tr').value.split(/(?<=[.!?])\s+/).filter(Boolean); $('#tr').value = fr.length > 3 ? fr.slice(0, 3).join(' ') : $('#tr').value; toast('Transcrição resumida.'); };
  $('#gp').onclick = async () => {
    const v = await API('voz.interpretar', $('#tr').value); if (!v.tema) return toast('Não percebi o tema. Diga, por exemplo: “plano sobre fotossíntese”.', true);
    plano = await tentar(() => API('plano.gerar', { disciplina: E.user.disciplina_principal || '', turma: v.turma, tema: v.tema, duracao: v.duracao, instrucao: $('#tr').value, texto: '' })); if (!plano) return;
    if (v.atividadePratica) plano.metodologia.splice(2, 0, { fase: 'Actividade prática', minutos: v.duracaoAtividade, descricao: `Experiência/actividade prática sobre ${v.tema}, com registo de resultados.` });
    $('#pl').innerHTML = `<b>${esc(plano.titulo)}</b><br><b>Objectivo:</b>${listaHtml(plano.objetivos.slice(0, 1))}<b>Conteúdo:</b>${listaHtml(plano.conteudo.slice(0, 3))}${v.atividadePratica ? `<b>Actividade prática (${v.duracaoAtividade} min)</b><br>` : ''}<b>Materiais:</b>${listaHtml(plano.material)}<b>Avaliação:</b>${listaHtml(plano.avaliacao)}`;
  };
  const guarda = async () => { if (!plano) { toast('Gere primeiro o plano.', true); return null; } return tentar(() => API('docs.guardar', 'plano', null, plano.titulo, plano), 'Guardado nos seus planos.'); };
  $('#sr').onclick = guarda;
  $('#xp').onclick = async () => { const id = await guarda(); if (id) { const d = await tentar(() => API('plano.exportar', id)); if (d) toast('PDF guardado em ' + d); } };
}

// ---------------- Central Offline ----------------
async function paginaOffline(el) {
  const o = await API('offline.estado'); const on = navigator.onLine; const pct = o.limite ? Math.round(o.usado / o.limite * 100) : 0;
  el.innerHTML = `<h1>Central Offline, Backup e Sincronização</h1>
  <div class="banner" style="margin:12px 0"><div><div class="b" style="font-size:18px">${on ? 'Online' : 'Modo Offline activo'}</div><div class="sm">${on ? 'Ligado à internet. Pode sincronizar a qualquer momento.' : 'Você está sem conexão. Alterações salvas localmente e sincronizadas quando voltar online.'}</div></div></div>
  <div class="grid g2"><div class="card"><h2>Estado de sincronização</h2><div class="b">Pendentes para sincronizar: ${o.pendentes} alterações</div><div class="sm mut">Última sincronização: ${o.ultimaSync ? dataHora(Date.parse(o.ultimaSync)) : 'nunca'}</div>${barra(o.progresso)}<div class="sm">${o.progresso}% sincronizado</div>
    <div class="row" style="margin-top:12px"><button id="sy" ${o.backupNuvem ? '' : 'class="sec"'}>☁ Backup para a nuvem ${o.backupNuvem ? '' : '⭐'}</button><button class="sec" id="bk">💾 Guardar cópia local</button><button class="sec" id="ex">⬇ Exportar todos os documentos</button></div>
    <div class="sm mut" style="margin-top:8px">Auto-guardado a cada 5 minutos na base de dados local (SQLite). A sincronização automática corre ao reconectar.${o.syncUrl ? '' : ' Servidor de sincronização ainda não configurado.'}</div></div>
   <div class="card"><h2>Armazenamento local</h2><div class="b">${bytes(o.usado)} de ${bytes(o.limite)} usados</div>${barra(pct)}
    <div class="row sp" style="padding:8px 0"><span>📄 Ficheiros carregados</span><span>${bytes(o.ficheirosBytes)} · ${o.ficheiros} ficheiros</span></div><div class="row sp" style="padding:8px 0"><span>🗄 Base de dados</span><span>${bytes(o.baseBytes)}</span></div>
    <div class="row sp" style="padding:8px 0"><span>📝 Rascunhos salvos</span><span>${o.rascunhos} itens</span></div>${E.info.planoKey === 'gratis' ? '<div class="sm mut">Plano Grátis: 500 MB. Premium: 8 GB + backup na nuvem.</div>' : ''}</div></div>`;
  $('#sy').onclick = async () => { const n = await tentar(() => API('offline.sincronizar')); if (n !== undefined) { toast(`${n} alterações sincronizadas.`); ir('offline'); } };
  $('#bk').onclick = async () => { const d = await tentar(() => API('offline.backup')); if (d) toast('Cópia guardada em ' + d); };
  $('#ex').onclick = async () => { const r = await tentar(() => API('offline.exportarTudo')); if (r) toast(`${r.n} documentos exportados para ${r.pasta}`); };
}
