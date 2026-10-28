'use strict';
const path = require('path');
const fs = require('fs');
let Database;
try { Database = require('better-sqlite3'); }
catch (e) { if (process.env.AULAPRO_TESTE) Database = require('node:sqlite').DatabaseSync; else throw e; } // fallback só para testes automáticos

let db;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  telefone TEXT,
  escola TEXT,
  cidade TEXT,
  disciplina_principal TEXT,
  papel TEXT NOT NULL DEFAULT 'professor',      -- professor | director | admin
  senha_hash TEXT NOT NULL,
  plano TEXT NOT NULL DEFAULT 'gratis',
  plano_expira INTEGER,
  estado TEXT NOT NULL DEFAULT 'activo',         -- activo | bloqueado
  tentativas INTEGER NOT NULL DEFAULT 0,
  bloqueado_ate INTEGER,
  criado_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS turmas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  disciplina TEXT NOT NULL,
  classe TEXT,
  ano_lectivo INTEGER NOT NULL,
  regra TEXT NOT NULL DEFAULT 'A',
  tem_exame INTEGER NOT NULL DEFAULT 0,
  opcao_exame INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS alunos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  turma_id INTEGER NOT NULL REFERENCES turmas(id) ON DELETE CASCADE,
  numero INTEGER,
  nome TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notas (
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  trimestre INTEGER NOT NULL,                    -- 1..3 ; 0 = exame
  acs1 REAL, acs2 REAL, acs3 REAL, at REAL, exame REAL,
  PRIMARY KEY (aluno_id, trimestre)
);

CREATE TABLE IF NOT EXISTS presencas (
  aluno_id INTEGER NOT NULL REFERENCES alunos(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  presente INTEGER NOT NULL,
  PRIMARY KEY (aluno_id, data)
);

CREATE TABLE IF NOT EXISTS documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,                            -- plano | apresentacao | ficha | rascunho
  titulo TEXT NOT NULL,
  conteudo TEXT NOT NULL,                        -- JSON
  origem_id INTEGER,
  criado_em INTEGER NOT NULL,
  actualizado_em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doc_user ON documentos(user_id, tipo);

CREATE TABLE IF NOT EXISTS modelos_plano (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  estrutura TEXT NOT NULL,                       -- JSON {secoes:[...]}
  texto_origem TEXT,
  sistema INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ficheiros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL,                            -- pdf | imagem | docx | txt
  caminho TEXT NOT NULL,
  tamanho INTEGER NOT NULL,
  texto TEXT,                                    -- texto extraído (parser/OCR)
  origem TEXT NOT NULL DEFAULT 'upload',         -- upload | biblioteca
  criado_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS biblioteca (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  autor TEXT,
  ano INTEGER,
  paginas INTEGER,
  tipo TEXT NOT NULL,                            -- PDF | Livro | Artigo
  categoria TEXT NOT NULL,
  licenca TEXT NOT NULL DEFAULT 'Domínio público',
  url TEXT,
  caminho TEXT
);

CREATE TABLE IF NOT EXISTS downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  biblioteca_id INTEGER NOT NULL,
  criado_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS uso (
  user_id INTEGER NOT NULL,
  recurso TEXT NOT NULL,                         -- plano | apresentacao | ficha | download | voz
  mes TEXT NOT NULL,                             -- AAAA-MM
  total INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, recurso, mes)
);

CREATE TABLE IF NOT EXISTS pagamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plano TEXT NOT NULL,
  valor REAL NOT NULL,
  metodo TEXT NOT NULL,                          -- M-Pesa | E-Mola | Mkesh | PayPal | Transferência
  numero_destino TEXT,
  nome_confirmacao TEXT,
  data_pagamento INTEGER,
  comprovativo TEXT,                             -- caminho da imagem
  estado TEXT NOT NULL DEFAULT 'pendente',       -- pendente | verificado | rejeitado
  verificado_por TEXT,                           -- admin | auto
  motivo TEXT,
  criado_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT
);

CREATE TABLE IF NOT EXISTS reclamacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL,                            -- problema | sugestao | facturacao
  prioridade TEXT NOT NULL DEFAULT 'media',
  assunto TEXT NOT NULL,
  mensagem TEXT,
  estado TEXT NOT NULL DEFAULT 'aberta',
  resposta TEXT,
  criado_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mensagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  de_admin INTEGER NOT NULL,
  texto TEXT NOT NULL,
  lida INTEGER NOT NULL DEFAULT 0,
  criado_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  tipo TEXT NOT NULL,                            -- acesso | pagamento | erro | admin
  detalhe TEXT,
  criado_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_fila (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entidade TEXT NOT NULL,
  entidade_id INTEGER,
  accao TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  sincronizado INTEGER NOT NULL DEFAULT 0
);
`;

const CONFIG_INICIAL = {
  nome_confirmacao: 'AULAPRO-PAYMENTS-OFFICIAL',
  mpesa_numero: '',
  emola_numero: '',
  conta_bancaria: '',
  exigir_confirmacao_acima: '500',
  auto_verificar_horas: '2',
  versao: '1.0.0',
  changelog: '',
  sync_url: '',
  ia_url: '',
  ia_chave: '',
  ia_modelo: '',
  ultima_sync: '',
};

function init(userDataDir) {
  fs.mkdirSync(userDataDir, { recursive: true });
  db = new Database(path.join(userDataDir, 'aulapro.db'));
  db.exec(SCHEMA);
  const ins = db.prepare('INSERT OR IGNORE INTO config(chave, valor) VALUES (?, ?)');
  for (const [k, v] of Object.entries(CONFIG_INICIAL)) ins.run(k, v);
  return db;
}

const get = () => db;
const mesActual = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

function getConfig(chave) {
  const r = db.prepare('SELECT valor FROM config WHERE chave = ?').get(chave);
  return r ? r.valor : null;
}
function setConfig(chave, valor) {
  db.prepare('INSERT INTO config(chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor')
    .run(chave, String(valor ?? ''));
}
function log(userId, tipo, detalhe) {
  db.prepare('INSERT INTO logs(user_id, tipo, detalhe, criado_em) VALUES (?,?,?,?)').run(userId ?? null, tipo, detalhe ?? '', Date.now());
}
function usoActual(userId, recurso) {
  const r = db.prepare('SELECT total FROM uso WHERE user_id=? AND recurso=? AND mes=?').get(userId, recurso, mesActual());
  return r ? r.total : 0;
}
function registarUso(userId, recurso) {
  db.prepare(`INSERT INTO uso(user_id, recurso, mes, total) VALUES (?,?,?,1)
    ON CONFLICT(user_id, recurso, mes) DO UPDATE SET total = total + 1`).run(userId, recurso, mesActual());
}
function enfileirar(entidade, id, accao) {
  db.prepare('INSERT INTO sync_fila(entidade, entidade_id, accao, criado_em) VALUES (?,?,?,?)').run(entidade, id ?? null, accao, Date.now());
}

module.exports = { init, get, getConfig, setConfig, log, usoActual, registarUso, enfileirar, mesActual };
