'use strict';
const assert = require('assert');
const c = require('../src/main/calc');
// Exemplo do documento: ACS 14,16,15 e AT 17 → média ACS 15, Regra A = (30+17)/3 = 15.7
assert.strictEqual(c.mediaTrimestral({ acs1: 14, acs2: 16, acs3: 15, at: 17 }, 'A'), 15.7);
// Regra B = (2*17+15)/3 = 16.3
assert.strictEqual(c.mediaTrimestral({ acs1: 14, acs2: 16, acs3: 15, at: 17 }, 'B'), 16.3);
assert.strictEqual(c.mediaAnual(15, 14, 16), 15);
// Exame opção 1: (2*16+15)/3 = 15.7 ; opção 2: (2*15+16)/3 = 15.3
assert.strictEqual(c.classificacaoFinal(15, 16, 1), 15.7);
assert.strictEqual(c.classificacaoFinal(15, 16, 2), 15.3);
assert.strictEqual(c.corNota(10), 'verde');
assert.strictEqual(c.corNota(9.9), 'amarelo');
assert.strictEqual(c.corNota(7.9), 'vermelho');
assert.strictEqual(c.validarNota('21').ok, false);
assert.strictEqual(c.validarNota('-1').ok, false);
assert.strictEqual(c.validarNota('14,5').valor, 14.5);
assert.strictEqual(c.mediaTrimestral({ acs1: 14, at: '' }, 'A'), null);
const r = c.calcularAluno({ 1: { acs1: 14, acs2: 16, acs3: 15, at: 17 }, 2: { acs1: 14, acs2: 14, acs3: 14, at: 14 }, 3: { acs1: 16, acs2: 16, acs3: 16, at: 16 }, exame: 16 }, { temExame: true, opcaoExame: 1 });
assert.strictEqual(r.resultado, 'Aprovado');
console.log('calc.test.js OK');
