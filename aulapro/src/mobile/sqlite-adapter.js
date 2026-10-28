'use strict';
// Adaptador: expõe a API do better-sqlite3 (usada por db.js/ipc.js) sobre o sql.js (SQLite em WebAssembly).
// A base de dados vive em memória e é gravada no IndexedDB (entry.js) após cada escrita.
const norm = (a) => a.flat().map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

function Database(_caminho) {
  const SQL = globalThis.__SQL;
  const raw = new SQL.Database(globalThis.__DBBYTES || undefined);
  const gravar = () => { if (globalThis.__aoGravarBD) globalThis.__aoGravarBD(raw); };
  const ultimoId = () => { const r = raw.exec('SELECT last_insert_rowid()'); return r[0].values[0][0]; };
  return {
    exec(sql) { raw.exec(sql); gravar(); },
    prepare(sql) {
      const abre = (a) => { const st = raw.prepare(sql); const p = norm(a); if (p.length) st.bind(p); return st; };
      return {
        run(...a) { const st = abre(a); try { st.step(); } finally { st.free(); } const changes = raw.getRowsModified(); const id = ultimoId(); gravar(); return { changes, lastInsertRowid: id }; },
        get(...a) { const st = abre(a); try { return st.step() ? st.getAsObject() : undefined; } finally { st.free(); } },
        all(...a) { const st = abre(a); try { const r = []; while (st.step()) r.push(st.getAsObject()); return r; } finally { st.free(); } },
      };
    },
    close() { raw.close(); },
  };
}
module.exports = Database;
