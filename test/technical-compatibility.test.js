const assert = require('node:assert/strict');
const test = require('node:test');
const { dimensionSurvey } = require('../technical-dimensioning');
const { findCompatibleProducts, selectCompatibleProductIds } = require('../technical-compatibility');

test('encontra switch compatível sem expor preço ou custo', () => {
  const dimensioning = dimensionSurvey({ id: 'lev-compat-1' }, [{ id: 'p-1', surveyId: 'lev-compat-1', type: 'Ponto de rede Cat6', quantity: 19 }]);
  const result = findCompatibleProducts(dimensioning, [
    { id: 'small', name: 'Switch 16 portas', category: 'Rede', active: true, price: 100 },
    { id: 'right', name: 'Switch 24 portas PoE+', brand: 'Marca', model: 'M24', category: 'Rede', active: true, price: 999 },
  ]);

  assert.equal(result.matches[0].products[0].productId, 'right');
  assert.equal(result.matches[0].products[0].capacity, 24);
  assert.equal(Object.hasOwn(result.matches[0].products[0], 'price'), false);
  assert.equal(Object.hasOwn(result.matches[0].products[0], 'cost'), false);
  assert.equal(result.unmatched.length, 0);
});

test('rejeita switch sem PoE quando a solução exige PoE', () => {
  const dimensioning = dimensionSurvey({ id: 'lev-compat-2' }, [{ id: 'p-1', surveyId: 'lev-compat-2', type: 'Access Point Wi-Fi', quantity: 1, poeWatts: 18 }]);
  const result = findCompatibleProducts(dimensioning, [{ id: 'plain', name: 'Switch 24 portas', category: 'Rede', active: true }]);

  assert.equal(result.matches.length, 0);
  assert.equal(result.unmatched[0].kind, 'switch');
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
    { id: 'switch', name: 'Switch 24 portas PoE+', category: 'Rede', active: true }
  ]);

  const match = result.matches.find((item) => item.requirementKind === 'access-point');
  assert.equal(match.requirement.quantity, 2);
  assert.deepEqual(match.products.map((product) => product.productId), ['ap']);
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
