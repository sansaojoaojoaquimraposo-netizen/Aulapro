'use strict';
// Teste do backend do ANDROID: carrega os módulos do AulaPro com os shims móveis (fs virtual, path, crypto,
// adaptador sql.js, electron-shim). O sql.js real (WebAssembly) é simulado sobre node:sqlite com a mesma API.
process.env.AULAPRO_TESTE = '1';
const Module = require('module'), path = require('path'), crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const M = (f) => path.join(__dirname, '..', 'src', 'mobile', f);

class MockSqlJs {
  constructor() { this.d = new DatabaseSync(':memory:'); }
  exec(sql) {
    if (/^\s*select/i.test(sql)) { const st = this.d.prepare(sql); const cols = st.columns().map((c) => c.name); return [{ columns: cols, values: st.all().map((r) => cols.map((c) => r[c])) }]; }
    this.d.exec(sql); return [];
  }
  prepare(sql) {
    const st = this.d.prepare(sql); let params = [], rows = null, i = 0, cur = null;
    return { bind(p) { params = p; }, step() { if (rows === null) { if (st.columns().length) rows = st.all(...params); else { st.run(...params); rows = []; } } if (i < rows.length) { cur = rows[i++]; return true; } return false; }, getAsObject() { return { ...cur }; }, free() {} };
  }
  getRowsModified() { return this.d.prepare('SELECT changes() c').get().c; }
  export() { return new Uint8Array(0); }
  close() {}
}
globalThis.__SQL = { Database: MockSqlJs };

const stubs = {
  electron: () => require(M('electron-shim.js')), fs: () => require(M('fs-shim.js')), path: () => require(M('path-shim.js')),
  crypto: () => require(M('crypto-shim.js')), 'better-sqlite3': () => require(M('sqlite-adapter.js')),
  './extract': () => require(M('extract-mobile.js')),
  bcryptjs: () => ({
    hashSync: (s) => { const salt = crypto.randomBytes(8).toString('hex'); return salt + ':' + crypto.scryptSync(s, salt, 32).toString('hex'); },
    compareSync: (s, h) => { const [salt, k] = h.split(':'); return crypto.scryptSync(s, salt, 32).toString('hex') === k; },
  }),
};
const orig = Module._load;
Module._load = function (req, parent, ...r) {
  if (parent && parent.filename && parent.filename.includes(path.join('src', 'main')) && stubs[req]) return stubs[req]();
  return orig.call(this, req, parent, ...r);
};
const dbm = require('../src/main/db'); dbm.init('/data');
const ipc = require('../src/main/ipc'); ipc.registarHandlers(() => null);
const handlers = globalThis.__handlers;
const chamar = async (canal, ...a) => { const r = await handlers['api:' + canal](null, ...a); if (!r.ok) throw new Error(r.erro); return r.data; };
module.exports = { chamar, handlers, dbm, ipc };
