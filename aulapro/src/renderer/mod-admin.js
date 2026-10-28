'use strict';
// Módulo 9: Painel do Desenvolvedor
const ADMIN_PAGINAS = {
  async adm_dash(el) {
    const d = await API('admin.dashboard'); const max = Math.max(1, ...d.acessos.map((a) => a.n)); const rmax = Math.max(1, ...d.receita.map((r) => r.v));
    el.innerHTML = `<h1>Painel do Desenvolvedor</h1><div class="grid g4" style="margin:12px 0"><div class="card kpi"><div class="mut sm">Total de utilizadores</div><div class="n">${d.totalUsers}</div><div class="sm az">+${d.novosSemana} esta semana</div></div>
     <div class="card kpi a"><div class="mut sm">Pagamentos pendentes</div><div class="n">${d.pendentes}</div><div class="sm mut">a aguardar</div></div><div class="card kpi r"><div class="mut sm">Reclamações abertas</div><div class="n">${d.reclamacoes}</div><div class="sm mut">${d.reclamacoesAltas} de alta prioridade</div></div>
     <div class="card kpi v"><div class="mut sm">Versão</div><div class="n" style="font-size:24px">v${esc(d.versao)}</div><div class="sm mut">Estável</div></div></div>
    <div class="grid g2"><div class="card"><h2>Utilizadores activos por dia</h2><div class="chart">${d.acessos.map((a) => `<div style="height:${a.n / max * 100}%"><span>${a.n}</span></div>`).join('') || '<span class="mut">Sem acessos registados.</span>'}</div><div class="sm mut">${d.acessos.map((a) => a.d.slice(5)).join(' · ')}</div></div>
     <div class="card"><h2>Receita por plano (verificada)</h2>${d.receita.map((r) => `<div class="row sp sm"><span>${esc(r.plano)}</span><b>${mt(r.v)}</b></div>${barra(r.v / rmax * 100)}`).join('') || '<span class="mut">Sem receita verificada.</span>'}</div></div>`;
  },
  async adm_users(el) {
    const f = E.ctx.f || {}; const us = await API('admin.users', f);
    el.innerHTML = `<div class="row sp"><h1>Gestão de utilizadores</h1><button id="cu">+ Criar utilizador</button></div><div class="row" style="margin:10px 0"><select id="fp" style="width:auto"><option value="">Todos os planos</option>${['gratis', 'semanal', 'mensal', 'anual', 'escola'].map((p) => `<option ${f.plano === p ? 'selected' : ''}>${p}</option>`).join('')}</select><input id="fe" placeholder="Escola" value="${esc(f.escola || '')}" style="width:180px"><input id="fc" placeholder="Cidade (Beira, Dondo…)" value="${esc(f.cidade || '')}" style="width:200px"><button class="sec" id="fa">Filtrar</button></div>
    <div class="card" style="padding:0;overflow:auto"><table><tr><th>Nome</th><th>Email</th><th>Telefone</th><th>Escola</th><th>Cidade</th><th>Plano</th><th>Estado</th><th>Registo</th><th></th></tr>${us.map((u) => `<tr><td>${esc(u.nome)}</td><td>${esc(u.email)}</td><td>${esc(u.telefone)}</td><td>${esc(u.escola)}</td><td>${esc(u.cidade)}</td><td>${esc(u.plano)}${u.plano_expira ? `<div class="sm mut">até ${dataCurta(u.plano_expira)}</div>` : ''}</td><td><span class="pill ${u.estado === 'activo' ? 'verde' : 'vermelho'}">${u.estado}</span></td><td>${dataCurta(u.criado_em)}</td>
      <td style="white-space:nowrap"><button class="sm sec" data-a="plano" data-i="${u.id}">Plano</button> <button class="sm sec" data-a="bloquear" data-i="${u.id}">${u.estado === 'activo' ? 'Bloquear' : 'Desbloquear'}</button> <button class="sm sec" data-a="resetar" data-i="${u.id}">Reset senha</button> <button class="sm sec" data-a="msg" data-i="${u.id}">Mensagem</button> <button class="sm sec" data-a="hist" data-i="${u.id}">Pagamentos</button> <button class="sm err" data-a="apagar" data-i="${u.id}">Apagar</button></td></tr>`).join('')}</table></div>`;
    $('#fa').onclick = () => ir('adm_users', { f: { plano: $('#fp').value, escola: $('#fe').value, cidade: $('#fc').value } });
    $('#cu').onclick = async () => { const r = await pedir('Criar utilizador', [{ nome: 'nome', rotulo: 'Nome' }, { nome: 'email', rotulo: 'Email' }, { nome: 'escola', rotulo: 'Escola' }, { nome: 'cidade', rotulo: 'Cidade' }, { nome: 'senha', rotulo: 'Palavra-passe inicial', tipo: 'password' }]);
      if (r) { const ok = await tentar(() => API('admin.criarUser', r), 'Utilizador criado.'); ir('adm_users', E.ctx); } };
    $$('[data-a]', el).forEach((b) => (b.onclick = async () => {
      const id = Number(b.dataset.i), a = b.dataset.a;
      if (a === 'apagar') { if (await confirmar('Apagar este utilizador e todos os seus dados?')) { await tentar(() => API('admin.userAccao', id, 'apagar')); ir('adm_users', E.ctx); } }
      else if (a === 'bloquear') { await tentar(() => API('admin.userAccao', id, 'bloquear')); ir('adm_users', E.ctx); }
      else if (a === 'resetar') { const r = await tentar(() => API('admin.userAccao', id, 'resetar')); if (r) modal(`<h2>Palavra-passe reposta</h2><p>Nova palavra-passe temporária: <b class="az">${esc(r.novaSenha)}</b></p><p class="sm mut">Comunique-a ao utilizador por canal seguro.</p>`); }
      else if (a === 'plano') { const r = await pedir('Atribuir plano', [{ nome: 'p', rotulo: 'Plano', opcoes: ['gratis', 'semanal', 'mensal', 'anual', 'escola'] }]); if (r) { await tentar(() => API('admin.userAccao', id, 'plano', r.p), 'Plano actualizado.'); ir('adm_users', E.ctx); } }
      else if (a === 'msg') { const r = await pedir('Enviar mensagem', [{ nome: 't', rotulo: 'Mensagem', tipo: 'area' }], 'Enviar'); if (r) tentar(() => API('admin.chatEnviar', id, r.t), 'Mensagem enviada.'); }
      else if (a === 'hist') { const h = await API('admin.historicoPagamentos', id); modal(`<h2>Histórico de pagamentos</h2>${h.length ? `<table><tr><th>ID</th><th>Plano</th><th>Valor</th><th>Estado</th></tr>${h.map((p) => `<tr><td>${esc(p.transaction_id)}</td><td>${esc(p.plano)}</td><td>${mt(p.valor)}</td><td>${esc(p.estado)}</td></tr>`).join('')}</table>` : '<span class="mut">Sem pagamentos.</span>'}`); }
    }));
  },
  async adm_fila(el) {
    const f = await API('admin.fila');
    el.innerHTML = `<h1>Fila de verificação de pagamentos</h1><div class="mut">Regra automática: se não verificar em 2 horas, o sistema confere número destino, nome de confirmação, valor do plano e data (últimas 24h). Só liberta se tudo bater; senão mantém pendente.</div>
    <div class="card" style="margin-top:12px;padding:0;overflow:auto"><table><tr><th>ID transação</th><th>Utilizador</th><th>Valor</th><th>Método</th><th>Nº destino</th><th>Nome confirmação</th><th>Enviado</th><th>Acção</th></tr>${f.map((p) => `<tr><td>${esc(p.transaction_id)}</td><td>${esc(p.nome)}<div class="sm mut">${esc(p.email)}</div></td><td>${mt(p.valor)}<div class="sm mut">${esc(p.plano)}</div></td><td>${esc(p.metodo)}</td><td>${esc(p.numero_destino)}</td><td>${esc(p.nome_confirmacao)}</td><td>${dataHora(p.criado_em)}</td>
      <td style="white-space:nowrap">${p.comprovativo ? `<button class="sm sec" data-v="${p.id}">Ver</button> ` : ''}<button class="sm ok" data-ok="${p.id}">Verify</button> <button class="sm err" data-no="${p.id}">Reject</button></td></tr>`).join('') || '<tr><td colspan="8" class="mut">Sem pagamentos pendentes.</td></tr>'}</table></div>`;
    $$('[data-v]', el).forEach((b) => (b.onclick = async () => { const s = await tentar(() => API('admin.comprovativo', Number(b.dataset.v))); if (s) modal(`<img src="${s}" style="max-width:100%;border-radius:8px"><button data-c style="margin-top:10px">Fechar</button>`, (o, fc) => ($('[data-c]', o).onclick = fc)); }));
    $$('[data-ok]', el).forEach((b) => (b.onclick = async () => { if (await tentar(() => API('admin.verificar', Number(b.dataset.ok), true), 'Premium libertado.')) ir('adm_fila'); }));
    $$('[data-no]', el).forEach((b) => (b.onclick = async () => { const r = await pedir('Rejeitar pagamento', [{ nome: 'm', rotulo: 'Motivo (enviado ao utilizador)', valor: 'Comprovativo inválido, envie novamente.' }], 'Rejeitar'); if (r && await tentar(() => API('admin.verificar', Number(b.dataset.no), false, r.m), 'Rejeitado.')) ir('adm_fila'); }));
  },
  async adm_config(el) {
    const c = await API('admin.config.obter'); const mk = (n) => (n ? '•• ••' + String(n).replace(/\D/g, '').slice(-4) : '');
    el.innerHTML = `<h1>Configuração de pagamentos</h1><div class="card" style="max-width:640px;margin-top:12px"><label>Nome de confirmação</label><input id="nc" value="${esc(c.nome_confirmacao)}"><label>Número M-Pesa</label><div class="row"><input id="mp" value="${esc(c.mpesa_numero)}" type="password" style="flex:1"><button class="sec sm" data-s="mp">Mostrar</button></div>
     <label>Número E-Mola</label><div class="row"><input id="em" value="${esc(c.emola_numero)}" type="password" style="flex:1"><button class="sec sm" data-s="em">Mostrar</button></div><label>Conta bancária (opcional)</label><input id="cb" value="${esc(c.conta_bancaria)}">
     <label>Exigir confirmação manual acima de (MT)</label><input id="ac" type="number" value="${esc(c.exigir_confirmacao_acima)}"><label>Verificação automática após (horas)</label><input id="ah" type="number" value="${esc(c.auto_verificar_horas)}">
     <h2 style="margin-top:18px">Sincronização e IA</h2><label>URL do servidor de sincronização</label><input id="su" value="${esc(c.sync_url)}" placeholder="https://…"><label>URL da API de IA (compatível com OpenAI)</label><input id="iu" value="${esc(c.ia_url)}" placeholder="https://…/v1/chat/completions">
     <label>Modelo</label><input id="im" value="${esc(c.ia_modelo)}"><label>Chave da API (guardada localmente; deixe vazio para manter)</label><input id="ik" type="password">
     <button id="sv" style="margin-top:14px">Guardar configuração</button></div>`;
    $$('[data-s]', el).forEach((b) => (b.onclick = () => { const i = $('#' + b.dataset.s); i.type = i.type === 'password' ? 'text' : 'password'; b.textContent = i.type === 'password' ? 'Mostrar' : 'Esconder'; }));
    $('#sv').onclick = () => tentar(() => API('admin.config.guardar', { nome_confirmacao: $('#nc').value, mpesa_numero: $('#mp').value, emola_numero: $('#em').value, conta_bancaria: $('#cb').value, exigir_confirmacao_acima: $('#ac').value, auto_verificar_horas: $('#ah').value, sync_url: $('#su').value, ia_url: $('#iu').value, ia_modelo: $('#im').value, ia_chave: $('#ik').value }), 'Configuração guardada. Os utilizadores vêem os novos números imediatamente.');
  },
  async adm_inbox(el) {
    const f = E.ctx.tipo || ''; const r = await API('admin.reclamacoes', { tipo: f });
    el.innerHTML = `<h1>Reclamações e sugestões</h1><div class="tabs">${[['', 'Todos'], ['problema', 'Problemas'], ['sugestao', 'Sugestões'], ['facturacao', 'Facturação']].map(([k, t]) => `<button data-t="${k}" class="${f === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    ${r.map((x) => `<div class="card" style="margin-bottom:10px"><div class="row sp"><div><span class="pill ${x.prioridade === 'alta' ? 'vermelho' : x.prioridade === 'media' ? 'amarelo' : 'neutro'}">${x.prioridade}</span> <b>${esc(x.assunto)}</b> <span class="sm mut">· ${esc(x.tipo)} · ${esc(x.email || '')} · ${dataHora(x.criado_em)}</span></div><span class="pill ${x.estado === 'aberta' ? 'amarelo' : 'verde'}">${x.estado}</span></div><p>${esc(x.mensagem)}</p>${x.resposta ? `<div class="sm az">Resposta: ${esc(x.resposta)}</div>` : ''}
      <div class="row"><button class="sm" data-re="${x.id}">Responder</button><button class="sm sec" data-rs="${x.id}">Marcar resolvido</button><select data-pr="${x.id}" style="width:auto"><option value="">Prioridade…</option><option>alta</option><option>media</option><option>baixa</option></select></div></div>`).join('') || '<div class="card mut">Sem itens.</div>'}`;
    $$('[data-t]', el).forEach((b) => (b.onclick = () => ir('adm_inbox', { tipo: b.dataset.t })));
    $$('[data-re]', el).forEach((b) => (b.onclick = async () => { const t = await pedir('Responder', [{ nome: 'r', rotulo: 'Resposta', tipo: 'area' }], 'Enviar'); if (t) { await tentar(() => API('admin.reclamacaoAccao', Number(b.dataset.re), { resposta: t.r }), 'Resposta enviada.'); ir('adm_inbox', E.ctx); } }));
    $$('[data-rs]', el).forEach((b) => (b.onclick = async () => { await API('admin.reclamacaoAccao', Number(b.dataset.rs), { estado: 'resolvida' }); ir('adm_inbox', E.ctx); }));
    $$('[data-pr]', el).forEach((s) => (s.onchange = async () => { if (s.value) { await API('admin.reclamacaoAccao', Number(s.dataset.pr), { prioridade: s.value }); ir('adm_inbox', E.ctx); } }));
  },
  async adm_chat(el) {
    const cs = await API('admin.chats'); const sel = E.ctx.u || cs[0]?.id; const m = sel ? await API('admin.chat', sel) : [];
    el.innerHTML = `<h1>Chat com utilizadores</h1><div class="grid" style="grid-template-columns:280px 1fr;margin-top:12px"><div class="card" style="padding:6px">${cs.map((c) => `<div class="thumb ${c.id === sel ? 'on' : ''}" data-u="${c.id}"><b>${esc(c.nome)}</b><div class="sm mut">${esc((c.ultima || '').slice(0, 50))}</div><div class="sm mut">${dataHora(c.quando)}</div></div>`).join('') || '<span class="mut">Sem conversas.</span>'}</div>
     <div class="card"><div class="chat" id="ch">${m.map((x) => `<div class="msg ${x.de_admin ? 'eu' : ''}">${esc(x.texto)}<div class="sm" style="opacity:.7">${dataHora(x.criado_em)}</div></div>`).join('')}</div>${sel ? '<div class="row" style="margin-top:8px"><input id="mt" style="flex:1" placeholder="Responder…"><button id="me">Enviar</button></div>' : ''}</div></div>`;
    $$('[data-u]', el).forEach((d) => (d.onclick = () => ir('adm_chat', { u: Number(d.dataset.u) })));
    if (sel) $('#me').onclick = async () => { if ($('#mt').value.trim() && await tentar(() => API('admin.chatEnviar', sel, $('#mt').value.trim()))) ir('adm_chat', { u: sel }); };
  },
  async adm_update(el) {
    const c = await API('admin.config.obter');
    el.innerHTML = `<h1>Publicação de actualizações</h1><div class="card" style="max-width:640px;margin-top:12px"><div>Versão publicada: <b>v${esc(c.versao)}</b></div><label>Nova versão</label><input id="v" value="${esc(c.versao)}"><label>Changelog (o que mudou)</label><textarea id="cl" placeholder="Ex.: Corrigido bug na caderneta Regra B">${esc(c.changelog)}</textarea>
    <button id="d" style="margin-top:12px">Publicar aviso de actualização</button><p class="sm mut">As instalações são actualizadas via electron-updater a partir do servidor definido em <code>package.json → build.publish</code>. Ao publicar, os utilizadores recebem o aviso “Nova actualização disponível” com este changelog.</p></div>`;
    $('#d').onclick = () => tentar(() => API('admin.update', $('#v').value, $('#cl').value), 'Aviso publicado.');
  },
  async adm_logs(el) {
    const t = E.ctx.tipo || ''; const l = await API('admin.logs', t);
    el.innerHTML = `<div class="row sp"><h1>Logs e monitorização</h1><button class="sec" id="cv">Exportar CSV (auditoria)</button></div><div class="tabs">${[['', 'Todos'], ['acesso', 'Acessos'], ['pagamento', 'Pagamentos'], ['erro', 'Erros'], ['admin', 'Admin']].map(([k, x]) => `<button data-t="${k}" class="${t === k ? 'on' : ''}">${x}</button>`).join('')}</div>
    <div class="card" style="padding:0;overflow:auto;max-height:70vh"><table><tr><th>Data</th><th>Tipo</th><th>Utilizador</th><th>Detalhe</th></tr>${l.map((x) => `<tr><td>${dataHora(x.criado_em)}</td><td>${esc(x.tipo)}</td><td>${esc(x.email || '—')}</td><td>${esc(x.detalhe)}</td></tr>`).join('')}</table></div>`;
    $$('[data-t]', el).forEach((b) => (b.onclick = () => ir('adm_logs', { tipo: b.dataset.t })));
    $('#cv').onclick = async () => { const d = await tentar(() => API('admin.logsCsv')); if (d) toast('Guardado em ' + d); };
  },
};
