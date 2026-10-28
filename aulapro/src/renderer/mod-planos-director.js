'use strict';
// Planos Premium + pagamento, Módulo 7 (Dashboard do Director), Suporte
async function paginaPlanos(el) {
  const i = E.info, P = i.planos, pk = i.planoKey; const meus = await API('pagamento.meus');
  const caixa = (k, extra, rec) => `<div class="planbox ${rec ? 'rec' : ''}">${rec ? '<span class="pill verde" style="position:absolute;top:-10px;right:12px">Mais vendido</span>' : ''}<h3>${P[k].nome}</h3><div class="pr">${mt(P[k].preco)}</div><div class="sm mut">${extra}</div><button style="width:100%;margin-top:10px" data-p="${k}">Assinar</button></div>`;
  el.innerHTML = `<h1>Planos Premium</h1><div class="mut">Pagamento por M-Pesa, E-Mola ou transferência. Cancele quando quiser. O plano é activado após verificação do comprovativo.</div>
  <div class="card" style="margin:12px 0">Plano actual: <b>${esc(P[pk].nome)}</b>${pk !== 'gratis' ? ` · válido até <b>${dataCurta(i.expira)}</b>` : ''}</div>
  <div class="grid g4">${caixa('semanal', '7 dias · teste rápido')}${caixa('mensal', '30 dias · padrão de 90% dos professores', true)}${caixa('anual', '365 dias · 2 meses grátis, poupa 589 MT')}${caixa('escola', 'Até 30 professores + Dashboard do Director')}</div>
  <h2 style="margin-top:20px">Grátis vs Premium</h2>${tabelaComparativa()}
  <h2 style="margin-top:20px">Os meus pagamentos</h2><div class="card">${meus.length ? `<table><tr><th>ID</th><th>Plano</th><th>Valor</th><th>Método</th><th>Estado</th><th>Data</th></tr>${meus.map((p) => `<tr><td>${esc(p.transaction_id)}</td><td>${esc(P[p.plano]?.nome)}</td><td>${mt(p.valor)}</td><td>${esc(p.metodo)}</td><td><span class="pill ${p.estado === 'verificado' ? 'verde' : p.estado === 'rejeitado' ? 'vermelho' : 'amarelo'}">${p.estado}</span>${p.motivo ? `<div class="sm mut">${esc(p.motivo)}</div>` : ''}</td><td>${dataHora(p.criado_em)}</td></tr>`).join('')}</table>` : '<span class="mut">Sem pagamentos.</span>'}</div>`;
  $$('[data-p]', el).forEach((b) => (b.onclick = () => pagar(b.dataset.p)));
}
function pagar(k) {
  const i = E.info, c = i.config, P = i.planos[k];
  const { ov, fechar } = modal(`<h2>Assinar ${P.nome} — ${mt(P.preco)}</h2>
   <div class="card" style="background:var(--bg)"><b>1. Pague para:</b><br>M-Pesa: <b>${esc(c.mpesa || 'indisponível')}</b><br>E-Mola: <b>${esc(c.emola || 'indisponível')}</b>${c.conta ? `<br>Conta bancária: <b>${esc(c.conta)}</b>` : ''}<br>Nome de confirmação: <b>${esc(c.nomeConfirmacao)}</b></div>
   <b style="display:block;margin-top:10px">2. Envie o comprovativo</b><label>Método</label><select id="m"><option>M-Pesa</option><option>E-Mola</option><option>Mkesh</option><option>PayPal</option><option>Transferência</option></select>
   <label>ID da transação</label><input id="t"><label>Número para onde pagou</label><input id="n"><label>Nome que apareceu na confirmação</label><input id="c"><label>Data do pagamento</label><input id="d" type="date" value="${new Date().toISOString().slice(0, 10)}">
   <label>Print do comprovativo (imagem)</label><div class="row"><button class="sec sm" id="im">Escolher imagem…</button><span id="fn" class="sm mut"></span></div>
   ${P.preco > c.acima ? `<div class="sm mut" style="margin-top:8px">Pagamentos acima de ${mt(c.acima)} exigem confirmação do administrador.</div>` : ''}
   <div class="row sp" style="margin-top:14px"><button class="sec" data-c>Cancelar</button><button data-e>Enviar comprovativo</button></div>`);
  let img = null;
  $('#im', ov).onclick = async () => { img = await tentar(() => API('ficheiro.escolher')); $('#fn', ov).textContent = img ? img.split(/[\\/]/).pop() : ''; };
  $('[data-c]', ov).onclick = fechar;
  $('[data-e]', ov).onclick = async () => { const r = await tentar(() => API('pagamento.enviar', { plano: k, metodo: $('#m', ov).value, transactionId: $('#t', ov).value, numeroDestino: $('#n', ov).value, nomeConfirmacao: $('#c', ov).value, dataPagamento: $('#d', ov).value, valor: P.preco, comprovativoCaminho: img }));
    if (r) { fechar(); modal('<h2>✅ Comprovativo enviado</h2><p>O pagamento está <b>pendente</b>. O administrador verifica e liberta o Premium. Se não for verificado em 2 horas, o sistema confere automaticamente número, nome, valor e data.</p><button data-o>Ok</button>', (o2, f2) => ($('[data-o]', o2).onclick = () => { f2(); ir('planos'); })); } };
}

// ---------------- Módulo 7: Dashboard do Director ----------------
async function paginaDirector(el) {
  if (E.info.planoKey !== 'escola') {
    el.innerHTML = `<h1>Dashboard do Director e Relatórios</h1><div class="card" style="margin-top:12px"><h2>🔒 Disponível apenas no plano Escola</h2><p>Acompanhe a taxa de aprovação, o desempenho por turma e os alunos em risco de toda a escola. Inclui até 30 contas de professores.</p><button id="up">Ver plano Escola — 5.000 MT/mês</button></div>`;
    return ($('#up').onclick = () => ir('planos'));
  }
  const d = await API('director.dados'); const max = Math.max(20, ...d.porTurma.map((t) => t.media)); const dist = d.distribuicao; const tot = dist.alto + dist.medio + dist.baixo || 1;
  const pc = (n) => Math.round((n / tot) * 100);
  el.innerHTML = `<div class="row sp"><div><h1>Dashboard do Director</h1><div class="mut">${esc(E.user.escola || 'Escola')}</div></div><div class="row"><button class="sec" data-x="pdf">Relatório mensal (PDF)</button><button class="sec" data-x="csv">Desempenho por turma (CSV)</button></div></div>
  <div class="grid g4" style="margin:12px 0"><div class="card kpi v"><div class="mut sm">Taxa de aprovação</div><div class="n">${d.aprovacao}%</div></div><div class="card kpi"><div class="mut sm">Média de notas</div><div class="n">${num(d.media)}/20</div></div>
   <div class="card kpi a"><div class="mut sm">Alunos activos</div><div class="n">${d.alunos}</div></div><div class="card kpi"><div class="mut sm">Professores</div><div class="n">${d.professores}</div></div></div>
  <div class="grid g2"><div class="card"><h2>Desempenho por turma</h2>${d.porTurma.map((t) => `<div style="margin:8px 0"><div class="row sp sm"><span>${esc(t.turma)}</span><b>${t.media}</b></div>${barra(t.media / max * 100)}</div>`).join('') || '<span class="mut">Sem dados.</span>'}</div>
   <div class="card"><h2>Análise dos alunos</h2><div class="row sp"><span>🟦 Alto (≥14)</span><b>${pc(dist.alto)}% — ${dist.alto}</b></div><div class="row sp"><span>🟨 Médio (10–13,9)</span><b>${pc(dist.medio)}% — ${dist.medio}</b></div><div class="row sp"><span>🟥 Baixo (&lt;10)</span><b>${pc(dist.baixo)}% — ${dist.baixo}</b></div>
   ${d.risco.length ? `<div class="card" style="background:#FFF4E5;color:#7A4B00;margin-top:10px">⚠ ${d.risco.length} aluno(s) em risco (média &lt; 8): ${d.risco.slice(0, 5).map((r) => esc(r.nome)).join(', ')}${d.risco.length > 5 ? '…' : ''}</div>` : ''}</div></div>`;
  $$('[data-x]', el).forEach((b) => (b.onclick = async () => { const r = await tentar(() => API('director.exportar', b.dataset.x === 'pdf' ? 'mensal' : 'desempenho', b.dataset.x)); if (r) toast('Guardado em ' + r); }));
}

// ---------------- Suporte ----------------
async function paginaSuporte(el) {
  const msgs = await API('chat.listar'); const pk = E.info.planoKey;
  el.innerHTML = `<h1>Suporte</h1><div class="mut">${pk === 'gratis' ? 'Plano Grátis: resposta por email em até 72h.' : 'Premium: suporte WhatsApp 24/7 prioritário.'}</div>
  <div class="grid g2" style="margin-top:12px"><div class="card"><h2>Conversa com o suporte</h2><div class="chat" id="ch">${msgs.map((m) => `<div class="msg ${m.de_admin ? '' : 'eu'}">${esc(m.texto)}<div class="sm" style="opacity:.7">${dataHora(m.criado_em)}</div></div>`).join('') || '<span class="mut">Sem mensagens.</span>'}</div>
    <div class="row" style="margin-top:8px"><input id="mt" placeholder="Escreva uma mensagem…" style="flex:1"><button id="me">Enviar</button></div></div>
   <div class="card"><h2>Reclamação ou sugestão</h2><label>Tipo</label><select id="tp"><option value="problema">Problema</option><option value="sugestao">Sugestão</option><option value="facturacao">Facturação</option></select><label>Prioridade</label><select id="pr"><option value="media">Média</option><option value="alta">Alta</option><option value="baixa">Baixa</option></select>
    <label>Assunto</label><input id="as"><label>Mensagem</label><textarea id="ms"></textarea><button id="en" style="margin-top:10px">Enviar</button></div></div>
  <div class="card" style="margin-top:14px"><h2>A minha conta</h2><div class="row"><button class="sec" id="pf">Editar perfil</button><button class="sec" id="ps">Alterar palavra-passe</button></div></div>`;
  const ch = $('#ch'); ch.scrollTop = ch.scrollHeight;
  $('#me').onclick = async () => { if (await tentar(() => API('chat.enviar', $('#mt').value))) ir('suporte'); };
  $('#en').onclick = async () => { if (await tentar(() => API('suporte.enviarReclamacao', { tipo: $('#tp').value, prioridade: $('#pr').value, assunto: $('#as').value, mensagem: $('#ms').value }), 'Enviado. Obrigado!')) ir('suporte'); };
  $('#pf').onclick = async () => { const u = E.user; const r = await pedir('Editar perfil', [{ nome: 'nome', rotulo: 'Nome', valor: u.nome }, { nome: 'telefone', rotulo: 'Telefone', valor: u.telefone }, { nome: 'escola', rotulo: 'Escola', valor: u.escola }, { nome: 'cidade', rotulo: 'Cidade', valor: u.cidade }, { nome: 'disciplina', rotulo: 'Disciplina principal', valor: u.disciplina_principal }]); if (r) { const n = await tentar(() => API('perfil.actualizar', r), 'Perfil actualizado.'); if (n) { E.user = n; desenharCasca(); ir('suporte'); } } };
  $('#ps').onclick = async () => { const r = await pedir('Alterar palavra-passe', [{ nome: 'a', rotulo: 'Palavra-passe actual', tipo: 'password' }, { nome: 'n', rotulo: 'Nova (mín. 6 caracteres e 1 símbolo)', tipo: 'password' }]); if (r) tentar(() => API('auth.alterarSenha', r.a, r.n), 'Palavra-passe alterada.'); };
}
