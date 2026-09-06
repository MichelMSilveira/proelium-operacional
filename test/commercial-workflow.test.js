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
    'Visita', 'Visita', 'Orçamento'
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
