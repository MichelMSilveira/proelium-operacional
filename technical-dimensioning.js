(function attachTechnicalDimensioning(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TechnicalDimensioning = factory();
}(typeof self !== 'undefined' ? self : globalThis, function createTechnicalDimensioning() {
  const SWITCH_PORTS = [8, 16, 24, 48];
  const NETWORK_TOKENS = ['rede', 'cat5', 'cat6', 'ethernet', 'rj45', 'cabeado', 'wifi', 'wi fi', 'access point', 'accesspoint', 'internet', 'cftv', 'camera', 'poe', 'switch', 'gateway'];
  const INFRASTRUCTURE_TOKENS = ['switch', 'gateway', 'roteador', 'router', 'patch panel', 'cabo', 'rack', 'nobreak', 'access point', 'accesspoint'];
  const POE_TOKENS = ['poe', 'camera', 'cftv', 'access point', 'accesspoint', 'wifi'];
  const AUDIO_TOKENS = ['audio', 'som ambiente', 'som distribuido', 'alto falante', 'alto-falante', 'caixa acustica', 'cinema', 'home theater', 'receiver'];
  const AUTOMATION_TOKENS = ['automacao', 'keypad', 'pulsador', 'iluminacao', 'dimmer', 'rele', 'pwm', 'persiana', 'cortina motorizada', 'climatizacao', 'ar condicionado', 'cena', 'infravermelho', 'controle rf', 'controle serial'];
  const UPS_POWER_FACTOR = 0.6;
  const UPS_AUTONOMY_MINUTES = 10;

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function normalized(value) {
    return text(value).toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ');
  }

  function number(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  function quantity(point) {
    return Math.max(0, Math.ceil(number(point.quantity, 0)));
  }

  function pointExtra(point) {
    const extra = point && typeof point.extraData === 'object' && point.extraData ? point.extraData : {};
    return { ...extra, ...(point && typeof point.metadata === 'object' && point.metadata ? point.metadata : {}) };
  }

  function pointText(point) {
    return normalized([point.type, point.name, point.technology, point.notes].filter(Boolean).join(' '));
  }

  function isAccessPointPoint(point) {
    return /wi\s*fi|access\s*point|accesspoint/.test(pointText(point));
  }

  function isAudioPoint(point) {
    return hasToken(pointText(point), AUDIO_TOKENS);
  }

  function isAutomationPoint(point) {
    return hasToken(pointText(point), AUTOMATION_TOKENS);
  }

  function isLightingPoint(point) {
    return /iluminacao|dimmer|rele|pwm|rgb/.test(pointText(point));
  }

  function lightingControlMode(point) {
    return /dimmer|pwm|rgb/.test(pointText(point)) ? 'dimmer' : 'relay';
  }

  function audioConfiguration(point) {
    const value = pointText(point);
    if (/cinema|home theater|receiver/.test(value)) return (value.match(/(?:5\.1|7\.1(?:\.\d+)?|2\.1|2\.0)/) || [])[0] || '5.1';
    return /estereo|stereo|2\.0/.test(value) ? '2.0' : 'mono';
  }

  function audioLayout(configuration) {
    if (configuration === 'mono') return { mainChannels: 1, heightChannels: 0, subwoofers: 0, channels: 1 };
    const parts = String(configuration).split('.').map(Number);
    const mainChannels = parts[0] || 2;
    const subwoofers = parts[1] || 0;
    const heightChannels = parts[2] || 0;
    return { mainChannels, heightChannels, subwoofers, channels: mainChannels + heightChannels };
  }

  function hasToken(value, tokens) {
    return tokens.some((token) => value.includes(token));
  }

  function poeWatts(point) {
    const extra = pointExtra(point);
    for (const key of ['poeWatts', 'powerWatts', 'consumptionWatts', 'power']) {
      const value = number(point[key] ?? extra[key], -1);
      if (value >= 0) return value;
    }
    return null;
  }

  function dimensionSurvey(survey, points, options) {
    const sourcePoints = Array.isArray(points) ? points : [];
    const reservePercent = number(options && options.reservePercent, 20);
    const surveyId = text(survey && survey.id);
    const networkPoints = sourcePoints.filter((point) => {
      if (surveyId && text(point.surveyId) && text(point.surveyId) !== surveyId) return false;
      const value = pointText(point);
      return hasToken(value, NETWORK_TOKENS);
    });
    const audioPoints = sourcePoints.filter((point) => {
      if (surveyId && text(point.surveyId) && text(point.surveyId) !== surveyId) return false;
      return isAudioPoint(point);
    });
    const automationPoints = sourcePoints.filter((point) => {
      if (surveyId && text(point.surveyId) && text(point.surveyId) !== surveyId) return false;
      return isAutomationPoint(point);
    });
    const lightingPoints = automationPoints.filter(isLightingPoint);
    const endpointPoints = networkPoints.filter((point) => !hasToken(pointText(point), INFRASTRUCTURE_TOKENS.filter((token) => !['access point', 'accesspoint'].includes(token))));
    const accessPointPoints = networkPoints.filter(isAccessPointPoint);
    const portsUsed = endpointPoints.reduce((total, point) => total + quantity(point), 0);
    const accessPointsRequired = accessPointPoints.reduce((total, point) => total + quantity(point), 0);
    const portsRequired = portsUsed ? Math.ceil(portsUsed * (1 + reservePercent / 100)) : 0;
    const minimumStandardPorts = SWITCH_PORTS.find((capacity) => capacity >= portsRequired) || null;
    const poePoints = networkPoints.filter((point) => hasToken(pointText(point), POE_TOKENS));
    const poeRequired = poePoints.length > 0;
    const poeWattsKnown = poePoints.reduce((total, point) => {
      const watts = poeWatts(point);
      return total + (watts == null ? 0 : watts * quantity(point));
    }, 0);
    const missingPoeWatts = poePoints.filter((point) => poeWatts(point) == null && quantity(point) > 0);
    const poeWattsRequired = poeRequired && poeWattsKnown > 0 ? Math.ceil(poeWattsKnown) : null;
    const poeWattsWithReserve = poeWattsRequired == null ? null : Math.ceil(poeWattsRequired * (1 + reservePercent / 100));
    const upsVaMinimum = poeWattsWithReserve == null ? null : Math.ceil((poeWattsWithReserve / UPS_POWER_FACTOR) / 100) * 100;
    const cableManagementQuantity = portsUsed ? Math.max(1, Math.ceil((minimumStandardPorts || portsUsed) / 24)) : 0;
    const rackOccupiedUnits = portsUsed ? 1 + (minimumStandardPorts ? 1 : 0) + cableManagementQuantity : 0;
    const rackReserveUnits = portsUsed ? 3 : 0;
    const rackMinimumUnits = portsUsed ? Math.max(6, rackOccupiedUnits + rackReserveUnits) : 0;
    const warnings = [];
    if (!networkPoints.length && !audioPoints.length && !automationPoints.length) warnings.push({ code: 'technical.no-input', message: 'Nenhum ponto técnico de Rede, Áudio ou Automação foi identificado no levantamento.' });
    if (portsUsed && !minimumStandardPorts) warnings.push({ code: 'network.switch-capacity', message: `A necessidade de ${portsRequired} portas excede os padrões iniciais de 8, 16, 24 e 48 portas.` });
    if (missingPoeWatts.length) warnings.push({ code: 'network.poe-power-missing', message: 'O consumo PoE precisa ser informado para validar o orçamento mínimo de potência.' });
    const requirements = [];
    if (portsUsed) requirements.push({
      category: 'network',
      kind: 'switch',
      portsUsed,
      reservePercent,
      portsRequired,
      minimumStandardPorts,
      poeRequired,
      poeWattsRequired,
      poeWattsWithReserve,
    });
    if (accessPointsRequired) requirements.push({
      category: 'network',
      kind: 'access-point',
      quantity: accessPointsRequired,
      sourcePointIds: accessPointPoints.map((point) => text(point.id)).filter(Boolean),
    });
    if (portsUsed && minimumStandardPorts) requirements.push({ category: 'network', kind: 'patch-panel', ports: minimumStandardPorts, quantity: 1 });
    if (portsUsed) requirements.push({ category: 'network', kind: 'cable-management', ports: minimumStandardPorts || portsUsed, quantity: cableManagementQuantity });
    if (portsUsed) requirements.push({ category: 'network', kind: 'rack', quantity: 1, mountingUnitsMinimum: rackMinimumUnits, mountingUnitsOccupied: rackOccupiedUnits, mountingUnitsReserve: rackReserveUnits });
    if (networkPoints.length) requirements.push({
      category: 'network',
      kind: 'ups',
      quantity: 1,
      powerWattsMinimum: poeWattsWithReserve,
      vaMinimum: upsVaMinimum,
      autonomyMinutesMinimum: UPS_AUTONOMY_MINUTES,
      outputWaveform: 'senoidal',
      sourcePointIds: networkPoints.map((point) => text(point.id)).filter(Boolean),
    });
    const audioGroups = new Map();
    audioPoints.forEach((point) => {
      const configuration = audioConfiguration(point);
      const group = audioGroups.get(configuration) || { configuration, quantity: 0, sourcePointIds: [] };
      group.quantity += quantity(point);
      if (point.id) group.sourcePointIds.push(text(point.id));
      audioGroups.set(configuration, group);
    });
    audioGroups.forEach((group) => {
      const layout = audioLayout(group.configuration);
      requirements.push({ category: 'audio', kind: 'audio-processing', configuration: group.configuration, quantity: group.quantity, channels: layout.channels, mainChannels: layout.mainChannels, heightChannels: layout.heightChannels, subwooferRequired: layout.subwoofers > 0, externalAmplificationRequired: layout.channels > 7, sourcePointIds: group.sourcePointIds });
      requirements.push({ category: 'audio', kind: 'audio-speakers', configuration: group.configuration, quantity: group.quantity * (layout.mainChannels + layout.heightChannels), mainSpeakers: group.quantity * layout.mainChannels, heightSpeakers: group.quantity * layout.heightChannels, sourcePointIds: group.sourcePointIds });
      if (layout.subwoofers) requirements.push({ category: 'audio', kind: 'audio-subwoofer', configuration: group.configuration, quantity: group.quantity * layout.subwoofers, sourcePointIds: group.sourcePointIds });
    });
    if (automationPoints.length) requirements.push({ category: 'automation', kind: 'automation-controller', quantity: 1, sourcePointIds: automationPoints.map((point) => text(point.id)).filter(Boolean) });
    const lightingGroups = new Map();
    lightingPoints.forEach((point) => {
      const controlMode = lightingControlMode(point);
      const group = lightingGroups.get(controlMode) || { controlMode, circuitsRequired: 0, sourcePointIds: [] };
      group.circuitsRequired += quantity(point);
      if (point.id) group.sourcePointIds.push(text(point.id));
      lightingGroups.set(controlMode, group);
    });
    lightingGroups.forEach((group) => requirements.push({ category: 'automation', kind: 'automation-lighting', controlMode: group.controlMode, circuitsRequired: group.circuitsRequired, channelsRequired: group.circuitsRequired, dimmableRequired: group.controlMode === 'dimmer', sourcePointIds: group.sourcePointIds }));
    if (networkPoints.length) requirements.push({
      category: 'electrical',
      kind: 'electrical-infrastructure',
      quantity: 1,
      dedicatedCircuitRequired: true,
      groundingRequired: true,
      surgeProtectionRequired: true,
      sourcePointIds: networkPoints.map((point) => text(point.id)).filter(Boolean),
    });
    const solutions = [];
    if (minimumStandardPorts) solutions.push({
      category: 'network',
      kind: 'switch',
      ports: minimumStandardPorts,
      poeRequired,
      poeWattsMinimum: poeWattsWithReserve,
    });
    if (accessPointsRequired) solutions.push({ category: 'network', kind: 'access-point', quantity: accessPointsRequired });
    if (portsUsed && minimumStandardPorts) solutions.push({ category: 'network', kind: 'patch-panel', ports: minimumStandardPorts, quantity: 1 });
    if (portsUsed) solutions.push({ category: 'network', kind: 'cable-management', ports: minimumStandardPorts || portsUsed, quantity: cableManagementQuantity });
    if (portsUsed) solutions.push({ category: 'network', kind: 'rack', quantity: 1, mountingUnitsMinimum: rackMinimumUnits, mountingUnitsOccupied: rackOccupiedUnits, mountingUnitsReserve: rackReserveUnits });
    if (networkPoints.length) solutions.push({ category: 'network', kind: 'ups', quantity: 1, powerWattsMinimum: poeWattsWithReserve, vaMinimum: upsVaMinimum, autonomyMinutesMinimum: UPS_AUTONOMY_MINUTES, outputWaveform: 'senoidal' });
    if (networkPoints.length) solutions.push({ category: 'electrical', kind: 'electrical-infrastructure', quantity: 1, dedicatedCircuitRequired: true, groundingRequired: true, surgeProtectionRequired: true });
    audioGroups.forEach((group) => {
      const layout = audioLayout(group.configuration);
      solutions.push({ category: 'audio', kind: 'audio-processing', configuration: group.configuration, quantity: group.quantity, channels: layout.channels, mainChannels: layout.mainChannels, heightChannels: layout.heightChannels, subwooferRequired: layout.subwoofers > 0, externalAmplificationRequired: layout.channels > 7 });
      solutions.push({ category: 'audio', kind: 'audio-speakers', configuration: group.configuration, quantity: group.quantity * (layout.mainChannels + layout.heightChannels), mainSpeakers: group.quantity * layout.mainChannels, heightSpeakers: group.quantity * layout.heightChannels });
      if (layout.subwoofers) solutions.push({ category: 'audio', kind: 'audio-subwoofer', configuration: group.configuration, quantity: group.quantity * layout.subwoofers });
    });
    if (automationPoints.length) solutions.push({ category: 'automation', kind: 'automation-controller', quantity: 1 });
    lightingGroups.forEach((group) => solutions.push({ category: 'automation', kind: 'automation-lighting', controlMode: group.controlMode, circuitsRequired: group.circuitsRequired, channelsRequired: group.circuitsRequired, dimmableRequired: group.controlMode === 'dimmer' }));
    const categories = [];
    if (networkPoints.length) categories.push('network');
    if (audioPoints.length) categories.push('audio');
    if (automationPoints.length) categories.push('automation');
    const trace = [];
    if (networkPoints.length) trace.push({ ruleId: 'network.switch.capacity.v1', sourcePointIds: networkPoints.map((point) => text(point.id)).filter(Boolean), endpointPointIds: endpointPoints.map((point) => text(point.id)).filter(Boolean), accessPointPointIds: accessPointPoints.map((point) => text(point.id)).filter(Boolean) });
    if (audioPoints.length) trace.push({ ruleId: 'audio.layout.v1', sourcePointIds: audioPoints.map((point) => text(point.id)).filter(Boolean) });
    if (automationPoints.length) trace.push({ ruleId: 'automation.controller.v1', sourcePointIds: automationPoints.map((point) => text(point.id)).filter(Boolean) });
    if (lightingPoints.length) trace.push({ ruleId: 'automation.lighting.channels.v1', sourcePointIds: lightingPoints.map((point) => text(point.id)).filter(Boolean) });
    return {
      engineVersion: 'technical-v3',
      status: (portsUsed || audioPoints.length || automationPoints.length) && !warnings.length ? 'dimensionado' : 'incompleto',
      categories,
      requirements,
      solutions,
      warnings,
      trace,
    };
  }

  return { dimensionSurvey };
}));
