const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('runtime source does not contain known UTF-8 mojibake', () => {
  for (const filename of ['app.js', 'server.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
    assert.doesNotMatch(source, /vocÃ|DisponÃ|IndisponÃ|invÃ|�/, `${filename} contém texto com codificação quebrada`);
  }
});
