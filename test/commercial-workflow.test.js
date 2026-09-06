const test = require('node:test');
const assert = require('node:assert/strict');
const workflow = require('../commercial-workflow');

const base = () => ({
  opportunities: [{ id: 'opp-1', stage: 'Qualificação de serviços', interests: 'Rede', needs: 'Cobertura', initialScope: 'Sala' }],
  surveys: [],
  appointments: [],
  quotes: []
});

test('bloqueia levantamento sem oportunidade ou antes da qualificação', () => {
  const current = base();
  assert.equal(workflow.validate(current, { ...current, surveys: [{ id: 'survey-1' }] }).ok, false);
  const primeiroContato = { ...current, opportunities: [{ id: 'opp-1', stage: 'Primeiro contato' }] };
  assert.equal(workflow.validate(primeiroContato, { ...primeiroContato, surveys: [{ id: 'survey-1', opportunityId: 'opp-1' }] }).message,
    'A oportunidade precisa estar em Qualificação de serviços antes de iniciar um levantamento técnico.');
});

test('registra interesse de Primeiro contato para Qualificação e mantém o alias legado', () => {
  const current = {
    opportunities: [{ id: 'opp-1', stage: 'Primeiro contato' }],
    surveys: [], appointments: [], quotes: []
  };
  const qualified = { ...current, opportunities: [{ id: 'opp-1', stage: 'Qualificação', interests: 'Rede', needs: 'Cobertura', initialScope: 'Sala' }] };
  assert.equal(workflow.validate(current, qualified).ok, true);
  const legacy = { ...current, opportunities: [{ id: 'opp-1', stage: 'Novo contato' }] };
  assert.equal(workflow.validate(legacy, { ...legacy, opportunities: [{ id: 'opp-1', stage: 'Qualificação', interests: 'Rede', needs: 'Cobertura', initialScope: 'Sala' }] }).ok, true);
  assert.equal(workflow.canonicalStage('Novo contato'), 'Primeiro contato');
});

test('exige interesses, necessidades e escopo para a Qualificação de serviços', () => {
  const current = { opportunities: [{ id: 'opp-1', stage: 'Primeiro contato' }], surveys: [], appointments: [], quotes: [] };
  const incomplete = { ...current, opportunities: [{ id: 'opp-1', stage: 'Qualificação de serviços' }] };
  assert.equal(workflow.validate(current, incomplete).message, 'A Qualificação de serviços exige interesses, necessidades e escopo inicial.');
  const qualified = { ...current, opportunities: [{ id: 'opp-1', stage: 'Qualificação de serviços', interests: 'Automação', needs: 'Controle de iluminação', initialScope: 'Sala e cozinha' }] };
  assert.equal(workflow.validate(current, qualified).ok, true);
});

test('permite Orçamento diretamente após diagrama validado e remove Visita das oportunidades', () => {
  const qualified = { opportunities: [{ id: 'opp-1', stage: 'Qualificação de serviços', interests: 'Rede', needs: 'Cobertura Wi-Fi', initialScope: 'Casa térrea' }], surveys: [], surveyPoints: [], appointments: [], quotes: [] };
  const diagram = { ...qualified, opportunities: [{ ...qualified.opportunities[0], stage: 'Levantamento técnico' }], surveys: [{ id: 'survey-1', opportunityId: 'opp-1', status: 'Validado' }], surveyPoints: [{ id: 'point-1', surveyId: 'survey-1', room: 'Sala', type: 'Ponto de rede', quantity: 2 }] };
  const withoutVisit = { ...diagram, opportunities: [{ ...diagram.opportunities[0], stage: 'Orçamento' }], quotes: [{ id: 'quote-1', opportunityId: 'opp-1' }] };
  assert.equal(workflow.validate(diagram, withoutVisit).ok, true);
  const invalidVisit = { ...qualified, opportunities: [{ ...qualified.opportunities[0], stage: 'Visita técnica' }] };
  assert.equal(workflow.validate(qualified, invalidVisit).message, 'Visita técnica não é uma etapa de Oportunidades; conclua o levantamento técnico antes do orçamento.');
  assert.equal(workflow.canonicalStage('Visita'), 'Levantamento técnico');
  assert.deepEqual(workflow.stages, ['Primeiro contato', 'Qualificação de serviços', 'Levantamento técnico', 'Orçamento']);
});

test('permite iniciar levantamento qualificado e seguir diretamente para orçamento', () => {
  const current = base();
  const withSurvey = {
    ...current,
    opportunities: [{ id: 'opp-1', stage: 'Levantamento técnico' }],
    surveys: [{ id: 'survey-1', opportunityId: 'opp-1', status: 'Validado' }],
    surveyPoints: [{ id: 'point-1', surveyId: 'survey-1', room: 'Sala', type: 'Ponto de rede', quantity: 1 }]
  };
  assert.equal(workflow.validate(current, withSurvey).ok, true);
  const directQuote = { ...withSurvey, opportunities: [{ id: 'opp-1', stage: 'Orçamento' }], quotes: [{ id: 'quote-1', opportunityId: 'opp-1' }] };
  assert.equal(workflow.validate(withSurvey, directQuote).ok, true);
});

test('não invalida registros legados inalterados ao salvar outra área', () => {
  const current = { opportunities: [], surveys: [{ id: 'legacy-survey', title: 'Legado' }], appointments: [], quotes: [] };
  const next = { ...current, clients: [{ id: 'client-1', name: 'Novo cliente' }] };
  assert.equal(workflow.validate(current, next).ok, true);
});

test('reconcilia os sete registros legados e é idempotente', () => {
  const current = {
    opportunities: [
      ...Array.from({ length: 4 }, (_, index) => ({ id: `survey-${index + 1}`, company: `Legado levantamento ${index + 1}`, stage: 'Novo contato' })),
      ...Array.from({ length: 2 }, (_, index) => ({ id: `visit-${index + 1}`, company: `Legado visita ${index + 1}`, stage: 'Novo contato' })),
      { id: 'quote-1', company: 'Legado orçamento', stage: 'Levantamento técnico', notes: 'preservar' },
      { id: 'won-1', company: 'Legado ganho', stage: 'Ganho' },
      { id: 'lost-1', company: 'Legado perdido', stage: 'Perdido' }
    ],
    surveys: [
      ...Array.from({ length: 4 }, (_, index) => ({ id: `survey-record-${index + 1}`, opportunityId: `survey-${index + 1}` })),
      ...Array.from({ length: 2 }, (_, index) => ({ id: `visit-survey-${index + 1}`, opportunityId: `visit-${index + 1}` })),
      { id: 'quote-survey', opportunityId: 'quote-1' }
    ],
    appointments: [
      { id: 'visit-record-1', opportunityId: 'visit-1', surveyId: 'visit-survey-1', type: 'Visita técnica', status: 'Iniciada' },
      { id: 'visit-record-2', opportunityId: 'visit-2', surveyId: 'visit-survey-2', visit: true, status: 'Agendado' }
    ],
    quotes: [{ id: 'quote-record', opportunityId: 'quote-1', status: 'Em elaboração' }],
    auditLog: [{ id: 'audit-existing', action: 'existente' }]
  };
  const first = workflow.reconcileLegacyStages(current);
  assert.equal(first.changes.length, 7);
  assert.deepEqual(first.data.opportunities.slice(0, 7).map(item => item.stage), [
    'Levantamento técnico', 'Levantamento técnico', 'Levantamento técnico', 'Levantamento técnico',
    'Levantamento técnico', 'Levantamento técnico', 'Orçamento'
  ]);
  assert.equal(first.data.opportunities.find(item => item.id === 'won-1').stage, 'Ganho');
  assert.equal(first.data.opportunities.find(item => item.id === 'lost-1').stage, 'Perdido');
  assert.equal(first.data.opportunities.find(item => item.id === 'quote-1').notes, 'preservar');
  assert.equal(first.data.auditLog[0].id, 'audit-existing');
  assert.equal(current.opportunities[0].stage, 'Novo contato');
  const second = workflow.reconcileLegacyStages(first.data);
  assert.equal(second.changes.length, 0);
  assert.deepEqual(second.data, first.data);
});
