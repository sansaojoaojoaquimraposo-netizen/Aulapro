'use strict';
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const dbm = require('./db');
const { planoEfectivo } = require('./plans');

const SESSAO_MS = 30 * 60 * 1000;          // expira após 30 min de inactividade
const MAX_TENTATIVAS = 5;
const BLOQUEIO_MS = 15 * 60 * 1000;        // bloqueio de 15 min
const RESET_VALIDADE_MS = 15 * 60 * 1000;  // código de recuperação válido 15 min

let sessao = null; // { userId, ultimaActividade, adminOk }
const resets = new Map(); // email -> { codigo, expira }

function validarSenha(senha) {
  if (typeof senha !== 'string' || senha.length < 6) return 'A palavra-passe deve ter no mínimo 6 caracteres.';
  if (!/[^A-Za-z0-9]/.test(senha)) return 'A palavra-passe deve conter pelo menos 1 símbolo (ex.: ! @ # $).';
  return null;
}

function publico(u) {
  if (!u) return null;
  const { senha_hash, tentativas, bloqueado_ate, ...resto } = u;
  return { ...resto, plano_efectivo: planoEfectivo(u) };
}

function registar({ nome, email, telefone, escola, cidade, disciplina, senha, papel }, { semSessao = false } = {}) {
  const db = dbm.get();
  email = String(email || '').trim().toLowerCase();
  if (!nome || !email) throw new Error('Nome e email são obrigatórios.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Email inválido.');
  const erro = validarSenha(senha);
  if (erro) throw new Error(erro);
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) throw new Error('Este email já está registado.');
  const hash = bcrypt.hashSync(senha, 10);
  const papelFinal = papel === 'director' ? 'director' : 'professor'; // 'admin' nunca por registo público
  const r = db.prepare(`INSERT INTO users(nome,email,telefone,escola,cidade,disciplina_principal,papel,senha_hash,criado_em)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(nome.trim(), email, telefone || '', escola || '', cidade || '', disciplina || '', papelFinal, hash, Date.now());
  dbm.log(r.lastInsertRowid, 'acesso', 'Registo de conta');
  if (semSessao) return { id: Number(r.lastInsertRowid) };
  return iniciarSessao(r.lastInsertRowid);
}

function iniciarSessao(userId) {
  sessao = { userId, ultimaActividade: Date.now(), adminOk: false };
  return publico(dbm.get().prepare('SELECT * FROM users WHERE id=?').get(userId));
}

function entrar(email, senha) {
  const db = dbm.get();
  email = String(email || '').trim().toLowerCase();
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!u) throw new Error('Email ou palavra-passe incorrectos.');
  if (u.estado === 'bloqueado') throw new Error('Conta bloqueada. Contacte o suporte.');
  if (u.bloqueado_ate && u.bloqueado_ate > Date.now()) {
    const min = Math.ceil((u.bloqueado_ate - Date.now()) / 60000);
    throw new Error(`Demasiadas tentativas. Tente novamente em ${min} min.`);
  }
  if (!bcrypt.compareSync(String(senha || ''), u.senha_hash)) {
    const t = u.tentativas + 1;
    if (t >= MAX_TENTATIVAS) {
      db.prepare('UPDATE users SET tentativas=0, bloqueado_ate=? WHERE id=?').run(Date.now() + BLOQUEIO_MS, u.id);
      dbm.log(u.id, 'acesso', 'Bloqueio temporário após 5 tentativas');
      throw new Error('Demasiadas tentativas. Conta bloqueada por 15 minutos.');
    }
    db.prepare('UPDATE users SET tentativas=? WHERE id=?').run(t, u.id);
    dbm.log(u.id, 'acesso', 'Palavra-passe errada');
    throw new Error(`Email ou palavra-passe incorrectos. Restam ${MAX_TENTATIVAS - t} tentativa(s).`);
  }
  db.prepare('UPDATE users SET tentativas=0, bloqueado_ate=NULL WHERE id=?').run(u.id);
  dbm.log(u.id, 'acesso', 'Login');
  return iniciarSessao(u.id);
}

function sair() { sessao = null; }

// Valida sessão e renova o prazo de inactividade. Devolve o utilizador completo.
function exigirSessao() {
  if (!sessao) throw new Error('SESSAO_EXPIRADA');
  if (Date.now() - sessao.ultimaActividade > SESSAO_MS) { sessao = null; throw new Error('SESSAO_EXPIRADA'); }
  sessao.ultimaActividade = Date.now();
  const u = dbm.get().prepare('SELECT * FROM users WHERE id=?').get(sessao.userId);
  if (!u || u.estado === 'bloqueado') { sessao = null; throw new Error('SESSAO_EXPIRADA'); }
  return u;
}
// Consulta sem renovar o prazo de inactividade (usada pelo verificador periódico da interface).
function utilizadorActual() {
  if (!sessao || Date.now() - sessao.ultimaActividade > SESSAO_MS) { sessao = null; return null; }
  const u = dbm.get().prepare('SELECT * FROM users WHERE id=?').get(sessao.userId);
  return u && u.estado !== 'bloqueado' ? publico(u) : null;
}

function alterarSenha(senhaActual, nova) {
  const u = exigirSessao();
  if (!bcrypt.compareSync(String(senhaActual || ''), u.senha_hash)) throw new Error('Palavra-passe actual incorrecta.');
  const erro = validarSenha(nova);
  if (erro) throw new Error(erro);
  dbm.get().prepare('UPDATE users SET senha_hash=? WHERE id=?').run(bcrypt.hashSync(nova, 10), u.id);
  dbm.log(u.id, 'acesso', 'Palavra-passe alterada');
  return true;
}

// Recuperação: gera um código de 6 dígitos válido 15 min.
// O envio por email exige servidor; offline o código é mostrado ao administrador/suporte.
function pedirRecuperacao(email) {
  email = String(email || '').trim().toLowerCase();
  const u = dbm.get().prepare('SELECT id FROM users WHERE email=?').get(email);
  if (!u) return { enviado: true }; // não revelar se o email existe
  const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  resets.set(email, { codigo, expira: Date.now() + RESET_VALIDADE_MS, userId: u.id });
  dbm.log(u.id, 'acesso', 'Pedido de recuperação de palavra-passe');
  return { enviado: true, codigoLocal: codigo };
}
function concluirRecuperacao(email, codigo, nova) {
  email = String(email || '').trim().toLowerCase();
  const r = resets.get(email);
  if (!r || r.expira < Date.now() || r.codigo !== String(codigo)) throw new Error('Código inválido ou expirado.');
  const erro = validarSenha(nova);
  if (erro) throw new Error(erro);
  dbm.get().prepare('UPDATE users SET senha_hash=?, tentativas=0, bloqueado_ate=NULL WHERE id=?').run(bcrypt.hashSync(nova, 10), r.userId);
  resets.delete(email);
  dbm.log(r.userId, 'acesso', 'Palavra-passe recuperada');
  return true;
}

// ---------- Administrador (Módulo 9): palavra-passe mestra + 2FA TOTP ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32encode(buf) {
  let bits = '', out = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}
function b32decode(s) {
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secret, t = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = crypto.createHmac('sha1', b32decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, '0');
}
function totpValido(secret, codigo) {
  for (const delta of [-1, 0, 1]) if (totp(secret, Date.now() + delta * 30000) === String(codigo)) return true;
  return false;
}

// Primeira utilização do painel: cria a conta de administrador e devolve o segredo 2FA (mostrar uma só vez).
function configurarAdmin({ nome, email, senha }) {
  const db = dbm.get();
  if (db.prepare("SELECT 1 FROM users WHERE papel='admin'").get()) throw new Error('O administrador já está configurado.');
  const erro = validarSenha(senha);
  if (erro) throw new Error(erro);
  email = String(email).trim().toLowerCase();
  const r = db.prepare(`INSERT INTO users(nome,email,papel,senha_hash,plano,plano_expira,criado_em) VALUES (?,?, 'admin', ?, 'escola', ?, ?)`)
    .run(nome || 'Administrador', email, bcrypt.hashSync(senha, 12), Date.now() + 100 * 365 * 864e5, Date.now());
  const segredo = b32encode(crypto.randomBytes(20));
  dbm.setConfig('admin_totp', segredo);
  dbm.log(r.lastInsertRowid, 'admin', 'Administrador configurado');
  return { segredo, uri: `otpauth://totp/AulaPro:${email}?secret=${segredo}&issuer=AulaPro` };
}
function adminConfigurado() { return !!dbm.get().prepare("SELECT 1 FROM users WHERE papel='admin'").get(); }

function entrarAdmin(email, senha, codigo2fa) {
  const db = dbm.get();
  const u = db.prepare("SELECT * FROM users WHERE email=? AND papel='admin'").get(String(email || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(String(senha || ''), u.senha_hash)) { dbm.log(null, 'admin', 'Falha de login admin'); throw new Error('Credenciais inválidas.'); }
  if (u.bloqueado_ate && u.bloqueado_ate > Date.now()) throw new Error('Acesso temporariamente bloqueado.');
  if (!totpValido(dbm.getConfig('admin_totp'), codigo2fa)) {
    const t = u.tentativas + 1;
    db.prepare('UPDATE users SET tentativas=?, bloqueado_ate=? WHERE id=?').run(t >= MAX_TENTATIVAS ? 0 : t, t >= MAX_TENTATIVAS ? Date.now() + BLOQUEIO_MS : null, u.id);
    dbm.log(u.id, 'admin', 'Código 2FA inválido');
    throw new Error('Código 2FA inválido.');
  }
  db.prepare('UPDATE users SET tentativas=0 WHERE id=?').run(u.id);
  sessao = { userId: u.id, ultimaActividade: Date.now(), adminOk: true };
  dbm.log(u.id, 'admin', 'Login admin');
  return publico(u);
}
function exigirAdmin() {
  const u = exigirSessao();
  if (u.papel !== 'admin' || !sessao.adminOk) throw new Error('Acesso negado.');
  return u;
}

module.exports = {
  validarSenha, registar, entrar, sair, exigirSessao, utilizadorActual, alterarSenha,
  pedirRecuperacao, concluirRecuperacao, configurarAdmin, adminConfigurado, entrarAdmin, exigirAdmin,
  totp, totpValido, publico,
};
