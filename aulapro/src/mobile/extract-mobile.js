'use strict';
// Extracção de texto no Android (v1): TXT e DOCX. PDF e foto (OCR) ainda só no computador.
const fs = require('./fs-shim');
const LIMITES = { pdf: 25 * 1048576, imagem: 10 * 1048576, docx: 10 * 1048576, txt: 5 * 1048576 };
function tipoDe(nome) {
  const e = String(nome).toLowerCase().match(/\.[a-z0-9]+$/); const x = e ? e[0] : '';
  return x === '.pdf' ? 'pdf' : ['.png', '.jpg', '.jpeg'].includes(x) ? 'imagem' : x === '.docx' ? 'docx' : x === '.txt' ? 'txt' : null;
}
async function inflarRaw(dados) {
  const ds = new DecompressionStream('deflate-raw'); const w = ds.writable.getWriter(); w.write(dados); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}
async function extrairDocx(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let i = u8.length - 22;
  while (i >= 0 && dv.getUint32(i, true) !== 0x06054b50) i--; if (i < 0) throw new Error('DOCX inválido.');
  const n = dv.getUint16(i + 10, true); let off = dv.getUint32(i + 16, true); const dec = new TextDecoder();
  for (let k = 0; k < n; k++) {
    const metodo = dv.getUint16(off + 10, true), cs = dv.getUint32(off + 20, true), nl = dv.getUint16(off + 28, true), el = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true), lho = dv.getUint32(off + 42, true);
    const nome = dec.decode(u8.subarray(off + 46, off + 46 + nl));
    if (nome === 'word/document.xml') {
      const ln = dv.getUint16(lho + 26, true), le = dv.getUint16(lho + 28, true); const d = u8.subarray(lho + 30 + ln + le, lho + 30 + ln + le + cs);
      const xml = dec.decode(metodo === 8 ? await inflarRaw(d) : d);
      return xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
    }
    off += 46 + nl + el + cl;
  }
  throw new Error('DOCX sem conteúdo legível.');
}
async function extrair(caminho, nome) {
  const tipo = tipoDe(nome);
  if (!tipo) throw new Error('Tipo não suportado. Use TXT ou DOCX.');
  const tamanho = fs.statSync(caminho).size; if (tamanho > LIMITES[tipo]) throw new Error('Ficheiro demasiado grande.');
  if (tipo === 'pdf' || tipo === 'imagem') throw new Error('Na versão Android, PDF e fotos (OCR) ainda não são suportados: use TXT, DOCX ou cole o texto. No computador funcionam.');
  const buf = fs.readFileSync(caminho);
  const texto = tipo === 'docx' ? await extrairDocx(new Uint8Array(buf)) : new TextDecoder().decode(buf);
  return { tipo, tamanho, texto: texto.replace(/\u0000/g, '').trim() };
}
module.exports = { extrair, tipoDe, LIMITES };
