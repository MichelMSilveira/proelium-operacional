(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ProeliumCommercialWorkflow = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const stages = ['Primeiro contato', 'Qualificação', 'Levantamento técnico', 'Visita', 'Orçamento'];
  const legacyStageAliases = { 'Novo contato': 'Primeiro contato' };
  const terminalStages = ['Ganho', 'Perdido'];

  const list = (data, key) => Array.isArray(data?.[key]) ? data[key] : [];
  const byId = (items, id) => items.find(item => String(item?.id) === String(id));
  const changedRecords = (current, next, key) => {
    const previous = new Map(list(current, key).map(item => [String(item.id), item]));
    return list(next, key).filter(item => {
      const old = previous.get(String(item.id));
      return !old || JSON.stringify(old) !== JSON.stringify(item);
    });
  };
  const canonicalStage = stage => legacyStageAliases[stage] || stage;
  const stageIndex = stage => stages.indexOf(canonicalStage(stage));
  const isVisit = appointment => Boolean(appointment && (
    appointment.type === 'Visita técnica' || appointment.visit === true || appointment.visitId || appointment.surveyId
  ));
  const visitsFor = (data, opportunityId, surveyId = '') => list(data, 'appointments').filter(appointment => (
    String(appointment.opportunityId || '') === String(opportunityId) &&
    (!surveyId || String(appointment.surveyId || '') === String(surveyId)) &&
    isVisit(appointment) && appointment.status !== 'Cancelado'
  ));
  const hasApprovedQuote = (data, opportunityId) => list(data, 'quotes').some(quote => (
    String(quote.opportunityId || '') === String(opportunityId) && quote.status === 'Aprovado'
  ));

  function reconcileLegacyStages(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const changes = [];
    const next = { ...source };
    next.opportunities = list(source, 'opportunities').map(opportunity => {
      if (terminalStages.includes(opportunity.stage)) return opportunity;
      const linkedSurveys = list(source, 'surveys').filter(survey => String(survey.opportunityId || '') === String(opportunity.id));
      const linkedVisits = visitsFor(source, opportunity.id);
      const linkedQuotes = list(source, 'quotes').filter(quote => String(quote.opportunityId || '') === String(opportunity.id));
      const target = linkedQuotes.length ? 'Orçamento' : linkedVisits.length ? 'Visita' : linkedSurveys.length ? 'Levantamento técnico' : '';
      const currentIndex = stageIndex(opportunity.stage);
      const targetIndex = stageIndex(target);
      if (!target || (currentIndex >= 0 && targetIndex <= currentIndex)) return opportunity;
      const reason = linkedQuotes.length ? 'orçamento vinculado' : linkedVisits.length ? 'visita técnica ativa' : 'levantamento técnico vinculado';
      changes.push({
        opportunityId: opportunity.id,
        company: opportunity.company || opportunity.title || opportunity.id,
        from: opportunity.stage || 'Sem etapa',
        to: target,
        reason
      });
      return { ...opportunity, stage: target };
    });
    return { data: next, changes };
  }

  function validate(currentData = {}, nextData = {}) {
    const current = currentData || {};
    const next = nextData || {};
    const opportunities = list(next, 'opportunities');
    const surveys = list(next, 'surveys');
    const quotes = list(next, 'quotes');
    const appointments = list(next, 'appointments');
    const error = message => ({ ok: false, message });

    for (const survey of changedRecords(current, next, 'surveys')) {
      const opportunity = byId(opportunities, survey.opportunityId);
      if (!survey.opportunityId || !opportunity) return error('Todo levantamento técnico deve estar vinculado a uma oportunidade existente.');
      const previousOpportunity = byId(list(current, 'opportunities'), opportunity.id);
      const previousStage = previousOpportunity?.stage;
      const isNew = !byId(list(current, 'surveys'), survey.id);
      if (isNew && !['Qualificação', 'Levantamento técnico', 'Visita', 'Orçamento', 'Ganho', 'Perdido'].includes(previousStage || opportunity.stage)) {
        return error('A oportunidade precisa estar em Qualificação antes de iniciar um levantamento técnico.');
      }
    }

    for (const appointment of changedRecords(current, next, 'appointments')) {
      if (!isVisit(appointment)) continue;
      const survey = byId(surveys, appointment.surveyId);
      const opportunity = byId(opportunities, appointment.opportunityId);
      if (!appointment.opportunityId || !opportunity || !appointment.surveyId || !survey) {
        return error('A visita técnica deve estar vinculada a uma oportunidade e a um levantamento.');
      }
    }

    for (const quote of changedRecords(current, next, 'quotes')) {
      const isNew = !byId(list(current, 'quotes'), quote.id);
      if (!isNew && !quote.opportunityId) continue;
      const opportunity = byId(opportunities, quote.opportunityId);
      if (!quote.opportunityId || !opportunity) return error('O orçamento deve ser criado a partir de uma oportunidade.');
      if (!visitsFor(next, opportunity.id).length) return error('O orçamento só pode ser criado após uma visita técnica.');
    }

    for (const opportunity of changedRecords(current, next, 'opportunities')) {
      const old = byId(list(current, 'opportunities'), opportunity.id);
      if (!old) {
        if (['Primeiro contato', 'Novo contato', 'Qualificação'].includes(opportunity.stage)) continue;
        if (opportunity.stage === 'Levantamento técnico' && surveys.some(survey => String(survey.opportunityId) === String(opportunity.id))) continue;
        if (opportunity.stage === 'Visita' && surveys.some(survey => String(survey.opportunityId) === String(opportunity.id)) && visitsFor(next, opportunity.id).length) continue;
        if (opportunity.stage === 'Orçamento' && visitsFor(next, opportunity.id).length) continue;
        if (opportunity.stage === 'Ganho' && hasApprovedQuote(next, opportunity.id)) continue;
        if (opportunity.stage === 'Perdido' && quotes.some(quote => String(quote.opportunityId) === String(opportunity.id))) continue;
        return error('Uma nova oportunidade deve respeitar as etapas e vínculos do fluxo comercial.');
      }
      if (old.stage === opportunity.stage) continue;
      const from = stageIndex(old.stage);
      const to = stageIndex(opportunity.stage);
      if (terminalStages.includes(opportunity.stage)) continue;
      if (to < 0) return error('Etapa comercial inválida.');
      if (opportunity.stage === 'Qualificação' && canonicalStage(old.stage) !== 'Primeiro contato') {
        return error('A oportunidade só pode entrar em Qualificação a partir de Primeiro contato.');
      }
      if (opportunity.stage === 'Levantamento técnico') {
        if (old.stage !== 'Qualificação' || !surveys.some(survey => String(survey.opportunityId) === String(opportunity.id))) {
          return error('A etapa Levantamento técnico exige uma oportunidade qualificada e um levantamento vinculado.');
        }
      }
      if (opportunity.stage === 'Visita') {
        if (from < stageIndex('Levantamento técnico') || !surveys.some(survey => String(survey.opportunityId) === String(opportunity.id)) || !visitsFor(next, opportunity.id).length) {
          return error('A visita só pode ser iniciada após o levantamento técnico.');
        }
      }
      if (opportunity.stage === 'Orçamento') {
        if (from < stageIndex('Visita') || !visitsFor(next, opportunity.id).length) {
          return error('O orçamento só pode ser criado após a visita técnica.');
        }
      }
      if (opportunity.stage === 'Ganho' && !hasApprovedQuote(next, opportunity.id)) {
        return error('A oportunidade só pode ser ganha a partir de um orçamento aprovado.');
      }
      if (from >= 0 && to > from + 1 && opportunity.stage !== 'Ganho') {
        return error('A oportunidade deve seguir as etapas comerciais na ordem definida.');
      }
    }

    return { ok: true };
  }

  return { stages, terminalStages, legacyStageAliases, canonicalStage, isVisit, visitsFor, reconcileLegacyStages, validate };
}));
