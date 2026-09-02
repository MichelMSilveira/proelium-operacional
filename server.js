const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createStorage } = require('./storage');

const port = Number(process.env.PORT || 4173);
const root = __dirname;
const isolatedTestDirectory = String(process.env.PROELIUM_TEST_DATA_DIR || '').trim();
if (isolatedTestDirectory && process.env.NODE_ENV !== 'test') {
  throw new Error('PROELIUM_TEST_DATA_DIR só pode ser usado com NODE_ENV=test.');
}
const dataDirectory = isolatedTestDirectory ? path.resolve(isolatedTestDirectory) : path.join(root, 'data');
const dataFile = path.join(dataDirectory, 'shared-data.json');
const usersFile = path.join(dataDirectory, 'users.json');
const companiesFile = path.join(dataDirectory, 'companies.json');
const routinesFile = path.join(dataDirectory, 'routines.json');
const storage = createStorage({ dataFile, usersFile, companiesFile, routinesFile });
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const publicFiles = new Set(['index.html', 'styles.css', 'quotes.css', 'bi.css', 'crm.css', 'danger.css', 'app.js', 'sw.js', 'manifest.webmanifest', 'icon.svg']);
const eventClients = new Set();
const presence = new Map();
const loginAttempts = new Map();
const googleStates = new Map();
// Keep the authenticated session across app/browser restarts without storing passwords.
const sessionTtl = 30 * 24 * 60 * 60 * 1000;
const configuredSessionSecret = String(process.env.SESSION_SECRET || '').trim();
if (process.env.NODE_ENV === 'production' && (!configuredSessionSecret || configuredSessionSecret.length < 32)) {
  throw new Error('SESSION_SECRET deve ser configurado em produção com pelo menos 32 caracteres.');
}
const sessionSecret = configuredSessionSecret || 'proelium-development-session-secret-change-me';

const roleLabels = { admin: 'Administrador', comercial: 'Comercial', operacao: 'Operação', financeiro: 'Financeiro', leitura: 'Leitura', operador: 'Operação' };
const rolePermissions = {
  admin: ['*'],
  comercial: ['dashboard', 'clients', 'commercial', 'quotes', 'products', 'survey'],
  operacao: ['dashboard', 'projects', 'processes', 'tasks', 'agenda', 'installations', 'operations', 'quality', 'collaborators', 'equipment', 'knowledge'],
  financeiro: ['dashboard', 'clients', 'projects', 'commercial', 'finance', 'bi', 'biMarket', 'knowledge'],
  leitura: ['dashboard', 'projects', 'installations', 'knowledge', 'bi', 'biMarket']
};
const normalizeRole = role => role === 'operador' ? 'operacao' : (rolePermissions[role] ? role : 'operacao');
const permissionsFor = role => rolePermissions[normalizeRole(role)] || rolePermissions.operacao;
const writableRoles = { admin: null, comercial: new Set(['clients', 'commercial', 'quotes', 'products', 'survey']), operacao: new Set(['projects', 'processes', 'tasks', 'agenda', 'installations', 'operations', 'reports', 'quality', 'collaborators', 'equipment']), financeiro: new Set(['finance']), leitura: new Set() };
const dataDomains = { clients: 'clients', projects: 'projects', processes: 'processes', tasks: 'tasks', agenda: 'appointments', commercial: 'opportunities', quotes: 'quotes', products: 'products', survey: 'surveys', installations: 'installations', operations: 'serviceOrders', reports: 'serviceReports', quality: 'evaluations', collaborators: 'collaborators', equipment: 'equipment', finance: 'financialEntries' };

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(item => item.trim().split('='))
    .filter(([key, value]) => key && value).map(([key, value]) => [key, decodeURIComponent(value)]));
}
function rejectsCrossOriginMutation(req) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return false;
  const origin = req.headers.origin;
  if (!origin) return false;
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  return origin !== `${protocol}://${req.headers.host}`;
}

function signedSession(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function currentUser(req) {
  const value = parseCookies(req).proelium_session || '';
  const [encoded, signature] = value.split('.');
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac('sha256', sessionSecret).update(encoded).digest('base64url');
  const actualBuffer = Buffer.from(signature), expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const session = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return session.expiresAt >= Date.now() ? session : null;
  } catch { return null; }
}

const securityHeaders = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' };
function sendJson(res, status, value, extraHeaders = {}) {
  res.writeHead(status, { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
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
  const role = normalizeRole(user.role);
  return { username: user.username, name: user.name || user.username, email: user.email || '', role: user.role || 'operador', roleLabel: roleLabels[role], permissions: permissionsFor(role), active: user.active !== false, companyId: user.companyId || 'legacy' };
}
function httpsJson(url, options={}, body='') { return new Promise((resolve,reject)=>{ const request=https.request(url,{...options,headers:{'Content-Type':'application/x-www-form-urlencoded',...(options.headers||{})}},response=>{let raw='';response.on('data',chunk=>raw+=chunk);response.on('end',()=>{try{resolve({status:response.statusCode,data:JSON.parse(raw)})}catch{reject(new Error('Resposta OAuth inválida.'))}})});request.on('error',reject);if(body)request.write(body);request.end();}); }

function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) {
    sendJson(res, 401, { error: 'É necessário entrar no sistema.' });
    return null;
  }
  return user;
}

function broadcastUpdate(saved) {
  const message = `event: data-updated\ndata: ${JSON.stringify({ revision: saved.revision, updatedAt: saved.updatedAt })}\n\n`;
  for (const client of eventClients) client.write(message);
}
function broadcastEvent(name, payload) { const message = `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`; for (const client of eventClients) client.write(message); }
function normalizeDevice(value) { const device = String(value || '').trim().slice(0, 32); return ['Android', 'iPhone/iPad', 'Windows', 'macOS', 'Linux', 'Navegador'].includes(device) ? device : 'Navegador'; }
function deviceFromUserAgent(value) { const ua=String(value||''); return /Android/i.test(ua)?'Android':/iPhone|iPad|iPod/i.test(ua)?'iPhone/iPad':/Windows/i.test(ua)?'Windows':/Macintosh|Mac OS/i.test(ua)?'macOS':/Linux/i.test(ua)?'Linux':'Navegador'; }
function presencePayload() { return [...presence.values()].filter(item => Date.now() - item.lastSeen < 90_000).sort((a,b) => a.name.localeCompare(b.name, 'pt-BR')).map(({ username, name, role, available, device }) => { const sessions=[...eventClients].filter(client=>client.username===username),devices=[...new Set([...sessions.map(client=>normalizeDevice(client.device)),normalizeDevice(device)])]; return { username, name, role, device: devices[0], devices, sessions: Math.max(1,sessions.length), available: available !== false }; }); }
function announcePresence() { broadcastEvent('presence-updated', { users: presencePayload(), at: new Date().toISOString() }); }
function touchPresence(user, req) { const previous=presence.get(user.username); presence.set(user.username, { username: user.username, name: user.name || user.username, role: user.role || 'operador', device: deviceFromUserAgent(req?.headers?.['user-agent']) || previous?.device || 'Navegador', available: previous?.available !== false, lastSeen: Date.now() }); announcePresence(); }

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

async function handleRequest(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const secureCookie = req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';

  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, storage: storage.backend, isolatedTestMode: Boolean(isolatedTestDirectory), serverTime: new Date().toISOString() });
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const user = currentUser(req);
    return user ? sendJson(res, 200, { authenticated: true, user: publicUser(user) })
      : sendJson(res, 401, { authenticated: false });
  }

  if (pathname === '/api/auth/google' && req.method === 'GET') {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return sendJson(res,503,{error:'Login Google ainda não configurado no servidor.'});
    const state=crypto.randomBytes(24).toString('hex'); googleStates.set(state,Date.now()+300000);
    const redirect=process.env.GOOGLE_REDIRECT_URI || `${req.headers['x-forwarded-proto']==='https'?'https':'http'}://${req.headers.host}/api/auth/google/callback`;
    const params=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,redirect_uri:redirect,response_type:'code',scope:'openid email profile',state});
    res.writeHead(302,{Location:`https://accounts.google.com/o/oauth2/v2/auth?${params}`});res.end();return;
  }
  if (pathname === '/api/auth/google/callback' && req.method === 'GET') {
    try { const query=new URL(req.url,`http://${req.headers.host}`).searchParams,state=query.get('state'),code=query.get('code');if(!state||googleStates.get(state)<Date.now()||!code)return sendJson(res,400,{error:'Validação Google expirada ou inválida.'});googleStates.delete(state);const redirect=process.env.GOOGLE_REDIRECT_URI || `${req.headers['x-forwarded-proto']==='https'?'https':'http'}://${req.headers.host}/api/auth/google/callback`;const token=await httpsJson('https://oauth2.googleapis.com/token',{method:'POST'},new URLSearchParams({code,client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,redirect_uri:redirect,grant_type:'authorization_code'}).toString());if(token.status!==200||!token.data.access_token)return sendJson(res,401,{error:'Não foi possível validar a conta Google.'});const profile=await httpsJson(`https://openidconnect.googleapis.com/v1/userinfo?access_token=${encodeURIComponent(token.data.access_token)}`);const email=String(profile.data.email||'').trim().toLowerCase();if(profile.status!==200||!email||profile.data.email_verified!==true)return sendJson(res,401,{error:'A conta Google precisa ter e-mail verificado.'});const user=(await storage.readUsers()).find(item=>String(item.email||'').toLowerCase()===email&&item.active!==false);if(!user)return sendJson(res,403,{error:'Este e-mail ainda não está vinculado a um usuário do Proelium.'});const session=signedSession({username:user.username,role:user.role||'operador',name:user.name||profile.data.name||user.username,email,companyId:user.companyId||'legacy',expiresAt:Date.now()+sessionTtl});setSessionCookie(res,session,sessionTtl/1000,secureCookie);res.writeHead(302,{Location:'/'});res.end();return; } catch(error) { console.error('Falha no OAuth Google:',error.message);return sendJson(res,502,{error:'Não foi possível concluir o login Google.'}); }
  }

  if (pathname === '/api/auth/register-company' && req.method === 'POST') {
    try {
      const payload=JSON.parse(await readBody(req));
      const companyName=String(payload.companyName||'').trim().slice(0,120), document=String(payload.document||'').trim().slice(0,32);
      const username=String(payload.username||'').trim().toLowerCase(), name=String(payload.name||'').trim().slice(0,80), password=String(payload.password||'');
      if(!companyName||!name||!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username)||password.length<10)return sendJson(res,400,{error:'Informe empresa, nome, usuário válido e senha com pelo menos 10 caracteres.'});
      const companies=await storage.readCompanies(), users=await storage.readUsers();
      if(users.some(user=>user.username===username))return sendJson(res,409,{error:'Esse usuário já está cadastrado.'});
      const company={id:`emp-${crypto.randomUUID()}`,name:companyName,document,createdAt:new Date().toISOString()};
      await storage.writeCompanies([...companies,company]);
      const user={username,name,role:'admin',active:true,companyId:company.id,createdAt:new Date().toISOString(),...passwordRecord(password)};
      await storage.writeUsers([...users,user]);
      const token=signedSession({username,role:'admin',name,companyId:company.id,expiresAt:Date.now()+sessionTtl}); setSessionCookie(res,token,sessionTtl/1000,secureCookie);
      return sendJson(res,201,{ok:true,user:publicUser(user),company});
    } catch(error) { console.error('Falha no cadastro de empresa:',error.message); return sendJson(res,400,{error:'Não foi possível concluir o cadastro.'}); }
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const payload = JSON.parse(await readBody(req));
      const username = String(payload.username || '').trim().toLowerCase();
      const password = String(payload.password || '');
      const attemptKey = `${req.socket.remoteAddress || 'unknown'}:${username}`;
      const attempt = loginAttempts.get(attemptKey);
      if (attempt && attempt.lockedUntil > Date.now()) return sendJson(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
      const user = (await storage.readUsers()).find(item => item.username === username && item.active !== false);
      if (!user || !passwordMatches(password, user)) {
        const next = attempt && attempt.lockedUntil <= Date.now() ? { failures: 0 } : (attempt || { failures: 0 });
        next.failures += 1;
        next.lockedUntil = next.failures >= 5 ? Date.now() + 5 * 60 * 1000 : 0;
        loginAttempts.set(attemptKey, next);
        return sendJson(res, 401, { error: 'Usuário ou senha inválidos.' });
      }
      loginAttempts.delete(attemptKey);
      const token = signedSession({ username: user.username, role: user.role || 'operador', name: user.name || user.username, companyId: user.companyId || 'legacy', expiresAt: Date.now() + sessionTtl });
      setSessionCookie(res, token, sessionTtl / 1000, secureCookie);
      return sendJson(res, 200, { ok: true, user: publicUser(user) });
    } catch { return sendJson(res, 400, { error: 'Solicitação de login inválida.' }); }
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const user = currentUser(req); if (user) { presence.delete(user.username); announcePresence(); }
    setSessionCookie(res, '', 0, secureCookie);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/company/routines' && ['GET','PUT'].includes(req.method)) {
    const actor=requireUser(req,res); if(!actor)return;
    const companyId=actor.companyId||'legacy';
    if(req.method==='GET')return sendJson(res,200,{routines:await storage.readRoutines(companyId)});
    try { const payload=JSON.parse(await readBody(req)), routines=Array.isArray(payload.routines)?payload.routines.slice(0,200).map(item=>({id:String(item.id||crypto.randomUUID()).slice(0,80),name:String(item.name||'').trim().slice(0,120),description:String(item.description||'').trim().slice(0,500),periodicity:String(item.periodicity||'Sem periodicidade').slice(0,40),steps:Array.isArray(item.steps)?item.steps.slice(0,100).map(step=>String(step).trim().slice(0,200)).filter(Boolean):[]})).filter(item=>item.name):[]; await storage.writeRoutines(companyId,routines); return sendJson(res,200,{ok:true,routines}); } catch { return sendJson(res,400,{error:'Rotinas inválidas.'}); }
  }

  if (pathname === '/api/auth/users' && ['GET', 'POST', 'DELETE'].includes(req.method)) {
    const actor = requireUser(req, res);
    if (!actor) return;
    if (actor.role !== 'admin') return sendJson(res, 403, { error: 'Apenas administradores podem gerenciar usuários.' });
    let users;
    try { users = await storage.readUsers(); }
    catch (error) {
      console.error('Falha ao ler usuários:', error.message);
      return sendJson(res, 503, { error: 'Armazenamento temporariamente indisponível.' });
    }
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
        users.splice(index, 1); await storage.writeUsers(users); return sendJson(res, 200, { ok: true });
      }
      const password = String(payload.password || '');
      if (index < 0 && password.length < 10) return sendJson(res, 400, { error: 'A senha deve ter pelo menos 10 caracteres.' });
      if (payload.role && !Object.keys(rolePermissions).includes(payload.role)) return sendJson(res, 400, { error: 'Papel inválido.' });
      const existing = index >= 0 ? users[index] : { username, createdAt: new Date().toISOString() };
      const email = String(payload.email || existing.email || '').trim().toLowerCase();
      if (email && !/^\S+@\S+\.\S+$/.test(email)) return sendJson(res, 400, { error: 'E-mail inválido.' });
      const next = { ...existing, username, email, name: String(payload.name || username).trim().slice(0, 80), role: payload.role || existing.role || 'operador', active: payload.active !== false };
      if (password) { if (password.length < 10) return sendJson(res, 400, { error: 'A senha deve ter pelo menos 10 caracteres.' }); Object.assign(next, passwordRecord(password)); }
      users[index >= 0 ? index : users.length] = next;
      await storage.writeUsers(users);
      return sendJson(res, index >= 0 ? 200 : 201, { ok: true, user: publicUser(next) });
    } catch { return sendJson(res, 400, { error: 'Dados de usuário inválidos.' }); }
  }

  let authenticatedUser = null;
  if (pathname.startsWith('/api/')) {
    authenticatedUser = requireUser(req, res);
    if (!authenticatedUser) return;
    if (rejectsCrossOriginMutation(req)) return sendJson(res, 403, { error: 'Origem da solicitação não autorizada.' });
    touchPresence(authenticatedUser, req);
  }

  if (pathname === '/api/presence' && req.method === 'GET') return sendJson(res, 200, { users: presencePayload() });
  if (pathname === '/api/presence/heartbeat' && req.method === 'POST') { try { const payload=JSON.parse(await readBody(req)||'{}'), current=presence.get(authenticatedUser.username); if(current&&payload.device) current.device=normalizeDevice(payload.device); announcePresence(); return sendJson(res, 200, { ok: true, users: presencePayload() }); } catch { return sendJson(res, 400, { error: 'Heartbeat inválido.' }); } }
  if (pathname === '/api/presence/availability' && req.method === 'POST') {
    try { const payload=JSON.parse(await readBody(req)), current=presence.get(authenticatedUser.username); if(current) { current.available=payload.available!==false; for(const client of eventClients)if(client.username===authenticatedUser.username)client.available=current.available; } announcePresence(); return sendJson(res,200,{ok:true,users:presencePayload()}); }
    catch { return sendJson(res,400,{error:'Disponibilidade inválida.'}); }
  }
  if (pathname === '/api/collaboration-requests' && req.method === 'POST') {
    try {
      const payload = JSON.parse(await readBody(req));
      const message = String(payload.message || '').trim().slice(0, 500);
      if (!message) return sendJson(res, 400, { error: 'Descreva como deseja colaborar.' });
      const request = { id: crypto.randomUUID(), from: publicUser(authenticatedUser), message, at: new Date().toISOString() };
      for (const client of eventClients) if (client.userRole === 'admin') client.write(`event: collaboration-request\ndata: ${JSON.stringify(request)}\n\n`);
      return sendJson(res, 202, { ok: true });
    } catch { return sendJson(res, 400, { error: 'Pedido de colaboração inválido.' }); }
  }
  if (pathname === '/api/assistance-requests' && req.method === 'POST') {
    try {
      const payload=JSON.parse(await readBody(req)), message=String(payload.message||'').trim().slice(0,500);
      if(!message)return sendJson(res,400,{error:'Descreva o auxílio necessário.'});
      const request={id:crypto.randomUUID(),from:publicUser(authenticatedUser),message,at:new Date().toISOString()};
      for(const client of eventClients)if(client.username!==authenticatedUser.username&&client.available!==false)client.write(`event: assistance-request\ndata: ${JSON.stringify(request)}\n\n`);
      return sendJson(res,202,{ok:true});
    } catch { return sendJson(res,400,{error:'Pedido de auxílio inválido.'}); }
  }

  if (pathname === '/api/data' && req.method === 'GET') {
    try {
      return sendJson(res, 200, await storage.readSharedData());
    } catch {
      return sendJson(res, 500, { error: 'Não foi possível ler os dados compartilhados.' });
    }
  }

  if (pathname === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      ...securityHeaders,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 3000\n\n');
    eventClients.add(res);
    res.username = authenticatedUser.username;
    res.userRole = normalizeRole(authenticatedUser.role);
    res.device = deviceFromUserAgent(req.headers['user-agent']);
    res.available = presence.get(authenticatedUser.username)?.available !== false;
    touchPresence(authenticatedUser, req);
    res.write(`event: presence-updated\ndata: ${JSON.stringify({ users: presencePayload() })}\n\n`);
    req.on('close', () => { eventClients.delete(res); if (![...eventClients].some(client => client.username === authenticatedUser.username)) { presence.delete(authenticatedUser.username); announcePresence(); } });
    return;
  }

  if (pathname === '/api/data' && req.method === 'PUT') {
    try {
      const payload = JSON.parse(await readBody(req));
      if (!payload || typeof payload.data !== 'object') return sendJson(res, 400, { error: 'Dados inválidos.' });
      const role = normalizeRole(authenticatedUser.role);
      const allowed = writableRoles[role];
      if (allowed) {
        const current = await storage.readSharedData();
        const changedDomains = Object.keys(dataDomains).filter(view => {
          const key = dataDomains[view];
          return JSON.stringify(current.data?.[key] ?? null) !== JSON.stringify(payload.data[key] ?? null);
        });
        const denied = changedDomains.filter(view => !allowed.has(view));
        if (denied.length) return sendJson(res, 403, { error: `Seu perfil não pode alterar: ${denied.join(', ')}.` });
      }
      const baseRevision = Number(payload.baseRevision || 0);
      const result = await storage.writeSharedData(payload.data, baseRevision, authenticatedUser.username);
      if (result.conflict) {
        return sendJson(res, 409, {
          error: 'Os dados foram atualizados por outro aparelho.',
          revision: result.current.revision,
          updatedAt: result.current.updatedAt
        });
      }
      const saved = result.value;
      sendJson(res, 200, { ok: true, updatedAt: saved.updatedAt, revision: saved.revision });
      broadcastUpdate(saved);
      return;
    } catch {
      return sendJson(res, 400, { error: 'Não foi possível salvar os dados.' });
    }
  }

  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const safeSegments = requested.split('/').every(segment => segment && segment !== '.' && segment !== '..');
  const publicAsset = safeSegments && (publicFiles.has(requested) || requested.startsWith('assets/') || requested.startsWith('downloads/'));
  if (!publicAsset) {
    res.writeHead(404); res.end('Not found'); return;
  }
  const file = path.resolve(root, requested);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, {
    ...securityHeaders,
    'Content-Type': types[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': path.extname(file) === '.html' || path.extname(file) === '.js' || path.extname(file) === '.css' ? 'no-cache' : 'public, max-age=3600'
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(error => {
    console.error('Falha inesperada na requisição:', error.message);
    if (!res.headersSent) sendJson(res, 500, { error: 'Falha interna do servidor.' });
    else res.destroy();
  });
});

async function start() {
  await storage.initialize();
  server.listen(port, '127.0.0.1', () => console.log(`Proelium Operacional: http://localhost:${port} · ${storage.backend}`));
}

async function shutdown() {
  server.close(async () => {
    await storage.close();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch(error => {
  console.error('Falha ao iniciar o Proelium:', error.message);
  process.exit(1);
});

setInterval(() => {
  for (const client of eventClients) client.write(': keep-alive\n\n');
}, 25000).unref();
