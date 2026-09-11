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

test('validação concluída registra autoria, avança a oportunidade e cria orçamento vinculado', () => {
  const current = base();
  const next = workflow.applyValidatedSurveyTransition(current, {
    ...current,
    opportunities: [{ ...current.opportunities[0], stage: 'Levantamento técnico' }],
    surveys: [{ id: 'survey-1', opportunityId: 'opp-1', status: 'Validado' }],
    surveyPoints: [{ id: 'point-1', surveyId: 'survey-1', room: 'Sala', type: 'Ponto de rede Cat6', quantity: 1 }]
  }, 'Ana Teste', '2026-09-06T20:30:00.000Z');
  assert.equal(next.opportunities[0].stage, 'Orçamento');
  assert.equal(next.surveys[0].validatedBy, 'Ana Teste');
  assert.equal(next.surveys[0].validatedAt, '2026-09-06T20:30:00.000Z');
  assert.equal(next.opportunities[0].validatedBy, 'Ana Teste');
  assert.equal(next.opportunities[0].validatedAt, '2026-09-06T20:30:00.000Z');
  assert.equal(next.quotes[0].opportunityId, 'opp-1');
  assert.equal(next.quotes[0].technicalSurveyId, 'survey-1');
  assert.equal(workflow.validate(current, next).ok, true);
  const reloaded = workflow.applyValidatedSurveyTransition(next, structuredClone(next), 'Outro usuário', '2026-09-06T21:00:00.000Z');
  assert.equal(reloaded.surveys[0].validatedBy, 'Ana Teste');
  assert.equal(reloaded.surveys[0].validatedAt, '2026-09-06T20:30:00.000Z');
  assert.equal(reloaded.opportunities[0].validatedBy, 'Ana Teste');
  assert.equal(reloaded.opportunities[0].validatedAt, '2026-09-06T20:30:00.000Z');
  assert.equal(reloaded.quotes.filter(item => item.technicalSurveyId === 'survey-1').length, 1);
});

test('converte levantamento residencial em itens de catálogo e mantém o total idempotente', () => {
  const data = {
    products: [
      { id: 'central', name: 'Controladora compacta Embrace Lite', technicalType: 'Central de automação', price: 6000, cost: 5000, active: true },
      { id: 'keypad', name: 'Kit keypad 1 acionamento Virtue', technicalType: 'Interface de automação', price: 300, cost: 200, active: true },
      { id: 'relay', name: 'Módulo relé 8 canais', technicalType: 'Módulo de iluminação', price: 2800, cost: 2300, active: true },
      { id: 'switch', name: 'Switch UniFi Pro Max 24 PoE', technicalType: 'Switch de rede', price: 14000, cost: 11000, active: true },
      { id: 'ap', name: 'Access Point UniFi U7 Pro', technicalType: 'Ponto de rede Wi-Fi', price: 2500, cost: 1800, active: true },
      { id: 'cable', name: 'Cabo de rede Cat6', technicalType: 'Cabo de rede', unit: 'm', price: 8, cost: 4, active: true }
    ],
    surveys: [{ id: 'survey-residential', opportunityId: 'opp-1', status: 'Enviado ao orçamento' }],
    surveyPoints: [
      { id: 'automation-point', surveyId: 'survey-residential', room: 'Sala', type: 'Automação geral', quantity: 1 },
      { id: 'wifi-point', surveyId: 'survey-residential', room: 'Sala', type: 'Wi-Fi', quantity: 1 },
      { id: 'network-point', surveyId: 'survey-residential', room: 'Sala', type: 'Pontos de rede', quantity: 2 },
      { id: 'lighting-point', surveyId: 'survey-residential', room: 'Sala', type: 'Circuito de iluminacao / retorno', quantity: 3 }
    ],
    surveyRooms: [{ id: 'survey-room', surveyId: 'survey-residential', name: 'Sala' }],
    quotes: [{ id: 'quote-1', opportunityId: 'opp-1', technicalSurveyId: 'survey-residential', value: 0 }],
    quoteRooms: [{ id: 'quote-room', quoteId: 'quote-1', name: 'Sala', items: [] }]
  };

  const first = workflow.populateQuoteFromSurvey(data, 'survey-residential', 'quote-1', prefix => `${prefix}-new`);
  const itemCount = data.quoteRooms.reduce((sum, room) => sum + room.items.length, 0);
  assert.equal(first.added, 6);
  assert.equal(itemCount, 6);
  assert.equal(data.quotes[0].value, 26080);
  assert.ok(data.quoteRooms.find(room => room.name === 'Infraestrutura técnica').items.some(item => item.productId === 'relay'));

  const second = workflow.populateQuoteFromSurvey(data, 'survey-residential', 'quote-1', prefix => `${prefix}-new`);
  assert.equal(second.added, 0);
  assert.equal(second.updated, 6);
  assert.equal(data.quoteRooms.reduce((sum, room) => sum + room.items.length, 0), 6);
  assert.equal(data.quotes[0].value, 26080);
});

test('não duplica levantamento ao reutilizar a oportunidade', () => {
  const current = { ...base(), surveys: [{ id: 'survey-1', opportunityId: 'opp-1', status: 'Em levantamento' }] };
  const duplicate = { ...current, surveys: [...current.surveys, { id: 'survey-2', opportunityId: 'opp-1', status: 'Em levantamento' }] };
  assert.equal(workflow.validate(current, duplicate).message, 'Esta oportunidade já possui um levantamento técnico; abra o registro existente para continuar.');
});

test('bloqueia orçamento órfão ou sem levantamento concluído', () => {
  const current = base();
  assert.equal(workflow.validate(current, { ...current, quotes: [{ id: 'quote-1' }] }).message,
    'O orçamento deve ser criado a partir de uma oportunidade.');
  const linkedWithoutSurvey = { ...current, quotes: [{ id: 'quote-1', opportunityId: 'opp-1' }] };
  assert.equal(workflow.validate(current, linkedWithoutSurvey).message,
    'O orçamento exige levantamento técnico validado com ao menos um ponto técnico.');
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
