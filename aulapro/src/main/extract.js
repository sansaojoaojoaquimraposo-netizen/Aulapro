'use strict';
// Extracção de texto de ficheiros carregados: PDF (parser), foto (OCR Tesseract), DOCX, TXT.
const fs = require('fs');
const path = require('path');

const MB = 1024 * 1024;
const LIMITES = { pdf: 25 * MB, imagem: 10 * MB, docx: 10 * MB, txt: 5 * MB };

function tipoDe(nome) {
  const e = path.extname(nome).toLowerCase();
  if (e === '.pdf') return 'pdf';
  if (['.png', '.jpg', '.jpeg'].includes(e)) return 'imagem';
  if (e === '.docx') return 'docx';
  if (e === '.txt') return 'txt';
  return null;
}

async function extrairDocx(buf) {
  // DOCX é um ZIP; word/document.xml contém o texto. Usa o zip embutido do pacote 'docx' não é possível,
  // por isso lê as entradas com um leitor ZIP mínimo (método "deflate").
  const zlib = require('zlib');
  let i = buf.length - 22;
  while (i >= 0 && buf.readUInt32LE(i) !== 0x06054b50) i--;
  if (i < 0) throw new Error('DOCX inválido.');
  const n = buf.readUInt16LE(i + 10);
  let off = buf.readUInt32LE(i + 16);
  for (let k = 0; k < n; k++) {
    const metodo = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20);
    const nl = buf.readUInt16LE(off + 28), el = buf.readUInt16LE(off + 30), cl = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const nome = buf.toString('utf8', off + 46, off + 46 + nl);
    if (nome === 'word/document.xml') {
      const ln = buf.readUInt16LE(lho + 26), le = buf.readUInt16LE(lho + 28);
      const dados = buf.subarray(lho + 30 + ln + le, lho + 30 + ln + le + csize);
      const xml = (metodo === 8 ? zlib.inflateRawSync(dados) : dados).toString('utf8');
      return xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
    }
    off += 46 + nl + el + cl;
  }
  throw new Error('DOCX sem conteúdo legível.');
}

async function extrair(caminho, nome, { ocrDataPath } = {}) {
  const tipo = tipoDe(nome);
  if (!tipo) throw new Error('Tipo não suportado. Use PDF, PNG, JPG, JPEG, TXT ou DOCX.');
  const tamanho = fs.statSync(caminho).size;
  if (tamanho > LIMITES[tipo]) throw new Error(`Ficheiro demasiado grande (máx. ${LIMITES[tipo] / MB} MB para ${tipo.toUpperCase()}).`);
  let texto = '';
  if (tipo === 'pdf') {
    const pdfParse = require('pdf-parse');
    texto = (await pdfParse(fs.readFileSync(caminho))).text || '';
  } else if (tipo === 'imagem') {
    const Tesseract = require('tesseract.js');
    const opts = ocrDataPath ? { langPath: ocrDataPath, gzip: false, cachePath: ocrDataPath } : {};
    const worker = await Tesseract.createWorker('por', 1, opts);
    try { texto = (await worker.recognize(caminho)).data.text || ''; } finally { await worker.terminate(); }
  } else if (tipo === 'docx') {
    texto = await extrairDocx(fs.readFileSync(caminho));
  } else {
    texto = fs.readFileSync(caminho, 'utf8');
  }
  return { tipo, tamanho, texto: texto.replace(/\u0000/g, '').trim() };
}

module.exports = { extrair, tipoDe, LIMITES };
