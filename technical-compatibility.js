(function attachTechnicalCompatibility(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TechnicalCompatibility = factory();
}(typeof self !== 'undefined' ? self : globalThis, function createTechnicalCompatibility() {
  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function normalized(value) {
    return text(value).toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ');
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function productText(product) {
    const definition = product && typeof product.technicalDefinition === 'object' ? product.technicalDefinition : {};
    const connection = product && typeof product.connectionModel === 'object' ? product.connectionModel : {};
    return normalized([
      product && product.name,
      product && product.category,
      product && product.technicalType,
      product && product.technicalFunction,
      definition.input,
      definition.output,
      definition.capacity,
      definition.powerWatts,
      definition.capacityWatts,
      definition.capacityVa,
      definition.autonomyMinutes,
      definition.channels,
      definition.channelCount,
      definition.configuration,
      product && product.technicalFunction,
      connection.requirements,
      connection.constraints,
    ].flat().filter(Boolean).join(' '));
  }

  function capacity(product) {
    const definition = product && typeof product.technicalDefinition === 'object' ? product.technicalDefinition : {};
    const direct = number(definition.ports ?? definition.portCount ?? definition.capacityPorts);
    if (direct != null) return direct;
    const match = productText(product).match(/(?:^|\s)(\d+)\s*(?:portas?|ports?)(?:\s|$)/);
    return match ? Number(match[1]) : null;
  }

  function isSwitch(product) {
    const value = productText(product);
    return value.includes('switch') || value.includes('comutador') || value.includes('distribuicao de portas');
  }

  function isAccessPoint(product) {
    const value = productText(product);
    return value.includes('access point') || value.includes('accesspoint') || value.includes('wifi') || value.includes('wi fi');
  }

  function isPatchPanel(product) {
    const value = productText(product);
    return value.includes('patch panel') || value.includes('patchpanel');
  }

  function isRack(product) {
    const value = productText(product);
    return value.includes('rack') || value.includes('armario tecnico') || value.includes('gabinete de rede');
  }

  function isCableManagement(product) {
    const value = productText(product);
    return value.includes('organizador de cabo') || value.includes('organizacao de cabo') || value.includes('gerenciamento de cabo') || value.includes('cable management');
  }

  function isAudioProcessor(product) {
    const value = productText(product);
    return value.includes('receiver') || value.includes('processador de audio') || value.includes('processador av') || value.includes('amplificador multicanal') || value.includes('amplificador de audio') || value.includes('amplificador') && value.includes('canais');
  }

  function isAudioSpeaker(product) {
    const value = productText(product);
    return value.includes('caixa acustica') || value.includes('alto falante') || value.includes('alto-falante') || value.includes('speaker');
  }

  function isSubwoofer(product) {
    return productText(product).includes('subwoofer');
  }

  function isAutomationController(product) {
    const value = productText(product);
    return value.includes('controladora') || value.includes('central de automacao') || value.includes('controlador') || value.includes('interface de automacao') || value.includes('scenario') || value.includes('embrace');
  }

  function isLightingModule(product) {
    const value = productText(product);
    return value.includes('modulo de iluminacao') || value.includes('dimmer') || value.includes('rele') || value.includes('pwm');
  }

  function lightingControlMode(product) {
    return /dimmer|pwm|rgb/.test(productText(product)) ? 'dimmer' : 'relay';
  }

  function moduleChannels(product) {
    const definition = product && typeof product.technicalDefinition === 'object' ? product.technicalDefinition : {};
    for (const value of [product && product.channels, product && product.channelCount, definition.channels, definition.channelCount, definition.capacityChannels]) {
      const parsed = number(value);
      if (parsed != null) return parsed;
    }
    const match = productText(product).match(/(\d+)\s*(?:canais|channels)/);
    return match ? Number(match[1]) : null;
  }

  function audioChannels(product) {
    const definition = product && typeof product.technicalDefinition === 'object' ? product.technicalDefinition : {};
    for (const value of [product && product.channels, product && product.channelCount, definition.channels, definition.channelCount]) {
      const parsed = number(value);
      if (parsed != null) return parsed;
    }
    const match = productText(product).match(/(\d+)\s*(?:canais|channels)/);
    return match ? Number(match[1]) : null;
  }

  function isUps(product) {
    const value = productText(product);
    return value.includes('nobreak') || value.includes('no break') || value.includes('ups') || value.includes('backup power');
  }

  function supportsPoe(product) {
    return productText(product).includes('poe');
  }

  function poeBudgetWatts(product) {
    const definition = product && typeof product.technicalDefinition === 'object' ? product.technicalDefinition : {};
    const connection = product && typeof product.connectionModel === 'object' ? product.connectionModel : {};
    for (const value of [product && product.poeBudgetWatts, product && product.poeBudget, definition.poeBudgetWatts, definition.poeBudget, definition.powerBudgetWatts, connection.poeBudgetWatts, connection.poeBudget]) {
      const parsed = number(value);
      if (parsed != null) return parsed;
    }
    const match = productText(product).match(/(?:poe|power budget|orcamento poe)[^0-9]{0,30}(\d+(?:[.,]\d+)?)\s*w/);
    return match ? number(match[1].replace(',', '.')) : null;
  }

  function productPowerWatts(product) {
    const definition = product && typeof product.technicalDefinition === 'object' ? product.technicalDefinition : {};
    for (const value of [product && product.powerWatts, product && product.outputWatts, definition.powerWatts, definition.outputWatts, definition.capacityWatts]) {
      const parsed = number(value);
      if (parsed != null) return parsed;
    }
    const match = productText(product).match(/(\d+(?:[.,]\d+)?)\s*w(?:atts?)?/);
    return match ? number(match[1].replace(',', '.')) : null;
  }

  function productVa(product) {
    const definition = product && typeof product.technicalDefinition === 'object' ? product.technicalDefinition : {};
    for (const value of [product && product.va, product && product.capacityVa, definition.va, definition.capacityVa]) {
      const parsed = number(value);
      if (parsed != null) return parsed;
    }
    const match = productText(product).match(/(\d+(?:[.,]\d+)?)\s*va/);
    return match ? number(match[1].replace(',', '.')) : null;
  }

  function productAutonomyMinutes(product) {
    const definition = product && typeof product.technicalDefinition === 'object' ? product.technicalDefinition : {};
    for (const value of [product && product.autonomyMinutes, definition.autonomyMinutes]) {
      const parsed = number(value);
      if (parsed != null) return parsed;
    }
    return null;
  }

  function publicProductReference(product) {
    return {
      productId: text(product && product.id),
      sku: text(product && product.sku),
      name: text(product && product.name),
      brand: text(product && product.brand),
      model: text(product && product.model),
    };
  }

  function findCompatibleProducts(dimensioning, products) {
    const catalog = Array.isArray(products) ? products : [];
    const requirements = Array.isArray(dimensioning && dimensioning.requirements) ? dimensioning.requirements : [];
    const matches = [];
    const unmatched = [];
    requirements.forEach((requirement) => {
      if (requirement.kind === 'electrical-infrastructure') return;
      if (!['switch', 'access-point', 'patch-panel', 'cable-management', 'rack', 'ups', 'audio-processing', 'audio-speakers', 'audio-subwoofer', 'automation-controller', 'automation-lighting'].includes(requirement.kind)) return;
      const compatible = catalog.filter((product) => {
        if (!product || product.active === false || normalized(product.catalogType) === 'service') return false;
        if (requirement.kind === 'access-point') return isAccessPoint(product);
        if (requirement.kind === 'rack') return isRack(product);
        if (requirement.kind === 'cable-management') return isCableManagement(product);
        if (requirement.kind === 'audio-processing') return isAudioProcessor(product) && (audioChannels(product) == null || audioChannels(product) >= Number(requirement.channels || 0));
        if (requirement.kind === 'audio-speakers') return isAudioSpeaker(product);
        if (requirement.kind === 'audio-subwoofer') return isSubwoofer(product);
        if (requirement.kind === 'automation-controller') return isAutomationController(product);
        if (requirement.kind === 'automation-lighting') {
          if (!isLightingModule(product) || lightingControlMode(product) !== requirement.controlMode) return false;
          const availableChannels = moduleChannels(product);
          return availableChannels == null || availableChannels >= Number(requirement.channelsRequired || requirement.circuitsRequired || 0);
        }
        if (requirement.kind === 'ups') {
          if (!isUps(product)) return false;
          const requiredWatts = Number(requirement.powerWattsMinimum || 0);
          const availableWatts = productPowerWatts(product);
          if (requiredWatts && availableWatts != null && availableWatts < requiredWatts) return false;
          const requiredVa = Number(requirement.vaMinimum || 0);
          const availableVa = productVa(product);
          return !requiredVa || availableVa == null || availableVa >= requiredVa;
        }
        if (requirement.kind === 'patch-panel') {
          return isPatchPanel(product) && (capacity(product) == null || capacity(product) >= Number(requirement.ports || 0));
        }
        if (!isSwitch(product)) return false;
        const ports = capacity(product);
        if (ports == null || ports < Number(requirement.minimumStandardPorts || requirement.portsRequired || 0)) return false;
        if (requirement.poeRequired && !supportsPoe(product)) return false;
        const requiredPoeWatts = Number(requirement.poeWattsWithReserve || 0);
        const availablePoeWatts = poeBudgetWatts(product);
        return !requiredPoeWatts || availablePoeWatts == null || availablePoeWatts >= requiredPoeWatts;
      });
      if (!compatible.length) {
        unmatched.push({ kind: requirement.kind, message: 'Nenhum produto do catalogo atende aos requisitos tecnicos atuais.' });
        return;
      }
      if (requirement.kind === 'switch') compatible.sort((left, right) => (capacity(left) - Number(requirement.minimumStandardPorts || requirement.portsRequired || 0)) - (capacity(right) - Number(requirement.minimumStandardPorts || requirement.portsRequired || 0)));
      matches.push({
        requirementKind: requirement.kind,
        requirement: requirement.kind === 'access-point' || requirement.kind === 'rack'
          ? { quantity: requirement.quantity }
          : requirement.kind === 'patch-panel'
            ? { ports: requirement.ports, quantity: requirement.quantity }
            : requirement.kind === 'cable-management'
              ? { ports: requirement.ports, quantity: requirement.quantity }
            : requirement.kind === 'audio-processing'
              ? { configuration: requirement.configuration, quantity: requirement.quantity, channels: requirement.channels, mainChannels: requirement.mainChannels, heightChannels: requirement.heightChannels, subwooferRequired: requirement.subwooferRequired, externalAmplificationRequired: requirement.externalAmplificationRequired }
            : requirement.kind === 'audio-speakers' || requirement.kind === 'audio-subwoofer'
              ? { configuration: requirement.configuration, quantity: requirement.quantity }
            : requirement.kind === 'automation-lighting'
              ? { controlMode: requirement.controlMode, circuitsRequired: requirement.circuitsRequired, channelsRequired: requirement.channelsRequired, dimmableRequired: requirement.dimmableRequired }
            : requirement.kind === 'automation-controller'
              ? { quantity: requirement.quantity }
            : requirement.kind === 'ups'
              ? { quantity: requirement.quantity, powerWattsMinimum: requirement.powerWattsMinimum ?? null, vaMinimum: requirement.vaMinimum ?? null, autonomyMinutesMinimum: requirement.autonomyMinutesMinimum, outputWaveform: requirement.outputWaveform }
            : { ports: requirement.minimumStandardPorts || requirement.portsRequired, poeRequired: Boolean(requirement.poeRequired), poeWattsMinimum: requirement.poeWattsWithReserve ?? null },
        products: compatible.map((product) => ({ ...publicProductReference(product), ...(requirement.kind === 'switch' || requirement.kind === 'patch-panel' ? { capacity: capacity(product), ...(requirement.kind === 'switch' ? { poeSupported: supportsPoe(product), poeBudgetWatts: poeBudgetWatts(product) } : {}) } : requirement.kind === 'ups' ? { powerWatts: productPowerWatts(product), va: productVa(product), autonomyMinutes: productAutonomyMinutes(product) } : requirement.kind === 'audio-processing' ? { channels: audioChannels(product) } : requirement.kind === 'automation-lighting' ? { channels: moduleChannels(product), controlMode: lightingControlMode(product) } : {}) })),
      });
    });
    return { engineVersion: 'technical-compatibility-v3', matches, unmatched };
  }

  function selectCompatibleProductIds(compatibility, requestedProductIds) {
    const requested = new Set((Array.isArray(requestedProductIds) ? requestedProductIds : []).map(text));
    return (Array.isArray(compatibility && compatibility.matches) ? compatibility.matches : []).flatMap((match) => {
      const products = Array.isArray(match && match.products) ? match.products : [];
      const selected = products.find((product) => requested.has(text(product && product.productId))) || products[0];
      const productId = text(selected && selected.productId);
      return productId ? [productId] : [];
    });
  }

  return { findCompatibleProducts, selectCompatibleProductIds };
}));
