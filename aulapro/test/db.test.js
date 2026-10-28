'use strict';
// Testes de integração do processo principal (limites, segurança, pagamentos, admin).
const assert = require('assert');
const { chamar, dbm, ipc } = require(process.env.AULAPRO_MOBILE ? './mobile-harness' : './harness');
const auth = require('../src/main/auth');
const falha = async (fn, re) => { try { await fn(); } catch (e) { assert.match(e.message, re); return; } assert.fail('devia falhar: ' + re); };

(async () => {
  // --- registo e palavra-passe ---
  await falha(() => chamar('auth.registar', { nome: 'X', email: 'x@x.mz', senha: 'abc' }), /mínimo 6/);
  await falha(() => chamar('auth.registar', { nome: 'X', email: 'x@x.mz', senha: 'abcdef' }), /símbolo/);
  const u = await chamar('auth.registar', { nome: 'Prof Teste', email: 't@t.mz', senha: 'Abc#123', escola: 'EPC Teste', papel: 'admin' });
  assert.strictEqual(u.papel, 'professor', 'registo público nunca cria admin');
  assert.strictEqual(u.plano_efectivo, 'gratis');
  assert.ok(!('senha_hash' in u));
  // --- limites do plano Grátis ---
  const t = await chamar('turmas.criar', { nome: '7ª A', disciplina: 'Física' });
  await falha(() => chamar('turmas.criar', { nome: '7ª B', disciplina: 'Física' }), /LIMITE.*1 turma/);
  await falha(() => chamar('turmas.config', t, { regra: 'B' }), /LIMITE.*Regra B/);
  await falha(() => chamar('alunos.adicionar', t, Array.from({ length: 36 }, (_, i) => 'Aluno ' + i)), /LIMITE.*35/);
  await chamar('alunos.adicionar', t, Array.from({ length: 35 }, (_, i) => 'Aluno ' + i));
  await falha(() => chamar('alunos.adicionar', t, ['Mais um']), /LIMITE/);
  await falha(() => chamar('notas.gravar', 1, 1, 'acs1', 21), /entre 0 e 20/);
  await falha(() => chamar('caderneta.simular', t, 1, 10), /Premium/);
  await falha(() => chamar('director.dados'), /plano Escola/);
  await falha(() => chamar('ficha.exportar', { titulo: 'x', questoes: [] }, 'docx'), /DOCX/);
  await falha(() => chamar('banco.listar'), /Premium/);
  for (let i = 0; i < 20; i++) await chamar('plano.gerar', { tema: 'T' + i, disciplina: 'F', turma: '7' });
  await falha(() => chamar('plano.gerar', { tema: 'T21', disciplina: 'F', turma: '7' }), /LIMITE.*20/);
  // --- fórmulas via caderneta ---
  const al = dbm.get().prepare('SELECT id FROM alunos WHERE turma_id=? ORDER BY numero').all(t)[0].id;
  for (const [i, c] of ['acs1', 'acs2', 'acs3', 'at'].entries()) for (const tr of [1, 2, 3]) await chamar('notas.gravar', al, tr, c, [14, 16, 15, 17][i]);
  const cad = await chamar('caderneta.obter', t);
  assert.strictEqual(cad.linhas[0].t1, 15.7); assert.strictEqual(cad.linhas[0].anual, 15.7); assert.strictEqual(cad.linhas[0].resultado, 'Aprovado');
  assert.strictEqual(cad.resumo.pendentes, 34);
  // --- bloqueio por tentativas ---
  await chamar('auth.sair');
  for (let i = 0; i < 4; i++) await falha(() => chamar('auth.entrar', 't@t.mz', 'errada'), /incorrectos/);
  await falha(() => chamar('auth.entrar', 't@t.mz', 'errada'), /bloqueada por 15/);
  await falha(() => chamar('auth.entrar', 't@t.mz', 'Abc#123'), /Demasiadas tentativas/);
  dbm.get().prepare('UPDATE users SET bloqueado_ate=NULL WHERE email=?').run('t@t.mz');
  // --- recuperação ---
  const r = await chamar('auth.pedirRecuperacao', 't@t.mz');
  await falha(() => chamar('auth.concluirRecuperacao', 't@t.mz', '000000', 'Nova#123'), /inválido/);
  await chamar('auth.concluirRecuperacao', 't@t.mz', r.codigoLocal, 'Nova#123');
  await chamar('auth.entrar', 't@t.mz', 'Nova#123');
  // --- pagamentos: regra automática das 2 horas ---
  dbm.setConfig('mpesa_numero', '84 000 8721'); dbm.setConfig('nome_confirmacao', 'AULAPRO-PAYMENTS-OFFICIAL');
  const pg = (id, o) => chamar('pagamento.enviar', { plano: 'mensal', metodo: 'M-Pesa', transactionId: id, numeroDestino: '84 000 8721', nomeConfirmacao: 'aulapro-payments-official', valor: 299, dataPagamento: new Date().toISOString(), ...o });
  const a = await pg('TXN-OK'), b = await pg('TXN-NOME', { nomeConfirmacao: 'Outro' }), c = await pg('TXN-VALOR', { valor: 100 }), d = await pg('TXN-NUM', { numeroDestino: '84 999 0000' });
  assert.deepStrictEqual(ipc.verificacaoAutomatica(), [], 'antes de 2h nada é libertado');
  dbm.get().prepare('UPDATE pagamentos SET criado_em=criado_em-?').run(3 * 3600e3);
  dbm.get().prepare('UPDATE pagamentos SET data_pagamento=? ').run(Date.now() - 3 * 3600e3);
  const lib = ipc.verificacaoAutomatica();
  assert.deepStrictEqual(lib, [a.id], 'só o pagamento que bate em tudo é libertado');
  const info = await chamar('planos.info'); assert.strictEqual(info.planoKey, 'mensal');
  assert.ok(info.expira > Date.now() + 29 * 864e5);
  const est = dbm.get().prepare('SELECT id,estado FROM pagamentos ORDER BY id').all().map((x) => x.estado);
  assert.deepStrictEqual(est, ['verificado', 'pendente', 'pendente', 'pendente']);
  assert.strictEqual((await chamar('turmas.criar', { nome: '7ª B', disciplina: 'Física' })) > 0, true, 'Premium: turmas ilimitadas');
  await chamar('turmas.config', t, { regra: 'B', temExame: false, opcaoExame: 1 });
  // --- plano expirado volta a Grátis ---
  dbm.get().prepare("UPDATE users SET plano_expira=? WHERE email='t@t.mz'").run(Date.now() - 1000);
  assert.strictEqual((await chamar('planos.info')).planoKey, 'gratis');
  // --- painel admin ---
  await chamar('auth.sair');
  await falha(() => chamar('admin.dashboard'), /SESSAO_EXPIRADA/);
  const cfg = await chamar('auth.configurarAdmin', { nome: 'Dev', email: 'dev@aula.pro', senha: 'Mestra#2026' });
  await falha(() => chamar('auth.configurarAdmin', { nome: 'Dev2', email: 'd2@aula.pro', senha: 'Mestra#2026' }), /já está configurado/);
  await falha(() => chamar('auth.entrarAdmin', 'dev@aula.pro', 'Mestra#2026', '123456'), /2FA/);
  await chamar('auth.entrarAdmin', 'dev@aula.pro', 'Mestra#2026', auth.totp(cfg.segredo));
  const dash = await chamar('admin.dashboard'); assert.ok(dash.totalUsers >= 1 && dash.pendentes === 3);
  const fila = await chamar('admin.fila'); assert.strictEqual(fila.length, 3);
  await chamar('admin.verificar', fila[0].id, false, 'Comprovativo inválido');
  await chamar('admin.verificar', fila[1].id, true);
  await falha(() => chamar('admin.verificar', fila[1].id, true), /já tratado/);
  const uid = dbm.get().prepare("SELECT id FROM users WHERE email='t@t.mz'").get().id;
  const rs = await chamar('admin.userAccao', uid, 'resetar'); assert.match(rs.novaSenha, /^Aula#\d{4}$/);
  await chamar('admin.userAccao', uid, 'bloquear');
  await chamar('admin.criarUser', { nome: 'Novo', email: 'novo@x.mz', senha: 'Abc#123' });
  assert.ok(await chamar('admin.users', {}), 'sessão admin mantém-se após criar utilizador');
  await chamar('auth.sair'); await falha(() => chamar('auth.entrar', 't@t.mz', rs.novaSenha), /bloqueada/);
  await chamar('auth.registar', { nome: 'Outro', email: 'o@o.mz', senha: 'Abc#123' });
  await falha(() => chamar('admin.users', {}), /Acesso negado/);
  console.log('db.test.js OK');
  process.exit(0);
})().catch((e) => { console.error('FALHOU:', e); process.exit(1); });
