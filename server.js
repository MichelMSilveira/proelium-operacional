const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createStorage } = require('./storage');

// Carrega configurações locais sem depender de pacote externo; nunca imprime valores sensíveis.
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

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
const invitesFile = path.join(dataDirectory, 'company-invites.json');
const companyDataDirectory = path.join(dataDirectory, 'company-data');
const storage = createStorage({ dataFile, usersFile, companiesFile, routinesFile, invitesFile, companyDataDirectory });
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

const roleLabels = { admin: 'Administrador', suporte: 'Suporte da plataforma', comercial: 'Comercial', operacao: 'Operação', financeiro: 'Financeiro', leitura: 'Leitura', operador: 'Operação' };
const rolePermissions = {
  admin: ['*'],
  suporte: [],
  comercial: ['dashboard', 'clients', 'commercial', 'quotes', 'products', 'survey'],
  operacao: ['dashboard', 'projects', 'processes', 'tasks', 'agenda', 'installations', 'operations', 'quality', 'collaborators', 'equipment', 'knowledge'],
  financeiro: ['dashboard', 'clients', 'projects', 'commercial', 'finance', 'bi', 'biMarket', 'knowledge'],
  leitura: ['dashboard', 'projects', 'installations', 'knowledge', 'bi', 'biMarket']
};
const normalizeRole = role => role === 'operador' ? 'operacao' : (rolePermissions[role] ? role : 'operacao');
const permissionsFor = role => rolePermissions[normalizeRole(role)] || rolePermissions.operacao;
const writableRoles = { admin: null, comercial: new Set(['clients', 'commercial', 'quotes', 'products', 'survey']), operacao: new Set(['projects', 'processes', 'tasks', 'agenda', 'installations', 'operations', 'reports', 'quality', 'collaborators', 'equipment']), financeiro: new Set(['finance']), leitura: new Set() };
const dataDomains = { clients: 'clients', projects: 'projects', processes: 'processes', tasks: 'tasks', agenda: 'appointments', commercial: 'opportunities', quotes: 'quotes', products: 'products', survey: 'surveys', installations: 'installations', operations: 'serviceOrders', reports: 'serviceReports', quality: 'evaluations', collaborators: 'collaborators', equipment: 'equipment', finance: 'financialEntries' };
const dataAccessScopes = {
  clients: ['clients', 'activities'], projects: ['projects', 'projectChecklists', 'projectDeliveries', 'supportTickets', 'technicalConnections', 'technicalConnectionEdits', 'technicalConnectionOverrides'],
  processes: ['processes'], tasks: ['tasks'], agenda: ['appointments'], commercial: ['opportunities'],
  quotes: ['quotes', 'quoteRooms', 'packages', 'procurementRequests'], products: ['products', 'manufacturerLibrary'],
  survey: ['surveys', 'surveyPoints', 'surveyRooms'], installations: ['installations'], operations: ['serviceOrders'],
  reports: ['serviceReports'], quality: ['evaluations'], collaborators: ['collaborators'],
  equipment: ['equipment', 'equipmentHistory'], finance: ['financialEntries', 'financialAccounts'],
  knowledge: ['articles'], audit: ['auditLog', 'recoveryLog'], diagram: ['technicalPoints', 'technicalConnections', 'technicalConnectionEdits', 'technicalConnectionOverrides'],
  purchases: ['purchaseItems'], execution: ['executionEntries', 'executionItems']
};
const companyTrialModules = {
  contratante: ['dashboard','commercial','quotes','clients','products','projects','processes','tasks','agenda','operations','reports','finance','bi','biMarket','quality','collaborators','equipment','knowledge','routines'],
  contratado: ['dashboard','clients','projects','processes','tasks','agenda','operations','reports','quality','collaborators','equipment','execution','knowledge','routines'],
  residencial: ['dashboard','clients','projects','agenda','operations','reports','quality','equipment','knowledge']
};
function modulesForCompanyTrial(company, user) {
  const available = companyTrialModules[company?.companyType] || companyTrialModules.contratado;
  if (user?.accountType === 'founder' || user?.role === 'admin') return available;
  const roleViews = permissionsFor(user?.role);
  return available.filter(view => roleViews.includes('*') || roleViews.includes(view));
}
const platformAdmins = new Set(String(process.env.PROELIUM_PLATFORM_ADMINS || 'admin').split(',').map(value => value.trim().toLowerCase()).filter(Boolean));
function isPlatformAdmin(user) { return Boolean(user && (platformAdmins.has(String(user.username || '').toLowerCase()) || platformAdmins.has(String(user.email || '').toLowerCase()))); }
function isPortfolioUser(user) { return Boolean(user?.accountType === 'portfolio'); }
function isSupportUser(user) { return Boolean(user && !isPlatformAdmin(user) && !isPortfolioUser(user) && (!user.companyId || user.companyId === 'legacy') && (user.role === 'suporte' || user.role === 'admin')); }
function isPlatformStaff(user) { return isPlatformAdmin(user) || isSupportUser(user); }
function isCompanyAdmin(user) { return Boolean(user?.role === 'admin' && user.companyId && user.companyId !== 'legacy'); }

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
function setGooglePendingCookie(res, token, secure = false) {
  res.setHeader('Set-Cookie', `proelium_google_pending=${encodeURIComponent(token)}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
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
  const platformAdmin=isPlatformAdmin(user);
  const companyScoped=Boolean(user.companyId&&user.companyId!=='legacy');
  const supportUser=isSupportUser(user);
  const companyFullAccess=companyScoped&&user.companyAccessOverride==='full',rolePermissionList=permissionsFor(role), permissions=companyFullAccess?['*']:(Array.isArray(user.modules)&&user.modules.length?rolePermissionList[0]==='*'?user.modules:rolePermissionList.filter(item=>user.modules.includes(item)):rolePermissionList);
  const portfolioUser=isPortfolioUser(user);
  return { username: user.username, name: user.name || user.username, email: user.email || '', role: user.role || 'operador', roleLabel: supportUser ? 'Suporte da plataforma' : portfolioUser ? 'Perfil pessoal' : roleLabels[role], scope:platformAdmin?'platform':companyScoped?'company':supportUser?'support':portfolioUser?'portfolio':'legacy', platformAdmin, supportUser, portfolioUser, accountType:user.accountType||'member', founder:user.accountType==='founder'||user.founder===true, permissions:portfolioUser?[]:permissions, modules:portfolioUser?[]:(Array.isArray(user.modules)?user.modules:[]), companyAccessOverride:companyFullAccess?'full':null, portfolioCount:Array.isArray(user.portfolio)?user.portfolio.length:0, accessLevel:portfolioUser?'full':(user.accessLevel||(companyScoped?'limited':'full')), licenseStatus:portfolioUser?'approved':(user.licenseStatus||(companyScoped?'pending':'approved')), companyStatus:portfolioUser?'approved':(user.companyStatus||'approved'), active: user.active !== false, companyId: portfolioUser ? null : (user.companyId || 'legacy') };
}
function dataViewsForUser(user) {
  if (isPlatformAdmin(user) || isSupportUser(user) || isPortfolioUser(user)) return new Set();
  if (user?.companyId && user.companyId !== 'legacy' && user.companyAccessOverride === 'full') return new Set(['*']);
  const roleViews = permissionsFor(user?.role);
  const modules = Array.isArray(user?.modules) ? user.modules : [];
  const views = user?.accessLevel === 'limited'
    ? (modules.length ? modules : ['dashboard', 'knowledge'])
    : (modules.length ? (roleViews[0] === '*' ? modules : roleViews.filter(view => modules.includes(view))) : roleViews);
  return new Set(views);
}
function visibleDataForUser(data, user) {
  const allowed = dataViewsForUser(user), full = allowed.has('*'), scopedKeys = new Set(Object.values(dataAccessScopes).flat());
  return Object.fromEntries(Object.entries(data || {}).map(([key, value]) => {
    if (!Array.isArray(value)) return [key, value];
    const scope = Object.entries(dataAccessScopes).find(([, keys]) => keys.includes(key))?.[0];
    return [key, scopedKeys.has(key) && !full && !allowed.has(scope) ? [] : value];
  }));
}
function mergeWritableData(current, incoming, user) {
  const allowed = dataViewsForUser(user), full = allowed.has('*'), merged = { ...current, ...Object.fromEntries(Object.entries(incoming || {}).filter(([, value]) => !Array.isArray(value))) };
  for (const [scope, keys] of Object.entries(dataAccessScopes)) {
    if (!full && !allowed.has(scope)) continue;
    for (const key of keys) if (Object.prototype.hasOwnProperty.call(incoming || {}, key)) merged[key] = incoming[key];
  }
  return merged;
}
function validCnpj(value) { const digits=String(value||'').replace(/\D/g,''); if(digits.length!==14||/^([0-9])\1+$/.test(digits))return false; const calc=(length)=>{let sum=0,factor=5+(length-12);for(let i=0;i<length;i++){sum+=Number(digits[i])*factor--;if(factor===1)factor=9}const digit=(sum%11<2?0:11-sum%11);return digit};return calc(12)===Number(digits[12])&&calc(13)===Number(digits[13]); }
function validCpf(value) { const digits=String(value||'').replace(/\D/g,''); if(digits.length!==11||/^([0-9])\1+$/.test(digits))return false; const calc=(length)=>{let sum=0;for(let i=0;i<length;i++)sum+=Number(digits[i])*(length+1-i);const rest=(sum*10)%11;return rest===10?0:rest};return calc(9)===Number(digits[9])&&calc(10)===Number(digits[10]); }
function inviteTokenHash(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }
function invitePublic(invite, companies) { const company=companies.find(item=>item.id===invite.companyId); return { id:invite.id, companyId:invite.companyId, companyName:company?.name||'Empresa', email:invite.email||'', role:invite.role||'operacao', modules:invite.modules||[], expiresAt:invite.expiresAt, usedAt:invite.usedAt||null, createdAt:invite.createdAt }; }
function companyProfilePublic(company) { return { id:company.id, name:company.name||'', document:company.document||'', responsible:company.responsible||'', phone:company.phone||'', companyType:company.companyType||'', profileInfo:company.profileInfo||'', founderUsername:company.founderUsername||'', status:company.status||'pending', accessLevel:company.accessLevel||'limited', licenseStatus:company.licenseStatus||'pending', createdAt:company.createdAt||null }; }
function companyWithAdminContact(company, users) {
  const admin = users.find(user => user.companyId === company.id && user.role === 'admin' && user.active !== false);
  return { ...company, adminName: admin?.name || company.responsible || '', adminEmail: admin?.email || '', adminUsername: admin?.username || '' };
}
function membershipModules(user, company, fallback=[]) {
  // A conta fundadora é a responsável por avaliar o produto e precisa conhecer
  // todos os módulos pertinentes ao seu tipo de empresa. A limitação de cargo
  // continua valendo para os demais participantes convidados.
  if (company && (user?.accountType === 'founder' || user?.founder === true)) return modulesForCompanyTrial(company, user);
  if (Array.isArray(user?.modules) && user.modules.length) return user.modules;
  if (company?.licenseStatus === 'pending' || company?.status === 'pending') return modulesForCompanyTrial(company, user);
  return Array.isArray(company?.modules) && company.modules.length ? company.modules : fallback;
}
function portfolioEntry(user, company, leftAt=new Date().toISOString()) {
  return { companyId:company.id, companyName:company.name||'Empresa', role:user.role||'operador', founder:user.accountType==='founder'||user.founder===true, joinedAt:user.createdAt||null, leftAt };
}
function accountProfilePublic(user) {
  return { username:user.username, name:user.name||user.username, email:user.email||'', accountType:user.accountType||'member', founder:user.accountType==='founder'||user.founder===true, profileInfo:user.profileInfo||'', portfolio:Array.isArray(user.portfolio)?user.portfolio:[], companyId:user.companyId||null };
}
function httpsJson(url, options={}, body='') { return new Promise((resolve,reject)=>{ const request=https.request(url,{...options,headers:{'Content-Type':'application/x-www-form-urlencoded',...(options.headers||{})}},response=>{let raw='';response.on('data',chunk=>raw+=chunk);response.on('end',()=>{try{resolve({status:response.statusCode,data:JSON.parse(raw)})}catch{reject(new Error('Resposta OAuth inválida.'))}})});request.on('error',reject);if(body)request.write(body);request.end();}); }

async function storedUserFromSession(req) {
  const session = currentUser(req);
  if (!session) return null;
  const users = await storage.readUsers();
  const user = users.find(item => item.username === session.username && item.active !== false);
  if (!user) return null;
  if (session.email && user.email && String(session.email).toLowerCase() !== String(user.email).toLowerCase()) return null;
  const companyId = Object.prototype.hasOwnProperty.call(user, 'companyId') ? (user.companyId || 'legacy') : (session.companyId || 'legacy');
  const company = companyId !== 'legacy' ? (await storage.readCompanies()).find(item => item.id === companyId) : null;
  const userModules = membershipModules(user, company, Array.isArray(session.modules) ? session.modules : []);
  return {
    ...session,
    ...user,
    email: user.email || session.email || '',
    name: user.name || session.name || user.username,
    role: user.role || session.role || 'operador',
    companyId,
    accessLevel: isPortfolioUser(user) ? 'full' : (user.accessLevel || session.accessLevel || company?.accessLevel || (companyId === 'legacy' ? 'full' : 'limited')),
    licenseStatus: isPortfolioUser(user) ? 'approved' : (user.licenseStatus || session.licenseStatus || company?.licenseStatus || (companyId === 'legacy' ? 'approved' : 'pending')),
    companyStatus: isPortfolioUser(user) ? 'approved' : (user.companyStatus || session.companyStatus || company?.status || (companyId === 'legacy' ? 'approved' : 'pending')),
    modules: isPortfolioUser(user) ? [] : userModules,
    companyAccessOverride: user.companyAccessOverride || session.companyAccessOverride || null,
    accountType: user.accountType || (isPlatformAdmin(user) ? 'support' : (companyId === 'legacy' ? 'support' : 'member')),
    founder: user.founder === true || session.founder === true,
    profileInfo: user.profileInfo || session.profileInfo || '',
    portfolio: Array.isArray(user.portfolio) ? user.portfolio : (Array.isArray(session.portfolio) ? session.portfolio : [])
  };
}

async function requireUser(req, res) {
  try {
    const user = await storedUserFromSession(req);
    if (!user) {
      sendJson(res, 401, { error: 'É necessário entrar no sistema.' });
      return null;
    }
    return user;
  } catch (error) {
    console.error('Falha ao validar sessão:', error.message);
    sendJson(res, 503, { error: 'Não foi possível validar a sessão agora.' });
    return null;
  }
}

function broadcastUpdate(saved, companyId='legacy') {
  const message = `event: data-updated\ndata: ${JSON.stringify({ revision: saved.revision, updatedAt: saved.updatedAt })}\n\n`;
  for (const client of eventClients) if (client.companyId===companyId) client.write(message);
}
function broadcastEvent(name, payload, companyId = null) { const message = `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`; for (const client of eventClients) if (companyId === null || client.companyId === companyId) client.write(message); }
function normalizeDevice(value) { const device = String(value || '').trim().slice(0, 32); return ['Android', 'iPhone/iPad', 'Windows', 'macOS', 'Linux', 'Navegador'].includes(device) ? device : 'Navegador'; }
function deviceFromUserAgent(value) { const ua=String(value||''); return /Android/i.test(ua)?'Android':/iPhone|iPad|iPod/i.test(ua)?'iPhone/iPad':/Windows/i.test(ua)?'Windows':/Macintosh|Mac OS/i.test(ua)?'macOS':/Linux/i.test(ua)?'Linux':'Navegador'; }
function presencePayload(companyId = 'legacy') { return [...presence.values()].filter(item => item.companyId === companyId && Date.now() - item.lastSeen < 90_000).sort((a,b) => a.name.localeCompare(b.name, 'pt-BR')).map(({ username, name, role, available, device }) => { const sessions=[...eventClients].filter(client=>client.username===username&&client.companyId===companyId),devices=[...new Set([...sessions.map(client=>normalizeDevice(client.device)),normalizeDevice(device)])]; return { username, name, role, device: devices[0], devices, sessions: Math.max(1,sessions.length), available: available !== false }; }); }
function announcePresence() { for (const companyId of new Set([...eventClients].map(client => client.companyId))) broadcastEvent('presence-updated', { users: presencePayload(companyId), at: new Date().toISOString() }, companyId); }
function touchPresence(user, req) { const previous=presence.get(user.username); presence.set(user.username, { username: user.username, companyId: user.companyId || 'legacy', name: user.name || user.username, role: user.role || 'operador', device: deviceFromUserAgent(req?.headers?.['user-agent']) || previous?.device || 'Navegador', available: previous?.available !== false, lastSeen: Date.now() }); announcePresence(); }

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
    try {
      const user = await storedUserFromSession(req);
      return user ? sendJson(res, 200, { authenticated: true, user: publicUser(user) })
        : sendJson(res, 401, { authenticated: false });
    } catch (error) {
      console.error('Falha ao consultar sessão:', error.message);
      return sendJson(res, 503, { authenticated: false, error: 'Não foi possível validar a sessão agora.' });
    }
  }
  if (pathname === '/api/auth/google/pending' && req.method === 'GET') {
    const pending=currentUser({headers:{cookie:`proelium_session=${parseCookies(req).proelium_google_pending||''}`}});
    return pending?.email ? sendJson(res,200,{email:pending.email,name:pending.name||'',invite:Boolean(parseCookies(req).proelium_invite)}) : sendJson(res,401,{error:'Identificação Google expirada.'});
  }

  if (pathname === '/api/auth/google' && req.method === 'GET') {
    const invite=new URL(req.url,`http://${req.headers.host}`).searchParams.get('invite');
    if(invite){const secureCookie=(req.headers['x-forwarded-proto']==='https'||req.headers.host?.startsWith('app.'))?' ; Secure':'';res.setHeader('Set-Cookie',`proelium_invite=${encodeURIComponent(invite)}; Path=/; Max-Age=300; HttpOnly; SameSite=Lax${secureCookie}`.replace(';  ', '; '));}
  }
  if (pathname === '/api/auth/google' && req.method === 'GET') {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return sendJson(res,503,{error:'Login Google ainda não configurado no servidor.'});
    const state=crypto.randomBytes(24).toString('hex'); googleStates.set(state,Date.now()+300000);
    const redirect=process.env.GOOGLE_REDIRECT_URI || `${req.headers['x-forwarded-proto']==='https'?'https':'http'}://${req.headers.host}/api/auth/google/callback`;
    const params=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,redirect_uri:redirect,response_type:'code',scope:'openid email profile',state});
    res.writeHead(302,{Location:`https://accounts.google.com/o/oauth2/v2/auth?${params}`});res.end();return;
  }
  if (pathname === '/api/auth/consume-invite' && req.method === 'POST') {
    try {
      const actor=await requireUser(req,res); if(!actor)return;
      const cookies=parseCookies(req),token=String(cookies.proelium_invite||'');
      if(!actor.email||!token)return sendJson(res,401,{error:'Nenhum convite pendente.'});
      const invites=await storage.readInvites(),invite=invites.find(item=>item.tokenHash===inviteTokenHash(token)&&!item.usedAt&&new Date(item.expiresAt)>new Date());
      if(!invite)return sendJson(res,410,{error:'Este convite expirou ou já foi utilizado.'});
      if(invite.email&&invite.email!==String(actor.email).toLowerCase())return sendJson(res,403,{error:'Este convite foi enviado para outro e-mail Google.'});
      const companies=await storage.readCompanies(),company=companies.find(item=>item.id===invite.companyId);
      if(!company)return sendJson(res,404,{error:'Empresa do convite não encontrada.'});
      const users=await storage.readUsers(),index=users.findIndex(item=>item.username===actor.username);
      if(index<0)return sendJson(res,404,{error:'Usuário não encontrado.'});
      if(users[index].companyId&&users[index].companyId!==invite.companyId)return sendJson(res,409,{error:'Este usuário já pertence a outra empresa.'});
      const user={...users[index],companyId:invite.companyId,role:invite.role||'operacao',active:true};
      users[index]=user;
      await storage.writeUsers(users);
      await storage.writeInvites(invites.map(item=>item.id===invite.id?{...item,usedAt:new Date().toISOString()}:item));
      const session=signedSession({username:user.username,role:user.role,name:user.name,email:user.email,companyId:company.id,companyStatus:company.status,accessLevel:company.accessLevel||'limited',licenseStatus:company.licenseStatus||'pending',modules:invite.modules||[],expiresAt:Date.now()+sessionTtl});
      res.setHeader('Set-Cookie',[`proelium_session=${encodeURIComponent(session)}; Path=/; Max-Age=${sessionTtl/1000}; HttpOnly; SameSite=Lax${secureCookie?'; Secure':''}`,'proelium_invite=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax']);
      return sendJson(res,200,{ok:true,user:publicUser(user),company});
    } catch(error) { console.error('Falha ao vincular convite:',error.message);return sendJson(res,400,{error:'Não foi possível vincular o convite.'}); }
  }
  if (pathname === '/api/auth/join-google-company' && req.method === 'POST') {
    try { const cookies=parseCookies(req),pending=currentUser({headers:{cookie:`proelium_session=${cookies.proelium_google_pending||''}`}}),token=String(cookies.proelium_invite||'');if(!pending?.email||!token)return sendJson(res,401,{error:'Convite ou identificação Google expirado.'});const invites=await storage.readInvites(),invite=invites.find(item=>item.tokenHash===inviteTokenHash(token)&&!item.usedAt&&new Date(item.expiresAt)>new Date());if(!invite)return sendJson(res,410,{error:'Este convite expirou ou já foi utilizado.'});const companies=await storage.readCompanies(),company=companies.find(item=>item.id===invite.companyId);if(!company)return sendJson(res,404,{error:'Empresa do convite não encontrada.'});if(invite.email&&invite.email!==pending.email.toLowerCase())return sendJson(res,403,{error:'Este convite foi enviado para outro e-mail Google.'});const users=await storage.readUsers(),existing=users.find(item=>String(item.email||'').toLowerCase()===pending.email.toLowerCase());if(existing&&existing.companyId!==invite.companyId)return sendJson(res,409,{error:'Este e-mail já pertence a outra empresa.'});const username=existing?.username||`${pending.email.split('@')[0].replace(/[^a-z0-9._-]/g,'').slice(0,24)||'colaborador'}-${Date.now().toString().slice(-5)}`,user={...(existing||{}),username,name:existing?.name||pending.name||username,email:pending.email,role:invite.role||'operacao',active:true,companyId:invite.companyId,accountType:'member',founder:false,createdAt:existing?.createdAt||new Date().toISOString(),...passwordRecord(crypto.randomBytes(32).toString('hex'))};await storage.writeUsers(existing?users.map(item=>item.username===existing.username?user:item):[...users,user]);await storage.writeInvites(invites.map(item=>item.id===invite.id?{...item,usedAt:new Date().toISOString()}:item));const session=signedSession({username,role:user.role,name:user.name,email:user.email,companyId:invite.companyId,companyStatus:company.status,accessLevel:company.accessLevel||'limited',modules:membershipModules(user,company,invite.modules||[]),accountType:'member',founder:false,expiresAt:Date.now()+sessionTtl});setSessionCookie(res,session,sessionTtl/1000,secureCookie);res.setHeader('Set-Cookie',[`proelium_session=${encodeURIComponent(session)}; Path=/; Max-Age=${sessionTtl/1000}; HttpOnly; SameSite=Lax${secureCookie?' ; Secure':''}`.replace(';  ','; '),'proelium_invite=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax']);return sendJson(res,201,{ok:true,user:publicUser(user),company}); } catch(error) { console.error('Falha ao aceitar convite Google:',error.message);return sendJson(res,400,{error:'Não foi possível aceitar o convite.'}); }
  }
  if (pathname === '/api/auth/google/callback' && req.method === 'GET') {
    try { const query=new URL(req.url,`http://${req.headers.host}`).searchParams,state=query.get('state'),code=query.get('code');if(!state||googleStates.get(state)<Date.now()||!code)return sendJson(res,400,{error:'Validação Google expirada ou inválida.'});googleStates.delete(state);const redirect=process.env.GOOGLE_REDIRECT_URI || `${req.headers['x-forwarded-proto']==='https'?'https':'http'}://${req.headers.host}/api/auth/google/callback`;const token=await httpsJson('https://oauth2.googleapis.com/token',{method:'POST'},new URLSearchParams({code,client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,redirect_uri:redirect,grant_type:'authorization_code'}).toString());if(token.status!==200||!token.data.access_token){console.error('Google OAuth token recusado:',token.status,token.data.error||'sem código',token.data.error_description||'');return sendJson(res,401,{error:'Não foi possível validar a conta Google.'});}const profile=await httpsJson(`https://openidconnect.googleapis.com/v1/userinfo?access_token=${encodeURIComponent(token.data.access_token)}`);const email=String(profile.data.email||'').trim().toLowerCase();if(profile.status!==200||!email||profile.data.email_verified!==true)return sendJson(res,401,{error:'A conta Google precisa ter e-mail verificado.'});const user=(await storage.readUsers()).find(item=>String(item.email||'').toLowerCase()===email&&item.active!==false);if(!user){const invite=Boolean(parseCookies(req).proelium_invite);setGooglePendingCookie(res,signedSession({email,name:String(profile.data.name||'').slice(0,80),expiresAt:Date.now()+600000}),secureCookie);res.writeHead(302,{Location:invite?'/?google_invite=1':'/?google_onboarding=1'});res.end();return;}const companyId=user.companyId||'legacy',company=companyId!=='legacy'?(await storage.readCompanies()).find(item=>item.id===companyId):null,userModules=membershipModules(user,company),accountType=user.accountType||(isPlatformAdmin(user)?'support':(user.companyId?'member':'support')),session=signedSession({username:user.username,role:user.role||'operador',name:user.name||profile.data.name||user.username,email,companyId,companyStatus:company?.status||(companyId==='legacy'?'approved':'pending'),accessLevel:company?.accessLevel||(companyId==='legacy'?'full':'limited'),licenseStatus:company?.licenseStatus||(companyId==='legacy'?'approved':'pending'),modules:userModules,accountType,founder:user.founder===true,profileInfo:user.profileInfo||'',portfolio:user.portfolio||[],expiresAt:Date.now()+sessionTtl});setSessionCookie(res,session,sessionTtl/1000,secureCookie);res.writeHead(302,{Location:'/'});res.end();return; } catch(error) { console.error('Falha no OAuth Google:',error.message);return sendJson(res,502,{error:'Não foi possível concluir o login Google.'}); }
  }

  if (pathname === '/api/auth/register-google-company' && req.method === 'POST') {
    try { const pending=currentUser({headers:{cookie:`proelium_session=${parseCookies(req).proelium_google_pending||''}`}});if(!pending?.email)return sendJson(res,401,{error:'A identificação Google expirou. Tente novamente.'});const payload=JSON.parse(await readBody(req)),companyName=String(payload.companyName||'').trim().slice(0,120),document=String(payload.document||'').trim().slice(0,32),responsible=String(payload.responsible||pending.name||'').trim().slice(0,80),phone=String(payload.phone||'').trim().slice(0,30),companyType=['residencial','contratante','contratado'].includes(payload.companyType)?payload.companyType:'contratado',profileInfo=String(payload.profileInfo||'').trim().slice(0,2000),documentValid=companyType==='contratante'?validCnpj(document):validCnpj(document)||validCpf(document);if(!companyName||!documentValid||!responsible||phone.replace(/\D/g,'').length<10)return sendJson(res,400,{error:'Informe um CPF ou CNPJ válido, nome da empresa, responsável e telefone válido.'});const companies=await storage.readCompanies(),users=await storage.readUsers();if(companies.some(company=>company.document&&String(company.document).replace(/\D/g,'')===document.replace(/\D/g,'')))return sendJson(res,409,{error:'Este CNPJ já possui cadastro no Proelium.'});const company={id:`emp-${crypto.randomUUID()}`,name:companyName,document,responsible,phone,companyType,profileInfo,status:'approved',accessLevel:'limited',licenseStatus:'pending',founderUsername:'',createdAt:new Date().toISOString()};const base=(pending.email.split('@')[0].replace(/[^a-z0-9._-]/g,'')||'usuario').slice(0,24),username=users.some(user=>user.username===base)?`${base}-${Date.now().toString().slice(-5)}`:base;company.founderUsername=username;const user={username,name:responsible,email:pending.email,role:'admin',active:true,companyId:company.id,accountType:'founder',founder:true,profileInfo:'',portfolio:[],createdAt:new Date().toISOString(),...passwordRecord(crypto.randomBytes(32).toString('hex'))};await storage.writeCompanies([...companies,company]);await storage.writeUsers([...users,user]);const session=signedSession({username,role:'admin',name:responsible,email:pending.email,companyId:company.id,companyStatus:'approved',accessLevel:'limited',licenseStatus:'pending',modules:modulesForCompanyTrial(company,user),accountType:'founder',founder:true,portfolio:[],expiresAt:Date.now()+sessionTtl});setSessionCookie(res,session,sessionTtl/1000,secureCookie);return sendJson(res,201,{ok:true,user:publicUser(user),company}); } catch(error) { console.error('Falha no cadastro Google da empresa:',error.message);return sendJson(res,400,{error:'Não foi possível concluir o cadastro da empresa.'}); }
  }

  if (pathname === '/api/auth/register-company' && req.method === 'POST') {
    try {
      const payload=JSON.parse(await readBody(req));
      const companyName=String(payload.companyName||'').trim().slice(0,120), document=String(payload.document||'').trim().slice(0,32);
      const username=String(payload.username||'').trim().toLowerCase(), name=String(payload.name||'').trim().slice(0,80), password=String(payload.password||'');
      if(!companyName||!name||!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username)||password.length<10)return sendJson(res,400,{error:'Informe empresa, nome, usuário válido e senha com pelo menos 10 caracteres.'});
      const companies=await storage.readCompanies(), users=await storage.readUsers();
      if(users.some(user=>user.username===username))return sendJson(res,409,{error:'Esse usuário já está cadastrado.'});
      const company={id:`emp-${crypto.randomUUID()}`,name:companyName,document,founderUsername:username,createdAt:new Date().toISOString()};
      await storage.writeCompanies([...companies,company]);
      const user={username,name,role:'admin',active:true,companyId:company.id,accountType:'founder',founder:true,profileInfo:'',portfolio:[],createdAt:new Date().toISOString(),...passwordRecord(password)};
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
      const companyId=user.companyId||'legacy',company=companyId!=='legacy'?(await storage.readCompanies()).find(item=>item.id===companyId):null,userModules=membershipModules(user,company),accountType=user.accountType||(isPlatformAdmin(user)?'support':(user.companyId?'member':'support')),token = signedSession({ username: user.username, role: user.role || 'operador', name: user.name || user.username, companyId, companyStatus:company?.status||(companyId==='legacy'?'approved':'pending'), accessLevel:company?.accessLevel||(companyId==='legacy'?'full':'limited'), licenseStatus:company?.licenseStatus||(companyId==='legacy'?'approved':'pending'), modules:userModules, accountType, founder:user.founder===true, profileInfo:user.profileInfo||'', portfolio:user.portfolio||[], expiresAt: Date.now() + sessionTtl });
      setSessionCookie(res, token, sessionTtl / 1000, secureCookie);
      return sendJson(res, 200, { ok: true, user: publicUser({ ...user, companyId, companyStatus:company?.status, accessLevel:company?.accessLevel, licenseStatus:company?.licenseStatus, modules:userModules }) });
    } catch { return sendJson(res, 400, { error: 'Solicitação de login inválida.' }); }
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const user = currentUser(req); if (user) { presence.delete(user.username); announcePresence(); }
    setSessionCookie(res, '', 0, secureCookie);
    return sendJson(res, 200, { ok: true });
  }

  if (pathname === '/api/company/profile' && ['GET','PUT'].includes(req.method)) {
    const actor=await requireUser(req,res); if(!actor)return;
    if(!isCompanyAdmin(actor))return sendJson(res,403,{error:'Apenas o administrador da empresa pode editar sua configuração.'});
    try {
      const companies=await storage.readCompanies(),index=companies.findIndex(company=>company.id===actor.companyId);
      if(index<0)return sendJson(res,404,{error:'Empresa não encontrada.'});
      if(req.method==='GET')return sendJson(res,200,{company:companyProfilePublic(companies[index])});
      const payload=JSON.parse(await readBody(req)),name=String(payload.name||'').trim().slice(0,120),responsible=String(payload.responsible||'').trim().slice(0,80),phone=String(payload.phone||'').trim().slice(0,30),profileInfo=String(payload.profileInfo||'').trim().slice(0,2000);
      if(!name||!responsible||phone.replace(/\D/g,'').length<10)return sendJson(res,400,{error:'Informe nome da empresa, responsável e telefone válido.'});
      companies[index]={...companies[index],name,responsible,phone,profileInfo,updatedAt:new Date().toISOString()};
      await storage.writeCompanies(companies); return sendJson(res,200,{ok:true,company:companyProfilePublic(companies[index])});
    } catch { return sendJson(res,400,{error:'Configuração da empresa inválida.'}); }
  }
  if (pathname === '/api/account/profile' && ['GET','PUT'].includes(req.method)) {
    const actor=await requireUser(req,res); if(!actor)return;
    try {
      const users=await storage.readUsers(),index=users.findIndex(user=>user.username===actor.username);
      if(index<0)return sendJson(res,404,{error:'Perfil não encontrado.'});
      if(req.method==='GET')return sendJson(res,200,{profile:accountProfilePublic(users[index])});
      const payload=JSON.parse(await readBody(req)),name=String(payload.name||'').trim().slice(0,80),profileInfo=String(payload.profileInfo||'').trim().slice(0,2000);
      if(!name)return sendJson(res,400,{error:'Informe um nome para o perfil.'});
      users[index]={...users[index],name,profileInfo,updatedAt:new Date().toISOString()};
      await storage.writeUsers(users); return sendJson(res,200,{ok:true,profile:accountProfilePublic(users[index])});
    } catch { return sendJson(res,400,{error:'Perfil inválido.'}); }
  }
  if (pathname === '/api/company/routines' && ['GET','PUT'].includes(req.method)) {
    const actor=await requireUser(req,res); if(!actor)return;
    const companyId=actor.companyId||'legacy';
    if(req.method==='GET')return sendJson(res,200,{routines:await storage.readRoutines(companyId)});
    try { const payload=JSON.parse(await readBody(req)), routines=Array.isArray(payload.routines)?payload.routines.slice(0,200).map(item=>({id:String(item.id||crypto.randomUUID()).slice(0,80),name:String(item.name||'').trim().slice(0,120),description:String(item.description||'').trim().slice(0,500),periodicity:String(item.periodicity||'Sem periodicidade').slice(0,40),steps:Array.isArray(item.steps)?item.steps.slice(0,100).map(step=>String(step).trim().slice(0,200)).filter(Boolean):[]})).filter(item=>item.name):[]; await storage.writeRoutines(companyId,routines); return sendJson(res,200,{ok:true,routines}); } catch { return sendJson(res,400,{error:'Rotinas inválidas.'}); }
  }
  if (pathname === '/api/company/invites' && ['GET','POST','DELETE'].includes(req.method)) {
    const actor=await requireUser(req,res); if(!actor)return; if(!actor.companyId||actor.companyId==='legacy'||!['admin'].includes(actor.role))return sendJson(res,403,{error:'Apenas o administrador da empresa pode gerenciar convites.'});
    const companies=await storage.readCompanies(),company=companies.find(item=>item.id===actor.companyId); if(!company)return sendJson(res,404,{error:'Empresa não encontrada.'});
    const invites=(await storage.readInvites()).filter(item=>item.companyId===actor.companyId);
    if(req.method==='GET')return sendJson(res,200,{invites:invites.filter(item=>!item.usedAt&&new Date(item.expiresAt)>new Date()).map(item=>invitePublic(item,companies))});
    try { const payload=req.method==='DELETE'?{id:new URL(req.url,`http://${req.headers.host}`).searchParams.get('id')}:JSON.parse(await readBody(req)); if(req.method==='DELETE'){const id=String(payload.id||'');if(!invites.some(item=>item.id===id))return sendJson(res,404,{error:'Convite não encontrado nesta empresa.'});const next=(await storage.readInvites()).map(item=>item.companyId===actor.companyId&&item.id===id?{...item,usedAt:new Date().toISOString()}:item);await storage.writeInvites(next);return sendJson(res,200,{ok:true});} const token=crypto.randomBytes(32).toString('base64url'),allowedModules=['dashboard','projects','tasks','agenda','operations','reports','quality','collaborators','equipment','knowledge','routines'],modules=[...new Set((Array.isArray(payload.modules)?payload.modules:allowedModules).filter(item=>allowedModules.includes(item)))].slice(0,12),invite={id:`inv-${crypto.randomUUID()}`,companyId:actor.companyId,tokenHash:inviteTokenHash(token),email:String(payload.email||'').trim().toLowerCase().slice(0,160),role:['operacao','comercial','financeiro','leitura'].includes(payload.role)?payload.role:'operacao',modules,expiresAt:new Date(Date.now()+300000).toISOString(),createdAt:new Date().toISOString()}; const all=(await storage.readInvites()).filter(item=>item.companyId!==actor.companyId||(!item.usedAt&&new Date(item.expiresAt)>new Date()));await storage.writeInvites([...all,invite]);const base=process.env.BASE_URL||`${req.headers['x-forwarded-proto']==='https'?'https':'http'}://${req.headers.host}`;return sendJson(res,201,{ok:true,invite:invitePublic(invite,companies),url:`${base}/?invite=${encodeURIComponent(token)}`}); } catch { return sendJson(res,400,{error:'Convite inválido.'}); }
  }
  if (pathname === '/api/admin/companies' && req.method === 'DELETE') {
    const actor=await requireUser(req,res); if(!actor)return;
    if(!isPlatformAdmin(actor)||actor.role!=='admin')return sendJson(res,403,{error:'Apenas administradores da plataforma podem excluir empresas.'});
    try {
      const id=String(new URL(req.url,`http://${req.headers.host}`).searchParams.get('id')||'');
      if(!id)return sendJson(res,400,{error:'Empresa inválida.'});
      if(actor.companyId===id)return sendJson(res,400,{error:'O administrador atual não pode excluir a própria empresa.'});
      const companies=await storage.readCompanies(),company=companies.find(item=>item.id===id);
      if(!company)return sendJson(res,404,{error:'Empresa não encontrada.'});
      const allUsers=await storage.readUsers(),companyUsers=allUsers.filter(user=>user.companyId===id),detachedUsers=allUsers.map(user=>user.companyId===id?{...user,companyId:null,accountType:'portfolio',founder:false,companyAccessOverride:null,modules:[],portfolio:[...(Array.isArray(user.portfolio)?user.portfolio:[]),portfolioEntry(user,company)]}:user);
      await storage.writeUsers(detachedUsers);
      await storage.deleteCompany(id);
      for(const [username,entry] of presence)if(companyUsers.some(user=>user.username===username))presence.delete(username);
      for(const client of [...eventClients])if(client.companyId===id){eventClients.delete(client);try{client.end()}catch{}}
      announcePresence();
      return sendJson(res,200,{ok:true,companies:await storage.readCompanies()});
    } catch(error) { console.error('Falha ao excluir empresa:',error.message);return sendJson(res,500,{error:'Não foi possível excluir a empresa com segurança.'}); }
  }
  if (pathname === '/api/admin/companies' && ['GET','PUT'].includes(req.method)) {
    const actor=await requireUser(req,res); if(!actor)return;
    if(!isPlatformStaff(actor))return sendJson(res,403,{error:'Apenas a equipe da plataforma pode consultar empresas.'});
    const companies=await storage.readCompanies(),users=await storage.readUsers(),listedCompanies=companies.map(company=>companyWithAdminContact(company,users));
    if(req.method==='GET')return sendJson(res,200,{companies:listedCompanies});
    if(!isPlatformAdmin(actor)||actor.role!=='admin')return sendJson(res,403,{error:'Apenas administradores da plataforma podem alterar empresas.'});
    try { const payload=JSON.parse(await readBody(req)),id=String(payload.id||''),status=String(payload.status||'');if(!id||!['pending','approved','rejected','suspended'].includes(status))return sendJson(res,400,{error:'Atualização inválida.'});const index=companies.findIndex(company=>company.id===id);if(index<0)return sendJson(res,404,{error:'Empresa não encontrada.'});const allowedModules=['dashboard','clients','projects','commercial','quotes','products','survey','routines','reports','finance','knowledge'];const modules=Array.isArray(payload.modules)?[...new Set(payload.modules.filter(item=>allowedModules.includes(item)))].slice(0,20):(companies[index].modules||['dashboard','knowledge']);companies[index]={...companies[index],status,accessLevel:['limited','full'].includes(payload.accessLevel)?payload.accessLevel:(companies[index].accessLevel||'limited'),modules,licenseStatus:['pending','approved','rejected'].includes(payload.licenseStatus)?payload.licenseStatus:(companies[index].licenseStatus||'pending'),adminNotes:String(payload.adminNotes||companies[index].adminNotes||'').slice(0,1000),reviewedAt:new Date().toISOString()};await storage.writeCompanies(companies);return sendJson(res,200,{ok:true,companies:companies.map(company=>companyWithAdminContact(company,users))}); } catch { return sendJson(res,400,{error:'Não foi possível atualizar o cadastro.'}); }
  }

  if (pathname === '/api/company/users' && ['GET','POST','DELETE'].includes(req.method)) {
    const actor=await requireUser(req,res); if(!actor)return;
    if(!isCompanyAdmin(actor))return sendJson(res,403,{error:'Apenas administradores da empresa podem gerenciar seus usuários.'});
    let users;
    try { users=(await storage.readUsers()).filter(user=>user.companyId===actor.companyId); }
    catch(error) { console.error('Falha ao ler usuários da empresa:',error.message); return sendJson(res,503,{error:'Armazenamento temporariamente indisponível.'}); }
    if(req.method==='GET')return sendJson(res,200,{users:users.map(publicUser)});
    try {
      const payload=req.method==='DELETE'?{username:new URL(req.url,`http://${req.headers.host}`).searchParams.get('username')}:JSON.parse(await readBody(req));
      const username=String(payload.username||'').trim().toLowerCase(), index=users.findIndex(user=>user.username===username);
      if(!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username))return sendJson(res,400,{error:'Usuário inválido.'});
      if(index<0)return sendJson(res,404,{error:'Usuário não encontrado nesta empresa.'});
      if(username===actor.username)return sendJson(res,400,{error:'Você não pode remover ou desativar o próprio acesso.'});
      const allUsers=await storage.readUsers(),target=users[index];
      if(req.method==='DELETE') {
        if(target.role==='admin')return sendJson(res,403,{error:'A conta fundadora/administradora não pode ser removida por este painel.'});
        const company=(await storage.readCompanies()).find(item=>item.id===actor.companyId),portfolio=[...(Array.isArray(target.portfolio)?target.portfolio:[]),...(company?[portfolioEntry(target,company)]:[])],detached={...target,companyId:null,accountType:'portfolio',founder:false,companyAccessOverride:null,modules:[],portfolio};
        const next=allUsers.map(user=>user.username===username?detached:user); await storage.writeUsers(next); return sendJson(res,200,{ok:true,user:publicUser(detached)});
      }
      if(target.role==='admin')return sendJson(res,403,{error:'A administração da empresa não pode ser alterada por este painel.'});
      target.active=payload.active!==false;
      if(Object.prototype.hasOwnProperty.call(payload,'companyAccessOverride'))target.companyAccessOverride=payload.companyAccessOverride==='full'?'full':null;
      await storage.writeUsers(allUsers.map(user=>user.username===username?target:user));
      return sendJson(res,200,{ok:true,user:publicUser(target)});
    } catch { return sendJson(res,400,{error:'Dados de usuário da empresa inválidos.'}); }
  }

  if (pathname === '/api/auth/users' && ['GET', 'POST', 'DELETE'].includes(req.method)) {
    const actor = await requireUser(req, res);
    if (!actor) return;
    if (actor.role !== 'admin' || !isPlatformAdmin(actor)) return sendJson(res, 403, { error: 'Apenas administradores da plataforma podem gerenciar usuários globais.' });
    let users;
    try { users = await storage.readUsers(); }
    catch (error) {
      console.error('Falha ao ler usuários:', error.message);
      return sendJson(res, 503, { error: 'Armazenamento temporariamente indisponível.' });
    }
    if (req.method === 'GET') return sendJson(res, 200, { users: users.filter(user => (!user.companyId || user.companyId === 'legacy') && user.accountType !== 'portfolio').map(publicUser) });
    try {
      const payload = req.method === 'DELETE' ? { username: new URL(req.url, `http://${req.headers.host}`).searchParams.get('username') } : JSON.parse(await readBody(req));
      const username = String(payload.username || '').trim().toLowerCase();
      const index = users.findIndex(item => item.username === username);
      if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username)) return sendJson(res, 400, { error: 'Usuário inválido.' });
      if (req.method === 'DELETE') {
        if (username === actor.username) return sendJson(res, 400, { error: 'Você não pode excluir o próprio usuário.' });
      if (index < 0) return sendJson(res, 404, { error: 'Usuário não encontrado.' });
        if (users[index].accountType === 'portfolio') return sendJson(res, 403, { error: 'Perfis pessoais não são gerenciados no painel de suporte.' });
        if (users[index].role === 'admin' && users.filter(item => item.role === 'admin' && item.active !== false).length <= 1) return sendJson(res, 400, { error: 'Mantenha pelo menos um administrador ativo.' });
        users.splice(index, 1); await storage.writeUsers(users); return sendJson(res, 200, { ok: true });
      }
      const password = String(payload.password || '');
      if (index < 0 && password.length < 10) return sendJson(res, 400, { error: 'A senha deve ter pelo menos 10 caracteres.' });
      if (payload.role && !Object.keys(rolePermissions).includes(payload.role)) return sendJson(res, 400, { error: 'Papel inválido.' });
      const existing = index >= 0 ? users[index] : { username, createdAt: new Date().toISOString() };
      if (existing.accountType === 'portfolio') return sendJson(res, 409, { error: 'Perfis pessoais devem ser gerenciados pelo próprio usuário.' });
      if (existing.companyId && existing.companyId !== 'legacy') return sendJson(res, 409, { error: 'Usuários de empresas devem ser gerenciados pela própria empresa.' });
      const email = String(payload.email || existing.email || '').trim().toLowerCase();
      if (email && !/^\S+@\S+\.\S+$/.test(email)) return sendJson(res, 400, { error: 'E-mail inválido.' });
      const nextRole = isPlatformAdmin(existing) ? 'admin' : (payload.role || existing.role || 'operador');
      const next = { ...existing, username, email, name: String(payload.name || username).trim().slice(0, 80), role: nextRole, active: payload.active !== false, companyId: null, accountType: nextRole === 'suporte' ? 'support' : (existing.accountType || 'support'), founder: false, modules: [] };
      if (password) { if (password.length < 10) return sendJson(res, 400, { error: 'A senha deve ter pelo menos 10 caracteres.' }); Object.assign(next, passwordRecord(password)); }
      users[index >= 0 ? index : users.length] = next;
      await storage.writeUsers(users);
      return sendJson(res, index >= 0 ? 200 : 201, { ok: true, user: publicUser(next) });
    } catch { return sendJson(res, 400, { error: 'Dados de usuário inválidos.' }); }
  }

  let authenticatedUser = null;
  if (pathname.startsWith('/api/')) {
    authenticatedUser = await requireUser(req, res);
    if (!authenticatedUser) return;
    if (rejectsCrossOriginMutation(req)) return sendJson(res, 403, { error: 'Origem da solicitação não autorizada.' });
    touchPresence(authenticatedUser, req);
  }

  const authenticatedCompanyId = authenticatedUser?.companyId || 'legacy';
  if (pathname === '/api/presence' && req.method === 'GET') return sendJson(res, 200, { users: presencePayload(authenticatedCompanyId) });
  if (pathname === '/api/presence/heartbeat' && req.method === 'POST') { try { const payload=JSON.parse(await readBody(req)||'{}'), current=presence.get(authenticatedUser.username); if(current&&payload.device) current.device=normalizeDevice(payload.device); announcePresence(); return sendJson(res, 200, { ok: true, users: presencePayload(authenticatedCompanyId) }); } catch { return sendJson(res, 400, { error: 'Heartbeat inválido.' }); } }
  if (pathname === '/api/presence/availability' && req.method === 'POST') {
    try { const payload=JSON.parse(await readBody(req)), current=presence.get(authenticatedUser.username); if(current) { current.available=payload.available!==false; for(const client of eventClients)if(client.username===authenticatedUser.username&&client.companyId===authenticatedCompanyId)client.available=current.available; } announcePresence(); return sendJson(res,200,{ok:true,users:presencePayload(authenticatedCompanyId)}); }
    catch { return sendJson(res,400,{error:'Disponibilidade inválida.'}); }
  }
  if (pathname === '/api/collaboration-requests' && req.method === 'POST') {
    try {
      const payload = JSON.parse(await readBody(req));
      const message = String(payload.message || '').trim().slice(0, 500);
      if (!message) return sendJson(res, 400, { error: 'Descreva como deseja colaborar.' });
      const request = { id: crypto.randomUUID(), from: publicUser(authenticatedUser), message, at: new Date().toISOString() };
      for (const client of eventClients) if (client.companyId === authenticatedCompanyId && client.userRole === 'admin') client.write(`event: collaboration-request\ndata: ${JSON.stringify(request)}\n\n`);
      return sendJson(res, 202, { ok: true });
    } catch { return sendJson(res, 400, { error: 'Pedido de colaboração inválido.' }); }
  }
  if (pathname === '/api/assistance-requests' && req.method === 'POST') {
    try {
      const payload=JSON.parse(await readBody(req)), message=String(payload.message||'').trim().slice(0,500);
      if(!message)return sendJson(res,400,{error:'Descreva o auxílio necessário.'});
      const request={id:crypto.randomUUID(),from:publicUser(authenticatedUser),message,at:new Date().toISOString()};
      for(const client of eventClients)if(client.companyId===authenticatedCompanyId&&client.username!==authenticatedUser.username&&client.available!==false)client.write(`event: assistance-request\ndata: ${JSON.stringify(request)}\n\n`);
      return sendJson(res,202,{ok:true});
    } catch { return sendJson(res,400,{error:'Pedido de auxílio inválido.'}); }
  }

  if (pathname === '/api/data' && req.method === 'GET') {
    try {
      const current = await storage.readSharedData(authenticatedUser.companyId || 'legacy');
      return sendJson(res, 200, { ...current, data: visibleDataForUser(current.data, authenticatedUser) });
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
    res.companyId = authenticatedUser.companyId || 'legacy';
    res.userRole = normalizeRole(authenticatedUser.role);
    res.device = deviceFromUserAgent(req.headers['user-agent']);
    res.available = presence.get(authenticatedUser.username)?.available !== false;
    touchPresence(authenticatedUser, req);
    res.write(`event: presence-updated\ndata: ${JSON.stringify({ users: presencePayload(authenticatedCompanyId) })}\n\n`);
    req.on('close', () => { eventClients.delete(res); if (![...eventClients].some(client => client.username === authenticatedUser.username)) { presence.delete(authenticatedUser.username); announcePresence(); } });
    return;
  }

  if (pathname === '/api/data' && req.method === 'PUT') {
    try {
      const payload = JSON.parse(await readBody(req));
      if (!payload || typeof payload.data !== 'object') return sendJson(res, 400, { error: 'Dados inválidos.' });
      const current = await storage.readSharedData(authenticatedUser.companyId || 'legacy');
      const dataViews = dataViewsForUser(authenticatedUser);
      const fullDataAccess = dataViews.has('*');
      const changedScopes = Object.entries(dataAccessScopes)
        .filter(([, keys]) => keys.some(key => Object.prototype.hasOwnProperty.call(payload.data, key)
          && JSON.stringify(current.data?.[key] ?? null) !== JSON.stringify(payload.data[key] ?? null)))
        .map(([view]) => view);
      const deniedScopes = changedScopes.filter(view => !fullDataAccess && !dataViews.has(view));
      if (deniedScopes.length) return sendJson(res, 403, { error: `Seu perfil não pode acessar: ${deniedScopes.join(', ')}.` });
      const role = normalizeRole(authenticatedUser.role);
      const roleAllowed = writableRoles[role];
      const allowed = roleAllowed && Array.isArray(authenticatedUser.modules) && authenticatedUser.modules.length
        ? new Set([...roleAllowed].filter(view => authenticatedUser.modules.includes(view)))
        : roleAllowed;
      if (allowed) {
        const changedDomains = Object.keys(dataDomains).filter(view => {
          const key = dataDomains[view];
          return Object.prototype.hasOwnProperty.call(payload.data, key)
            && JSON.stringify(current.data?.[key] ?? null) !== JSON.stringify(payload.data[key] ?? null);
        });
        const denied = changedDomains.filter(view => !allowed.has(view));
        if (denied.length) return sendJson(res, 403, { error: `Seu perfil não pode alterar: ${denied.join(', ')}.` });
      }
      const baseRevision = Number(payload.baseRevision || 0);
      const nextData = mergeWritableData(current.data || {}, payload.data, authenticatedUser);
      const result = await storage.writeSharedData(nextData, baseRevision, authenticatedUser.username, authenticatedUser.companyId || 'legacy');
      if (result.conflict) {
        return sendJson(res, 409, {
          error: 'Os dados foram atualizados por outro aparelho.',
          revision: result.current.revision,
          updatedAt: result.current.updatedAt
        });
      }
      const saved = result.value;
      sendJson(res, 200, { ok: true, updatedAt: saved.updatedAt, revision: saved.revision });
      broadcastUpdate(saved, authenticatedUser.companyId || 'legacy');
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
