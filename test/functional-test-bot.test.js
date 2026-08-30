const test = require('node:test');
const assert = require('node:assert/strict');
const { runFunctionalTestBot } = require('../scripts/functional-test-bot');

test('functional bot completes the full scenario without accessing the real database', { timeout: 30_000 }, async () => {
  const report = await runFunctionalTestBot({ reportPath: null, log: () => {} });
  assert.equal(report.ok, true, report.checks.filter(check => !check.ok).map(check => `${check.name}: ${check.detail}`).join('\n'));
  assert.ok(report.checks.length >= 20);
  assert.equal(report.checks.find(check => check.name === 'Isolamento dos dados').ok, true);
  assert.equal(report.checks.find(check => check.name === 'Conversão proposta → cliente → projeto').ok, true);
  assert.equal(report.checks.find(check => check.name === 'Perfil Leitura não altera tarefas').ok, true);
});
