'use strict';
// Fórmulas da Caderneta Mestra (Módulo 1) — lógica pura, sem dependências.

const round1 = (n) => Math.round((n + Number.EPSILON) * 10) / 10;
const isNum = (v) => v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v));

function validarNota(v) {
  if (v === '' || v === null || v === undefined) return { ok: true, valor: null };
  const n = Number(String(v).replace(',', '.'));
  if (Number.isNaN(n)) return { ok: false, erro: 'Nota inválida' };
  if (n < 0 || n > 20) return { ok: false, erro: 'A nota deve estar entre 0 e 20' };
  return { ok: true, valor: n };
}

function mediaACS(acs1, acs2, acs3) {
  const v = [acs1, acs2, acs3].filter(isNum).map(Number);
  if (v.length === 0) return null;
  // Divide sempre por 3 quando as três existem; com notas em falta usa as lançadas.
  return v.reduce((a, b) => a + b, 0) / (v.length === 3 ? 3 : v.length);
}

// Regra A (padrão Sofala): (2*MediaACS + AT) / 3
// Regra B (alternativa):   (2*AT + MediaACS) / 3
function mediaTrimestral({ acs1, acs2, acs3, at }, regra = 'A') {
  const m = mediaACS(acs1, acs2, acs3);
  if (m === null || !isNum(at)) return null;
  const AT = Number(at);
  const r = regra === 'B' ? (2 * AT + m) / 3 : (2 * m + AT) / 3;
  return round1(r);
}

function mediaAnual(t1, t2, t3) {
  const v = [t1, t2, t3].filter(isNum).map(Number);
  if (v.length < 3) return null;
  return round1(v.reduce((a, b) => a + b, 0) / 3);
}

// Opção 1: (2*Exame + MediaAnual)/3   Opção 2: (2*MediaAnual + Exame)/3
function classificacaoFinal(mAnual, exame, opcao = 1) {
  if (mAnual === null || mAnual === undefined) return null;
  if (!isNum(exame)) return round1(mAnual);
  const E = Number(exame);
  return round1(opcao === 2 ? (2 * mAnual + E) / 3 : (2 * E + mAnual) / 3);
}

function corNota(n) {
  if (n === null || n === undefined) return 'neutro';
  if (n >= 10) return 'verde';
  if (n >= 8) return 'amarelo';
  return 'vermelho';
}

function resultado(final) {
  if (final === null || final === undefined) return 'Pendente';
  if (final >= 10) return 'Aprovado';
  if (final >= 8) return 'Recuperação';
  return 'Reprovado';
}

// notas: { 1:{acs1,acs2,acs3,at}, 2:{...}, 3:{...}, exame }
function calcularAluno(notas, { regra = 'A', opcaoExame = 1, temExame = false } = {}) {
  const t = [1, 2, 3].map((i) => mediaTrimestral(notas[i] || {}, regra));
  const anual = mediaAnual(t[0], t[1], t[2]);
  const final = temExame ? classificacaoFinal(anual, notas.exame, opcaoExame) : anual;
  return { t1: t[0], t2: t[1], t3: t[2], anual, final, resultado: resultado(final), cor: corNota(final) };
}

module.exports = {
  round1, validarNota, mediaACS, mediaTrimestral, mediaAnual,
  classificacaoFinal, corNota, resultado, calcularAluno,
};
