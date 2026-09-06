const test = require('node:test');
const assert = require('node:assert/strict');
const workflow = require('../commercial-workflow');

const base = () => ({
  opportunities: [{ id: 'opp-1', stage: 'Qualificação' }],
  surveys: [],
  appointments: [],
  quotes: []
});

test('bloqueia levantamento sem oportunidade ou antes da qualificação', () => {
  const current = base();
  assert.equal(workflow.validate(current, { ...current, surveys: [{ id: 'survey-1' }] }).ok, false);
  const novoContato = { ...current, opportunities: [{ id: 'opp-1', stage: 'Novo contato' }] };
  assert.equal(workflow.validate(novoContato, { ...novoContato, surveys: [{ id: 'survey-1', opportunityId: 'opp-1' }] }).message,
    'A oportunidade precisa estar em Qualificação antes de iniciar um levantamento técnico.');
});

test('permite iniciar levantamento qualificado e exige visita antes do orçamento', () => {
  const current = base();
  const withSurvey = {
    ...current,
    opportunities: [{ id: 'opp-1', stage: 'Levantamento técnico' }],
    surveys: [{ id: 'survey-1', opportunityId: 'opp-1', status: 'Validado' }]
  };
  assert.equal(workflow.validate(current, withSurvey).ok, true);
  const withoutVisitQuote = { ...withSurvey, opportunities: [{ id: 'opp-1', stage: 'Orçamento' }], quotes: [{ id: 'quote-1', opportunityId: 'opp-1' }] };
  assert.equal(workflow.validate(withSurvey, withoutVisitQuote).message, 'O orçamento só pode ser criado após uma visita técnica.');
  const withVisit = {
    ...withSurvey,
    opportunities: [{ id: 'opp-1', stage: 'Visita' }],
    appointments: [{ id: 'visit-1', opportunityId: 'opp-1', surveyId: 'survey-1', type: 'Visita técnica', status: 'Iniciada' }]
  };
  assert.equal(workflow.validate(withSurvey, withVisit).ok, true);
  const withQuote = { ...withVisit, opportunities: [{ id: 'opp-1', stage: 'Orçamento' }], quotes: [{ id: 'quote-1', opportunityId: 'opp-1' }] };
  assert.equal(workflow.validate(withVisit, withQuote).ok, true);
});

test('não invalida registros legados inalterados ao salvar outra área', () => {
  const current = { opportunities: [], surveys: [{ id: 'legacy-survey', title: 'Legado' }], appointments: [], quotes: [] };
  const next = { ...current, clients: [{ id: 'client-1', name: 'Novo cliente' }] };
  assert.equal(workflow.validate(current, next).ok, true);
});
