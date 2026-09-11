const assert = require('node:assert/strict');
const test = require('node:test');
const { dimensionSurvey } = require('../technical-dimensioning');
const { findCompatibleProducts, selectCompatibleProductIds } = require('../technical-compatibility');

test('encontra switch compatível sem expor preço ou custo', () => {
  const dimensioning = dimensionSurvey({ id: 'lev-compat-1' }, [{ id: 'p-1', surveyId: 'lev-compat-1', type: 'Ponto de rede Cat6', quantity: 19 }]);
  const result = findCompatibleProducts(dimensioning, [
    { id: 'small', name: 'Switch 16 portas', category: 'Rede', active: true, price: 100 },
    { id: 'right', name: 'Switch 24 portas PoE+', brand: 'Marca', model: 'M24', category: 'Rede', active: true, price: 999 },
    { id: 'patch', name: 'Patch panel 24 portas', category: 'Cabeamento', active: true },
    { id: 'ups', name: 'Nobreak senoidal 1200 VA / 720 W', category: 'Infraestrutura eletrica', technicalType: 'Nobreak', active: true },
    { id: 'organizer', name: 'Organizador horizontal de cabos 1U', category: 'Infraestrutura de rede', technicalType: 'Organizador de cabos', active: true },
    { id: 'rack', name: 'Rack técnico 6U', category: 'Infraestrutura', active: true },
  ]);

  assert.equal(result.matches[0].products[0].productId, 'right');
  assert.equal(result.matches[0].products[0].capacity, 24);
  assert.equal(Object.hasOwn(result.matches[0].products[0], 'price'), false);
  assert.equal(Object.hasOwn(result.matches[0].products[0], 'cost'), false);
  assert.equal(result.unmatched.length, 0);
});

test('rejeita switch sem PoE quando a solução exige PoE', () => {
  const dimensioning = dimensionSurvey({ id: 'lev-compat-2' }, [{ id: 'p-1', surveyId: 'lev-compat-2', type: 'Access Point Wi-Fi', quantity: 1, poeWatts: 18 }]);
  const result = findCompatibleProducts(dimensioning, [
    { id: 'plain', name: 'Switch 24 portas', category: 'Rede', active: true },
    { id: 'patch', name: 'Patch panel 24 portas', category: 'Cabeamento', active: true },
    { id: 'rack', name: 'Rack técnico 6U', category: 'Infraestrutura', active: true }
  ]);

  assert.equal(result.matches.some((item) => item.requirementKind === 'switch'), false);
  assert.equal(result.unmatched.some((item) => item.kind === 'switch'), true);
});

test('confirma uma unica referencia por requisito e respeita a escolha solicitada', () => {
  const compatibility = {
    matches: [{
      requirementKind: 'switch',
      products: [{ productId: 'small' }, { productId: 'right' }]
    }]
  };

  assert.deepEqual(selectCompatibleProductIds(compatibility, ['small', 'right']), ['small']);
  assert.deepEqual(selectCompatibleProductIds(compatibility, ['right']), ['right']);
});

test('encontra access points compativeis sem misturar switches', () => {
  const dimensioning = dimensionSurvey({ id: 'lev-compat-3' }, [{ id: 'wifi-1', surveyId: 'lev-compat-3', type: 'Access Point Wi-Fi', quantity: 2 }]);
  const result = findCompatibleProducts(dimensioning, [
    { id: 'ap', name: 'Access Point Wi-Fi PoE+', category: 'Rede Wi-Fi', active: true },
    { id: 'switch', name: 'Switch 24 portas PoE+', category: 'Rede', active: true },
    { id: 'patch', name: 'Patch panel 24 portas', category: 'Cabeamento', active: true },
    { id: 'organizer', name: 'Organizador horizontal de cabos 1U', category: 'Infraestrutura de rede', technicalType: 'Organizador de cabos', active: true },
    { id: 'rack', name: 'Rack técnico 6U', category: 'Infraestrutura', active: true }
  ]);

  const match = result.matches.find((item) => item.requirementKind === 'access-point');
  assert.equal(match.requirement.quantity, 2);
  assert.deepEqual(match.products.map((product) => product.productId), ['ap']);
  assert.equal(result.matches.find((item) => item.requirementKind === 'patch-panel').products[0].productId, 'patch');
  assert.equal(result.matches.find((item) => item.requirementKind === 'cable-management').products[0].productId, 'organizer');
  assert.equal(result.matches.find((item) => item.requirementKind === 'rack').products[0].productId, 'rack');
});

test('rejeita switch com orçamento PoE abaixo do requisito', () => {
  const dimensioning = {
    requirements: [{ kind: 'switch', minimumStandardPorts: 24, poeRequired: true, poeWattsWithReserve: 172 }]
  };
  const result = findCompatibleProducts(dimensioning, [
    { id: 'low', name: 'Switch 24 portas PoE 95 W', category: 'Rede', active: true },
    { id: 'right', name: 'Switch 24 portas PoE 250 W', category: 'Rede', active: true }
  ]);

  assert.deepEqual(result.matches[0].products.map((product) => product.productId), ['right']);
  assert.equal(result.matches[0].products[0].poeBudgetWatts, 250);
});

test('seleciona nobreak pela carga e capacidade VA', () => {
  const dimensioning = dimensionSurvey({ id: 'lev-compat-5' }, [{ id: 'ap-1', surveyId: 'lev-compat-5', type: 'Access Point Wi-Fi', quantity: 1, poeWatts: 500 }]);
  const result = findCompatibleProducts(dimensioning, [
    { id: 'low-ups', name: 'Nobreak senoidal 1000 VA / 500 W', category: 'Infraestrutura eletrica', technicalType: 'Nobreak', active: true },
    { id: 'right-ups', name: 'Nobreak senoidal 1200 VA / 720 W', category: 'Infraestrutura eletrica', technicalType: 'Nobreak', active: true }
  ]);

  const match = result.matches.find((item) => item.requirementKind === 'ups');
  assert.equal(match.requirement.powerWattsMinimum, 600);
  assert.equal(match.requirement.vaMinimum, 1000);
  assert.deepEqual(match.products.map((product) => product.productId), ['right-ups']);
  assert.equal(match.products[0].powerWatts, 720);
  assert.equal(match.products[0].va, 1200);
  assert.equal(result.unmatched.some((item) => item.kind === 'electrical-infrastructure'), false);
});

test('encontra processamento de audio compativel com cinema 7.1.4', () => {
  const dimensioning = dimensionSurvey({ id: 'lev-compat-audio' }, [{ id: 'cinema-1', surveyId: 'lev-compat-audio', type: 'Cinema 7.1.4', quantity: 1 }]);
  const result = findCompatibleProducts(dimensioning, [
    { id: 'receiver-7', name: 'Receiver 7 canais', category: 'Audio e video', technicalType: 'Receiver', active: true },
    { id: 'processor-11', name: 'Processador AV 11 canais', category: 'Audio e video', technicalType: 'Processador AV', active: true },
    { id: 'speaker', name: 'Caixa acustica residencial', category: 'Audio', technicalType: 'Caixa acustica', active: true },
    { id: 'sub', name: 'Subwoofer ativo residencial', category: 'Audio', technicalType: 'Subwoofer', active: true }
  ]);

  assert.deepEqual(result.matches.find((item) => item.requirementKind === 'audio-processing').products.map((product) => product.productId), ['processor-11']);
  assert.equal(result.matches.find((item) => item.requirementKind === 'audio-speakers').requirement.quantity, 11);
  assert.equal(result.matches.find((item) => item.requirementKind === 'audio-subwoofer').products[0].productId, 'sub');
  assert.equal(result.unmatched.length, 0);
});
