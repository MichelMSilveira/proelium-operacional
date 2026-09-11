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

  const normalizeSearchText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[‑–—]/g, '-').toLocaleLowerCase('pt-BR');
  const productPrice = product => Number(product?.price ?? product?.extraData?.price ?? product?.extraData?.salePrice ?? product?.extraData?.valor ?? 0);
  const productCost = product => Number(product?.cost ?? product?.extraData?.cost ?? product?.extraData?.costPrice ?? product?.extraData?.custo ?? 0);
  const productSearchText = product => normalizeSearchText(`${product?.name || ''} ${product?.brand || ''} ${product?.model || ''} ${product?.category || ''} ${product?.technicalType || ''} ${product?.technicalFunction || ''}`);
  const pickCatalogProduct = (products, patterns) => {
    const candidates = Array.isArray(products) ? products.filter(product => product && product.active !== false) : [];
    const scored = candidates.map(product => {
      const text = productSearchText(product);
      const score = patterns.reduce((total, pattern, index) => total + (pattern.test(text) ? patterns.length - index : 0), 0);
      return { product, score };
    }).filter(item => item.score > 0);
    scored.sort((left, right) => (productPrice(right.product) > 0 ? 1 : 0) - (productPrice(left.product) > 0 ? 1 : 0) || right.score - left.score || productPrice(left.product) - productPrice(right.product) || String(left.product.name || '').localeCompare(String(right.product.name || ''), 'pt-BR'));
    return scored[0]?.product || null;
  };
  const productForSurveyPoint = (products, point) => {
    const explicit = (products || []).find(product => String(product?.id || '') === String(point?.sourceProductId || ''));
    if (explicit && explicit.active !== false) return explicit;
    const text = normalizeSearchText(`${point?.type || ''} ${point?.technology || ''} ${point?.technicalType || ''} ${point?.technicalFunction || ''}`);
    if (/wi\s*-?\s*fi|access\s*point/.test(text)) return pickCatalogProduct(products, [/ponto de rede wi/, /access\s*point/, /wi\s*-?\s*fi/]);
    if (/pontos? de rede|rede cabeada|cat\s*6/.test(text)) return pickCatalogProduct(products, [/switch de rede/, /switch/, /cabo.*(?:cat\s*6|categoria\s*6)/, /cabo de rede/]);
    if (/circuito.*ilumin|ilumin.*(?:rele|dimmer)|dimmer|pwm/.test(text)) return pickCatalogProduct(products, [/modulo rele.*8 canais/, /modulo dimmer.*8 canais/, /modulo de iluminacao/]);
    if (/automacao geral|automacao|keypad|pulsador/.test(text)) return pickCatalogProduct(products, [/keypad.*1 acionamento/, /interface de automacao/, /central de automacao/]);
    return null;
  };
  const itemQuantity = (product, quantity, kind) => {
    const value = Math.max(1, Number(quantity || 1));
    if (kind === 'lighting') return Math.max(1, Math.ceil(value / 8));
    if (kind === 'network-cable') return String(product?.unit || '').toLocaleLowerCase('pt-BR') === 'm' ? value * 30 : Math.max(1, Math.ceil(value * 30 / 305));
    if (kind === 'network-switch') return Math.max(1, Math.ceil(value / 24));
    return value;
  };
  const quoteValue = (data, quoteId) => (Array.isArray(data?.quoteRooms) ? data.quoteRooms : []).filter(room => String(room?.quoteId || '') === String(quoteId)).reduce((total, room) => total + (Array.isArray(room?.items) ? room.items : []).reduce((sum, item) => {
    const product = (Array.isArray(data?.products) ? data.products : []).find(candidate => String(candidate?.id || '') === String(item?.productId || ''));
    const discount = Math.max(0, Math.min(100, Number(item?.discount || 0)));
    return sum + productPrice(product) * Number(item?.qty || 0) * (1 - discount / 100);
  }, 0), 0);
  const quoteCost = (data, quoteId) => (Array.isArray(data?.quoteRooms) ? data.quoteRooms : []).filter(room => String(room?.quoteId || '') === String(quoteId)).reduce((total, room) => total + (Array.isArray(room?.items) ? room.items : []).reduce((sum, item) => {
    const product = (Array.isArray(data?.products) ? data.products : []).find(candidate => String(candidate?.id || '') === String(item?.productId || ''));
    const discount = Math.max(0, Math.min(100, Number(item?.discount || 0)));
    return sum + productCost(product) * Number(item?.qty || 0) * (1 - discount / 100);
  }, 0), 0);

  function ensurePreProjectFromQuote(data = {}, surveyId, quoteId, makeId = prefix => `${prefix}-${Date.now().toString(36)}`) {
    const survey = list(data, 'surveys').find(item => String(item?.id || '') === String(surveyId));
    const quote = list(data, 'quotes').find(item => String(item?.id || '') === String(quoteId));
    if (!survey || !quote) return { project: null, created: false, updated: false, cost: 0 };
    if (!Array.isArray(data.projects)) data.projects = [];
    const extraData = project => project?.extraData && typeof project.extraData === 'object' ? project.extraData : {};
    let project = data.projects.find(item => String(item?.quoteId || extraData(item).quoteId || '') === String(quoteId));
    const cost = Number(quoteCost(data, quoteId).toFixed(2));
    const opportunity = list(data, 'opportunities').find(item => String(item?.id || '') === String(quote.opportunityId || survey.opportunityId || ''));
    const name = String(quote.title || `Projeto técnico · ${opportunity?.company || survey.title}`).replace(/^Proposta\s+[—-]\s*/, '').trim();
    const roomNames = list(data, 'surveyRooms').filter(room => String(room?.surveyId || room?.technicalSurveyId || '') === String(surveyId)).map(room => String(room?.name || '').trim()).filter(Boolean);
    const pointCount = list(data, 'surveyPoints').filter(point => String(point?.surveyId || '') === String(surveyId) && Number(point?.quantity || 0) > 0).length;
    let created = false;
    let updated = false;
    if (!project) {
      const preProjectCount = data.projects.filter(item => item?.preProject === true || item?.status === 'Pré-projeto').length;
      project = {
        id: makeId('prj'),
        quoteId,
        technicalSurveyId: surveyId,
        preProject: true,
        code: `PRE-${String(preProjectCount + 1).padStart(3, '0')}`,
        name,
        description: `Pré-projeto gerado a partir do levantamento técnico ${survey.title}.`,
        clientId: String(quote.clientId || ''),
        manager: String(opportunity?.owner || 'A definir'),
        technicalStage: 'Projeto técnico',
        status: 'Pré-projeto',
        progress: 0,
        budget: Number(quote.value || quoteValue(data, quoteId) || 0),
        cost,
        due: 'A definir',
        scope: { surveyId, roomNames, pointCount }
      };
      data.projects.push(project);
      created = true;
    } else if (project.preProject === true || project.status === 'Pré-projeto') {
      Object.assign(project, {
        quoteId,
        technicalSurveyId: surveyId,
        preProject: true,
        budget: Number(quote.value || quoteValue(data, quoteId) || 0),
        cost,
        scope: { surveyId, roomNames, pointCount }
      });
      updated = true;
    }
    quote.preProjectId = project.id;
    quote.extraData = { ...(quote.extraData && typeof quote.extraData === 'object' ? quote.extraData : {}), technicalSurveyId: surveyId, preProjectId: project.id, preProject: project.preProject === true };
    return { project, created, updated, cost };
  }

  function populateQuoteFromSurvey(data = {}, surveyId, quoteId, makeId = prefix => `${prefix}-${Date.now().toString(36)}`) {
    const survey = list(data, 'surveys').find(item => String(item?.id || '') === String(surveyId));
    const quote = list(data, 'quotes').find(item => String(item?.id || '') === String(quoteId));
    if (!survey || !quote) return { added: 0, updated: 0, unmapped: [], value: 0 };
    if (!Array.isArray(data.quoteRooms)) data.quoteRooms = [];
    const products = list(data, 'products');
    const points = list(data, 'surveyPoints').filter(point => String(point?.surveyId || '') === String(surveyId) && Number(point?.quantity || 0) > 0);
    const technicalSolution = survey.technicalSolution || survey.extraData?.technicalSolution;
    const selectedProductIds = Array.isArray(technicalSolution?.selectedProductIds) ? technicalSolution.selectedProductIds.map(id => String(id)) : [];
    const selectedProducts = selectedProductIds.map(id => products.find(product => String(product?.id || '') === id)).filter(product => product && product.active !== false);
    const surveyRooms = list(data, 'surveyRooms').filter(room => String(room?.surveyId || room?.technicalSurveyId || '') === String(surveyId));
    const roomFor = (name, global = false) => {
      const roomName = global ? 'Infraestrutura técnica' : String(name || 'Ambiente sem nome').trim();
      let room = data.quoteRooms.find(item => String(item?.quoteId || '') === String(quoteId) && item.name === roomName);
      if (!room) {
        const source = surveyRooms.find(item => item.name === roomName);
        room = { id: makeId('amb'), quoteId, technicalSurveyId: surveyId, surveyRoomId: source?.id || '', name: roomName, items: [] };
        data.quoteRooms.push(room);
      }
      if (!Array.isArray(room.items)) room.items = [];
      return room;
    };
    let added = 0;
    let updated = 0;
    const unmapped = [];
    const addGenerated = (product, quantity, scope, pointIds, basis) => {
      if (!product || !Number(quantity || 0)) return false;
      const room = roomFor(scope.room, scope.global);
      const sourceKey = `${scope.global ? 'global' : 'room'}:${scope.kind}:${scope.room || 'all'}`;
      const existing = room.items.find(item => item.autoGenerated === 'survey-v1' && item.sourceSurveyId === surveyId && item.sourceKey === sourceKey);
      const record = { productId: product.id, qty: Number(quantity), discount: 0, autoGenerated: 'survey-v1', sourceSurveyId: surveyId, sourceSurveyPointIds: pointIds, sourceKey, quantityBasis: basis };
      if (existing) { Object.assign(existing, record); updated += 1; } else { room.items.push(record); added += 1; }
      return true;
    };

    points.filter(point => point.sourceProductId).forEach(point => {
      const product = productForSurveyPoint(products, point);
      if (product) addGenerated(product, Number(point.quantity || 1), { room: point.room, kind: 'explicit' }, [point.id], 'Quantidade informada no ponto técnico');
      else unmapped.push({ pointId: point.id, type: point.type || 'Item técnico' });
    });
    const inferred = points.filter(point => !point.sourceProductId);
    const byRoom = new Map();
    inferred.forEach(point => { const key = String(point.room || 'Ambiente sem nome').trim(); if (!byRoom.has(key)) byRoom.set(key, []); byRoom.get(key).push(point); });
    for (const [room, roomPoints] of byRoom) {
      const automation = roomPoints.filter(point => /automacao geral|automacao|keypad|pulsador/.test(normalizeSearchText(`${point.type} ${point.technology}`)));
      const wifi = roomPoints.filter(point => /wi\s*-?\s*fi|access\s*point/.test(normalizeSearchText(`${point.type} ${point.technology}`)));
      if (automation.length) {
        const product = pickCatalogProduct(products, [/keypad.*1 acionamento/, /interface de automacao/, /central de automacao/]);
        if (!addGenerated(product, automation.reduce((sum, point) => sum + Number(point.quantity || 1), 0), { room, kind: 'automation' }, automation.map(point => point.id), 'Uma interface por necessidade de automação do ambiente')) unmapped.push(...automation.map(point => ({ pointId: point.id, type: point.type || 'Automação' })));
      }
      if (wifi.length) {
        const product = pickCatalogProduct(products, [/ponto de rede wi/, /access\s*point/, /wi\s*-?\s*fi/]);
        if (!addGenerated(product, wifi.reduce((sum, point) => sum + Number(point.quantity || 1), 0), { room, kind: 'wifi' }, wifi.map(point => point.id), 'Um access point por necessidade Wi-Fi')) unmapped.push(...wifi.map(point => ({ pointId: point.id, type: point.type || 'Wi-Fi' })));
      }
      roomFor(room);
    }
    const pointText = point => normalizeSearchText(`${point.type} ${point.technology}`);
    const networkPoints = inferred.filter(point => /pontos? de rede|rede cabeada|cat\s*6/.test(pointText(point)));
    const technicalNetworkPoints = inferred.filter(point => /rede|wi\s*-?\s*fi|access\s*point|camera|cftv|poe/.test(pointText(point)));
    const lightingPoints = inferred.filter(point => /circuito.*ilumin|ilumin.*(?:rele|dimmer)|dimmer|pwm/.test(pointText(point)));
    const automationPoints = inferred.filter(point => /automacao geral|automacao|keypad|pulsador/.test(pointText(point)));
    const totalNetwork = networkPoints.reduce((sum, point) => sum + Number(point.quantity || 1), 0);
    const totalLighting = lightingPoints.reduce((sum, point) => sum + Number(point.quantity || 1), 0);
    if (automationPoints.length || totalLighting) {
      const product = pickCatalogProduct(products, [/controladora.*embrace.*lite/, /central de automacao/]);
      if (!addGenerated(product, 1, { global: true, kind: 'controller' }, automationPoints.concat(lightingPoints).map(point => point.id), 'Uma central para o conjunto residencial')) unmapped.push({ type: 'Central de automação' });
    }
    if (totalLighting) {
      const product = pickCatalogProduct(products, [/modulo rele.*8 canais/, /modulo dimmer.*8 canais/, /modulo de iluminacao/]);
      if (!addGenerated(product, itemQuantity(product, totalLighting, 'lighting'), { global: true, kind: 'lighting' }, lightingPoints.map(point => point.id), `${totalLighting} circuito(s), dimensionado(s) em blocos de 8 canais`)) unmapped.push({ type: 'Módulo de iluminação' });
    }
    if (totalNetwork) {
      const confirmedSwitch = selectedProducts.find(product => /switch|comutador/.test(productSearchText(product)));
      const switchProduct = confirmedSwitch || pickCatalogProduct(products, [/switch de rede/, /switch/]);
      const switchQuantity = confirmedSwitch ? 1 : itemQuantity(switchProduct, totalNetwork, 'network-switch');
      const switchBasis = confirmedSwitch ? `Produto confirmado na soluÃ§Ã£o tÃ©cnica ${String(technicalSolution.engineVersion || '')}`.trim() : `${totalNetwork} ponto(s), dimensionado(s) em blocos de 24 portas`;
      if (!addGenerated(switchProduct, switchQuantity, { global: true, kind: 'network-switch' }, (confirmedSwitch ? technicalNetworkPoints : networkPoints).map(point => point.id), switchBasis)) unmapped.push({ type: 'Switch de rede' });
      const cableProduct = pickCatalogProduct(products, [/cabo.*(?:cat\s*6|categoria\s*6)/, /cabo de rede/]);
      if (!addGenerated(cableProduct, itemQuantity(cableProduct, totalNetwork, 'network-cable'), { global: true, kind: 'network-cable' }, networkPoints.map(point => point.id), `${totalNetwork} ponto(s) × 30 m médios; bobina considerada em 305 m quando aplicável`)) unmapped.push({ type: 'Cabo de rede' });
    } else {
      const confirmedSwitch = selectedProducts.find(product => /switch|comutador/.test(productSearchText(product)));
      if (confirmedSwitch && !addGenerated(confirmedSwitch, 1, { global: true, kind: 'network-switch' }, technicalNetworkPoints.map(point => point.id), `Produto confirmado na soluÃ§Ã£o tÃ©cnica ${String(technicalSolution.engineVersion || '')}`.trim())) unmapped.push({ type: 'Switch de rede' });
    }
    quote.surveyMapping = { version: 1, surveyId, generatedAt: new Date().toISOString(), generatedItems: added + updated, technicalSolutionApplied: Boolean(selectedProducts.length), unmapped };
    quote.value = Number(quoteValue(data, quoteId).toFixed(2));
    return { added, updated, unmapped, value: quote.value };
  }

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

  return { stages, terminalStages, legacyStageAliases, qualificationFields, canonicalStage, isVisit, visitsFor, reconcileLegacyStages, applyValidatedSurveyTransition, populateQuoteFromSurvey, ensurePreProjectFromQuote, quoteValue, quoteCost, validate };
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
