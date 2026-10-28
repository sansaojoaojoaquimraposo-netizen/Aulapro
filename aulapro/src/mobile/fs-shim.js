'use strict';
// Sistema de ficheiros virtual para o Android: memória + IndexedDB (feito em entry.js).
// Ficheiros em /export/ são entregues ao utilizador (Partilhar/Guardar) assim que são escritos.
const ficheiros = new Map(); // caminho -> Uint8Array
const pastas = new Set(['/']);
const ganchos = { aoMudar: null, aoExportar: null };

const norm = (p) => { const s = String(p).replace(/\\/g, '/').replace(/\/+/g, '/'); return s.length > 1 ? s.replace(/\/$/, '') : s; };
const paraBytes = (d) => (typeof d === 'string' ? new TextEncoder().encode(d) : d instanceof Uint8Array ? d : new Uint8Array(d));
const comoBuffer = (u8) => (typeof Buffer !== 'undefined' ? Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength) : u8);
const err = (p) => Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });

function mkdirSync(p) { let acc = ''; for (const parte of norm(p).split('/').filter(Boolean)) { acc += '/' + parte; pastas.add(acc); } }
function existsSync(p) { p = norm(p); return ficheiros.has(p) || pastas.has(p); }
function writeFileSync(p, d) {
  p = norm(p); const b = paraBytes(d).slice(); ficheiros.set(p, b); mkdirSync(p.slice(0, p.lastIndexOf('/')) || '/');
  if (p.startsWith('/export/')) ganchos.aoExportar && ganchos.aoExportar(p.slice(8), b); else ganchos.aoMudar && ganchos.aoMudar(p, b);
}
function readFileSync(p, enc) {
  p = norm(p); const b = ficheiros.get(p); if (!b) throw err(p);
  return enc ? new TextDecoder().decode(b) : comoBuffer(b);
}
function copyFileSync(a, b) { writeFileSync(b, readFileSync(a)); }
function unlinkSync(p) { p = norm(p); if (!ficheiros.delete(p)) throw err(p); ganchos.aoMudar && ganchos.aoMudar(p, null); }
function statSync(p) {
  p = norm(p);
  if (ficheiros.has(p)) return { size: ficheiros.get(p).length, isDirectory: () => false };
  if (pastas.has(p)) return { size: 0, isDirectory: () => true };
  throw err(p);
}
function readdirSync(p, o) {
  p = norm(p); const pre = p === '/' ? '/' : p + '/'; const nomes = new Map();
  for (const f of ficheiros.keys()) if (f.startsWith(pre)) { const r = f.slice(pre.length).split('/'); nomes.set(r[0], r.length > 1); }
  for (const d of pastas) if (d.startsWith(pre) && d !== p) { const r = d.slice(pre.length).split('/'); nomes.set(r[0], true); }
  if (!existsSync(p)) throw err(p);
  return [...nomes].map(([name, dir]) => (o && o.withFileTypes ? { name, isDirectory: () => dir } : name));
}
module.exports = { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, unlinkSync, statSync, readdirSync, ganchos, _ficheiros: ficheiros };
