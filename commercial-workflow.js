(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ProeliumCommercialWorkflow = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const stages = ['Primeiro contato', 'Qualificação de serviços', 'Levantamento técnico', 'Orçamento'];
  const legacyStageAliases = { 'Novo contato': 'Primeiro contato', 'Qualificação': 'Qualificação de serviços', 'Visita': 'Levantamento técnico', 'Visita técnica': 'Levantamento técnico' };
  const removedVisitStages = new Set(['Visita', 'Visita técnica']);
  const qualificationFields = ['interests', 'needs', 'initialScope'];
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
  const surveyReadyForQuote = (data, opportunityId) => list(data, 'surveys').some(survey => String(survey.opportunityId || '') === String(opportunityId) && (
    survey.status === 'Validado' || survey.status === 'Enviado ao orçamento'
  ) && list(data, 'surveyPoints').some(point => String(point.surveyId || '') === String(survey.id) && Number(point.quantity || 0) > 0));

  function applyValidatedSurveyTransition(currentData = {}, nextData = {}, actor = '', validatedAt = '') {
    const next = structuredClone(nextData || {});
    const currentSurveys = list(currentData, 'surveys');
    const now = validatedAt || new Date().toISOString();
    for (const survey of list(next, 'surveys')) {
      const previous = byId(currentSurveys, survey.id);
      const ready = surveyReadyForQuote(next, survey.opportunityId);
      if (!ready) continue;
      if (previous?.validatedAt) {
        survey.validatedBy = previous.validatedBy;
        survey.validatedAt = previous.validatedAt;
      } else {
        survey.validatedBy = survey.validatedBy || actor || 'Usuário autenticado';
        survey.validatedAt = survey.validatedAt || now;
      }
      const opportunity = byId(list(next, 'opportunities'), survey.opportunityId);
      if (opportunity) {
        opportunity.validatedBy = opportunity.validatedBy || survey.validatedBy;
        opportunity.validatedAt = opportunity.validatedAt || survey.validatedAt;
      }
      if (opportunity && ['Qualificação de serviços', 'Levantamento técnico'].includes(canonicalStage(opportunity.stage))) {
        opportunity.stage = 'Orçamento';
      }
      if (!Array.isArray(next.quotes)) next.quotes = [];
      let quote = next.quotes.find(item => String(item.opportunityId || '') === String(survey.opportunityId) && item.status === 'Aprovado') ||
        next.quotes.find(item => String(item.opportunityId || '') === String(survey.opportunityId) && item.status !== 'Aprovado');
      if (!quote) {
        quote = { id: `orc-${survey.id}`, opportunityId: survey.opportunityId, technicalSurveyId: survey.id, clientId: '', title: `Proposta — ${opportunity?.company || survey.title}`, value: 0, status: 'Em elaboração', createdAt: now };
        next.quotes.unshift(quote);
      } else if (!quote.technicalSurveyId) quote.technicalSurveyId = survey.id;
    }
    return next;
  }

  function reconcileLegacyStages(input = {}) {
    const source = input && typeof input === 'object' ? input : {};
    const changes = [];
    const next = { ...source };
    next.opportunities = list(source, 'opportunities').map(opportunity => {
      if (terminalStages.includes(opportunity.stage)) return opportunity;
      const linkedSurveys = list(source, 'surveys').filter(survey => String(survey.opportunityId || '') === String(opportunity.id));
      const linkedVisits = visitsFor(source, opportunity.id);
      const linkedQuotes = list(source, 'quotes').filter(quote => String(quote.opportunityId || '') === String(opportunity.id));
      const target = linkedQuotes.length ? 'Orçamento' : linkedSurveys.length || linkedVisits.length ? 'Levantamento técnico' : '';
      const currentIndex = stageIndex(opportunity.stage);
      const targetIndex = stageIndex(target);
      if (!target || (currentIndex >= 0 && targetIndex <= currentIndex)) return opportunity;
      const reason = linkedQuotes.length ? 'orçamento vinculado' : linkedVisits.length ? 'visita técnica legada vinculada ao levantamento' : 'levantamento técnico vinculado';
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
  const surveyPoints = list(next, 'surveyPoints');
  const quotes = list(next, 'quotes');
  const appointments = list(next, 'appointments');
  const surveyReadyForQuote = opportunityId => surveys.some(survey => String(survey.opportunityId || '') === String(opportunityId) && (
    survey.status === 'Validado' || survey.status === 'Enviado ao orçamento'
  ) && surveyPoints.some(point => String(point.surveyId || '') === String(survey.id) && Number(point.quantity || 0) > 0));
    const error = message => ({ ok: false, message });

    for (const survey of changedRecords(current, next, 'surveys')) {
      const opportunity = byId(opportunities, survey.opportunityId);
      if (!survey.opportunityId || !opportunity) return error('Todo levantamento técnico deve estar vinculado a uma oportunidade existente.');
      const previousOpportunity = byId(list(current, 'opportunities'), opportunity.id);
      const previousStage = previousOpportunity?.stage;
      const isNew = !byId(list(current, 'surveys'), survey.id);
      if (isNew && list(current, 'surveys').some(item => String(item.opportunityId || '') === String(survey.opportunityId))) {
        return error('Esta oportunidade já possui um levantamento técnico; abra o registro existente para continuar.');
      }
      if (isNew && !['Qualificação de serviços', 'Qualificação', 'Levantamento técnico', 'Orçamento', 'Ganho', 'Perdido'].includes(canonicalStage(previousStage || opportunity.stage))) {
        return error('A oportunidade precisa estar em Qualificação de serviços antes de iniciar um levantamento técnico.');
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
      if (!surveyReadyForQuote(opportunity.id)) {
        return error('O orçamento exige levantamento técnico validado com ao menos um ponto técnico.');
      }
    }

    for (const opportunity of changedRecords(current, next, 'opportunities')) {
      const old = byId(list(current, 'opportunities'), opportunity.id);
      if (!old) {
        if (removedVisitStages.has(opportunity.stage)) return error('Visita técnica não é uma etapa de Oportunidades; conclua o levantamento técnico antes do orçamento.');
        if (canonicalStage(opportunity.stage) === 'Primeiro contato') continue;
        if (canonicalStage(opportunity.stage) === 'Qualificação de serviços') {
          if (qualificationFields.every(field => String(opportunity[field] || '').trim())) continue;
          return error('A Qualificação de serviços exige interesses, necessidades e escopo inicial.');
        }
        if (opportunity.stage === 'Levantamento técnico' && surveys.some(survey => String(survey.opportunityId) === String(opportunity.id))) continue;
        if (opportunity.stage === 'Orçamento' && surveyReadyForQuote(opportunity.id)) continue;
        if (opportunity.stage === 'Ganho' && hasApprovedQuote(next, opportunity.id)) continue;
        if (opportunity.stage === 'Perdido' && quotes.some(quote => String(quote.opportunityId) === String(opportunity.id))) continue;
        return error('Uma nova oportunidade deve respeitar as etapas e vínculos do fluxo comercial.');
      }
      if (old.stage === opportunity.stage) continue;
      const from = stageIndex(old.stage);
      const to = stageIndex(opportunity.stage);
      if (terminalStages.includes(opportunity.stage)) continue;
      if (removedVisitStages.has(opportunity.stage)) return error('Visita técnica não é uma etapa de Oportunidades; conclua o levantamento técnico antes do orçamento.');
      if (to < 0) return error('Etapa comercial inválida.');
      if (canonicalStage(opportunity.stage) === 'Qualificação de serviços' && canonicalStage(old.stage) !== 'Primeiro contato') {
        return error('A oportunidade só pode entrar em Qualificação de serviços a partir de Primeiro contato.');
      }
      if (canonicalStage(opportunity.stage) === 'Qualificação de serviços' && !qualificationFields.every(field => String(opportunity[field] || '').trim())) {
        return error('A Qualificação de serviços exige interesses, necessidades e escopo inicial.');
      }
      if (opportunity.stage === 'Levantamento técnico') {
        if (canonicalStage(old.stage) !== 'Qualificação de serviços' || !surveys.some(survey => String(survey.opportunityId) === String(opportunity.id))) {
          return error('A etapa Levantamento técnico exige uma oportunidade qualificada e um levantamento vinculado.');
        }
      }
      if (opportunity.stage === 'Orçamento') {
        const legacyVisitPath = removedVisitStages.has(old.stage) && visitsFor(next, opportunity.id).length;
        const surveyValidationTransition = changedRecords(current, next, 'surveys').some(survey => String(survey.opportunityId || '') === String(opportunity.id) && surveyReadyForQuote(opportunity.id));
        if (!['Levantamento técnico', 'Qualificação de serviços'].includes(canonicalStage(old.stage)) || (!surveyReadyForQuote(opportunity.id) && !legacyVisitPath)) {
          return error('O orçamento exige levantamento técnico validado com ao menos um ponto técnico.');
        }
        if (canonicalStage(old.stage) === 'Qualificação de serviços' && !surveyValidationTransition) {
          return error('O orçamento exige avanço a partir de um levantamento técnico validado.');
        }
      }
      if (opportunity.stage === 'Ganho' && !hasApprovedQuote(next, opportunity.id)) {
        return error('A oportunidade só pode ser ganha a partir de um orçamento aprovado.');
      }
      const directQuoteAfterSurvey = opportunity.stage === 'Orçamento' && ['Levantamento técnico', 'Qualificação de serviços'].includes(canonicalStage(old.stage)) && surveyReadyForQuote(opportunity.id);
      if (from >= 0 && to > from + 1 && opportunity.stage !== 'Ganho' && !directQuoteAfterSurvey) {
        return error('A oportunidade deve seguir as etapas comerciais na ordem definida.');
      }
    }

    return { ok: true };
  }

  return { stages, terminalStages, legacyStageAliases, qualificationFields, canonicalStage, isVisit, visitsFor, reconcileLegacyStages, applyValidatedSurveyTransition, validate };
}));
// Compacta os cartões comerciais no mobile sem alterar dados nem regras do fluxo principal.
(()=>{
  if(typeof document==='undefined')return;
  const compactLabel=button=>{
    if(!button||button.dataset.mobileLabelReady)return;
    const full=button.textContent.trim(),short=button.matches('[data-qualify-opportunity]')?'Qualificar →':button.matches('[data-start-survey-opportunity]')?'Iniciar levantamento':button.matches('[data-open-commercial-survey]')?'Continuar levantamento':button.matches('[data-survey-start-quote]')?'Criar orçamento →':button.matches('[data-open-commercial-quote]')?'Ver orçamento':'Abrir cliente';
    button.textContent='';
    const desktop=document.createElement('span'),mobile=document.createElement('span');
    desktop.className='commercial-action-full';desktop.textContent=full;
    mobile.className='commercial-action-compact';mobile.textContent=short;
    button.append(desktop,mobile);button.dataset.mobileLabelReady='true';
  };
  const enhance=()=>document.querySelectorAll('.commercial-deal').forEach(card=>{
    const actions=card.querySelector('.deal-actions'),remove=card.querySelector('[data-delete-opportunity]');
    if(!actions||!remove)return;
    compactLabel(actions.querySelector('.button.primary'));
    const paragraphs=[...card.children].filter(element=>element.tagName==='P');
    paragraphs[paragraphs.length-1]?.classList.add('commercial-next-action');
    if(!card.querySelector('.commercial-mobile-details')){
      const details=document.createElement('details');details.className='commercial-mobile-details';
      const summary=document.createElement('summary');summary.textContent='Detalhes';
      const content=document.createElement('div'),contact=card.querySelector('.commercial-contact-details'),value=card.querySelector('.deal-value'),orientation=card.querySelector('.commercial-next-step');
      [contact,value,orientation].forEach(element=>{if(element){const row=document.createElement(element===orientation?'small':'span');row.textContent=element.textContent;content.append(row)}});
      details.append(summary,content);actions.before(details);
    }
    if(!remove.closest('.commercial-actions-menu')){
      const menu=document.createElement('details');menu.className='commercial-actions-menu';
      const summary=document.createElement('summary');summary.textContent='⋮';summary.setAttribute('aria-label','Mais ações');summary.title='Mais ações';
      remove.textContent='Excluir oportunidade';remove.before(menu);menu.append(summary,remove);
    }
  });
  new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});
  enhance();
})();
