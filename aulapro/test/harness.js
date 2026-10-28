'use strict';
// Ambiente de TESTE (não faz parte do instalador): corre o código real do processo principal
// (ipc.js, db.js, auth.js, calc.js, ai.js) com SQLite via node:sqlite e serve a interface num
// browser para capturas de ecrã e testes. Substitui apenas 'electron' e 'bcryptjs' (scrypt).
process.env.AULAPRO_TESTE = '1';
const Module = require('module'), http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const handlers = {};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aulapro-'));
const stubs = {
  electron: {
    ipcMain: { handle: (c, f) => { handlers[c] = f; } },
    dialog: { showSaveDialog: async () => ({ canceled: true }), showOpenDialog: async () => ({ canceled: true }) },
    shell: { openExternal: async () => {}, openPath: async () => '' },
    app: { getPath: () => tmp, getVersion: () => '1.0.0' }, BrowserWindow: class {},
  },
  bcryptjs: {
    hashSync: (s) => { const salt = crypto.randomBytes(8).toString('hex'); return salt + ':' + crypto.scryptSync(s, salt, 32).toString('hex'); },
    compareSync: (s, h) => { const [salt, k] = h.split(':'); return crypto.scryptSync(s, salt, 32).toString('hex') === k; },
  },
};
const orig = Module._load;
Module._load = function (req, ...r) { return stubs[req] || orig.call(this, req, ...r); };

const dbm = require('../src/main/db');
dbm.init(tmp);
const ipc = require('../src/main/ipc');
ipc.registarHandlers(() => null);
const chamar = async (canal, ...a) => { const r = await handlers['api:' + canal](null, ...a); if (!r.ok) throw new Error(r.erro); return r.data; };

async function semear() {
  const auth = require('../src/main/auth');
  await chamar('auth.registar', { nome: 'Ana Mucavele', email: 'ana@escola.mz', telefone: '84 123 4567', cidade: 'Maputo', escola: 'Escola Secundária 12 de Outubro', disciplina: 'Matemática', senha: 'Aula#2026' });
  dbm.get().prepare("UPDATE users SET plano='escola', plano_expira=? WHERE email='ana@escola.mz'").run(Date.now() + 30 * 864e5);
  const t = await chamar('turmas.criar', { nome: '10ª Classe - Turma A', disciplina: 'Matemática', ano: 2024 });
  const N = [['Ana Maria Mabunda', [14,16,15,17],[15,14,14,16]], ['Carlos João Chemane', [12,13,11,14],[13,12,14,13]], ['Fátima Issufo', [9,10,11,12],[10,11,9,11]], ['João Paulo Nhantumbo', [16,17,18,18],[15,17,18,19]], ['Sara Lopes Mondlane', [7,8,6,9],[8,7,9,8]]];
  await chamar('alunos.adicionar', t, N.map((n) => n[0]));
  const al = dbm.get().prepare('SELECT id FROM alunos WHERE turma_id=? ORDER BY numero').all(t);
  for (let i = 0; i < N.length; i++) for (const [tr, v] of [[1, N[i][1]], [3, N[i][2]]]) for (const [k, c] of ['acs1', 'acs2', 'acs3', 'at'].entries()) await chamar('notas.gravar', al[i].id, tr, c, v[k]);
  for (let i = 0; i < N.length; i++) for (const [k, c] of ['acs1', 'acs2', 'acs3', 'at'].entries()) await chamar('notas.gravar', al[i].id, 2, c, N[i][1][k] + (i % 2));
  await chamar('turmas.config', t, { regra: 'A', temExame: true, opcaoExame: 1 });
  [16, 13, 11, 18, 9].forEach((e, i) => chamar('notas.gravar', al[i].id, 0, 'exame', e));
  const t2 = await chamar('turmas.criar', { nome: '8ª Classe - Turma B', disciplina: 'Ciências Naturais', ano: 2024 });
  await chamar('alunos.adicionar', t2, ['Aida Machava', 'Bento Sitoe', 'Celeste Cossa']);
  const p = await chamar('plano.gerar', { disciplina: 'Ciências Naturais', turma: '8ª Classe', tema: 'Fotossíntese: como as plantas produzem energia', duracao: 50, competencia: '', instrucao: 'organiza em 3 partes com exemplo de machamba e 3 perguntas no fim',
    texto: 'A fotossíntese é o processo pelo qual as plantas produzem a sua própria energia. As plantas absorvem luz solar, água e dióxido de carbono para formar glicose e libertar oxigénio. A clorofila presente nas folhas capta a luz do sol durante o dia. Numa machamba de milho, as folhas verdes fazem fotossíntese para o milho crescer.' });
  const pid = await chamar('docs.guardar', 'plano', null, p.titulo, p);
  await chamar('docs.guardar', 'apresentacao', null, 'Fotossíntese', { titulo: 'Fotossíntese', slides: (await chamar('apresentacao.gerar', pid)).slides, origem: pid });
  await chamar('docs.guardar', 'ficha', null, 'Teste de Matemática — 10ª Classe', (await chamar('ficha.deplano', pid)));
  // utilizadores e pagamentos para o painel do desenvolvedor
  const outros = [['Pedro Gomes', 'pedro.g@email.com', 'Beira'], ['Luís Pereira', 'luis.p@email.com', 'Dondo'], ['Sofia Machel', 'sofia.m@email.com', 'Nampula']];
  const db = dbm.get();
  for (const [n, e, c] of outros) { auth.sair(); await chamar('auth.registar', { nome: n, email: e, cidade: c, escola: 'EPC ' + c, senha: 'Aula#2026' }); }
  const uid = (e) => db.prepare('SELECT id FROM users WHERE email=?').get(e).id;
  dbm.setConfig('mpesa_numero', '84 000 8721'); dbm.setConfig('emola_numero', '86 000 3421');
  db.prepare("INSERT INTO pagamentos(transaction_id,user_id,plano,valor,metodo,numero_destino,nome_confirmacao,data_pagamento,estado,criado_em) VALUES ('TXN-89234',?,'mensal',299,'M-Pesa','84 000 8721','AULAPRO-PAYMENTS-OFFICIAL',?,'pendente',?)").run(uid('pedro.g@email.com'), Date.now() - 3600e3, Date.now() - 3000e3);
  db.prepare("INSERT INTO pagamentos(transaction_id,user_id,plano,valor,metodo,numero_destino,nome_confirmacao,data_pagamento,estado,criado_em) VALUES ('TXN-90011',?,'anual',2999,'E-Mola','86 000 3421','Outro Nome',?,'pendente',?)").run(uid('luis.p@email.com'), Date.now() - 7200e3, Date.now() - 6000e3);
  db.prepare("INSERT INTO pagamentos(transaction_id,user_id,plano,valor,metodo,estado,criado_em) VALUES ('TXN-77100',?,'mensal',299,'M-Pesa','verificado',?)").run(uid('sofia.m@email.com'), Date.now() - 86400e3);
  db.prepare("INSERT INTO reclamacoes(user_id,tipo,prioridade,assunto,mensagem,criado_em) VALUES (?,'problema','alta','Não consigo repor a palavra-passe','O código não chega.',?)").run(uid('luis.p@email.com'), Date.now() - 3600e3);
  db.prepare("INSERT INTO reclamacoes(user_id,tipo,prioridade,assunto,mensagem,criado_em) VALUES (?,'sugestao','media','Modo escuro','Seria útil um modo escuro.',?)").run(uid('sofia.m@email.com'), Date.now() - 5 * 3600e3);
  db.prepare("INSERT INTO mensagens(user_id,de_admin,texto,criado_em) VALUES (?,0,'Olá, paguei mas o Premium não foi libertado.',?)").run(uid('pedro.g@email.com'), Date.now() - 300e3);
  auth.sair();
}

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const R = path.join(__dirname, '..', 'src', 'renderer');
const server = http.createServer(async (rq, rs) => {
  if (rq.method === 'POST' && rq.url === '/rpc') {
    let b = ''; for await (const c of rq) b += c; const { canal, args } = JSON.parse(b);
    const h = handlers['api:' + canal]; const out = h ? await h(null, ...args) : { ok: false, erro: 'canal desconhecido ' + canal };
    rs.setHeader('content-type', 'application/json'); return rs.end(JSON.stringify(out));
  }
  let f = rq.url.split('?')[0]; if (f === '/') f = '/index.html';
  if (f === '/shim.js') { rs.setHeader('content-type', 'text/javascript'); return rs.end(`window.api={plataforma:'linux',aoReceber(){},async invocar(canal,...args){const r=await (await fetch('/rpc',{method:'POST',body:JSON.stringify({canal,args})})).json();if(!r.ok)throw new Error(r.erro);return r.data;}};`); }
  const p = path.join(R, f); if (!p.startsWith(R) || !fs.existsSync(p)) { rs.statusCode = 404; return rs.end('nao encontrado'); }
  let data = fs.readFileSync(p); if (f === '/index.html') data = Buffer.from(data.toString().replace('<script src="core.js">', '<script src="/shim.js"></script><script src="core.js">'));
  rs.setHeader('content-type', mime[path.extname(p)] || 'application/octet-stream'); rs.end(data);
});
module.exports = { chamar, handlers, semear, dbm, server, ipc, tmp };
if (require.main === module) semear().then(() => server.listen(Number(process.env.PORT) || 5177, () => console.log('harness em http://localhost:' + (process.env.PORT || 5177))));
