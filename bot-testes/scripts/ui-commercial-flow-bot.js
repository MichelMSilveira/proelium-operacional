const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { once } = require('events');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..', '..');
const TEST_USER = 'bot.ui.comercial';
const TEST_PASSWORD = process.env.PROELIUM_UI_TEST_PASSWORD || 'Bot-UI-Fluxo-2026!';
const COMPANY_ID = 'company-ui-commercial-bot';

function passwordRecord(password) {
  const salt = crypto.randomBytes(16);
  return { salt: salt.toString('base64'), hash: crypto.scryptSync(password, salt, 64).toString('base64') };
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

function emptyState() {
  const keys = [
    'clients', 'projects', 'tasks', 'quotes', 'products', 'installations', 'activities',
    'opportunities', 'appointments', 'quoteRooms', 'packages', 'equipment', 'equipmentHistory',
    'financialEntries', 'financialAccounts', 'evaluations', 'collaborators', 'projectChecklists',
    'serviceReports', 'projectDeliveries', 'serviceOrders', 'supportTickets', 'executionEntries',
    'executionItems', 'procurementRequests', 'purchaseItems', 'surveys', 'surveyPoints', 'surveyRooms',
    'technicalPoints', 'technicalConnections', 'articles', 'auditLog', 'recoveryLog'
  ];
  return Object.fromEntries(keys.map(key => [key, []]));
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Servidor isolado encerrou com código ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Servidor isolado não iniciou dentro do tempo esperado.');
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 2_000))]);
}

async function assertData(page, predicate, message) {
  let lastData = {};
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    lastData = await page.evaluate(async () => {
      const response = await fetch('./api/data', { cache: 'no-store' });
      if (!response.ok) throw new Error(`API de dados retornou HTTP ${response.status}.`);
      return (await response.json()).data || {};
    });
    try {
      if (predicate(lastData)) return lastData;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`${message} Estado remoto: ${JSON.stringify(Object.fromEntries(Object.entries(lastData).filter(([key]) => ['opportunities', 'surveys', 'surveyPoints', 'quotes', 'quoteRooms', 'collaborators'].includes(key)).map(([key, value]) => [key, Array.isArray(value) ? value.length : value])))}`);
}

async function fillField(page, name, value) {
  const field = page.locator(`#recordForm [name="${name}"]`);
  await field.waitFor({ state: 'visible', timeout: 5_000 });
  await field.fill(String(value));
}

async function selectLabel(page, name, label) {
  const field = page.locator(`#recordForm select[name="${name}"]`);
  await field.waitFor({ state: 'visible', timeout: 5_000 });
  await field.selectOption({ label });
}

async function saveDialog(page) {
  const validity = await page.locator('#recordForm').evaluate(form => ({
    valid: form.checkValidity(),
    invalid: [...form.elements].filter(element => !element.checkValidity()).map(element => ({ name: element.name, value: element.value, message: element.validationMessage }))
  }));
  if (!validity.valid) throw new Error(`Formulário inválido antes de salvar: ${JSON.stringify(validity.invalid)}`);
  await page.locator('#saveButton').click();
  if (await page.locator('#recordDialog').isVisible()) {
    const toast = await page.locator('#toastText').innerText().catch(() => '');
    throw new Error(`O formulário não fechou após salvar. Mensagem: ${toast}`);
  }
  await page.locator('#recordDialog').waitFor({ state: 'hidden', timeout: 5_000 });
}

async function openView(page, view) {
  const button = page.locator(`[data-view="${view}"]`).last();
  await button.waitFor({ state: 'visible', timeout: 5_000 });
  await button.evaluate(element => { element.scrollIntoView({ block: 'center' }); element.click(); });
  await page.locator('#content').waitFor({ state: 'visible' });
  await page.waitForTimeout(150);
  const active = await page.locator(`[data-view="${view}"].active`).count();
  if (!active) {
    const buttons = await page.locator('[data-view]').evaluateAll(elements => elements.slice(0, 12).map(element => `${element.dataset.view}:${element.textContent.trim()}:${element.className}`));
    throw new Error(`A navegação para ${view} não alterou a tela. Botões: ${buttons.join(' | ')}`);
  }
  await page.waitForFunction(expected => document.querySelector('#pageTitle')?.textContent.toLocaleLowerCase().includes(expected), view === 'commercial' ? 'oportunidades' : view, { timeout: 5_000 }).catch(() => {});
}

async function run() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'proelium-ui-commercial-bot-'));
  const users = [{
    username: TEST_USER,
    name: 'Bot UI Comercial',
    email: 'bot.ui.comercial@example.invalid',
    role: 'admin',
    active: true,
    companyId: COMPANY_ID,
    accountType: 'founder',
    founder: true,
    accessLevel: 'full',
    companyAccessOverride: 'full',
    licenseStatus: 'approved',
    companyStatus: 'approved',
    modules: ['dashboard', 'commercial', 'quotes', 'clients', 'products', 'survey', 'projects', 'collaborators'],
    permissions: ['dashboard', 'commercial', 'quotes', 'clients', 'products', 'survey', 'projects', 'processes', 'tasks', 'agenda', 'operations', 'reports', 'finance', 'bi', 'biMarket', 'quality', 'collaborators', 'equipment', 'knowledge', 'routines'],
    portfolio: [],
    createdAt: new Date().toISOString(),
    ...passwordRecord(TEST_PASSWORD)
  }];
  const companies = [{
    id: COMPANY_ID,
    name: 'Empresa UI Comercial',
    document: '12.345.678/0001-95',
    responsible: 'Bot UI Comercial',
    phone: '5511999990000',
    companyType: 'contratante',
    profileInfo: 'Empresa criada somente para o teste de uso da interface.',
    status: 'approved',
    accessLevel: 'full',
    licenseStatus: 'approved',
    founderUsername: TEST_USER,
    createdAt: new Date().toISOString()
  }];
  fs.writeFileSync(path.join(temporaryDirectory, 'users.json'), JSON.stringify(users, null, 2));
  fs.writeFileSync(path.join(temporaryDirectory, 'companies.json'), JSON.stringify(companies, null, 2));
  fs.writeFileSync(path.join(temporaryDirectory, 'shared-data.json'), JSON.stringify({ data: emptyState(), revision: 0, updatedAt: null }, null, 2));
  fs.mkdirSync(path.join(temporaryDirectory, 'company-data'), { recursive: true });
  fs.writeFileSync(path.join(temporaryDirectory, 'company-data', `${COMPANY_ID}.json`), JSON.stringify({ data: emptyState(), revision: 0, updatedAt: null }, null, 2));

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      DATABASE_URL: '',
      PROELIUM_TEST_DATA_DIR: temporaryDirectory,
      SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
      PROELIUM_PLATFORM_ADMINS: 'ui-master-only'
    },
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true
  });
  let serverError = '';
  child.stderr.on('data', chunk => { serverError += chunk.toString(); });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(`request ${request.url()} — ${request.failure()?.errorText || 'falhou'}`));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('401 (Unauthorized)')) errors.push(message.text());
  });

  try {
    await waitForServer(baseUrl, child);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 10_000 });
    const login = await page.evaluate(async ({ username, password }) => {
      const response = await fetch('./api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      return { ok: response.ok, status: response.status };
    }, { username: TEST_USER, password: TEST_PASSWORD });
    if (!login.ok) throw new Error(`Login da conta-fundadora de teste rejeitado (HTTP ${login.status}).`);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 10_000 });
    await page.waitForFunction(() => !document.body.classList.contains('auth-pending'), null, { timeout: 10_000 }).catch(async error => {
      const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 600).replace(/\s+/g, ' ');
      throw new Error(`${error.message} · auth-pending=${await page.locator('body').evaluate(node => node.classList.contains('auth-pending')).catch(() => 'desconhecido')} · ${body} · page=${errors.join(' | ') || 'sem erro de página'} · server=${serverError.slice(-500) || 'sem erro do servidor'}`);
    });
    const firstVisibleMenu = await page.locator('#navigation').innerText();
    for (const group of ['Início', 'Projetos 360°', 'Pós-venda']) {
      if (!firstVisibleMenu.toLocaleLowerCase().includes(group.toLocaleLowerCase())) {
        throw new Error(`O primeiro menu visível não contém o grupo final ${group}.`);
      }
    }
    console.log('[OK] Boot — primeiro menu visível já é o menu completo');
    await page.waitForFunction(() => typeof window.refreshSharedData === 'function', null, { timeout: 10_000 });
    // A sincronização abaixo é apenas preparação da sessão: lê a empresa vazia
    // criada pelo teste. Todas as mutações comerciais seguintes acontecem por
    // cliques, preenchimento e submits reais da interface.
    await page.evaluate(() => window.refreshSharedData(true));
    await page.locator('[data-view="commercial"]').first().waitFor({ state: 'visible', timeout: 10_000 });
    await openView(page, 'commercial');
    if (await page.locator('[data-commercial-demo]').count() !== 1) {
      const title = await page.locator('#pageTitle').innerText().catch(() => '');
      const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 500).replace(/\s+/g, ' ');
      throw new Error(`Botão de demonstração não foi localizado; tela atual: ${title || 'sem título'} · ${body}`);
    }
    const initialSnapshot = await assertData(page, data => {
      const keys = ['opportunities', 'surveys', 'quotes', 'clients', 'projects'];
      if (keys.every(key => !data[key]?.length)) return true;
      throw new Error(`registros iniciais: ${keys.map(key => `${key}=${data[key]?.length || 0}`).join(', ')}`);
    }, 'A empresa temporária já possuía registros comerciais antes do teste.');
    console.log('[OK] UI — sessão isolada autenticada sem carga prévia de dados comerciais');

    await openView(page, 'collaborators');
    await page.locator('[data-add="collaborator"].button.primary').click();
    await fillField(page, 'name', 'Ana UI Operações');
    await fillField(page, 'role', 'Técnica de campo');
    await fillField(page, 'specialty', 'Rede e automação');
    await fillField(page, 'relationship', 'Colaboradora interna');
    await fillField(page, 'availability', 'Segunda a sexta');
    await fillField(page, 'compensation', 'Diária de teste');
    await fillField(page, 'status', 'Ativo');
    await saveDialog(page);
    await assertData(page, data => data.collaborators?.some(item => item.name === 'Ana UI Operações'), 'Colaborador não foi gravado pelo formulário.');
    console.log('[OK] UI — colaborador criado e persistido pelo formulário');

    await openView(page, 'commercial');
    await page.locator('[data-add="opportunity"]').click();
    await fillField(page, 'company', 'Casa Aurora · UI Bot');
    await fillField(page, 'contact', 'Marina UI');
    await fillField(page, 'phone', '5511999991001');
    await fillField(page, 'email', 'marina.ui.bot@example.invalid');
    await selectLabel(page, 'owner', 'Ana UI Operações');
    await selectLabel(page, 'stage', 'Novo contato');
    await selectLabel(page, 'source', 'Indicação');
    await fillField(page, 'nextAction', 'Agendar levantamento técnico');
    await fillField(page, 'nextDue', new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
    await fillField(page, 'estimatedValue', '18000');
    await fillField(page, 'lossReason', '');
    await saveDialog(page);
    await assertData(page, data => data.opportunities?.some(item => item.company === 'Casa Aurora · UI Bot'), 'Oportunidade não foi gravada pelo formulário.');
    console.log('[OK] UI — oportunidade criada com contato, responsável e próxima ação');

    const opportunityId = (await assertData(page, data => data.opportunities?.length === 1, 'A base do bot recebeu dados comerciais antes da oportunidade.')).opportunities[0].id;
    const startSurvey = page.locator(`[data-start-survey-opportunity="${opportunityId}"]`);
    await startSurvey.click();
    await fillField(page, 'title', 'Levantamento UI Bot · Casa Aurora');
    await fillField(page, 'site', 'São Paulo · residência de teste');
    await selectLabel(page, 'source', 'Visita técnica');
    await selectLabel(page, 'status', 'Validado');
    await fillField(page, 'notes', 'Necessidades confirmadas na visita feita pelo bot de interface.');
    await saveDialog(page);
    await assertData(page, data => data.surveys?.some(item => item.title === 'Levantamento UI Bot · Casa Aurora'), 'Levantamento não foi gravado pelo formulário.');
    console.log('[OK] UI — levantamento técnico criado e validado');

    const surveyId = (await assertData(page, data => data.surveys?.length === 1, 'Mais de um levantamento apareceu sem ter sido criado pela interface.')).surveys[0].id;
    await page.locator(`[data-open-commercial-survey="${surveyId}"]`).click();
    await page.locator('[data-add-survey-point]').click();
    await fillField(page, 'room', 'Sala principal');
    await selectLabel(page, 'type', 'Ponto de rede Cat6');
    await selectLabel(page, 'technology', 'Rede cabeada Cat6');
    await fillField(page, 'quantity', '4');
    await selectLabel(page, 'status', 'Validado');
    await fillField(page, 'notes', 'Quatro pontos de rede conferidos na visita.');
    await saveDialog(page);
    await assertData(page, data => data.surveyPoints?.some(item => item.room === 'Sala principal' && Number(item.quantity) === 4), 'Ponto técnico não foi gravado pelo formulário.');
    console.log('[OK] UI — quantitativo de ambiente criado e persistido');

    await page.locator(`[data-survey-start-quote="${surveyId}"]`).click();
    await page.waitForFunction(() => document.querySelector('#pageTitle')?.textContent.toLocaleLowerCase().includes('orçamento'), null, { timeout: 5_000 });
    if (await page.locator('.quote-analysis').count() !== 1) throw new Error('A análise do orçamento não foi aberta após o levantamento.');
    console.log('[OK] UI — orçamento criado a partir do levantamento');

    await page.locator('[data-add="quoteItem"]').click();
    const productSearch = page.locator('#quoteProductSearch');
    await productSearch.fill('Controladora compacta Embrace Lite');
    const result = page.locator('[data-search-product]').first();
    await result.waitFor({ state: 'visible', timeout: 5_000 });
    await result.click();
    await fillField(page, 'qty', '2');
    await fillField(page, 'discount', '5');
    await saveDialog(page);
    const afterItem = await assertData(page, data => data.quoteRooms?.some(room => room.items?.some(item => Number(item.qty) === 2)), 'Item do orçamento não foi gravado pelo formulário de busca do catálogo.');
    console.log('[OK] UI — item de catálogo adicionado ao orçamento com quantidade e desconto');

    const quoteId = afterItem.quotes[0].id;
    await page.locator(`[data-quote-set-status="Enviado"][data-quote-id="${quoteId}"]`).click();
    await page.waitForFunction(() => document.querySelector('.quote-status-enviado.active'), null, { timeout: 5_000 });
    const sent = await assertData(page, data => data.quotes?.some(item => item.id === quoteId && item.status === 'Enviado'), 'A mudança para Enviado não foi persistida.');
    console.log('[OK] UI — orçamento enviado e status persistido');

    await page.locator(`[data-quote-revision="${quoteId}"]`).dispatchEvent('click');
    await page.locator('#recordDialog').waitFor({ state: 'visible', timeout: 5_000 });
    await fillField(page, 'reason', 'Cliente pediu ajuste de quantidade antes da aprovação.');
    await saveDialog(page);
    const revised = await assertData(page, data => data.quotes?.some(item => item.parentQuoteId === quoteId && item.version === 2), 'A revisão não foi criada por interação na interface.');
    const revisedQuote = revised.quotes.find(item => item.parentQuoteId === quoteId && item.version === 2);
    console.log('[OK] UI — revisão criada com histórico preservado');

    await page.locator(`[data-approve-quote="${revisedQuote.id}"]`).dispatchEvent('click');
    const finalData = await assertData(page, data => {
      const quote = data.quotes?.find(item => item.id === revisedQuote.id);
      const client = data.clients?.find(item => item.name === 'Casa Aurora · UI Bot');
      const project = data.projects?.find(item => item.quoteId === revisedQuote.id);
      return quote?.status === 'Aprovado' && client && project;
    }, 'A aprovação não criou o cliente e o projeto vinculados.');
    const finalClient = finalData.clients.find(item => item.name === 'Casa Aurora · UI Bot');
    await openView(page, 'clients');
    await page.locator(`[data-client="${finalClient.id}"]`).waitFor({ state: 'visible', timeout: 5_000 });
    if (!finalData.projects.some(project => project.quoteId === revisedQuote.id)) throw new Error('Projeto aprovado não foi vinculado ao orçamento revisado.');
    console.log('[OK] UI — aprovação concluiu o ciclo e criou cliente + projeto vinculados');

    await openView(page, 'products');
    const downloadPromise = page.waitForEvent('download', { timeout: 5_000 });
    await page.locator('[data-export-catalog]').click();
    const download = await downloadPromise;
    const exportedPath = await download.path();
    const exportedCsv = exportedPath ? fs.readFileSync(exportedPath, 'utf8') : '';
    if (!download.suggestedFilename().endsWith('.csv') || !exportedCsv.includes('"SKU";') || !exportedCsv.includes('Controladora compacta Embrace Lite')) {
      throw new Error('A exportação do catálogo não gerou um CSV da empresa atual.');
    }
    console.log('[OK] UI — catálogo da empresa exportado em CSV pela interface');

    if (errors.length) throw new Error(`Erros do navegador: ${errors.join(' | ')}`);
    console.log('\nBot UI Comercial: ciclo completo validado sem usar carga demonstrativa.');
  } catch (error) {
    const detail = serverError.trim() ? ` Servidor: ${serverError.trim()}` : '';
    throw new Error(`${error.message}${detail}`);
  } finally {
    await browser.close();
    await stopServer(child);
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error(`[FALHA] Bot UI Comercial — ${error.message}`);
  process.exitCode = 1;
});
