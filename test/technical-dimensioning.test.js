const assert = require('node:assert/strict');
const test = require('node:test');
const { dimensionSurvey } = require('../technical-dimensioning');

test('dimensiona portas de rede com reserva técnica de 20%', () => {
  const points = [{ id: 'rede-1', surveyId: 'lev-1', type: 'Ponto de rede Cat6', quantity: 19 }];
  const result = dimensionSurvey({ id: 'lev-1' }, points);
  const requirement = result.requirements[0];

  assert.equal(result.status, 'dimensionado');
  assert.equal(requirement.portsUsed, 19);
  assert.equal(requirement.portsRequired, 23);
  assert.equal(requirement.minimumStandardPorts, 24);
  assert.deepEqual(result.solutions, [
    { category: 'network', kind: 'switch', ports: 24, poeRequired: false, poeWattsMinimum: null },
    { category: 'network', kind: 'patch-panel', ports: 24, quantity: 1 },
    { category: 'network', kind: 'rack', quantity: 1, mountingUnitsMinimum: 6 }
  ]);
  assert.equal(Object.hasOwn(result, 'products'), false);
  assert.equal(Object.hasOwn(result, 'prices'), false);
});

test('gera requisito genérico de PoE sem escolher produto', () => {
  const points = [
    { id: 'ap-1', surveyId: 'lev-2', type: 'Access Point Wi-Fi', quantity: 3, poeWatts: 18 },
    { id: 'cam-1', surveyId: 'lev-2', type: 'Câmera PoE', quantity: 4, powerWatts: 12 },
    { id: 'rede-1', surveyId: 'lev-2', type: 'Ponto de rede Cat6', quantity: 12 },
  ];
  const result = dimensionSurvey({ id: 'lev-2' }, points);
  const requirement = result.requirements[0];

  assert.equal(requirement.portsUsed, 19);
  assert.equal(requirement.minimumStandardPorts, 24);
  assert.equal(requirement.poeWattsRequired, 102);
  assert.equal(requirement.poeWattsWithReserve, 123);
  assert.equal(result.warnings.length, 0);
});

test('sinaliza levantamento sem entradas de rede', () => {
  const result = dimensionSurvey({ id: 'lev-3' }, [{ id: 'audio-1', surveyId: 'lev-3', type: 'Som ambiente', quantity: 2 }]);

  assert.equal(result.status, 'incompleto');
  assert.equal(result.requirements.length, 0);
  assert.equal(result.warnings[0].code, 'network.no-input');
});

test('gera requisito separado para access points com rastreabilidade', () => {
  const result = dimensionSurvey({ id: 'lev-4' }, [
    { id: 'wifi-1', surveyId: 'lev-4', type: 'Access Point Wi-Fi', quantity: 3, poeWatts: 18 }
  ]);
  const requirement = result.requirements.find((item) => item.kind === 'access-point');
  const solution = result.solutions.find((item) => item.kind === 'access-point');

  assert.equal(requirement.quantity, 3);
  assert.equal(solution.quantity, 3);
  assert.deepEqual(requirement.sourcePointIds, ['wifi-1']);
});
