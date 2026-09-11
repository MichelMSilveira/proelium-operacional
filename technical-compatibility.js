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

  function supportsPoe(product) {
    return productText(product).includes('poe');
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
      if (requirement.kind !== 'switch') return;
      const compatible = catalog.filter((product) => {
        if (!product || product.active === false || normalized(product.catalogType) === 'service' || !isSwitch(product)) return false;
        const ports = capacity(product);
        if (ports == null || ports < Number(requirement.minimumStandardPorts || requirement.portsRequired || 0)) return false;
        return !requirement.poeRequired || supportsPoe(product);
      });
      if (!compatible.length) {
        unmatched.push({ kind: requirement.kind, message: 'Nenhum produto do catalogo atende aos requisitos tecnicos atuais.' });
        return;
      }
      compatible.sort((left, right) => (capacity(left) - Number(requirement.minimumStandardPorts || requirement.portsRequired || 0)) - (capacity(right) - Number(requirement.minimumStandardPorts || requirement.portsRequired || 0)));
      matches.push({
        requirementKind: requirement.kind,
        requirement: { ports: requirement.minimumStandardPorts || requirement.portsRequired, poeRequired: Boolean(requirement.poeRequired), poeWattsMinimum: requirement.poeWattsWithReserve ?? null },
        products: compatible.map((product) => ({ ...publicProductReference(product), capacity: capacity(product), poeSupported: supportsPoe(product) })),
      });
    });
    return { engineVersion: 'network-compatibility-v1', matches, unmatched };
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
