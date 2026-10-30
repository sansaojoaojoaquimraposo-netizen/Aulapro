'use strict';
const fs = require('fs');
const path = require('path');
const { ipcMain, dialog, shell, app, BrowserWindow } = require('electron');
const dbm = require('./db');
const auth = require('./auth');
const calc = require('./calc');
const ai = require('./ai');
const ex = require('./exporters');
const extract = require('./extract');
const { PLANOS, LIMITES, planoEfectivo, limitesDe } = require('./plans');

const db = () => dbm.get();
const inf = (v) => (v === Infinity ? null : v);

function handle(canal, fn) {
  ipcMain.handle('api:' + canal, async (_e, ...args) => {
    try { return { ok: true, data: await fn(...args) }; }
    catch (e) { return { ok: false, erro: e.message || String(e) }; }
  });
}

// ---------- helpers de plano / limites ----------
function ctx() {
  const u = auth.exigirSessao();
  const pk = planoEfectivo(u);
  return { u, pk, lim: limitesDe(pk), marca: pk === 'gratis' };
}
function gastar(u, lim, recurso, chaveLim, msg) {
  const max = lim[chaveLim];
  if (max !== Infinity && dbm.usoActual(u.id, recurso) >= max) throw new Error(`LIMITE: ${msg} (${max}/mês no plano Grátis). Assine o Premium para continuar.`);
  dbm.registarUso(u.id, recurso);
}
function activarPlano(userId, plano) {
  const p = PLANOS[plano]; if (!p || !p.dias) throw new Error('Plano inválido.');
  const u = db().prepare('SELECT plano_expira FROM users WHERE id=?').get(userId);
  const base = Math.max(Date.now(), u?.plano_expira || 0);
  db().prepare('UPDATE users SET plano=?, plano_expira=? WHERE id=?').run(plano, base + p.dias * 864e5, userId);
}
// Dados de OCR (por.traineddata) vão dentro do instalador, para o OCR funcionar sem internet.
const ocrDir = () => { const d = path.join(__dirname, '..', 'ocr').replace('app.asar', 'app.asar.unpacked'); return fs.existsSync(path.join(d, 'por.traineddata')) ? d : undefined; };
const pastaDados = () => path.join(app.getPath('userData'), 'ficheiros');

async function escolherDestino(janela, nome, ext) {
  const r = await dialog.showSaveDialog(janela, { defaultPath: nome, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
  return r.canceled ? null : r.filePath;
}
const limpaNome = (s) => String(s || 'documento').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);

// ---------- Caderneta ----------
function turmaDoUser(id, uid) {
  const t = db().prepare('SELECT * FROM turmas WHERE id=? AND user_id=?').get(id, uid);
  if (!t) throw new Error('Turma não encontrada.');
  return t;
}
function carregarCaderneta(turmaId, uid) {
  const t = turmaDoUser(turmaId, uid);
  const alunos = db().prepare('SELECT * FROM alunos WHERE turma_id=? ORDER BY numero, nome').all(turmaId);
  const notasQ = db().prepare('SELECT * FROM notas WHERE aluno_id=?');
  const linhas = alunos.map((a) => {
    const n = { exame: null };
    for (const r of notasQ.all(a.id)) { if (r.trimestre === 0) n.exame = r.exame; else n[r.trimestre] = r; }
    const c = calc.calcularAluno(n, { regra: t.regra, opcaoExame: t.opcao_exame, temExame: !!t.tem_exame });
    return { id: a.id, numero: a.numero, nome: a.nome, notas: n, ...c, exame: n.exame };
  });
  const por = (r) => linhas.filter((l) => l.resultado === r).length;
  const resumo = { total: linhas.length, aprovados: por('Aprovado'), recuperacao: por('Recuperação'), reprovados: por('Reprovado'), pendentes: por('Pendente') };
  return { turma: t, linhas, resumo };
}

function registarHandlers(getJanela) {
  // ---- Autenticação ----
  handle('auth.registar', (d) => auth.registar(d));
  handle('auth.entrar', (e, s) => auth.entrar(e, s));
  handle('auth.sair', () => { auth.sair(); return true; });
  handle('auth.eu', () => auth.utilizadorActual());
  handle('auth.alterarSenha', (a, n) => auth.alterarSenha(a, n));
  handle('auth.pedirRecuperacao', (e) => auth.pedirRecuperacao(e));
  handle('auth.concluirRecuperacao', (e, c, n) => auth.concluirRecuperacao(e, c, n));
  handle('auth.adminConfigurado', () => auth.adminConfigurado());
  handle('auth.configurarAdmin', (d) => auth.configurarAdmin(d));
  handle('auth.entrarAdmin', (e, s, c) => auth.entrarAdmin(e, s, c));
  handle('perfil.actualizar', (d) => {
    const { u } = ctx();
    db().prepare('UPDATE users SET nome=?, telefone=?, escola=?, cidade=?, disciplina_principal=? WHERE id=?')
      .run(d.nome || u.nome, d.telefone || '', d.escola || '', d.cidade || '', d.disciplina || '', u.id);
    return auth.utilizadorActual();
  });

  // ---- Planos / limites ----
  handle('planos.info', () => {
    const { u, pk, lim } = ctx();
    const uso = {};
    for (const r of ['plano', 'apresentacao', 'ficha', 'download', 'voz']) uso[r] = dbm.usoActual(u.id, r);
    const l = Object.fromEntries(Object.entries(lim).map(([k, v]) => [k, v === Infinity ? null : v]));
    return { planoKey: pk, planos: PLANOS, limites: l, uso, expira: u.plano_expira, config: {
      nomeConfirmacao: dbm.getConfig('nome_confirmacao'), mpesa: dbm.getConfig('mpesa_numero'), emola: dbm.getConfig('emola_numero'),
      conta: dbm.getConfig('conta_bancaria'), acima: Number(dbm.getConfig('exigir_confirmacao_acima')) } };
  });
  handle('pagamento.enviar', async (d) => {
    const { u } = ctx();
    const p = PLANOS[d.plano]; if (!p || !p.preco) throw new Error('Escolha um plano pago.');
    if (!d.transactionId || String(d.transactionId).trim().length < 4) throw new Error('Indique o ID da transação.');
    if (!d.metodo) throw new Error('Indique o método de pagamento.');
    let comprov = null;
    if (d.comprovativoCaminho) {
      fs.mkdirSync(path.join(pastaDados(), 'comprovativos'), { recursive: true });
      comprov = path.join(pastaDados(), 'comprovativos', `${Date.now()}_${path.basename(d.comprovativoCaminho)}`);
      fs.copyFileSync(d.comprovativoCaminho, comprov);
    }
    const r = db().prepare(`INSERT INTO pagamentos(transaction_id,user_id,plano,valor,metodo,numero_destino,nome_confirmacao,data_pagamento,comprovativo,criado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(String(d.transactionId).trim(), u.id, d.plano, Number(d.valor ?? p.preco), d.metodo,
      d.numeroDestino || '', d.nomeConfirmacao || '', d.dataPagamento ? new Date(d.dataPagamento).getTime() : Date.now(), comprov, Date.now());
    dbm.log(u.id, 'pagamento', `Pagamento ${d.transactionId} (${d.plano}) enviado`);
    dbm.enfileirar('pagamentos', r.lastInsertRowid, 'criar');
    return { id: r.lastInsertRowid, estado: 'pendente' };
  });
  handle('pagamento.meus', () => db().prepare('SELECT id,transaction_id,plano,valor,metodo,estado,motivo,criado_em FROM pagamentos WHERE user_id=? ORDER BY id DESC').all(ctx().u.id));
  handle('ficheiro.escolher', async (filtros) => {
    const r = await dialog.showOpenDialog(getJanela(), { properties: ['openFile'], filters: filtros || [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg'] }] });
    return r.canceled ? null : r.filePaths[0];
  });

  // ---- Home ----
  handle('home.stats', () => {
    const { u } = ctx();
    const q = (sql, ...a) => db().prepare(sql).get(...a);
    const turmas = db().prepare('SELECT t.id,t.nome,t.disciplina,(SELECT COUNT(*) FROM alunos a WHERE a.turma_id=t.id) alunos FROM turmas t WHERE user_id=?').all(u.id);
    const recentes = db().prepare("SELECT id,tipo,titulo,actualizado_em FROM documentos WHERE user_id=? AND tipo!='rascunho' ORDER BY actualizado_em DESC LIMIT 6").all(u.id);
    const notasFinais = [];
    const progresso = turmas.map((t) => {
      const c = carregarCaderneta(t.id, u.id);
      c.linhas.forEach((l) => { if (Number.isFinite(l.final)) notasFinais.push(l.final); });
      const feitos = c.linhas.filter((l) => l.resultado !== 'Pendente').length;
      return { id: t.id, nome: `${t.disciplina} • ${t.nome}`, alunos: t.alunos, pct: t.alunos ? Math.round((feitos / t.alunos) * 100) : 0 };
    });
    return {
      nome: u.nome, estudantes: turmas.reduce((a, t) => a + t.alunos, 0), turmas: turmas.length,
      mediaGeral: notasFinais.length ? calc.round1(notasFinais.reduce((a, n) => a + n, 0) / notasFinais.length) : null,
      planos: q("SELECT COUNT(*) n FROM documentos WHERE user_id=? AND tipo='plano'", u.id).n,
      apresentacoes: q("SELECT COUNT(*) n FROM documentos WHERE user_id=? AND tipo='apresentacao'", u.id).n,
      fichas: q("SELECT COUNT(*) n FROM documentos WHERE user_id=? AND tipo='ficha'", u.id).n,
      progresso, recentes,
      naoLidas: q('SELECT COUNT(*) n FROM mensagens WHERE user_id=? AND de_admin=1 AND lida=0', u.id).n,
    };
  });

  // ---- Módulo 1: Caderneta ----
  handle('turmas.listar', () => {
    const { u } = ctx();
    return db().prepare('SELECT t.*,(SELECT COUNT(*) FROM alunos a WHERE a.turma_id=t.id) alunos FROM turmas t WHERE user_id=? ORDER BY id').all(u.id);
  });
  handle('turmas.criar', (d) => {
    const { u, lim } = ctx();
    const n = db().prepare('SELECT COUNT(*) n FROM turmas WHERE user_id=?').get(u.id).n;
    if (lim.turmas !== Infinity && n >= lim.turmas) throw new Error(`LIMITE: o plano Grátis permite ${lim.turmas} turma. Assine o Premium para turmas ilimitadas.`);
    if (!d.nome || !d.disciplina) throw new Error('Indique o nome da turma e a disciplina.');
    const r = db().prepare('INSERT INTO turmas(user_id,nome,disciplina,classe,ano_lectivo) VALUES (?,?,?,?,?)')
      .run(u.id, d.nome.trim(), d.disciplina.trim(), d.classe || '', Number(d.ano) || new Date().getFullYear());
    return r.lastInsertRowid;
  });
  handle('turmas.config', (id, d) => {
    const { u, lim } = ctx(); turmaDoUser(id, u.id);
    if (d.regra === 'B' && !lim.regras.includes('B')) throw new Error('LIMITE: a Regra B é exclusiva do Premium.');
    db().prepare('UPDATE turmas SET regra=?, tem_exame=?, opcao_exame=? WHERE id=?').run(d.regra === 'B' ? 'B' : 'A', d.temExame ? 1 : 0, d.opcaoExame === 2 ? 2 : 1, id);
    return true;
  });
  handle('turmas.apagar', (id) => { const { u } = ctx(); turmaDoUser(id, u.id); db().prepare('DELETE FROM turmas WHERE id=?').run(id); return true; });
  handle('alunos.adicionar', (turmaId, lista) => {
    const { u, lim } = ctx(); turmaDoUser(turmaId, u.id);
    const nomes = (Array.isArray(lista) ? lista : [lista]).map((s) => String(s).trim()).filter(Boolean);
    let n = db().prepare('SELECT COUNT(*) n FROM alunos WHERE turma_id=?').get(turmaId).n;
    if (lim.alunosPorTurma !== Infinity && n + nomes.length > lim.alunosPorTurma) throw new Error(`LIMITE: o plano Grátis permite ${lim.alunosPorTurma} alunos por turma.`);
    const ins = db().prepare('INSERT INTO alunos(turma_id,numero,nome) VALUES (?,?,?)');
    for (const nome of nomes) ins.run(turmaId, ++n, nome);
    return nomes.length;
  });
  handle('alunos.importar', async (turmaId) => {
    const { u, lim } = ctx(); turmaDoUser(turmaId, u.id);
    const r = await dialog.showOpenDialog(getJanela(), { properties: ['openFile'], filters: [{ name: 'Lista (CSV/TXT)', extensions: ['csv', 'txt'] }] });
    if (r.canceled) return 0;
    const nomes = fs.readFileSync(r.filePaths[0], 'utf8').split(/\r?\n/).map((l) => l.split(/[;,\t]/).slice(-1)[0].replace(/^"|"$/g, '').trim()).filter((n) => n && !/^(nome|estudante|aluno)$/i.test(n));
    let n = db().prepare('SELECT COUNT(*) n FROM alunos WHERE turma_id=?').get(turmaId).n;
    if (lim.alunosPorTurma !== Infinity && n + nomes.length > lim.alunosPorTurma) throw new Error(`LIMITE: o plano Grátis permite ${lim.alunosPorTurma} alunos por turma.`);
    const ins = db().prepare('INSERT INTO alunos(turma_id,numero,nome) VALUES (?,?,?)');
    for (const nome of nomes) ins.run(turmaId, ++n, nome);
    return nomes.length;
  });
  handle('alunos.apagar', (id) => {
    const { u } = ctx();
    const a = db().prepare('SELECT a.id FROM alunos a JOIN turmas t ON t.id=a.turma_id WHERE a.id=? AND t.user_id=?').get(id, u.id);
    if (!a) throw new Error('Aluno não encontrado.');
    db().prepare('DELETE FROM alunos WHERE id=?').run(id); return true;
  });
  handle('notas.gravar', (alunoId, trimestre, campo, valor) => {
    const { u } = ctx();
    const a = db().prepare('SELECT a.id FROM alunos a JOIN turmas t ON t.id=a.turma_id WHERE a.id=? AND t.user_id=?').get(alunoId, u.id);
    if (!a) throw new Error('Aluno não encontrado.');
    const v = calc.validarNota(valor); if (!v.ok) throw new Error(v.erro);
    const campos = trimestre === 0 ? ['exame'] : ['acs1', 'acs2', 'acs3', 'at'];
    if (!campos.includes(campo)) throw new Error('Campo inválido.');
    db().prepare('INSERT OR IGNORE INTO notas(aluno_id,trimestre) VALUES (?,?)').run(alunoId, trimestre);
    db().prepare(`UPDATE notas SET ${campo}=? WHERE aluno_id=? AND trimestre=?`).run(v.valor, alunoId, trimestre);
    dbm.enfileirar('notas', alunoId, 'gravar');
    return true;
  });
  handle('caderneta.obter', (turmaId) => carregarCaderneta(turmaId, ctx().u.id));
  handle('caderneta.simular', (turmaId, alunoId, exame) => {
    const { lim, u } = ctx();
    if (!lim.simuladorExame) throw new Error('LIMITE: o simulador de exame é exclusivo do Premium.');
    const c = carregarCaderneta(turmaId, u.id);
    const l = c.linhas.find((x) => x.id === alunoId); if (!l) throw new Error('Aluno não encontrado.');
    return { opcao1: calc.classificacaoFinal(l.anual, exame, 1), opcao2: calc.classificacaoFinal(l.anual, exame, 2),
      minimoParaPassar: (Array.from({ length: 41 }, (_, i) => i / 2).find((e) => calc.classificacaoFinal(l.anual, e, c.turma.opcao_exame) >= 10)) ?? null };
  });
  handle('caderneta.exportar', async (turmaId, formato) => {
    const { u, marca } = ctx();
    const c = carregarCaderneta(turmaId, u.id);
    const dest = await escolherDestino(getJanela(), `Caderneta_${limpaNome(c.turma.disciplina)}_${limpaNome(c.turma.nome)}.${formato}`, formato);
    if (!dest) return null;
    const rows = c.linhas.map((l) => ({ ...l, t1: l.t1 ?? '', t2: l.t2 ?? '', t3: l.t3 ?? '', anual: l.anual ?? '', final: l.final ?? '', exame: l.exame ?? '' }));
    if (formato === 'csv') {
      const cab = ['Nº', 'Estudante', 'T1', 'T2', 'T3', 'Média Anual', ...(c.turma.tem_exame ? ['Exame'] : []), 'Classificação Final', 'Resultado'];
      fs.writeFileSync(dest, ex.csv([cab, ...rows.map((l) => [l.numero, l.nome, l.t1, l.t2, l.t3, l.anual, ...(c.turma.tem_exame ? [l.exame] : []), l.final, l.resultado])]));
    } else {
      await ex.pdfCaderneta(dest, { nome: c.turma.nome, disciplina: c.turma.disciplina, ano: c.turma.ano_lectivo, regra: c.turma.regra,
        temExame: !!c.turma.tem_exame, opcaoExame: c.turma.opcao_exame, linhas: rows }, { marca, escola: u.escola });
    }
    dbm.log(u.id, 'acesso', `Exportou caderneta (${formato})`);
    return dest;
  });

  // ---- Documentos (planos, apresentações, fichas) ----
  const docs = (tipo) => db().prepare('SELECT id,titulo,actualizado_em,conteudo FROM documentos WHERE user_id=? AND tipo=? ORDER BY actualizado_em DESC').all(ctx().u.id, tipo)
    .map((d) => ({ ...d, conteudo: JSON.parse(d.conteudo) }));
  function guardarDoc(tipo, id, titulo, conteudo, origem) {
    const { u } = ctx(); const agora = Date.now();
    if (id) {
      const r = db().prepare('UPDATE documentos SET titulo=?, conteudo=?, actualizado_em=? WHERE id=? AND user_id=?').run(titulo, JSON.stringify(conteudo), agora, id, u.id);
      if (!r.changes) throw new Error('Documento não encontrado.');
      dbm.enfileirar('documentos', id, 'actualizar');
      return id;
    }
    if (tipo === 'plano') {
      const n = db().prepare("SELECT COUNT(*) n FROM documentos WHERE user_id=? AND tipo='plano'").get(u.id).n;
      if (n >= 500) throw new Error('Limite de 500 planos locais atingido. Apague planos antigos.');
    }
    const r = db().prepare('INSERT INTO documentos(user_id,tipo,titulo,conteudo,origem_id,criado_em,actualizado_em) VALUES (?,?,?,?,?,?,?)')
      .run(u.id, tipo, titulo, JSON.stringify(conteudo), origem || null, agora, agora);
    dbm.enfileirar('documentos', r.lastInsertRowid, 'criar');
    return r.lastInsertRowid;
  }
  handle('docs.listar', (tipo) => docs(tipo));
  handle('docs.obter', (id) => { const d = db().prepare('SELECT * FROM documentos WHERE id=? AND user_id=?').get(id, ctx().u.id); if (!d) throw new Error('Documento não encontrado.'); return { ...d, conteudo: JSON.parse(d.conteudo) }; });
  handle('docs.guardar', (tipo, id, titulo, conteudo, origem) => guardarDoc(tipo, id, titulo, conteudo, origem));
  handle('docs.apagar', (id) => { db().prepare('DELETE FROM documentos WHERE id=? AND user_id=?').run(id, ctx().u.id); return true; });

  // ---- Módulo 2: Plano de aula ----
  handle('ficheiros.listar', () => db().prepare('SELECT id,nome,tipo,tamanho,origem,criado_em FROM ficheiros WHERE user_id=? ORDER BY id DESC').all(ctx().u.id));
  handle('ficheiros.carregar', async () => {
    const { u, lim } = ctx();
    const r = await dialog.showOpenDialog(getJanela(), { properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Material', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'txt', 'docx'] }] });
    if (r.canceled) return [];
    const out = []; fs.mkdirSync(pastaDados(), { recursive: true });
    for (const f of r.filePaths) {
      const nome = path.basename(f);
      if (!lim.planoUploads) throw new Error('LIMITE: o carregamento de PDF, foto e modelos é exclusivo do Premium. No plano Grátis use apenas texto.');
      const ext = await extract.extrair(f, nome, { ocrDataPath: ocrDir() });
      const dest = path.join(pastaDados(), `${Date.now()}_${nome}`); fs.copyFileSync(f, dest);
      const id = db().prepare('INSERT INTO ficheiros(user_id,nome,tipo,caminho,tamanho,texto,criado_em) VALUES (?,?,?,?,?,?,?)')
        .run(u.id, nome, ext.tipo, dest, ext.tamanho, ext.texto, Date.now()).lastInsertRowid;
      out.push({ id, nome, tipo: ext.tipo, tamanho: ext.tamanho, caracteres: ext.texto.length });
    }
    return out;
  });
  handle('ficheiros.apagar', (id) => {
    const f = db().prepare('SELECT * FROM ficheiros WHERE id=? AND user_id=?').get(id, ctx().u.id);
    if (f) { try { fs.unlinkSync(f.caminho); } catch {} db().prepare('DELETE FROM ficheiros WHERE id=?').run(id); }
    return true;
  });
  handle('modelos.listar', () => {
    const { u } = ctx();
    const base = [
      { id: 'sys-minedh', nome: 'MINEDH Oficial', sistema: 1, estrutura: { secoes: ['Dados da Aula', 'Objectivos', 'Conteúdo', 'Metodologia', 'Material', 'Avaliação', 'TPC'] } },
    ];
    return base.concat(db().prepare('SELECT id,nome,estrutura,sistema FROM modelos_plano WHERE user_id=?').all(u.id).map((m) => ({ ...m, estrutura: JSON.parse(m.estrutura) })));
  });
  handle('modelos.guardar', (nome, texto) => {
    const { u, lim } = ctx();
    const n = db().prepare('SELECT COUNT(*) n FROM modelos_plano WHERE user_id=?').get(u.id).n;
    if (n >= lim.planoModelos - 1) throw new Error(`LIMITE: pode guardar até ${lim.planoModelos} modelos no seu plano (o modelo do sistema não conta).`);
    const secoes = String(texto).split(/\r?\n/).map((l) => l.replace(/^[\s\d.\-–•)]+/, '').trim()).filter((l) => l.length > 2 && l.length < 60);
    return db().prepare('INSERT INTO modelos_plano(user_id,nome,estrutura,texto_origem) VALUES (?,?,?,?)').run(u.id, nome, JSON.stringify({ secoes }), texto).lastInsertRowid;
  });
  handle('plano.gerar', async (d) => {
    const { u, lim } = ctx();
    gastar(u, lim, 'plano', 'planosMes', 'atingiu o limite de planos de aula');
    let textoBase = d.texto || '';
    for (const id of d.ficheiros || []) {
      const f = db().prepare('SELECT texto FROM ficheiros WHERE id=? AND user_id=?').get(id, u.id);
      if (f?.texto) textoBase += '\n' + f.texto;
    }
    if (!d.tema) throw new Error('Indique o tema da aula.');
    return ai.gerarPlano({ ...d, textoBase, temFicheiros: (d.ficheiros || []).length > 0 });
  });
  handle('plano.exportar', async (id) => {
    const { u, marca } = ctx();
    const d = db().prepare('SELECT * FROM documentos WHERE id=? AND user_id=? AND tipo=?').get(id, u.id, 'plano');
    if (!d) throw new Error('Plano não encontrado.');
    const dest = await escolherDestino(getJanela(), `${limpaNome(d.titulo)}.pdf`, 'pdf'); if (!dest) return null;
    await ex.pdfPlano(dest, JSON.parse(d.conteudo), { marca, escola: u.escola, professor: u.nome, timbre: !marca });
    return dest;
  });

  // ---- Módulo 3: Apresentação ----
  handle('apresentacao.gerar', (planoId) => {
    const { u, lim } = ctx();
    const d = db().prepare('SELECT * FROM documentos WHERE id=? AND user_id=? AND tipo=?').get(planoId, u.id, 'plano');
    if (!d) throw new Error('Escolha um plano de aula.');
    gastar(u, lim, 'apresentacao', 'apresentacoesMes', 'atingiu o limite de apresentações');
    const slides = ai.planoParaSlides(JSON.parse(d.conteudo));
    return { titulo: JSON.parse(d.conteudo).tema, slides, origem: planoId };
  });
  handle('apresentacao.exportar', async (slides, formato, titulo) => {
    const { u, marca } = ctx();
    const dest = await escolherDestino(getJanela(), `${limpaNome(titulo)}.${formato}`, formato); if (!dest) return null;
    if (formato === 'pptx') await ex.pptx(dest, slides, { marca });
    else await ex.pdfPlano(dest, { titulo, objetivos: [], conteudo: slides.flatMap((s) => [s.titulo, ...(s.topicos || [])]), metodologia: [], material: [], avaliacao: [], tpc: [] }, { marca, escola: u.escola, professor: u.nome });
    return dest;
  });

  // ---- Módulo 4: Fichas ----
  handle('ficha.deplano', (planoId) => {
    const { u } = ctx();
    const d = db().prepare('SELECT * FROM documentos WHERE id=? AND user_id=? AND tipo=?').get(planoId, u.id, 'plano');
    if (!d) throw new Error('Plano não encontrado.');
    const p = JSON.parse(d.conteudo);
    return { titulo: `Teste de ${p.disciplina || ''} — ${p.tema}`, cabecalho: { escola: u.escola, professor: u.nome, disciplina: p.disciplina, ano: p.turma, data: '', duracao: '40 min' },
      questoes: ai.planoParaFicha(p), incluirGabarito: true, incluirCabecalho: true, espacoNome: true };
  });
  handle('ficha.guardarSistema', (ficha, id) => guardarDoc('ficha', id, ficha.titulo || 'Ficha', ficha));
  handle('ficha.exportar', async (ficha, formato) => {
    const { u, lim, marca } = ctx();
    if (formato === 'docx' && !lim.fichaDocx) throw new Error('LIMITE: a exportação DOCX (Word) é exclusiva do Premium.');
    gastar(u, lim, 'ficha', 'fichasMes', 'atingiu o limite de fichas');
    const dest = await escolherDestino(getJanela(), `${limpaNome(ficha.titulo)}.${formato}`, formato); if (!dest) return null;
    const o = { marca, escola: ficha.cabecalho?.escola || u.escola };
    if (formato === 'docx') await ex.docxFicha(dest, ficha, o); else await ex.pdfFicha(dest, ficha, o);
    // alimenta o banco de questões do utilizador
    if (lim.bancoQuestoes) guardarDoc('rascunho', null, `banco:${ficha.titulo}`, { banco: ficha.questoes });
    return dest;
  });
  handle('banco.listar', () => {
    const { lim, u } = ctx();
    if (!lim.bancoQuestoes) throw new Error('LIMITE: o banco de questões é exclusivo do Premium.');
    return db().prepare("SELECT conteudo FROM documentos WHERE user_id=? AND tipo='rascunho' AND titulo LIKE 'banco:%'").all(u.id)
      .flatMap((r) => JSON.parse(r.conteudo).banco || []);
  });

  // ---- Módulo 5: Biblioteca ----
  const FONTES = [
    { nome: 'Biblioteca Nacional de Moçambique', url: 'https://www.bnm.gov.mz', licenca: 'Acervo público' },
    { nome: 'OpenStax', url: 'https://openstax.org/subjects', licenca: 'Creative Commons' },
    { nome: 'UNESCO — Recursos educativos abertos', url: 'https://www.unesco.org/en/open-educational-resources', licenca: 'Recursos abertos' },
    { nome: 'Khan Academy', url: 'https://pt.khanacademy.org', licenca: 'Creative Commons' },
    { nome: 'Domínio Público', url: 'http://www.dominiopublico.gov.br', licenca: 'Domínio público' },
  ];
  handle('biblioteca.fontes', () => FONTES);
  handle('biblioteca.abrir', (url) => { if (!/^https:\/\//.test(url)) throw new Error('Endereço inválido.'); return shell.openExternal(url); });
  handle('biblioteca.listar', (f = {}) => {
    ctx();
    let sql = 'SELECT * FROM biblioteca WHERE 1=1'; const a = [];
    if (f.q) { sql += ' AND (titulo LIKE ? OR autor LIKE ?)'; a.push(`%${f.q}%`, `%${f.q}%`); }
    if (f.tipo && f.tipo !== 'Todos') { sql += ' AND tipo=?'; a.push(f.tipo); }
    if (f.categoria) { sql += ' AND categoria=?'; a.push(f.categoria); }
    const itens = db().prepare(sql + ' ORDER BY id DESC').all(...a);
    const categorias = db().prepare('SELECT categoria, COUNT(*) n FROM biblioteca GROUP BY categoria ORDER BY n DESC').all();
    const total = db().prepare('SELECT COUNT(*) n FROM biblioteca').get().n;
    return { itens, categorias, total, downloads: db().prepare('SELECT COUNT(*) n FROM downloads WHERE user_id=?').get(ctx().u.id).n };
  });
  handle('biblioteca.adicionar', async (d) => {
    const { u, lim } = ctx();
    const r = await dialog.showOpenDialog(getJanela(), { properties: ['openFile'], filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled) return null;
    gastar(u, lim, 'download', 'downloadsMes', 'atingiu o limite de downloads');
    const ext = await extract.extrair(r.filePaths[0], path.basename(r.filePaths[0]));
    fs.mkdirSync(pastaDados(), { recursive: true });
    const dest = path.join(pastaDados(), `${Date.now()}_${path.basename(r.filePaths[0])}`); fs.copyFileSync(r.filePaths[0], dest);
    const bid = db().prepare('INSERT INTO biblioteca(titulo,autor,ano,tipo,categoria,licenca,caminho) VALUES (?,?,?,?,?,?,?)')
      .run(d.titulo || path.basename(r.filePaths[0], '.pdf'), d.autor || '', Number(d.ano) || null, d.tipo || 'PDF', d.categoria || 'Geral', d.licenca || 'Domínio público', dest).lastInsertRowid;
    db().prepare('INSERT INTO downloads(user_id,biblioteca_id,criado_em) VALUES (?,?,?)').run(u.id, bid, Date.now());
    // disponível automaticamente nos módulos 2 e 4
    db().prepare('INSERT INTO ficheiros(user_id,nome,tipo,caminho,tamanho,texto,origem,criado_em) VALUES (?,?,?,?,?,?,?,?)')
      .run(u.id, path.basename(r.filePaths[0]), 'pdf', dest, ext.tamanho, ext.texto, 'biblioteca', Date.now());
    return bid;
  });
  handle('biblioteca.ler', (id) => {
    const b = db().prepare('SELECT caminho FROM biblioteca WHERE id=?').get(id);
    if (!b?.caminho) throw new Error('Ficheiro indisponível.');
    return shell.openPath(b.caminho);
  });
  handle('biblioteca.resumir', (id) => {
    const { u } = ctx();
    const b = db().prepare('SELECT titulo,caminho FROM biblioteca WHERE id=?').get(id);
    const f = db().prepare('SELECT texto FROM ficheiros WHERE user_id=? AND caminho=?').get(u.id, b?.caminho);
    const fr = ai.frases(f?.texto || '');
    if (!fr.length) throw new Error('Sem texto extraído para resumir.');
    const passo = Math.max(1, Math.floor(fr.length / 6));
    return { titulo: b.titulo, resumo: fr.filter((_, i) => i % passo === 0).slice(0, 6) };
  });

  // ---- Módulo 6: Voz ----
  handle('voz.interpretar', (texto) => ai.interpretarVoz(texto));
  handle('voz.registarUso', () => { const { u, lim } = ctx(); gastar(u, lim, 'voz', 'vozUsosMes', 'atingiu o limite de usos de voz'); return { maxSeg: inf(lim.vozMaxSeg) }; });

  // ---- Módulo 7: Dashboard do Director (plano Escola) ----
  function dadosEscola(u) {
    const profs = db().prepare("SELECT id,nome FROM users WHERE escola=? AND papel!='admin'").all(u.escola || '__nenhuma__');
    const ids = profs.length ? profs.map((p) => p.id) : [u.id];
    const turmas = db().prepare(`SELECT * FROM turmas WHERE user_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
    const linhas = [], porTurma = [];
    for (const t of turmas) {
      const c = carregarCaderneta(t.id, t.user_id);
      const com = c.linhas.filter((l) => l.final !== null);
      porTurma.push({ turma: `${t.nome} (${t.disciplina})`, media: com.length ? calc.round1(com.reduce((a, l) => a + l.final, 0) / com.length) : 0 });
      linhas.push(...c.linhas.map((l) => ({ ...l, turma: t.nome })));
    }
    const com = linhas.filter((l) => l.final !== null);
    const alto = com.filter((l) => l.final >= 14).length, baixo = com.filter((l) => l.final < 10).length;
    const medio = com.length - alto - baixo;
    const aprov = com.length ? Math.round((com.filter((l) => l.final >= 10).length / com.length) * 100) : 0;
    return { professores: profs.length || 1, alunos: linhas.length, aprovacao: aprov,
      media: com.length ? calc.round1(com.reduce((a, l) => a + l.final, 0) / com.length) : 0,
      porTurma, distribuicao: { alto, medio, baixo }, risco: linhas.filter((l) => l.final !== null && l.final < 8).map((l) => ({ nome: l.nome, turma: l.turma, final: l.final })), linhas };
  }
  handle('director.dados', () => {
    const { u, lim } = ctx();
    if (!lim.dashboardDirector) throw new Error('LIMITE: o Dashboard do Director está disponível apenas no plano Escola.');
    const { linhas, ...r } = dadosEscola(u); return r;
  });
  handle('director.exportar', async (tipo, formato) => {
    const { u, lim, marca } = ctx();
    if (!lim.dashboardDirector) throw new Error('LIMITE: exclusivo do plano Escola.');
    const d = dadosEscola(u);
    const dest = await escolherDestino(getJanela(), `Relatorio_${tipo}_${dbm.mesActual()}.${formato}`, formato); if (!dest) return null;
    const cab = ['Turma', 'Nº', 'Estudante', 'Classificação', 'Resultado'];
    const rows = d.linhas.map((l) => [l.turma, l.numero, l.nome, l.final ?? '', l.resultado]);
    if (formato === 'csv') fs.writeFileSync(dest, ex.csv([cab, ...rows]));
    else await ex.pdfPlano(dest, { titulo: `Relatório ${tipo} — ${u.escola || ''}`, objetivos: [], conteudo: [
      `Taxa de aprovação: ${d.aprovacao}%`, `Média geral: ${d.media}/20`, `Alunos: ${d.alunos}   Professores: ${d.professores}`,
      ...d.porTurma.map((t) => `${t.turma}: média ${t.media}`), `Alunos em risco (<8): ${d.risco.length}`], metodologia: [], material: [], avaliacao: [], tpc: [] },
      { marca, escola: u.escola, professor: u.nome, timbre: true });
    return dest;
  });

  // ---- Módulo 8: Central offline ----
  const tamDir = (d) => { let t = 0, n = 0; try { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { const r = tamDir(p); t += r.t; n += r.n; } else { t += fs.statSync(p).size; n++; } } } catch {} return { t, n }; };
  handle('offline.estado', () => {
    const { u, lim } = ctx();
    const pend = db().prepare('SELECT COUNT(*) n FROM sync_fila WHERE sincronizado=0').get().n;
    const tot = db().prepare('SELECT COUNT(*) n FROM sync_fila').get().n;
    const ficheiros = tamDir(pastaDados());
    const dbSize = fs.existsSync(path.join(app.getPath('userData'), 'aulapro.db')) ? fs.statSync(path.join(app.getPath('userData'), 'aulapro.db')).size : 0;
    const rasc = db().prepare("SELECT COUNT(*) n FROM documentos WHERE user_id=? AND tipo='rascunho'").get(u.id).n;
    return { pendentes: pend, progresso: tot ? Math.round(((tot - pend) / tot) * 100) : 100, ultimaSync: dbm.getConfig('ultima_sync'),
      usado: ficheiros.t + dbSize, limite: lim.offlineBytes, ficheiros: ficheiros.n, ficheirosBytes: ficheiros.t, baseBytes: dbSize, rascunhos: rascunhos(rasc), backupNuvem: lim.backupNuvem, syncUrl: !!dbm.getConfig('sync_url') };
  });
  const rascunhos = (n) => n;
  handle('offline.sincronizar', async () => {
    const { u, lim } = ctx();
    if (!lim.backupNuvem) throw new Error('LIMITE: o backup na nuvem é exclusivo do Premium.');
    const url = dbm.getConfig('sync_url');
    if (!url) throw new Error('O servidor de sincronização ainda não está configurado (Definições do administrador).');
    const pend = db().prepare('SELECT * FROM sync_fila WHERE sincronizado=0').all();
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ utilizador: u.email, alteracoes: pend }), signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`O servidor respondeu ${r.status}.`);
    db().prepare('UPDATE sync_fila SET sincronizado=1 WHERE sincronizado=0').run();
    dbm.setConfig('ultima_sync', new Date().toISOString());
    return pend.length;
  });
  handle('offline.backup', async () => {
    const { u } = ctx();
    const dest = await escolherDestino(getJanela(), `AulaPro_backup_${new Date().toISOString().slice(0, 10)}.json`, 'json'); if (!dest) return null;
    const pega = (t, c = 'user_id') => db().prepare(`SELECT * FROM ${t} WHERE ${c}=?`).all(u.id);
    const turmas = pega('turmas');
    const dump = { versao: 1, exportado: new Date().toISOString(), turmas,
      alunos: turmas.flatMap((t) => db().prepare('SELECT * FROM alunos WHERE turma_id=?').all(t.id)),
      notas: db().prepare('SELECT n.* FROM notas n JOIN alunos a ON a.id=n.aluno_id JOIN turmas t ON t.id=a.turma_id WHERE t.user_id=?').all(u.id),
      documentos: pega('documentos'), modelos: pega('modelos_plano') };
    fs.writeFileSync(dest, JSON.stringify(dump, null, 2));
    return dest;
  });
  handle('offline.exportarTudo', async () => {
    const { u } = ctx();
    const r = await dialog.showOpenDialog(getJanela(), { properties: ['openDirectory', 'createDirectory'], title: 'Escolha a pasta de destino' });
    if (r.canceled) return null;
    const pasta = path.join(r.filePaths[0], 'AulaPro_documentos'); fs.mkdirSync(pasta, { recursive: true });
    let n = 0;
    for (const d of db().prepare("SELECT * FROM documentos WHERE user_id=? AND tipo IN ('plano','apresentacao','ficha')").all(u.id)) {
      fs.writeFileSync(path.join(pasta, `${d.tipo}_${limpaNome(d.titulo)}_${d.id}.json`), d.conteudo); n++;
    }
    return { pasta, n };
  });

  // ---- Mensagens / reclamações do utilizador ----
  handle('suporte.enviarReclamacao', (d) => {
    const { u } = ctx();
    db().prepare('INSERT INTO reclamacoes(user_id,tipo,prioridade,assunto,mensagem,criado_em) VALUES (?,?,?,?,?,?)')
      .run(u.id, d.tipo || 'problema', d.prioridade || 'media', d.assunto || 'Sem assunto', d.mensagem || '', Date.now()); return true;
  });
  handle('chat.listar', () => { const { u } = ctx(); const m = db().prepare('SELECT * FROM mensagens WHERE user_id=? ORDER BY id').all(u.id); db().prepare('UPDATE mensagens SET lida=1 WHERE user_id=? AND de_admin=1').run(u.id); return m; });
  handle('chat.enviar', (texto) => { const { u } = ctx(); if (!String(texto).trim()) throw new Error('Mensagem vazia.'); db().prepare('INSERT INTO mensagens(user_id,de_admin,texto,criado_em) VALUES (?,0,?,?)').run(u.id, String(texto).trim(), Date.now()); return true; });

  // ---- Módulo 9: Painel do desenvolvedor ----
  handle('admin.dashboard', () => {
    auth.exigirAdmin();
    const q = (s, ...a) => db().prepare(s).get(...a).n;
    const semana = Date.now() - 7 * 864e5;
    const receita = db().prepare("SELECT plano, SUM(valor) v FROM pagamentos WHERE estado='verificado' GROUP BY plano").all();
    const acessos = db().prepare("SELECT date(criado_em/1000,'unixepoch') d, COUNT(DISTINCT user_id) n FROM logs WHERE tipo='acesso' AND detalhe='Login' AND criado_em>? GROUP BY d ORDER BY d").all(Date.now() - 14 * 864e5);
    return { totalUsers: q("SELECT COUNT(*) n FROM users WHERE papel!='admin'"), novosSemana: q("SELECT COUNT(*) n FROM users WHERE papel!='admin' AND criado_em>?", semana),
      pendentes: q("SELECT COUNT(*) n FROM pagamentos WHERE estado='pendente'"), reclamacoes: q("SELECT COUNT(*) n FROM reclamacoes WHERE estado='aberta'"),
      reclamacoesAltas: q("SELECT COUNT(*) n FROM reclamacoes WHERE estado='aberta' AND prioridade='alta'"), versao: dbm.getConfig('versao'), receita, acessos };
  });
  handle('admin.users', (f = {}) => {
    auth.exigirAdmin();
    let sql = "SELECT id,nome,email,telefone,escola,cidade,plano,plano_expira,estado,criado_em FROM users WHERE papel!='admin'"; const a = [];
    if (f.plano) { sql += ' AND plano=?'; a.push(f.plano); }
    if (f.escola) { sql += ' AND escola LIKE ?'; a.push(`%${f.escola}%`); }
    if (f.cidade) { sql += ' AND cidade LIKE ?'; a.push(`%${f.cidade}%`); }
    return db().prepare(sql + ' ORDER BY id DESC').all(...a);
  });
  handle('admin.criarUser', (d) => { auth.exigirAdmin(); return auth.registar(d, { semSessao: true }).id; });
  handle('admin.userAccao', (id, accao, extra) => {
    const adm = auth.exigirAdmin();
    const u = db().prepare("SELECT * FROM users WHERE id=? AND papel!='admin'").get(id); if (!u) throw new Error('Utilizador não encontrado.');
    if (accao === 'bloquear') db().prepare("UPDATE users SET estado=CASE estado WHEN 'bloqueado' THEN 'activo' ELSE 'bloqueado' END WHERE id=?").run(id);
    else if (accao === 'resetar') { const bcrypt = require('bcryptjs'); const nova = 'Aula#' + Math.floor(1000 + Math.random() * 9000); db().prepare('UPDATE users SET senha_hash=?, tentativas=0, bloqueado_ate=NULL WHERE id=?').run(bcrypt.hashSync(nova, 10), id); dbm.log(adm.id, 'admin', `Reset de senha de ${u.email}`); return { novaSenha: nova }; }
    else if (accao === 'apagar') db().prepare('DELETE FROM users WHERE id=?').run(id);
    else if (accao === 'plano') { if (extra === 'gratis') db().prepare("UPDATE users SET plano='gratis', plano_expira=NULL WHERE id=?").run(id); else activarPlano(id, extra); }
    dbm.log(adm.id, 'admin', `${accao} em ${u.email}`);
    return true;
  });
  handle('admin.historicoPagamentos', (id) => { auth.exigirAdmin(); return db().prepare('SELECT * FROM pagamentos WHERE user_id=? ORDER BY id DESC').all(id); });
  handle('admin.fila', () => { auth.exigirAdmin(); return db().prepare(`SELECT p.*, u.nome, u.email FROM pagamentos p JOIN users u ON u.id=p.user_id WHERE p.estado='pendente' ORDER BY p.id`).all(); });
  handle('admin.comprovativo', (id) => {
    auth.exigirAdmin();
    const p = db().prepare('SELECT comprovativo FROM pagamentos WHERE id=?').get(id);
    if (!p?.comprovativo || !fs.existsSync(p.comprovativo)) throw new Error('Sem comprovativo.');
    return 'data:image/' + (path.extname(p.comprovativo).slice(1) || 'png').replace('jpg', 'jpeg') + ';base64,' + fs.readFileSync(p.comprovativo).toString('base64');
  });
  handle('admin.verificar', (id, aprovar, motivo) => verificarPagamento(id, aprovar, motivo, 'admin'));
  handle('admin.config.obter', () => {
    auth.exigirAdmin();
    return Object.fromEntries(['nome_confirmacao', 'mpesa_numero', 'emola_numero', 'conta_bancaria', 'exigir_confirmacao_acima', 'auto_verificar_horas', 'sync_url', 'ia_url', 'ia_modelo', 'versao', 'changelog'].map((k) => [k, dbm.getConfig(k)]));
  });
  handle('admin.config.guardar', (d) => {
    const a = auth.exigirAdmin();
    const permitidos = ['nome_confirmacao', 'mpesa_numero', 'emola_numero', 'conta_bancaria', 'exigir_confirmacao_acima', 'auto_verificar_horas', 'sync_url', 'ia_url', 'ia_chave', 'ia_modelo'];
    for (const k of permitidos) if (k in d && !(k === 'ia_chave' && !d[k])) dbm.setConfig(k, d[k]);
    dbm.log(a.id, 'admin', 'Configuração de pagamentos/IA actualizada'); return true;
  });
  handle('admin.reclamacoes', (f = {}) => { auth.exigirAdmin(); return db().prepare(`SELECT r.*, u.email FROM reclamacoes r LEFT JOIN users u ON u.id=r.user_id ${f.tipo ? 'WHERE r.tipo=?' : ''} ORDER BY CASE prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, r.id DESC`).all(...(f.tipo ? [f.tipo] : [])); });
  handle('admin.reclamacaoAccao', (id, d) => {
    auth.exigirAdmin();
    if (d.resposta) { const r = db().prepare('SELECT user_id FROM reclamacoes WHERE id=?').get(id); db().prepare('UPDATE reclamacoes SET resposta=? WHERE id=?').run(d.resposta, id); if (r?.user_id) db().prepare('INSERT INTO mensagens(user_id,de_admin,texto,criado_em) VALUES (?,1,?,?)').run(r.user_id, d.resposta, Date.now()); }
    if (d.estado) db().prepare('UPDATE reclamacoes SET estado=? WHERE id=?').run(d.estado, id);
    if (d.prioridade) db().prepare('UPDATE reclamacoes SET prioridade=? WHERE id=?').run(d.prioridade, id);
    return true;
  });
  handle('admin.chats', () => { auth.exigirAdmin(); return db().prepare(`SELECT u.id,u.nome,(SELECT texto FROM mensagens m WHERE m.user_id=u.id ORDER BY id DESC LIMIT 1) ultima,(SELECT criado_em FROM mensagens m WHERE m.user_id=u.id ORDER BY id DESC LIMIT 1) quando FROM users u WHERE EXISTS (SELECT 1 FROM mensagens m WHERE m.user_id=u.id) ORDER BY quando DESC`).all(); });
  handle('admin.chat', (uid) => { auth.exigirAdmin(); return db().prepare('SELECT * FROM mensagens WHERE user_id=? ORDER BY id').all(uid); });
  handle('admin.chatEnviar', (uid, texto) => { auth.exigirAdmin(); db().prepare('INSERT INTO mensagens(user_id,de_admin,texto,criado_em) VALUES (?,1,?,?)').run(uid, texto, Date.now()); return true; });
  handle('admin.update', (versao, changelog) => {
    const a = auth.exigirAdmin();
    dbm.setConfig('versao', versao); dbm.setConfig('changelog', changelog); dbm.log(a.id, 'admin', `Versão ${versao} registada: ${changelog}`);
    return true;
  });
  handle('admin.logs', (tipo) => { auth.exigirAdmin(); return db().prepare(`SELECT l.*, u.email FROM logs l LEFT JOIN users u ON u.id=l.user_id ${tipo ? 'WHERE l.tipo=?' : ''} ORDER BY l.id DESC LIMIT 500`).all(...(tipo ? [tipo] : [])); });
  handle('admin.logsCsv', async () => {
    auth.exigirAdmin();
    const dest = await escolherDestino(getJanela(), `logs_auditoria_${new Date().toISOString().slice(0, 10)}.csv`, 'csv'); if (!dest) return null;
    const l = db().prepare('SELECT l.criado_em,l.tipo,u.email,l.detalhe FROM logs l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.id').all();
    fs.writeFileSync(dest, ex.csv([['Data', 'Tipo', 'Utilizador', 'Detalhe'], ...l.map((r) => [new Date(r.criado_em).toISOString(), r.tipo, r.email || '', r.detalhe])]));
    return dest;
  });

  // Aviso de novas versões (para todos os utilizadores)
  handle('app.versao', () => ({ actual: app.getVersion(), publicada: dbm.getConfig('versao'), changelog: dbm.getConfig('changelog') }));
}

// ---------- Verificação de pagamentos ----------
function verificarPagamento(id, aprovar, motivo, quem) {
  const p = db().prepare('SELECT * FROM pagamentos WHERE id=?').get(id);
  if (!p || p.estado !== 'pendente') throw new Error('Pagamento já tratado ou inexistente.');
  if (aprovar) {
    activarPlano(p.user_id, p.plano);
    db().prepare("UPDATE pagamentos SET estado='verificado', verificado_por=? WHERE id=?").run(quem, id);
    db().prepare('INSERT INTO mensagens(user_id,de_admin,texto,criado_em) VALUES (?,1,?,?)').run(p.user_id, quem === 'auto' ? 'Premium liberado automaticamente. Obrigado!' : 'Pagamento verificado. O seu Premium está activo!', Date.now());
  } else {
    const m = motivo || 'Comprovativo inválido, envie novamente.';
    db().prepare("UPDATE pagamentos SET estado='rejeitado', motivo=?, verificado_por=? WHERE id=?").run(m, quem, id);
    db().prepare('INSERT INTO mensagens(user_id,de_admin,texto,criado_em) VALUES (?,1,?,?)').run(p.user_id, m, Date.now());
  }
  dbm.log(null, 'pagamento', `${aprovar ? 'Verificado' : 'Rejeitado'} (${quem}) pagamento ${p.transaction_id}`);
  return true;
}

// Regra automática das 2 horas (Documento Mestre 11.4): só liberta se TUDO bater; senão mantém pendente.
function verificacaoAutomatica() {
  const horas = Number(dbm.getConfig('auto_verificar_horas')) || 2;
  const limite = Date.now() - horas * 3600e3;
  const nomeOk = (dbm.getConfig('nome_confirmacao') || '').trim().toLowerCase();
  const numeros = [dbm.getConfig('mpesa_numero'), dbm.getConfig('emola_numero')].filter(Boolean).map((s) => s.replace(/\D/g, '').slice(-4));
  const lib = [];
  for (const p of db().prepare("SELECT * FROM pagamentos WHERE estado='pendente' AND criado_em<=?").all(limite)) {
    const plano = PLANOS[p.plano];
    const okNumero = numeros.length && numeros.includes(String(p.numero_destino || '').replace(/\D/g, '').slice(-4));
    const okNome = nomeOk && String(p.nome_confirmacao || '').trim().toLowerCase() === nomeOk;
    const okValor = plano && Number(p.valor) === plano.preco;
    const okData = p.data_pagamento && p.data_pagamento >= p.criado_em - 24 * 3600e3 && p.data_pagamento <= p.criado_em + 3600e3;
    if (okNumero && okNome && okValor && okData) { verificarPagamento(p.id, true, null, 'auto'); lib.push(p.id); }
    else dbm.log(null, 'pagamento', `Auto-verificação falhou para ${p.transaction_id}: mantém pendente (alerta ao admin)`);
  }
  return lib;
}

module.exports = { registarHandlers, verificacaoAutomatica, verificarPagamento };
