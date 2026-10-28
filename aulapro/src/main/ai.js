'use strict';
// Geração de conteúdo: motor local (offline) + IA opcional por API compatível com OpenAI.
// Regra do documento: usar APENAS o conteúdo carregado como base, seguir a instrução do
// utilizador e formatar dentro do modelo carregado.
const dbm = require('./db');

const PROMPT_SISTEMA =
  'És um assistente pedagógico para professores moçambicanos. Usa APENAS o conteúdo carregado como base. ' +
  'Segue a instrução do utilizador. Formata dentro do modelo carregado. Responde em Português de Moçambique ' +
  'e devolve SOMENTE JSON válido.';

const frases = (texto) =>
  String(texto || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 25 && s.length < 280);

function lerInstrucao(instr = '') {
  const t = instr.toLowerCase();
  const partes = (t.match(/(\d+)\s*partes?/) || [])[1];
  const perguntas = (t.match(/(\d+)\s*perguntas?/) || [])[1];
  const exemplo = /machamba|mercado|cozinha|escola|quintal|familia|família/.exec(t);
  return { partes: partes ? Number(partes) : 3, perguntas: perguntas ? Number(perguntas) : 3, exemplo: exemplo ? exemplo[0] : null };
}

async function chamarAPI(mensagens) {
  const url = dbm.getConfig('ia_url');
  const chave = dbm.getConfig('ia_chave');
  const modelo = dbm.getConfig('ia_modelo');
  if (!url || !chave || !modelo) return null;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave}` },
    body: JSON.stringify({ model: modelo, messages: mensagens, temperature: 0.4 }),
    signal: AbortSignal.timeout(90000),
  });
  if (!r.ok) throw new Error(`A IA devolveu erro ${r.status}`);
  const j = await r.json();
  const txt = j.choices?.[0]?.message?.content || '';
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Resposta da IA inválida.');
  return JSON.parse(m[0]);
}

function planoLocal(p) {
  const { disciplina, turma, tema, duracao = 50, competencia = '', textoBase = '', instrucao = '', modelo } = p;
  const ins = lerInstrucao(instrucao);
  const fr = frases(textoBase);
  const conteudo = fr.length
    ? fr.slice(0, Math.max(ins.partes * 2, 4))
    : [`Definição e conceitos fundamentais de ${tema}.`, `Características principais de ${tema}.`, `Aplicação de ${tema} no quotidiano.`];
  const min = (pc) => Math.max(2, Math.round((duracao * pc) / 100));
  const ex = ins.exemplo ? ` com exemplo de ${ins.exemplo}` : '';
  const metodologia = [
    { fase: 'Introdução', minutos: min(15), descricao: `Pergunta motivadora e revisão de conhecimentos prévios sobre ${tema}${ex}.` },
    { fase: 'Desenvolvimento', minutos: min(50), descricao: `Exposição dialogada do conteúdo em ${ins.partes} parte(s) com participação dos alunos.` },
    { fase: 'Prática', minutos: min(25), descricao: 'Resolução de exercícios em pares e correcção colectiva no quadro.' },
    { fase: 'Conclusão', minutos: min(10), descricao: `Síntese da aula e ${ins.perguntas} pergunta(s) de verificação.` },
  ];
  const perguntas = Array.from({ length: ins.perguntas }, (_, i) =>
    fr[i] ? `Explique por palavras suas: ${fr[i].slice(0, 90).replace(/[.!?]$/, '')}…` : `Pergunta ${i + 1} sobre ${tema}.`);
  return {
    titulo: `Plano de Aula — ${tema}`,
    disciplina, turma, tema, duracao, competencia,
    modelo: modelo?.nome || 'Modelo do sistema',
    objetivos: [
      `Compreender o conceito de ${tema}.`,
      `Identificar as ideias principais de ${tema} em situações do dia-a-dia.`,
      competencia ? `Desenvolver a competência: ${competencia}.` : `Aplicar os conhecimentos de ${tema} na resolução de exercícios.`,
    ],
    conteudo,
    metodologia,
    material: ['Quadro e giz/marcador', 'Livro do aluno', 'Caderno', ...(p.temFicheiros ? ['Material carregado no AulaPro'] : [])],
    avaliacao: perguntas,
    tpc: [`Resolver 3 exercícios sobre ${tema} no caderno.`],
    geradoPor: 'motor local',
  };
}

async function gerarPlano(p) {
  let usadoAPI = false;
  try {
    const r = await chamarAPI([
      { role: 'system', content: PROMPT_SISTEMA },
      { role: 'user', content: JSON.stringify({
        pedido: 'Gera um plano de aula',
        campos_json: ['titulo', 'objetivos[]', 'conteudo[]', 'metodologia[{fase,minutos,descricao}]', 'material[]', 'avaliacao[]', 'tpc[]'],
        disciplina: p.disciplina, turma: p.turma, tema: p.tema, duracao_min: p.duracao, competencia: p.competencia,
        instrucao_utilizador: p.instrucao, modelo_escola: p.modelo?.estrutura || null,
        conteudo_carregado: String(p.textoBase || '').slice(0, 24000),
      }) },
    ]);
    if (r && Array.isArray(r.objetivos)) {
      usadoAPI = true;
      return { disciplina: p.disciplina, turma: p.turma, tema: p.tema, duracao: p.duracao, competencia: p.competencia,
        modelo: p.modelo?.nome || 'Modelo do sistema', material: [], avaliacao: [], tpc: [], conteudo: [], metodologia: [], ...r, geradoPor: 'IA' };
    }
  } catch (e) { if (usadoAPI) throw e; /* sem rede ou sem chave: usa o motor local */ }
  return planoLocal(p);
}

// ---------- Plano → Apresentação (3 a 10 slides) ----------
function planoParaSlides(plano) {
  const slides = [];
  slides.push({ tipo: 'titulo', titulo: plano.tema || plano.titulo, subtitulo: `${plano.disciplina || ''} • ${plano.turma || ''} • ${plano.duracao || ''} min` });
  slides.push({ tipo: 'topicos', titulo: 'Objectivos da aula', topicos: plano.objetivos || [] });
  const cont = plano.conteudo || [];
  for (let i = 0; i < cont.length && slides.length < 7; i += 3) {
    slides.push({ tipo: 'topicos', titulo: i === 0 ? 'Conteúdo' : `Conteúdo (${i / 3 + 1})`, topicos: cont.slice(i, i + 3) });
  }
  slides.push({ tipo: 'topicos', titulo: 'Como vamos trabalhar', topicos: (plano.metodologia || []).map((m) => `${m.fase} (${m.minutos} min): ${m.descricao}`).slice(0, 5) });
  slides.push({ tipo: 'topicos', titulo: 'Verificação', topicos: (plano.avaliacao || []).slice(0, 5) });
  if ((plano.tpc || []).length) slides.push({ tipo: 'topicos', titulo: 'TPC', topicos: plano.tpc });
  return slides.slice(0, 10).map((s, i) => ({ ...s, numero: i + 1 }));
}

// ---------- Plano → Ficha / teste ----------
function planoParaFicha(plano) {
  const base = frases((plano.conteudo || []).join(' ')).concat(plano.conteudo || []);
  const q = [];
  const alvo = base.length ? base : [plano.tema];
  alvo.slice(0, 2).forEach((f, i) => q.push({
    tipo: 'mc', pontos: 2, enunciado: `Qual das afirmações sobre ${plano.tema} está correcta?`,
    opcoes: [f.replace(/[.]$/, ''), 'Nenhuma das anteriores', 'Não se aplica ao tema', 'Todas as anteriores'], correcta: 0, id: i + 1,
  }));
  q.push({ tipo: 'vf', pontos: 1, enunciado: `${alvo[0].replace(/[.]$/, '')}.`, correcta: true, id: q.length + 1 });
  q.push({ tipo: 'problema', pontos: 3, enunciado: (plano.avaliacao || [])[0] || `Explique o conceito de ${plano.tema}.`, resposta: '', id: q.length + 1 });
  return q;
}

// ---------- Voz: interpreta o comando falado ----------
function interpretarVoz(texto) {
  const t = String(texto || '').toLowerCase();
  const comando = /resum/.test(t) ? 'resumir' : /exporta/.test(t) ? 'exportar' : /adicion/.test(t) ? 'adicionar' : 'gerar';
  const classe = (t.match(/(\d{1,2})\s*[ºo°]?\s*(?:ano|classe)/) || [])[1];
  const min = (t.match(/(\d{1,3})\s*min/) || [])[1];
  const tema = (t.match(/sobre\s+(.+?)(?:\s+(?:para|do|da|no|na|com|,)\s|$)/) || [])[1];
  return {
    comando, tema: tema ? tema.trim() : '', turma: classe ? `${classe}ª Classe` : '',
    // "30 min" refere-se à actividade prática quando esta é mencionada; caso contrário é a duração da aula.
    duracao: !/pr[aá]tic/.test(t) && min ? Number(min) : 50,
    atividadePratica: /pr[aá]tic/.test(t), duracaoAtividade: /pr[aá]tic/.test(t) && min ? Number(min) : 30,
  };
}

module.exports = { gerarPlano, planoParaSlides, planoParaFicha, interpretarVoz, lerInstrucao, frases };
