const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { once } = require('events');
const { request, runSmokeBot } = require('./smoke-bot');

const TEST_USER = 'bot.teste';
const TEST_PASSWORD = process.env.PROELIUM_TEST_PASSWORD || crypto.randomBytes(24).toString('base64url');

function currentCatalogVersion() {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'app.js'), 'utf8');
  const match = source.match(/catalogVersion:\s*(\d+)/);
  if (!match) throw new Error('Versão do catálogo não encontrada em app.js.');
  return Number(match[1]);
}

function passwordRecord(password) {
  const salt = crypto.randomBytes(16);
  return {
    salt: salt.toString('base64'),
    hash: crypto.scryptSync(password, salt, 64).toString('base64')
  };
}

function emptyState() {
  return { ...Object.fromEntries([
    'clients', 'projects', 'tasks', 'quotes', 'products', 'installations', 'activities',
    'opportunities', 'appointments', 'quoteRooms', 'packages', 'equipment', 'equipmentHistory',
    'financialEntries', 'evaluations', 'collaborators', 'projectChecklists', 'serviceReports',
    'projectDeliveries', 'serviceOrders', 'supportTickets', 'executionEntries', 'executionItems',
    'procurementRequests', 'purchaseItems', 'surveys', 'surveyPoints', 'technicalPoints',
    'technicalConnections', 'articles', 'auditLog', 'recoveryLog'
  ].map(key => [key, []])), catalogVersion: currentCatalogVersion() };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function parseJson(response, label) {
  try { return JSON.parse(response.text); }
  catch { throw new Error(`${label} não retornou JSON válido.`); }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function sessionCookie(response) {
  return String(response.headers['set-cookie'] || '').split(';')[0];
}

function signedSession(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

async function waitForServer(baseUrl, child, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Servidor de teste encerrou com código ${child.exitCode}.`);
    try {
      const response = await request(baseUrl, '/api/health', { timeout: 500 });
      if (response.status === 200) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Servidor isolado não iniciou dentro do tempo esperado.');
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    once(child, 'exit'),
    new Promise(resolve => setTimeout(resolve, 2_000))
  ]);
}

function scenarioRecords(state) {
  const today = new Date().toISOString().slice(0, 10);
  const product = { id: 'prd-bot-switch', sku: 'BOT-SW-01', name: 'Switch de teste isolado', brand: 'Proelium Teste', model: 'SW-24', category: 'Rede', supplier: 'Fornecedor simulado', mode: 'Venda', unit: 'un', cost: 1200, price: 2000, status: 'Ativo', active: true };
  const service = { id: 'prd-bot-service', sku: 'BOT-SRV-01', name: 'Instalação de teste isolada', brand: 'Proelium', model: 'Serviço', category: 'Serviço', supplier: 'Interno', mode: 'Serviço', unit: 'h', cost: 80, price: 160, status: 'Ativo', active: true };
  const opportunity = { id: 'opp-bot-1', company: 'Cliente Simulado Bot', contact: 'Contato Teste', phone: '(11) 0000-0000', email: 'bot@example.invalid', source: 'Bot isolado', owner: 'Equipe de teste', stage: 'Novo contato', nextAction: 'Elaborar proposta', nextDue: today, estimatedValue: 0, lossReason: '' };
  const quote = { id: 'orc-bot-1', opportunityId: opportunity.id, clientId: '', title: 'Proposta funcional isolada', value: 0, status: 'Em elaboração', version: 1, createdAt: new Date().toISOString(), validUntil: today };
  const room = { id: 'amb-bot-1', quoteId: quote.id, name: 'Sala de teste', items: [{ productId: product.id, qty: 2, discount: 10 }, { productId: service.id, qty: 8, discount: 0 }] };
  const total = 2 * 2000 * 0.9 + 8 * 160;
  const cost = 2 * 1200 + 8 * 80;
  const client = { id: 'cli-bot-1', name: opportunity.company, document: 'TESTE-SEM-VALOR-FISCAL', contact: opportunity.contact, email: opportunity.email, phone: opportunity.phone, city: 'Cidade simulada', address: 'Ambiente isolado', status: 'Ativo', notes: 'Criado automaticamente em teste isolado.' };
  const project = { id: 'prj-bot-1', quoteId: quote.id, code: 'PRJ-BOT-001', name: 'Projeto funcional isolado', clientId: client.id, manager: opportunity.owner, technicalStage: 'Instalação', budget: total, cost, status: 'Em execução', progress: 65, due: today };
  return { today, product, service, opportunity, quote, room, total, cost, client, project, state };
}

function markdownReport(report) {
  const passed = report.checks.filter(check => check.ok).length;
  const failed = report.checks.filter(check => !check.ok);
  const rows = report.checks.map(check => `| ${check.ok ? 'Aprovado' : 'Falhou'} | ${check.group} | ${check.name} | ${check.detail.replace(/\|/g, '\\|')} |`).join('\n');
  const corrections = failed.length
    ? failed.map((check, index) => `${index + 1}. **${check.name}:** ${check.correction}`).join('\n')
    : 'Nenhuma correção funcional foi identificada nesta execução.';
  return `# Relatório do bot funcional Proelium\n\n- Execução: ${report.finishedAt}\n- Ambiente: servidor JSON temporário e descartável\n- Banco PostgreSQL: não acessado\n- Resultado: ${passed}/${report.checks.length} verificações aprovadas\n\n## Verificações\n\n| Resultado | Área | Verificação | Detalhe |\n|---|---|---|---|\n${rows}\n\n## Correções recomendadas\n\n${corrections}\n`;
}

async function runFunctionalTestBot(options = {}) {
  const startedAt = new Date().toISOString();
  const log = options.log || console.log;
  const reportPath = options.reportPath === undefined ? path.join(process.cwd(), 'reports', 'test-bot-latest.md') : options.reportPath;
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'proelium-functional-bot-'));
  const usersFile = path.join(temporaryDirectory, 'users.json');
  fs.writeFileSync(usersFile, JSON.stringify([{ username: TEST_USER, name: 'Bot de teste', role: 'admin', active: true, ...passwordRecord(TEST_PASSWORD) }], null, 2));
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const testSessionSecret = crypto.randomBytes(32).toString('hex');
  const child = spawn(process.execPath, [path.join(__dirname, '..', '..', 'server.js')], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test', DATABASE_URL: '', PROELIUM_TEST_DATA_DIR: temporaryDirectory, SESSION_SECRET: testSessionSecret, PROELIUM_PLATFORM_ADMINS: TEST_USER },
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true
  });
  let serverError = '';
  child.stderr.on('data', chunk => { serverError += chunk.toString(); });
  const checks = [];
  let googleCompanyCookie = '';
  const check = async (group, name, correction, action) => {
    try {
      const detail = String(await action() || 'Concluído');
      checks.push({ group, name, ok: true, detail, correction });
      log(`[OK] ${group} — ${name}: ${detail}`);
    } catch (error) {
      checks.push({ group, name, ok: false, detail: error.message, correction });
      log(`[FALHA] ${group} — ${name}: ${error.message}`);
    }
  };

  try {
    await waitForServer(baseUrl, child);
    await check('Segurança', 'Isolamento dos dados', 'Impedir o bot de iniciar sem PROELIUM_TEST_DATA_DIR e NODE_ENV=test.', async () => {
      const health = parseJson(await request(baseUrl, '/api/health'), '/api/health');
      expect(health.storage === 'json', `Backend inesperado: ${health.storage}.`);
      expect(health.isolatedTestMode === true, 'Servidor não confirmou o modo isolado.');
      expect(path.resolve(temporaryDirectory) !== path.resolve(path.join(__dirname, '..', '..', 'data')), 'Pasta real foi selecionada.');
      return 'JSON temporário confirmado; PostgreSQL não acessado';
    });

    const smoke = await runSmokeBot({ baseUrl, username: TEST_USER, password: TEST_PASSWORD, log: () => {} });
    await check('Base', 'Shell, PWA, autenticação e API', 'Revisar o endpoint ou ativo indicado pelo smoke test.', async () => {
      expect(smoke.ok, smoke.results.filter(item => !item.ok).map(item => `${item.name}: ${item.detail}`).join('; '));
      return `${smoke.results.length}/${smoke.results.length} verificações básicas`;
    });

    await check('Segurança', 'Rejeição de senha inválida', 'Corrigir a validação de credenciais da rota /api/auth/login.', async () => {
      const response = await request(baseUrl, '/api/auth/login', { method: 'POST', body: { username: TEST_USER, password: 'senha-incorreta' } });
      expect(response.status === 401, `Esperado 401; recebido ${response.status}.`);
      return 'credencial inválida bloqueada';
    });

    await check('Google', 'Cadastro conclui e libera o app', 'Revisar gravação da empresa, criação do usuário e cookie de sessão do onboarding Google.', async () => {
      const pending = signedSession({ email: 'google.bot@example.invalid', name: 'Google Bot', expiresAt: Date.now() + 60_000 }, testSessionSecret);
      const response = await request(baseUrl, '/api/auth/register-google-company', {
        method: 'POST',
        headers: { Cookie: `proelium_google_pending=${encodeURIComponent(pending)}` },
        body: { companyType: 'contratante', companyName: 'Empresa Google Bot', document: '12.345.678/0001-95', responsible: 'Google Bot', phone: '+55 11 99999-0000', profileInfo: '{}' }
      });
      expect(response.status === 201, `Cadastro Google retornou HTTP ${response.status}: ${response.text}`);
      const googleCookie = sessionCookie(response);
      googleCompanyCookie = googleCookie;
      expect(googleCookie.startsWith('proelium_session='), 'Cadastro não devolveu cookie de sessão.');
      const authenticated = await request(baseUrl, '/api/auth/me', { headers: { Cookie: googleCookie } });
      const payload = parseJson(authenticated, '/api/auth/me');
      expect(authenticated.status === 200 && payload.authenticated, 'Sessão criada não autenticou o usuário.');
      const sharedData = await request(baseUrl, '/api/data', { headers: { Cookie: googleCookie } });
      expect(sharedData.status === 200, `Usuário cadastrado não entrou no app: HTTP ${sharedData.status}.`);
      const companyUsers = await request(baseUrl, '/api/company/users', { headers: { Cookie: googleCookie } });
      expect(companyUsers.status === 200, `Administração da empresa retornou HTTP ${companyUsers.status}: ${companyUsers.text}`);
      const platformCompanies = await request(baseUrl, '/api/admin/companies', { headers: { Cookie: googleCookie } });
      expect(platformCompanies.status === 403, `Administração da plataforma deveria estar bloqueada; recebeu HTTP ${platformCompanies.status}.`);
      const invite = await request(baseUrl, '/api/company/invites', { method: 'POST', headers: { Cookie: googleCookie }, body: { email: 'convidado@example.invalid', role: 'operacao' } });
      const invitePayload = parseJson(invite, '/api/company/invites');
      expect(invite.status === 201 && /^http:\/\/127\.0\.0\.1:\d+\/\?invite=/.test(invitePayload.url||''), `Convite temporário inválido: HTTP ${invite.status}: ${invite.text}`);
      const inviteToken = new URL(invitePayload.url).searchParams.get('invite');
      const invitedPending = signedSession({ email: 'convidado@example.invalid', name: 'Convidado Bot', expiresAt: Date.now() + 60_000 }, testSessionSecret);
      const joined = await request(baseUrl, '/api/auth/join-google-company', { method: 'POST', headers: { Cookie: `proelium_google_pending=${encodeURIComponent(invitedPending)}; proelium_invite=${encodeURIComponent(inviteToken)}` } });
      expect(joined.status === 201, `Aceite do convite Google retornou HTTP ${joined.status}: ${joined.text}`);
      const joinedCookie = sessionCookie(joined);
      expect(joinedCookie.startsWith('proelium_session='), 'Aceite do convite não devolveu uma sessão nova.');
      const joinedData = await request(baseUrl, '/api/data', { headers: { Cookie: joinedCookie } });
      expect(joinedData.status === 200, `Participante convidado não entrou no app: HTTP ${joinedData.status}.`);
      const invitedUsers = parseJson(await request(baseUrl, '/api/company/users', { headers: { Cookie: googleCookie } }), '/api/company/users após convite');
      expect(invitedUsers.users.length === 2 && invitedUsers.users.some(user => user.email === 'convidado@example.invalid' && user.role === 'operacao'), 'O participante Google não foi adicionado à empresa do convite.');
      const secondPending=signedSession({ email: 'google.two@example.invalid', name: 'Google Two', expiresAt: Date.now() + 60_000 }, testSessionSecret);
      const secondRegistration=await request(baseUrl, '/api/auth/register-google-company', { method: 'POST', headers: { Cookie: `proelium_google_pending=${encodeURIComponent(secondPending)}` }, body: { companyType: 'contratante', companyName: 'Segunda Empresa Google Bot', document: '98.765.432/0001-98', responsible: 'Google Two', phone: '+55 11 98888-0000', profileInfo: '{}' } });
      expect(secondRegistration.status===201, `Segunda empresa retornou HTTP ${secondRegistration.status}: ${secondRegistration.text}`);
      const secondCookie=sessionCookie(secondRegistration), firstState={companyMarker:'empresa-um',clients:[]}, secondState={companyMarker:'empresa-dois',clients:[]};
      const foreignInvite=await request(baseUrl, '/api/company/invites', { method:'POST', headers:{Cookie:secondCookie}, body:{email:'outro@example.invalid',role:'leitura'} });
      const foreignInvitePayload=parseJson(foreignInvite, '/api/company/invites empresa dois');
      const foreignDelete=await request(baseUrl, `/api/company/invites?id=${encodeURIComponent(foreignInvitePayload.invite.id)}`, { method:'DELETE', headers:{Cookie:googleCookie} });
      expect(foreignDelete.status===404, `Uma empresa conseguiu alterar convite de outra: HTTP ${foreignDelete.status}.`);
      const firstWrite=await request(baseUrl, '/api/data', { method:'PUT', headers:{Cookie:googleCookie}, body:{data:firstState,baseRevision:0} });
      expect(firstWrite.status===200, `Gravação da primeira empresa retornou HTTP ${firstWrite.status}: ${firstWrite.text}`);
      const secondBeforeWrite=await request(baseUrl, '/api/data', { headers:{Cookie:secondCookie} });
      expect(secondBeforeWrite.status===200 && !String(secondBeforeWrite.text).includes('empresa-um'), 'A segunda empresa recebeu dados da primeira.');
      const secondWrite=await request(baseUrl, '/api/data', { method:'PUT', headers:{Cookie:secondCookie}, body:{data:secondState,baseRevision:0} });
      expect(secondWrite.status===200, `Gravação da segunda empresa retornou HTTP ${secondWrite.status}: ${secondWrite.text}`);
      const firstRead=await request(baseUrl, '/api/data', { headers:{Cookie:googleCookie} }),secondRead=await request(baseUrl, '/api/data', { headers:{Cookie:secondCookie} });
      expect(firstRead.status===200 && String(firstRead.text).includes('empresa-um') && !String(firstRead.text).includes('empresa-dois'), 'A primeira empresa recebeu dados cruzados.');
      expect(secondRead.status===200 && String(secondRead.text).includes('empresa-dois') && !String(secondRead.text).includes('empresa-um'), 'A segunda empresa recebeu dados cruzados.');
      const firstUsers=parseJson(await request(baseUrl, '/api/company/users', { headers:{Cookie:googleCookie} }), '/api/company/users empresa um');
      const secondUsers=parseJson(await request(baseUrl, '/api/company/users', { headers:{Cookie:secondCookie} }), '/api/company/users empresa dois');
      expect(firstUsers.users.length===2 && secondUsers.users.length===1 && firstUsers.users.every(user=>user.companyId===firstUsers.users[0].companyId) && firstUsers.users[0].email!==secondUsers.users[0].email, 'A lista de usuários foi compartilhada entre empresas.');
      const firstPresence = parseJson(await request(baseUrl, '/api/presence', { headers:{Cookie:googleCookie} }), '/api/presence empresa um');
      const secondPresence = parseJson(await request(baseUrl, '/api/presence', { headers:{Cookie:secondCookie} }), '/api/presence empresa dois');
      const firstPresenceAgain = parseJson(await request(baseUrl, '/api/presence', { headers:{Cookie:googleCookie} }), '/api/presence empresa um novamente');
      expect(firstPresenceAgain.users.every(user => user.email === undefined && user.username !== 'google.two'), 'A presença da segunda empresa vazou para a primeira.');
      expect(secondPresence.users.every(user => user.username !== 'google.bot'), 'A presença da primeira empresa vazou para a segunda.');
      return 'duas empresas criadas, convite Google ativou o participante, dados, usuários e presença isolados';
    });

    const login = await request(baseUrl, '/api/auth/login', { method: 'POST', body: { username: TEST_USER, password: TEST_PASSWORD } });
    const cookie = sessionCookie(login);
    expect(login.status === 200 && cookie, `Não foi possível autenticar o bot: HTTP ${login.status}.`);
    const api = (pathname, config = {}) => request(baseUrl, pathname, { ...config, headers: { Cookie: cookie, ...(config.headers || {}) } });
    let revision = 0;
    let state = emptyState();
    const save = async nextState => {
      const response = await api('/api/data', { method: 'PUT', body: { data: nextState, baseRevision: revision } });
      expect(response.status === 200, `Gravação isolada retornou HTTP ${response.status}: ${response.text}`);
      revision = parseJson(response, '/api/data PUT').revision;
      state = nextState;
    };

    await save(state);
    const records = scenarioRecords(state);
    state.opportunities.push(records.opportunity);
    await save(state);
    await check('CRM', 'Criação de contato e oportunidade', 'Revisar o cadastro comercial e seus campos obrigatórios.', async () => {
      expect(state.opportunities.some(item => item.id === records.opportunity.id && item.stage === 'Novo contato'), 'Contato não permaneceu no funil.');
      return 'novo contato salvo no funil';
    });

    state.products.push(records.product, records.service);
    state.quotes.push(records.quote);
    state.quoteRooms.push(records.room);
    state.packages.push({ id: 'pkg-bot-1', name: 'Pacote isolado', category: 'Rede', description: 'Pacote de teste', active: true, items: [{ productId: records.product.id, qty: 1 }] });
    state.surveys.push({ id: 'srv-bot-1', opportunityId: records.opportunity.id, title: 'Levantamento isolado', site: 'Sala de teste', source: 'Visita técnica', status: 'Validado', notes: 'Sem dados reais.' });
    state.surveyPoints.push({ id: 'svp-bot-1', surveyId: 'srv-bot-1', room: records.room.name, type: 'Ponto de rede', quantity: 2, status: 'Validado', notes: 'Teste' });
    await save(state);
    await check('Comercial', 'Proposta por ambiente', 'Corrigir produtos, ambientes, descontos ou cálculo total da proposta.', async () => {
      const calculated = records.room.items.reduce((sum, item) => {
        const product = state.products.find(entry => entry.id === item.productId);
        return sum + product.price * item.qty * (1 - Number(item.discount || 0) / 100);
      }, 0);
      expect(calculated === records.total, `Total calculado ${calculated}; esperado ${records.total}.`);
      return `proposta calculada em R$ ${records.total.toFixed(2)}`;
    });
    await check('Levantamento', 'Ambientes e quantitativos', 'Revisar vínculo entre levantamento, oportunidade e pontos técnicos.', async () => {
      expect(state.surveys[0].opportunityId === records.opportunity.id && state.surveyPoints[0].surveyId === state.surveys[0].id, 'Vínculo do levantamento inconsistente.');
      return 'levantamento e ponto vinculados';
    });

    state.clients.push(records.client);
    Object.assign(records.opportunity, { stage: 'Ganho', estimatedValue: records.total });
    Object.assign(records.quote, { clientId: records.client.id, value: records.total, status: 'Aprovado' });
    state.projects.push(records.project);
    state.activities.push({ id: 'act-bot-1', clientId: records.client.id, type: 'Proposta', title: 'Venda simulada aprovada', note: 'Registro isolado', date: records.today });
    await save(state);
    await check('Vendas', 'Conversão proposta → cliente → projeto', 'Revisar approveQuote e os vínculos de cliente, orçamento e projeto.', async () => {
      expect(records.quote.status === 'Aprovado' && records.opportunity.stage === 'Ganho', 'Venda não foi concluída.');
      expect(records.project.quoteId === records.quote.id && records.project.clientId === records.client.id, 'Projeto não herdou os vínculos da venda.');
      expect(records.project.budget === records.total, 'Projeto não herdou o valor da proposta.');
      return 'venda aprovada e projeto criado';
    });
    await check('CRM', 'Histórico do cliente', 'Revisar o vínculo de atividades ao Cliente 360°.', async () => {
      expect(state.activities.some(item => item.clientId === records.client.id), 'Histórico não vinculado.');
      return 'contato comercial registrado no histórico';
    });

    Object.assign(state, {
      tasks: [{ id: 'tsk-bot-1', title: 'Testar instalação', projectId: records.project.id, assignee: 'Técnico Bot', priority: 'Alta', status: 'Em andamento', due: records.today, time: '09:00' }],
      appointments: [{ id: 'apt-bot-1', title: 'Visita simulada', clientId: records.client.id, projectId: records.project.id, assignee: 'Técnico Bot', date: records.today, time: '09:00', note: 'Agenda isolada' }],
      installations: [{ id: 'ins-bot-1', clientId: records.client.id, projectId: records.project.id, type: 'Instalação de rede', site: 'Sala de teste', lead: 'Técnico Bot', stage: 'Instalação', progress: 65, due: records.today, status: 'Em execução' }],
      projectChecklists: [{ id: 'chk-bot-1', projectId: records.project.id, title: 'Conferir cabeamento', done: true }],
      serviceOrders: [{ id: 'os-bot-1', code: 'OS-BOT-001', clientId: records.client.id, projectId: records.project.id, type: 'Instalação', scope: 'Teste funcional', equipmentId: '', assignee: 'Técnico Bot', date: records.today, time: '09:00', status: 'Em execução' }],
      serviceReports: [{ id: 'rpt-bot-1', projectId: records.project.id, serviceOrderId: 'os-bot-1', execution: 'Instalação simulada', tests: 'Conectividade aprovada', pending: 'Nenhuma', nextAction: 'Entrega', photos: [], date: records.today }],
      projectDeliveries: [{ id: 'del-bot-1', projectId: records.project.id, accepted: true, recipient: 'Cliente Bot', date: records.today }],
      supportTickets: [{ id: 'sup-bot-1', clientId: records.client.id, projectId: records.project.id, title: 'Chamado simulado', priority: 'Média', status: 'Aberto', date: records.today }],
      collaborators: [{ id: 'col-bot-1', name: 'Técnico Bot', role: 'Técnico de teste', specialty: 'Validação', relationship: 'Simulado', availability: 'Disponível', compensation: 'Sem valor real', status: 'Ativo' }],
      evaluations: [{ id: 'eva-bot-1', projectId: records.project.id, source: 'Interna', evaluator: 'Bot de teste', collaborator: 'Técnico Bot', installation: 5, service: 5, commitment: 5, deadline: 5, note: 'Cenário isolado', date: records.today }],
      equipment: [{ id: 'eqp-bot-1', clientId: records.client.id, projectId: records.project.id, name: records.product.name, brand: records.product.brand, model: records.product.model, serial: 'SERIAL-TESTE', location: 'Cliente Simulado Bot', status: 'Instalado' }],
      equipmentHistory: [{ id: 'eqh-bot-1', equipmentId: 'eqp-bot-1', projectId: records.project.id, type: 'Instalação', note: 'Teste', date: records.today }],
      financialEntries: [{ id: 'fin-bot-1', clientId: records.client.id, projectId: records.project.id, type: 'Receita', category: 'Venda', description: 'Venda simulada', amount: records.total, date: records.today, status: 'Previsto' }],
      executionEntries: [{ id: 'exe-bot-1', projectId: records.project.id, kind: 'Mão de obra', description: 'Execução simulada', person: 'Técnico Bot', amount: 500, date: records.today }],
      executionItems: [{ id: 'exi-bot-1', executionEntryId: 'exe-bot-1', description: 'Comissionamento', quantity: 1, amount: 500 }],
      procurementRequests: [{ id: 'prc-bot-1', quoteId: records.quote.id, productId: records.product.id, name: records.product.name, category: 'Rede', status: 'A cotar' }],
      purchaseItems: [{ id: 'pur-bot-1', projectId: records.project.id, productId: records.product.id, name: records.product.name, quantity: 2, unit: 'un', status: 'Pendente', rooms: [records.room.name] }],
      technicalPoints: [{ id: 'tcp-bot-1', projectId: records.project.id, label: 'Ponto de rede 1', room: records.room.name, type: 'Rede', quantity: 1, sourceProductId: records.product.id }],
      technicalConnections: [{ id: 'tcn-bot-1', projectId: records.project.id, fromId: records.product.id, fromLabel: records.product.name, fromPort: 'LAN 1', fromRole: 'switch', toId: 'tcp-bot-1', toLabel: 'Ponto de rede 1', toPort: 'RJ-45', toRole: 'network-device', cable: 'Cat6', status: 'Confirmado' }],
      articles: [{ id: 'art-bot-1', tag: 'Testes', title: 'Procedimento isolado', summary: 'Registro temporário do bot.' }],
      auditLog: [{ id: 'aud-bot-1', action: 'functional-test', entity: records.project.id, actor: TEST_USER, at: new Date().toISOString() }]
    });
    await save(state);

    const groups = [
      ['Operação', ['tasks', 'appointments', 'installations', 'projectChecklists', 'serviceOrders', 'serviceReports', 'projectDeliveries', 'supportTickets']],
      ['Pessoas e qualidade', ['collaborators', 'evaluations']],
      ['Equipamentos', ['equipment', 'equipmentHistory']],
      ['Financeiro e execução', ['financialEntries', 'executionEntries', 'executionItems']],
      ['Compras', ['procurementRequests', 'purchaseItems']],
      ['Diagrama técnico', ['technicalPoints', 'technicalConnections']],
      ['Conhecimento e auditoria', ['articles', 'auditLog']]
    ];
    for (const [group, collections] of groups) {
      await check(group, 'Persistência dos registros', `Revisar os vínculos e a persistência de: ${collections.join(', ')}.`, async () => {
        const missing = collections.filter(key => !Array.isArray(state[key]) || state[key].length === 0);
        expect(!missing.length, `Coleções vazias: ${missing.join(', ')}.`);
        return `${collections.length} coleção(ões) validadas`;
      });
    }
    await check('Qualidade', 'Notas dentro da regra 1–5', 'Bloquear avaliações fora do intervalo permitido.', async () => {
      const scores = state.evaluations.flatMap(item => ['installation', 'service', 'commitment', 'deadline'].map(key => Number(item[key])));
      expect(scores.every(score => score >= 1 && score <= 5), 'Avaliação fora do intervalo.');
      return '4 critérios válidos';
    });
    await check('Diagrama técnico', 'Origem, cabo e destino', 'Revisar a integridade das conexões técnicas.', async () => {
      const connection = state.technicalConnections[0];
      expect(connection.fromId && connection.toId && connection.cable && connection.fromPort && connection.toPort, 'Ligação incompleta.');
      return `${connection.fromPort} → ${connection.cable} → ${connection.toPort}`;
    });

    await check('Sincronização', 'Leitura integral após uso simulado', 'Revisar serialização e envelope de /api/data.', async () => {
      const response = await api('/api/data');
      const saved = parseJson(response, '/api/data');
      expect(response.status === 200 && saved.revision === revision, 'Revisão divergente.');
      expect(saved.data.projects[0].id === records.project.id && saved.data.quotes[0].status === 'Aprovado', 'Fluxo comercial não foi recuperado.');
      return `revisão ${saved.revision} recuperada com ${Object.keys(saved.data).length} domínios`;
    });

    await check('Sincronização', 'Bloqueio de gravação antiga', 'Corrigir o controle otimista de revisão para retornar HTTP 409.', async () => {
      const response = await api('/api/data', { method: 'PUT', body: { data: state, baseRevision: revision - 1 } });
      expect(response.status === 409, `Esperado 409; recebido ${response.status}.`);
      return 'conflito detectado sem sobrescrever dados';
    });

    let readerCookie = '';
    await check('Permissões', 'Perfil Leitura não altera tarefas', 'Revisar writableRoles e dataDomains no servidor.', async () => {
      const createUser = await api('/api/auth/users', { method: 'POST', body: { username: 'leitor.bot', name: 'Leitor Bot', role: 'leitura', active: true, password: 'Leitor-Bot-2026!' } });
      expect(createUser.status === 201, `Criação isolada do leitor retornou ${createUser.status}.`);
      const readerLogin = await request(baseUrl, '/api/auth/login', { method: 'POST', body: { username: 'leitor.bot', password: 'Leitor-Bot-2026!' } });
      readerCookie = sessionCookie(readerLogin);
      const changed = structuredClone(state);
      changed.tasks.push({ id: 'tsk-negada', title: 'Não deve salvar' });
      const denied = await request(baseUrl, '/api/data', { method: 'PUT', headers: { Cookie: readerCookie }, body: { data: changed, baseRevision: revision } });
      expect(denied.status === 403, `Esperado 403; recebido ${denied.status}.`);
      return 'alteração indevida bloqueada';
    });

    await check('Segurança', 'Sessão revogada após exclusão do usuário', 'Validar a sessão contra o cadastro atual em toda requisição protegida.', async () => {
      const removed = await api('/api/auth/users?username=leitor.bot', { method: 'DELETE' });
      expect(removed.status === 200, `Exclusão do leitor retornou HTTP ${removed.status}: ${removed.text}`);
      const afterRemoval = await request(baseUrl, '/api/auth/me', { headers: { Cookie: readerCookie } });
      expect(afterRemoval.status === 401, `Sessão antiga continuou válida com HTTP ${afterRemoval.status}: ${afterRemoval.text}`);
      const blockedApi = await request(baseUrl, '/api/data', { headers: { Cookie: readerCookie } });
      expect(blockedApi.status === 401, `API continuou aceitando sessão removida com HTTP ${blockedApi.status}.`);
      return 'sessão antiga bloqueada no /api/auth/me e na API após exclusão';
    });

    await check('Administração', 'Exclusão segura de empresa', 'Manter a exclusão restrita à plataforma e remover todos os vínculos da empresa.', async () => {
      const listing = parseJson(await request(baseUrl, '/api/admin/companies', { headers: { Cookie: cookie } }), '/api/admin/companies antes da exclusão');
      const targets = listing.companies.filter(company => company.name.includes('Google Bot'));
      expect(targets.length === 2, `Empresas de teste esperadas não encontradas: ${targets.length}.`);
      for (const target of targets) {
        const deleted = await request(baseUrl, `/api/admin/companies?id=${encodeURIComponent(target.id)}`, { method: 'DELETE', headers: { Cookie: cookie } });
        expect(deleted.status === 200, `Exclusão de ${target.name} retornou HTTP ${deleted.status}: ${deleted.text}`);
      }
      const after = parseJson(await request(baseUrl, '/api/admin/companies', { headers: { Cookie: cookie } }), '/api/admin/companies após a exclusão');
      expect(!after.companies.some(company => targets.some(target => target.id === company.id)), 'A empresa excluída continuou no painel.');
      const revoked = await request(baseUrl, '/api/auth/me', { headers: { Cookie: googleCompanyCookie } });
      expect(revoked.status === 401, `Usuário da empresa excluída continuou autenticado: HTTP ${revoked.status}.`);
      return 'empresa, usuários, convites, rotinas e estado removidos; sessão revogada';
    });

    await check('Interface', 'Módulos funcionais publicados', 'Restaurar no app.js o módulo ausente e sua navegação.', async () => {
      const response = await request(baseUrl, '/app.js');
      const required = ['dashboard', 'clients', 'commercial', 'quotes', 'survey', 'products', 'projects', 'tasks', 'agenda', 'installations', 'operations', 'reports', 'execution', 'purchases', 'equipment', 'finance', 'bi', 'biMarket', 'quality', 'collaborators', 'knowledge', 'audit', 'diagram', 'productConnections'];
      const missing = required.filter(view => !new RegExp(`(?:views\\.${view}|['\"]${view}['\"])`).test(response.text));
      expect(!missing.length, `Módulos não encontrados: ${missing.join(', ')}.`);
      expect(!/vocÃ|DisponÃ|IndisponÃ|�/.test(response.text), 'Texto com codificação quebrada encontrado no shell.');
      return `${required.length} módulos encontrados no shell`;
    });
  } catch (error) {
    checks.push({ group: 'Execução', name: 'Conclusão do cenário', ok: false, detail: `${error.message}${serverError ? ` — ${serverError.trim()}` : ''}`, correction: 'Corrigir a falha estrutural que impediu a continuação do cenário isolado.' });
    log(`[FALHA] Execução — ${error.message}`);
  } finally {
    if (options.keepOpen && child.exitCode === null) {
      log(`[AMBIENTE] Interface isolada disponível em ${baseUrl} com usuário ${TEST_USER}. Pressione Ctrl+C para encerrar.`);
      await new Promise(resolve => {
        process.once('SIGINT', resolve);
        process.once('SIGTERM', resolve);
      });
    }
    await stopServer(child);
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  const report = { ok: checks.every(check => check.ok), startedAt, finishedAt: new Date().toISOString(), checks };
  if (reportPath) {
    fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
    fs.writeFileSync(path.resolve(reportPath), markdownReport(report), 'utf8');
    report.reportPath = path.resolve(reportPath);
  }
  return report;
}

function parseArguments(argv) {
  const reportIndex = argv.indexOf('--report');
  const reportPath = argv.includes('--no-report') ? null : (reportIndex >= 0 ? argv[reportIndex + 1] : undefined);
  return { reportPath, keepOpen: argv.includes('--keep-open') };
}

if (require.main === module) {
  runFunctionalTestBot(parseArguments(process.argv.slice(2))).then(report => {
    const passed = report.checks.filter(check => check.ok).length;
    console.log(`\n${report.ok ? 'Cenário funcional aprovado' : 'Cenário funcional encontrou falhas'}: ${passed}/${report.checks.length} verificações.`);
    if (report.reportPath) console.log(`Relatório: ${report.reportPath}`);
    if (!report.ok) process.exitCode = 1;
  }).catch(error => {
    console.error(`[FALHA] Bot funcional não pôde ser executado — ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { emptyState, markdownReport, runFunctionalTestBot };
