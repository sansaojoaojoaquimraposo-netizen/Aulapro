'use strict';
// Exportação: PDF (pdfkit), CSV, DOCX (docx), PPTX (pptxgenjs). Marca de água só no plano Grátis.
const fs = require('fs');
const { MARCA_DAGUA } = require('./plans');

const AZUL = '#0056D2';
const escCsv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function csv(linhas) {
  // BOM para o Excel abrir correctamente os acentos.
  return '﻿' + linhas.map((l) => l.map(escCsv).join(';')).join('\r\n');
}

function novoPDF(destino, { marca, escola, titulo, timbre }) {
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: titulo || 'AulaPro' } });
  doc._partes = [];
  doc.on('data', (c) => doc._partes.push(c));
  const rodape = () => {
    // Margem inferior a 0 durante o rodapé: evita que o pdfkit crie uma página nova ao escrever junto ao fundo.
    const mb = doc.page.margins.bottom; doc.page.margins.bottom = 0;
    const y = doc.page.height - 36;
    doc.save().fontSize(8).fillColor('#888').font('Helvetica');
    if (marca) doc.text(MARCA_DAGUA, 50, y, { align: 'center', width: doc.page.width - 100, lineBreak: false });
    else if (escola) doc.text(escola, 50, y, { align: 'center', width: doc.page.width - 100, lineBreak: false });
    doc.restore(); doc.page.margins.bottom = mb;
  };
  doc.on('pageAdded', rodape);
  rodape();
  if (timbre && escola) {
    doc.fontSize(14).fillColor(AZUL).font('Helvetica-Bold').text(escola.toUpperCase(), { align: 'center' });
    doc.moveDown(0.2).fontSize(8).fillColor('#444').font('Helvetica').text('República de Moçambique', { align: 'center' });
    doc.moveTo(50, doc.y + 6).lineTo(doc.page.width - 50, doc.y + 6).strokeColor(AZUL).lineWidth(1.5).stroke();
    doc.moveDown(1.2);
  }
  return doc;
}
const fim = (doc, destino) => new Promise((res, rej) => {
  doc.on('end', () => { try { fs.writeFileSync(destino, Buffer.concat(doc._partes)); res(destino); } catch (e) { rej(e); } });
  doc.on('error', rej);
  doc.end();
});

async function pdfPlano(destino, plano, opc) {
  const doc = novoPDF(destino, { ...opc, titulo: plano.titulo });
  doc.font('Helvetica-Bold').fontSize(18).fillColor(AZUL).text(plano.titulo || 'Plano de Aula');
  doc.moveDown(0.3).font('Helvetica').fontSize(10).fillColor('#222')
    .text(`Disciplina: ${plano.disciplina || ''}   Turma: ${plano.turma || ''}   Duração: ${plano.duracao || ''} min   Professor(a): ${opc.professor || ''}`);
  if (plano.competencia) doc.text(`Competência: ${plano.competencia}`);
  const sec = (t, itens, num) => {
    doc.moveDown(0.8).font('Helvetica-Bold').fontSize(12).fillColor(AZUL).text(t);
    doc.font('Helvetica').fontSize(10).fillColor('#222');
    (itens || []).forEach((it, i) => doc.text(`${num ? i + 1 + '. ' : '• '}${it}`, { indent: 10 }));
  };
  sec('1. Objectivos de aprendizagem', plano.objetivos);
  sec('2. Conteúdo', plano.conteudo);
  sec('3. Metodologia', (plano.metodologia || []).map((m) => `${m.fase} (${m.minutos} min): ${m.descricao}`));
  sec('4. Material', plano.material);
  sec('5. Avaliação', plano.avaliacao);
  sec('6. TPC', plano.tpc);
  return fim(doc, destino);
}

async function pdfFicha(destino, ficha, opc) {
  const doc = novoPDF(destino, { ...opc, titulo: ficha.titulo, timbre: true });
  const c = ficha.cabecalho || {};
  doc.font('Helvetica-Bold').fontSize(15).fillColor(AZUL).text(ficha.titulo || 'Ficha / Teste', { align: 'center' });
  doc.moveDown(0.4).font('Helvetica').fontSize(10).fillColor('#222')
    .text(`Disciplina: ${c.disciplina || ''}   Ano/Série: ${c.ano || ''}   Data: ${c.data || '___/___/______'}   Duração: ${c.duracao || ''}`)
    .text(`Elaborado por Prof.: ${c.professor || ''}`);
  if (ficha.espacoNome) doc.moveDown(0.5).text('Nome do aluno: ______________________________   Nº: _____');
  doc.moveDown(0.8);
  const letras = 'ABCD';
  (ficha.questoes || []).forEach((q, i) => {
    doc.font('Helvetica-Bold').fontSize(11).text(`${i + 1}. [${q.pontos} pt] `, { continued: true }).font('Helvetica').text(q.enunciado);
    if (q.tipo === 'mc') (q.opcoes || []).forEach((o, k) => doc.text(`   ${letras[k]}) ${o}`));
    else if (q.tipo === 'vf') doc.text('   (   ) Verdadeiro      (   ) Falso');
    else doc.moveDown(1.5).text('   ______________________________________________');
    doc.moveDown(0.6);
  });
  const total = (ficha.questoes || []).reduce((a, q) => a + Number(q.pontos || 0), 0);
  doc.font('Helvetica-Oblique').fontSize(9).fillColor('#666').text(`Total: ${(ficha.questoes || []).length} questões • ${total} pontos`);
  if (ficha.incluirGabarito) {
    doc.addPage().font('Helvetica-Bold').fontSize(14).fillColor(AZUL).text('Gabarito (Chave de respostas)').moveDown(0.5);
    doc.font('Helvetica').fontSize(11).fillColor('#222');
    (ficha.questoes || []).forEach((q, i) => {
      const r = q.tipo === 'mc' ? letras[q.correcta] + ') ' + (q.opcoes || [])[q.correcta] : q.tipo === 'vf' ? (q.correcta ? 'Verdadeiro' : 'Falso') : q.resposta || '—';
      doc.text(`${i + 1}. ${r}`);
    });
  }
  return fim(doc, destino);
}

async function pdfCaderneta(destino, dados, opc) {
  const doc = novoPDF(destino, { ...opc, titulo: 'Caderneta Mestra', timbre: true });
  doc.font('Helvetica-Bold').fontSize(14).fillColor(AZUL).text(`Caderneta Mestra — ${dados.disciplina} • ${dados.nome}`);
  doc.font('Helvetica').fontSize(9).fillColor('#444').text(`Ano lectivo ${dados.ano} • Regra ${dados.regra}${dados.temExame ? ` • Exame (opção ${dados.opcaoExame})` : ''}`).moveDown(0.6);
  const cols = ['Nº', 'Estudante', 'T1', 'T2', 'T3', 'M. Anual', ...(dados.temExame ? ['Exame'] : []), 'Final', 'Resultado'];
  const larg = [24, 150, 32, 32, 32, 48, ...(dados.temExame ? [38] : []), 38, 80];
  const linha = (vals, bold, cor) => {
    let x = 50; const y = doc.y;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
    vals.forEach((v, i) => { doc.fillColor(cor && i === vals.length - 1 ? cor : '#222').text(String(v ?? ''), x, y, { width: larg[i] - 2, lineBreak: false }); x += larg[i]; });
    doc.y = y + 14; doc.x = 50;
  };
  linha(cols, true);
  dados.linhas.forEach((l) => {
    const cor = { verde: '#0a7d36', amarelo: '#b8860b', vermelho: '#c0392b' }[l.cor];
    linha([l.numero, l.nome, l.t1, l.t2, l.t3, l.anual, ...(dados.temExame ? [l.exame] : []), l.final, l.resultado], false, cor);
    if (doc.y > doc.page.height - 70) doc.addPage();
  });
  return fim(doc, destino);
}

async function docxFicha(destino, ficha, opc) {
  const { Document, Packer, Paragraph, TextRun, Header, Footer, AlignmentType } = require('docx');
  const c = ficha.cabecalho || {};
  const P = (t, o = {}) => new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: t, ...o })], alignment: o.centro ? AlignmentType.CENTER : undefined });
  const letras = 'ABCD';
  const corpo = [
    P(ficha.titulo || 'Ficha / Teste', { bold: true, size: 30, color: '0056D2', centro: true }),
    P(`Disciplina: ${c.disciplina || ''}   Ano/Série: ${c.ano || ''}   Data: ${c.data || '___/___/______'}   Duração: ${c.duracao || ''}`),
    P(`Elaborado por Prof.: ${c.professor || ''}`),
    ...(ficha.espacoNome ? [P('Nome do aluno: ______________________________   Nº: _____')] : []),
  ];
  (ficha.questoes || []).forEach((q, i) => {
    corpo.push(P(`${i + 1}. [${q.pontos} pt] ${q.enunciado}`, { bold: true }));
    if (q.tipo === 'mc') (q.opcoes || []).forEach((o, k) => corpo.push(P(`   ${letras[k]}) ${o}`)));
    else if (q.tipo === 'vf') corpo.push(P('   (   ) Verdadeiro      (   ) Falso'));
    else corpo.push(P('   ______________________________________________'));
  });
  if (ficha.incluirGabarito) {
    corpo.push(P('Gabarito', { bold: true, size: 26, color: '0056D2' }));
    (ficha.questoes || []).forEach((q, i) => corpo.push(P(`${i + 1}. ${q.tipo === 'mc' ? letras[q.correcta] : q.tipo === 'vf' ? (q.correcta ? 'Verdadeiro' : 'Falso') : q.resposta || '—'}`)));
  }
  const doc = new Document({
    sections: [{
      headers: { default: new Header({ children: [P((ficha.incluirCabecalho ? opc.escola : '') || '', { bold: true, centro: true, color: '0056D2' })] }) },
      footers: { default: new Footer({ children: [P(opc.marca ? MARCA_DAGUA : opc.escola || '', { size: 16, centro: true, color: '888888' })] }) },
      children: corpo,
    }],
  });
  fs.writeFileSync(destino, await Packer.toBuffer(doc));
  return destino;
}

async function pptx(destino, slides, opc) {
  const PptxGenJS = require('pptxgenjs');
  const p = new PptxGenJS();
  p.layout = 'LAYOUT_WIDE';
  slides.forEach((s) => {
    const sl = p.addSlide();
    sl.background = { color: s.tipo === 'titulo' ? '0056D2' : 'F4F8FF' };
    if (s.tipo === 'titulo') {
      sl.addText(s.titulo, { x: 0.8, y: 2.3, w: 11.7, h: 1.5, fontSize: 44, bold: true, color: 'FFFFFF', fontFace: 'Calibri' });
      sl.addText(s.subtitulo || '', { x: 0.8, y: 3.9, w: 11.7, h: 0.6, fontSize: 22, color: 'DCE8FF' });
    } else {
      sl.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 1.1, fill: { color: '0056D2' } });
      sl.addText(s.titulo, { x: 0.6, y: 0.15, w: 12, h: 0.8, fontSize: 32, bold: true, color: 'FFFFFF' });
      sl.addText((s.topicos || []).map((t) => ({ text: t, options: { bullet: true, breakLine: true } })),
        { x: 0.8, y: 1.5, w: 11.7, h: 5, fontSize: 24, color: '1A2B4A', valign: 'top', paraSpaceAfter: 12 });
    }
    sl.addText(opc.marca ? MARCA_DAGUA : 'AulaPro', { x: 0.4, y: 7, w: 12.5, h: 0.3, fontSize: 10, color: opc.marca ? 'C0392B' : '7A8CA8', align: 'right' });
  });
  const dados = await p.write({ outputType: 'uint8array' });
  fs.writeFileSync(destino, Buffer.from(dados));
  return destino;
}

module.exports = { csv, pdfPlano, pdfFicha, pdfCaderneta, docxFicha, pptx };
