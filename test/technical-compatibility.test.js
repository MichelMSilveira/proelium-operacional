const assert = require('node:assert/strict');
const test = require('node:test');
const { dimensionSurvey } = require('../technical-dimensioning');
const { findCompatibleProducts } = require('../technical-compatibility');

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
