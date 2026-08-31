const http = require('http');
const https = require('https');

const DEFAULT_URL = 'http://127.0.0.1:4173';
const DEFAULT_TIMEOUT = 8_000;

function request(baseUrl, pathname, { method = 'GET', headers = {}, body, timeout = DEFAULT_TIMEOUT } = {}) {
  const url = new URL(pathname, `${baseUrl.replace(/\/$/, '')}/`);
  const transport = url.protocol === 'https:' ? https : http;
  const payload = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = transport.request(url, {
      method,
      headers: {
        Accept: 'application/json, text/plain, */*',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers
      }
    }, res => {
      const chunks = [];
      let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 2_000_000) {
          req.destroy(new Error('Resposta maior que 2 MB.'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        text: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.setTimeout(timeout, () => req.destroy(new Error(`Tempo limite de ${timeout} ms excedido.`)));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function parseJson(response, label) {
  try { return JSON.parse(response.text); }
  catch { throw new Error(`${label} não retornou JSON válido.`); }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function runSmokeBot(options = {}) {
  const baseUrl = options.baseUrl || DEFAULT_URL;
  const username = options.username || '';
  const password = options.password || '';
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const log = options.log || console.log;
  const results = [];

  async function check(name, action) {
    const startedAt = Date.now();
    try {
      const detail = await action();
      const result = { name, ok: true, detail, durationMs: Date.now() - startedAt };
      results.push(result);
      log(`[OK] ${name}${detail ? ` — ${detail}` : ''}`);
    } catch (error) {
      const result = { name, ok: false, detail: error.message, durationMs: Date.now() - startedAt };
      results.push(result);
      log(`[FALHA] ${name} — ${error.message}`);
    }
  }

  await check('Saúde do servidor', async () => {
    const response = await request(baseUrl, '/api/health', { timeout });
    expect(response.status === 200, `HTTP ${response.status}`);
    const data = parseJson(response, '/api/health');
    expect(data.ok === true, 'Servidor não confirmou estado saudável.');
    expect(['json', 'postgresql'].includes(data.storage), `Armazenamento desconhecido: ${data.storage || 'ausente'}.`);
    expect(!Number.isNaN(Date.parse(data.serverTime)), 'Horário do servidor inválido.');
    return `armazenamento ${data.storage}`;
  });

  await check('Interface principal', async () => {
    const response = await request(baseUrl, '/', { timeout });
    expect(response.status === 200, `HTTP ${response.status}`);
    expect(/<title>Proelium Operacional<\/title>/i.test(response.text), 'Título do app não encontrado.');
    expect(/<script[^>]+src=["']app\.js["']/i.test(response.text), 'Script principal não encontrado.');
    return 'HTML e app.js vinculados';
  });

  await check('Manifesto PWA', async () => {
    const response = await request(baseUrl, '/manifest.webmanifest', { timeout });
    expect(response.status === 200, `HTTP ${response.status}`);
    const manifest = parseJson(response, '/manifest.webmanifest');
    expect(manifest.name === 'Proelium Operacional', 'Nome do PWA inesperado.');
    expect(manifest.start_url, 'start_url ausente.');
    return 'manifesto válido';
  });

  await check('Service worker', async () => {
    const response = await request(baseUrl, '/sw.js', { timeout });
    expect(response.status === 200, `HTTP ${response.status}`);
    expect(/const CACHE = ['"]proelium-shell-v\d+['"]/.test(response.text), 'Identificador de cache não encontrado.');
    expect(response.text.includes("addEventListener('fetch'"), 'Tratamento offline não encontrado.');
    return 'cache e modo offline presentes';
  });

  await check('Proteção da API', async () => {
    const response = await request(baseUrl, '/api/data', { timeout });
    expect(response.status === 401, `Esperado HTTP 401 sem sessão; recebido ${response.status}.`);
    return 'dados exigem autenticação';
  });

  if (username || password) {
    if (!username || !password) {
      await check('Credenciais de teste', async () => { throw new Error('Informe usuário e senha juntos.'); });
    } else {
      let cookie = '';
      await check('Login de teste', async () => {
        const response = await request(baseUrl, '/api/auth/login', { method: 'POST', body: { username, password }, timeout });
        expect(response.status === 200, `HTTP ${response.status}`);
        const data = parseJson(response, '/api/auth/login');
        expect(data.ok === true && data.user?.username, 'Login não confirmou o usuário.');
        cookie = String(response.headers['set-cookie'] || '').split(';')[0];
        expect(cookie.startsWith('proelium_session='), 'Cookie de sessão ausente.');
        return `usuário ${data.user.username}`;
      });

      if (cookie) {
        await check('Sessão autenticada', async () => {
          const response = await request(baseUrl, '/api/auth/me', { headers: { Cookie: cookie }, timeout });
          expect(response.status === 200, `HTTP ${response.status}`);
          const data = parseJson(response, '/api/auth/me');
          expect(data.authenticated === true, 'Sessão não reconhecida.');
          return data.user?.roleLabel || data.user?.role || 'sessão válida';
        });

        await check('Leitura sincronizada', async () => {
          const response = await request(baseUrl, '/api/data', { headers: { Cookie: cookie }, timeout });
          expect(response.status === 200, `HTTP ${response.status}`);
          const data = parseJson(response, '/api/data');
          expect(Number.isInteger(data.revision) && data.revision >= 0, 'Revisão compartilhada inválida.');
          expect(Object.prototype.hasOwnProperty.call(data, 'data'), 'Envelope de dados incompleto.');
          return `revisão ${data.revision}`;
        });

        await check('Encerramento da sessão de teste', async () => {
          const response = await request(baseUrl, '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie }, timeout });
          expect(response.status === 200, `HTTP ${response.status}`);
          return 'logout confirmado';
        });
      }
    }
  }

  return { ok: results.every(result => result.ok), baseUrl, results };
}

if (require.main === module) {
  const baseUrl = process.argv[2] || process.env.PROELIUM_TEST_URL || DEFAULT_URL;
  runSmokeBot({
    baseUrl,
    username: process.env.PROELIUM_TEST_USER,
    password: process.env.PROELIUM_TEST_PASSWORD,
    timeout: Number(process.env.PROELIUM_TEST_TIMEOUT || DEFAULT_TIMEOUT)
  }).then(report => {
    const passed = report.results.filter(result => result.ok).length;
    console.log(`\n${report.ok ? 'Bot concluído' : 'Bot encontrou falhas'}: ${passed}/${report.results.length} verificações aprovadas em ${report.baseUrl}.`);
    if (!report.ok) process.exitCode = 1;
  }).catch(error => {
    console.error(`[FALHA] Não foi possível executar o bot — ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { request, runSmokeBot };
