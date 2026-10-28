'use strict';
const { spawnSync } = require('child_process'), path = require('path');
const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, 'db.test.js')], { env: { ...process.env, AULAPRO_MOBILE: '1' }, stdio: 'inherit' });
if (r.status) process.exit(r.status);
const assert = require('assert');
const { chamar } = require('./mobile-harness');
const fs = require('../src/mobile/fs-shim');
(async () => {
  const entregues = []; fs.ganchos.aoExportar = (nome, b) => entregues.push([nome, b.length]);
  await chamar('auth.registar', { nome: 'Mob', email: 'm@m.mz', senha: 'Abc#123', escola: 'EPC' });
  const t = await chamar('turmas.criar', { nome: '9ª A', disciplina: 'Química' });
  await chamar('alunos.adicionar', t, ['Aluno Um', 'Aluno Dois']);
  assert.ok(String(await chamar('caderneta.exportar', t, 'csv')).startsWith('/export/'));
  assert.strictEqual(entregues[0][0], 'Caderneta_Química_9ª A.csv'.replace(/[ª]/g, 'ª'));
  assert.ok(entregues[0][1] > 20);
  const p = await chamar('plano.gerar', { tema: 'Átomos', disciplina: 'Química', turma: '9', texto: 'O átomo é a menor unidade de um elemento químico. Os átomos têm protões, neutrões e electrões.' });
  const pid = await chamar('docs.guardar', 'plano', null, p.titulo, p);
  const ap = await chamar('apresentacao.gerar', pid);
  try { require('pptxgenjs'); } catch { console.log('pptxgenjs ausente: exportação PPTX não testada'); return console.log('mobile.test.js OK (parcial)'); }
  await chamar('apresentacao.exportar', ap.slides, 'pptx', 'Átomos');
  const x = entregues.find((e) => e[0] === 'Átomos.pptx'); assert.ok(x && x[1] > 10000, 'PPTX entregue');
  // ficheiros de texto carregados (Premium) e leitura de DOCX/TXT no Android
  const ex = require('../src/mobile/extract-mobile');
  fs.writeFileSync('/incoming/a.txt', 'Texto simples de teste.');
  assert.strictEqual((await ex.extrair('/incoming/a.txt', 'a.txt')).texto, 'Texto simples de teste.');
  await assert.rejects(() => ex.extrair('/incoming/a.txt', 'x.pdf'), /ainda não são suportados|não existe|ENOENT/);
  console.log('mobile.test.js OK');
})().catch((e) => { console.error('FALHOU', e); process.exit(1); });
