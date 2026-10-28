'use strict';
// Backend do AulaPro no Android: corre dentro da WebView e reutiliza os MESMOS módulos do computador
// (db, auth, calc, ai, exporters, ipc) com SQLite em WebAssembly (sql.js) guardado no IndexedDB.
if (typeof Buffer === 'undefined') globalThis.Buffer = require('buffer').Buffer;
const fs = require('./fs-shim');

// ---- IndexedDB (armazenamento persistente) ----
const abrirIDB = () => new Promise((res, rej) => { const r = indexedDB.open('aulapro', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
let idb;
const kv = (modo, fn) => new Promise((res, rej) => { const t = idb.transaction('kv', modo); const s = t.objectStore('kv'); const q = fn(s); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); });
const kvGet = (k) => kv('readonly', (s) => s.get(k));
const kvSet = (k, v) => kv('readwrite', (s) => s.put(v, k));
const kvDel = (k) => kv('readwrite', (s) => s.delete(k));
const kvTodas = () => new Promise((res, rej) => { const t = idb.transaction('kv').objectStore('kv'); const out = []; const c = t.openCursor(); c.onsuccess = () => { const x = c.result; if (x) { out.push([x.key, x.value]); x.continue(); } else res(out); }; c.onerror = () => rej(c.error); });

// ---- Entrega de exportações (PDF, PPTX, DOCX, CSV): Partilhar no Android, download no navegador ----
const paraBase64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
fs.ganchos.aoExportar = async (nome, bytes) => {
  try {
    const C = window.Capacitor;
    if (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.Filesystem && C.Plugins.Share) {
      const r = await C.Plugins.Filesystem.writeFile({ path: 'AulaPro/' + nome, data: paraBase64(bytes), directory: 'CACHE', recursive: true });
      await C.Plugins.Share.share({ title: nome, url: r.uri, dialogTitle: 'Guardar ou partilhar ' + nome });
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes])); a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    }
    if (window.toast) toast('Ficheiro pronto: ' + nome);
  } catch (e) { if (window.toast) toast('Não foi possível guardar o ficheiro: ' + e.message, true); }
};
fs.ganchos.aoMudar = (p, b) => { if (!idb) return; (b ? kvSet('f:' + p, b) : kvDel('f:' + p)).catch(() => {}); };

// ---- Arranque ----
let pronto;
async function iniciar() {
  idb = await abrirIDB();
  const initSqlJs = require('sql.js');
  globalThis.__SQL = await initSqlJs({ locateFile: () => 'sql-wasm.wasm' });
  globalThis.__DBBYTES = (await kvGet('bd')) || null;
  for (const [k, v] of await kvTodas()) if (String(k).startsWith('f:')) fs._ficheiros.set(String(k).slice(2), v);
  for (const p of fs._ficheiros.keys()) fs.mkdirSync(p.slice(0, p.lastIndexOf('/')) || '/');
  let temp = null, ultimo = null;
  const gravar = async () => { if (!ultimo) return; const bytes = ultimo.export(); ultimo.exec('PRAGMA foreign_keys = ON'); await kvSet('bd', bytes); };
  globalThis.__aoGravarBD = (raw) => { ultimo = raw; clearTimeout(temp); temp = setTimeout(() => gravar().catch(() => {}), 400); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) gravar().catch(() => {}); });
  window.addEventListener('pagehide', () => { gravar().catch(() => {}); });

  const dbm = require('../main/db');
  dbm.init('/data');
  require('../main/ipc').registarHandlers(() => null);
}
pronto = iniciar();

window.api = {
  plataforma: 'android',
  aoReceber() {},
  async invocar(canal, ...args) {
    await pronto;
    const h = (globalThis.__handlers || {})['api:' + canal];
    if (!h) throw new Error('Canal desconhecido: ' + canal);
    const r = await h(null, ...args);
    if (!r.ok) throw new Error(r.erro);
    return r.data;
  },
};
