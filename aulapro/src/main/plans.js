'use strict';
// Planos e limites Grátis vs Premium (Documento Mestre V2.0, secções 12 e 13).

const PLANOS = {
  gratis:  { nome: 'Grátis',  preco: 0,    dias: 0 },
  semanal: { nome: 'Semanal', preco: 99,   dias: 7 },
  mensal:  { nome: 'Mensal',  preco: 299,  dias: 30 },
  anual:   { nome: 'Anual',   preco: 2999, dias: 365 },
  escola:  { nome: 'Escola',  preco: 5000, dias: 30, maxProfessores: 30 },
};

const MB = 1024 * 1024;

const LIMITES = {
  gratis: {
    turmas: 1, alunosPorTurma: 35, regras: ['A'], simuladorExame: false,
    planosMes: 20, planoUploads: false, planoModelos: 1, planoVoz: false,
    apresentacoesMes: 5, apresentacaoMarca: true,
    fichasMes: 5, fichaDocx: false, fichaMarca: true, bancoQuestoes: false,
    downloadsMes: 3,
    vozUsosMes: 5, vozMaxSeg: 60,
    dashboardDirector: false,
    offlineBytes: 500 * MB, backupNuvem: false,
    exportMarca: true, timbreEscola: false,
    suporte: 'Email 72h',
  },
  premium: {
    turmas: Infinity, alunosPorTurma: Infinity, regras: ['A', 'B'], simuladorExame: true,
    planosMes: Infinity, planoUploads: true, planoModelos: 5, planoVoz: true,
    apresentacoesMes: Infinity, apresentacaoMarca: false,
    fichasMes: Infinity, fichaDocx: true, fichaMarca: false, bancoQuestoes: true,
    downloadsMes: Infinity,
    vozUsosMes: Infinity, vozMaxSeg: 600,
    dashboardDirector: false,
    offlineBytes: 8 * 1024 * MB, backupNuvem: true,
    exportMarca: false, timbreEscola: true,
    suporte: 'WhatsApp 24/7 prioritário',
  },
};
LIMITES.escola = { ...LIMITES.premium, dashboardDirector: true };

const MARCA_DAGUA = 'Gerado com AulaPro Grátis - aula.pro';

// Plano efectivo do utilizador: se a assinatura expirou, volta a Grátis.
function planoEfectivo(user, agora = Date.now()) {
  if (!user) return 'gratis';
  const p = user.plano || 'gratis';
  if (p === 'gratis') return 'gratis';
  if (!user.plano_expira || user.plano_expira < agora) return 'gratis';
  return p;
}

function limitesDe(planoKey) {
  return LIMITES[planoKey === 'gratis' ? 'gratis' : planoKey === 'escola' ? 'escola' : 'premium'];
}

module.exports = { PLANOS, LIMITES, MARCA_DAGUA, planoEfectivo, limitesDe };
