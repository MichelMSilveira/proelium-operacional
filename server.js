const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const port = Number(process.env.PORT || 4173);
const root = __dirname;
const dataDirectory = path.join(root, 'data');
const dataFile = path.join(dataDirectory, 'shared-data.json');
const usersFile = path.join(dataDirectory, 'users.json');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const eventClients = new Set();
const sessions = new Map();
// Keep the authenticated session across app/browser restarts without storing passwords.
const sessionTtl = 30 * 24 * 60 * 60 * 1000;

function readUsers() {
  if (!fs.existsSync(usersFile)) return [];
  try {
    const saved = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(item => item.trim().split('='))
    .filter(([key, value]) => key && value).map(([key, value]) => [key, decodeURIComponent(value)]));
}

function currentUser(req) {
  const token = parseCookies(req).proelium_session;
  const session = token && sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + sessionTtl;
  return session;
}

function sendJson(res, status, value, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(JSON.stringify(value));
}

function setSessionCookie(res, token, maxAge = sessionTtl / 1000, secure = false) {
  res.setHeader('Set-Cookie', `proelium_session=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
}

function passwordMatches(password, user) {
  try {
    const actual = crypto.scryptSync(password, Buffer.from(user.salt, 'base64'), 64);
    const expected = Buffer.from(user.hash, 'base64');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

function passwordRecord(password) {
  const salt = crypto.randomBytes(16);
  return { salt: salt.toString('base64'), hash: crypto.scryptSync(password, salt, 64).toString('base64') };
}

function publicUser(user) {
  return { username: user.username, name: user.name || user.username, role: user.role || 'operador', active: user.active !== false };
}

function writeUsers(users) {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const temporary = `${usersFile}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(users, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, usersFile);
}

function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) {
    sendJson(res, 401, { error: 'É necessário entrar no sistema.' });
    return null;
  }
  return user;
}

function readSharedData() {
  if (!fs.existsSync(dataFile)) return { data: null, updatedAt: null, revision: 0 };
  const saved = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  return { ...saved, revision: Number(saved.revision || 1) };
}

function broadcastUpdate(saved) {
  const message = `event: data-updated\ndata: ${JSON.stringify({ revision: saved.revision, updatedAt: saved.updatedAt })}\n\n`;
  for (const client of eventClients) client.write(message);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5_000_000) reject(new Error('Payload muito grande'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

http.createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const secureCookie = req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const user = currentUser(req);
    return user ? sendJson(res, 200, { authenticated: true, user: { username: user.username, role: user.role, name: user.name || user.username } })
      : sendJson(res, 401, { authenticated: false });
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const payload = JSON.parse(await readBody(req));
      const username = String(payload.username || '').trim().toLowerCase();
      const password = String(payload.password || '');
      const user = readUsers().find(item => item.username === username && item.active !== false);
      if (!user || !passwordMatches(password, user)) return sendJson(res, 401, { error: 'Usuário ou senha inválidos.' });
      const token = crypto.randomBytes(32).toString('base64url');
      sessions.set(token, { username: user.username, role: user.role || 'operador', name: user.name || user.username, expiresAt: Date.now() + sessionTtl });
      setSessionCookie(res, token, sessionTtl / 1000, secureCookie);
      return sendJson(res, 200, { ok: true, user: { username: user.username, role: user.role || 'operador', name: user.name || user.username } });
    } catch { return sendJson(res, 400, { error: 'Solicitação de login inválida.' }); }
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const token = parseCookies(req).proelium_session;
    if (token) sessions.delete(token);
    setSessionCookie(res, '', 0, secureCookie);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/auth/users' && ['GET', 'POST', 'DELETE'].includes(req.method)) {
    const actor = requireUser(req, res);
    if (!actor) return;
    if (actor.role !== 'admin') return sendJson(res, 403, { error: 'Apenas administradores podem gerenciar usuários.' });
    const users = readUsers();
    if (req.method === 'GET') return sendJson(res, 200, { users: users.map(publicUser) });
    try {
      const payload = req.method === 'DELETE' ? { username: new URL(req.url, `http://${req.headers.host}`).searchParams.get('username') } : JSON.parse(await readBody(req));
      const username = String(payload.username || '').trim().toLowerCase();
      const index = users.findIndex(item => item.username === username);
      if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username)) return sendJson(res, 400, { error: 'Usuário inválido.' });
      if (req.method === 'DELETE') {
        if (username === actor.username) return sendJson(res, 400, { error: 'Você não pode excluir o próprio usuário.' });
        if (index < 0) return sendJson(res, 404, { error: 'Usuário não encontrado.' });
        if (users[index].role === 'admin' && users.filter(item => item.role === 'admin' && item.active !== false).length <= 1) return sendJson(res, 400, { error: 'Mantenha pelo menos um administrador ativo.' });
        users.splice(index, 1); writeUsers(users); return sendJson(res, 200, { ok: true });
      }
      const password = String(payload.password || '');
      if (index < 0 && password.length < 10) return sendJson(res, 400, { error: 'A senha deve ter pelo menos 10 caracteres.' });
      if (payload.role && !['admin', 'operador'].includes(payload.role)) return sendJson(res, 400, { error: 'Papel inválido.' });
      const existing = index >= 0 ? users[index] : { username, createdAt: new Date().toISOString() };
      const next = { ...existing, username, name: String(payload.name || username).trim().slice(0, 80), role: payload.role || existing.role || 'operador', active: payload.active !== false };
      if (password) { if (password.length < 10) return sendJson(res, 400, { error: 'A senha deve ter pelo menos 10 caracteres.' }); Object.assign(next, passwordRecord(password)); }
      users[index >= 0 ? index : users.length] = next;
      writeUsers(users);
      return sendJson(res, index >= 0 ? 200 : 201, { ok: true, user: publicUser(next) });
    } catch { return sendJson(res, 400, { error: 'Dados de usuário inválidos.' }); }
  }

  if (pathname.startsWith('/api/')) {
    const user = requireUser(req, res);
    if (!user) return;
  }

  if (pathname === '/api/data' && req.method === 'GET') {
    try {
      return sendJson(res, 200, readSharedData());
    } catch {
      return sendJson(res, 500, { error: 'Não foi possível ler os dados compartilhados.' });
    }
  }

  if (pathname === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 3000\n\n');
    eventClients.add(res);
    req.on('close', () => eventClients.delete(res));
    return;
  }

  if (pathname === '/api/data' && req.method === 'PUT') {
    try {
      const payload = JSON.parse(await readBody(req));
      if (!payload || typeof payload.data !== 'object') return sendJson(res, 400, { error: 'Dados inválidos.' });
      const current = readSharedData();
      const baseRevision = Number(payload.baseRevision || 0);
      if (current.revision !== baseRevision) {
        return sendJson(res, 409, {
          error: 'Os dados foram atualizados por outro aparelho.',
          revision: current.revision,
          updatedAt: current.updatedAt
        });
      }
      fs.mkdirSync(dataDirectory, { recursive: true });
      const saved = { data: payload.data, updatedAt: new Date().toISOString(), revision: current.revision + 1 };
      const temporary = `${dataFile}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(saved, null, 2), 'utf8');
      fs.renameSync(temporary, dataFile);
      sendJson(res, 200, { ok: true, updatedAt: saved.updatedAt, revision: saved.revision });
      broadcastUpdate(saved);
      return;
    } catch {
      return sendJson(res, 400, { error: 'Não foi possível salvar os dados.' });
    }
  }

  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(root, requested);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, {
    'Content-Type': types[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': path.extname(file) === '.html' || path.extname(file) === '.js' || path.extname(file) === '.css' ? 'no-cache' : 'public, max-age=3600'
  });
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Proelium Operacional: http://localhost:${port}`));

setInterval(() => {
  for (const client of eventClients) client.write(': keep-alive\n\n');
}, 25000).unref();
