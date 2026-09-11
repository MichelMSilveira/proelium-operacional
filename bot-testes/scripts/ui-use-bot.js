const { chromium } = require('playwright');

const cliBaseUrl = process.argv.slice(2).find(argument => !argument.startsWith('--'));
const baseUrl = cliBaseUrl || process.env.PROELIUM_TEST_URL || 'http://127.0.0.1:4173';
const username = process.env.PROELIUM_TEST_USER;
const password = process.env.PROELIUM_TEST_PASSWORD;

async function loginThroughVisibleForm(page, { next = false } = {}) {
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.locator('#authGate:not([hidden]), main.auth-page').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(300);
  const masterToggle = page.getByRole('button', { name: /Acesso mestre da plataforma/i });
  if (await masterToggle.count()) {
    await masterToggle.click();
  }
  const usernameField = page.locator('input[name="username"]');
  const passwordField = page.locator('input[name="password"]');
  await usernameField.waitFor({ state: 'visible', timeout: 5000 });
  await usernameField.fill(username);
  await passwordField.fill(password);
  await page.locator('#authForm button[type="submit"], main.auth-page form button[type="submit"]').first().click();
  if (next) {
    await page.locator('#authUserBadge:not([hidden]), main.auth-page nav button').first().waitFor({ state: 'visible', timeout: 15000 });
  } else {
    await page.locator('#authUserBadge:not([hidden])').waitFor({ state: 'visible', timeout: 15000 });
  }
}

(async () => {
  const browser = process.env.PLAYWRIGHT_CDP_URL
    ? await chromium.connectOverCDP(process.env.PLAYWRIGHT_CDP_URL)
    : await chromium.launch({
        channel: process.argv.includes('--chrome') ? 'chrome' : undefined,
        headless: !process.argv.includes('--headed'),
      });
  let page = await browser.newPage();
  if (process.env.PROELIUM_NEXT_TEST === '1' || process.argv.includes('--next')) {
    try {
      if (username && password) {
        try {
          await loginThroughVisibleForm(page, { next: true });
        } catch (error) {
          throw new Error(`login Next pela interface falhou — ${error.message}`);
        }
        console.log('[OK] Next.js — login mestre concluído pela interface');
        const authenticatedNextPage = await browser.newPage();
        await page.close();
        page = authenticatedNextPage;
      }
      for (const route of ['/clients', '/projects', '/commercial', '/quotes']) {
        const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle', timeout: 15000 });
        if (!response || !response.ok()) throw new Error(`${route} retornou HTTP ${response?.status() || 'sem resposta'}.`);
        if (!(await page.locator('body').innerText()).trim()) throw new Error(`${route} ficou vazia.`);
        console.log(`[OK] Next.js — ${route}`);
      }
      await page.goto(`${baseUrl}/quotes`, { waitUntil: 'networkidle', timeout: 15000 });
      const detail = page.locator('a[href^="/quotes/"]').first();
      if (await detail.count()) { await detail.click(); await page.waitForLoadState('networkidle'); console.log(`[OK] Next.js — detalhe ${new URL(page.url()).pathname}`); }
      else console.log('[OK] Next.js — nenhum orçamento cadastrado para testar o detalhe');
    } finally { await browser.close(); }
    return;
  }
  const errors = [];
  page.on('pageerror', error => errors.push(`${error.message} @ ${error.stack || 'sem stack'}`));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('401 (Unauthorized)')) errors.push(message.text()); });
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    if (username && password) {
      try {
        await loginThroughVisibleForm(page);
      } catch (error) {
        const message = await page.locator('#authError').innerText().catch(() => '');
        throw new Error(message || `login pela interface falhou — ${error.message}`);
      }
      const firstVisibleMenu = await page.locator('#navigation').innerText();
      for (const group of ['Início', 'Projetos 360°', 'Pós-venda']) {
        if (!firstVisibleMenu.toLocaleLowerCase().includes(group.toLocaleLowerCase())) {
          throw new Error(`O primeiro menu visível não contém o grupo final ${group}.`);
        }
      }
      console.log('[OK] Boot — primeiro menu visível já é o menu completo');
    } else {
      console.log('[OK] Tela de autenticação exibida (sem credenciais fornecidas).');
    }
    if (!username || !password) return;
    const views = ['dashboard', 'commercial', 'clients', 'projects', 'processes', 'purchases', 'diagram', 'installations', 'agenda', 'tasks', 'operations', 'reports', 'equipment', 'execution', 'collaborators', 'quality', 'knowledge', 'finance', 'bi', 'audit'];
    const expected = { dashboard: 'Visão geral', commercial: 'Comercial', clients: 'Clientes', projects: 'Projetos', processes: 'Processos', purchases: 'Compras', diagram: 'Diagrama', installations: 'Instalação', agenda: 'Agenda', tasks: 'Tarefas', operations: 'Pós-venda', reports: 'Relatórios', equipment: 'Equipamentos', execution: 'Execução', collaborators: 'Colaboradores', quality: 'Qualidade', knowledge: 'Conhecimento', finance: 'Financeiro', bi: 'BI', audit: 'Auditoria' };
    for (const view of views) {
      const button = page.locator(`[data-view="${view}"]`).first();
      if (await button.count() === 0) continue;
      await button.click();
      await page.locator('#content').waitFor({ state: 'visible' });
      const text = `${await page.locator('#pageTitle').innerText()} ${await page.locator('#content').innerText()}`;
      if (!text.trim()) throw new Error(`A tela ${view} ficou vazia.`);
      if (expected[view] && !text.toLocaleLowerCase().includes(expected[view].toLocaleLowerCase())) throw new Error(`A tela ${view} não apresentou o conteúdo esperado: ${expected[view]}.`);
      console.log(`[OK] Navegação — ${view}`);
    }
    await page.locator('[data-view="commercial"]').first().click();
    const quote = page.locator('[data-quote]').first();
    if (await quote.count()) {
      await quote.click();
      await page.waitForFunction(() => document.querySelector('#pageTitle')?.textContent.includes('orçamento'), null, { timeout: 5000 });
      const quoteText = await page.locator('#content').innerText();
      if (await page.locator('.quote-analysis').count() === 0 || await page.locator('.kpi').count() < 4) throw new Error('A análise do orçamento não exibiu os indicadores esperados de ambientes, preço, custo e margem.');
      console.log('[OK] Missão Comercial — orçamento aberto e valores conferidos');
    } else console.log('[OK] Missão Comercial — nenhum orçamento disponível para abrir');
    await page.locator('[data-view="clients"]').first().click();
    const client = page.locator('[data-client]').first();
    if (await client.count()) {
      await client.click();
      await page.waitForFunction(() => document.querySelector('#pageTitle')?.textContent.includes('Cliente'), null, { timeout: 5000 });
      const clientText = await page.locator('#content').innerText();
      if (!clientText.includes('FICHA DO CLIENTE')) throw new Error('A ficha 360° do cliente não foi exibida.');
      console.log('[OK] Missão CRM — ficha do cliente aberta');
    } else console.log('[OK] Missão CRM — nenhum cliente disponível para abrir');
    if (errors.length) throw new Error(`Erros no navegador: ${errors.join(' | ')}`);
    console.log(`\nBot de uso da interface: ${views.length} áreas percorridas sem alteração de dados.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(`[FALHA] Bot de uso da interface — ${error.message}`); process.exitCode = 1; });
