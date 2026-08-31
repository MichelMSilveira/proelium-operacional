const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { runSmokeBot } = require('../scripts/smoke-bot');

const shell = '<!doctype html><title>Proelium Operacional</title><script src="app.js"></script>';
const manifest = JSON.stringify({ name: 'Proelium Operacional', start_url: './' });
const serviceWorker = "const CACHE = 'proelium-shell-v204'; self.addEventListener('fetch', () => {});";

async function withServer(handler, action) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    return await action(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('smoke bot validates the public shell, API protection and authenticated read', async () => {
  await withServer((req, res) => {
    const authenticated = req.headers.cookie === 'proelium_session=test';
    const json = (status, value, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
      res.end(JSON.stringify(value));
    };
    if (req.url === '/api/health') return json(200, { ok: true, storage: 'postgresql', serverTime: new Date().toISOString() });
    if (req.url === '/') { res.writeHead(200); return res.end(shell); }
    if (req.url === '/manifest.webmanifest') { res.writeHead(200); return res.end(manifest); }
    if (req.url === '/sw.js') { res.writeHead(200); return res.end(serviceWorker); }
    if (req.url === '/api/auth/login') return json(200, { ok: true, user: { username: 'bot' } }, { 'Set-Cookie': 'proelium_session=test; Path=/' });
    if (req.url === '/api/auth/me' && authenticated) return json(200, { authenticated: true, user: { roleLabel: 'Leitura' } });
    if (req.url === '/api/data' && authenticated) return json(200, { data: {}, revision: 7, updatedAt: new Date().toISOString() });
    if (req.url === '/api/data') return json(401, { error: 'É necessário entrar no sistema.' });
    if (req.url === '/api/auth/logout' && authenticated) return json(200, { ok: true });
    return json(404, { error: 'Não encontrado.' });
  }, async baseUrl => {
    const report = await runSmokeBot({ baseUrl, username: 'bot', password: 'senha-segura', log: () => {} });
    assert.equal(report.ok, true);
    assert.equal(report.results.length, 9);
    assert.equal(report.results.every(result => result.ok), true);
  });
});

test('smoke bot reports an unhealthy server with a failing exit-ready result', async () => {
  await withServer((req, res) => {
    if (req.url === '/api/health') {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false }));
    }
    if (req.url === '/') { res.writeHead(200); return res.end(shell); }
    if (req.url === '/manifest.webmanifest') { res.writeHead(200); return res.end(manifest); }
    if (req.url === '/sw.js') { res.writeHead(200); return res.end(serviceWorker); }
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Sem sessão.' }));
  }, async baseUrl => {
    const report = await runSmokeBot({ baseUrl, log: () => {} });
    assert.equal(report.ok, false);
    assert.equal(report.results.find(result => result.name === 'Saúde do servidor').ok, false);
  });
});
