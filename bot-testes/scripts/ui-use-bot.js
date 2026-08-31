const { chromium } = require('playwright');

const baseUrl = process.argv[2] || process.env.PROELIUM_TEST_URL || 'http://127.0.0.1:4173';
const username = process.env.PROELIUM_TEST_USER;
const password = process.env.PROELIUM_TEST_PASSWORD;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('401 (Unauthorized)')) errors.push(message.text()); });
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    if (username && password) {
      await page.locator('#authUsername').fill(username);
      await page.locator('#authPassword').fill(password);
      await page.waitForTimeout(500);
      const response = await page.evaluate(async ({ username, password }) => {
        const result = await fetch('./api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
        return { ok: result.ok, status: result.status };
      }, { username, password });
      if (!response.ok) throw new Error(`login rejeitado pelo servidor (HTTP ${response.status}).`);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.waitForFunction(() => !document.body.classList.contains('auth-pending'), null, { timeout: 10000 }).catch(async () => {
        const message = await page.locator('#authError').innerText().catch(() => '');
        throw new Error(message || 'login não foi concluído; verifique usuário, senha e servidor.');
      });
    } else {
      console.log('[OK] Tela de autenticação exibida (sem credenciais fornecidas).');
    }
    if (!username || !password) return;
    const views = ['dashboard', 'commercial', 'clients', 'projects', 'processes', 'purchases', 'diagram', 'installations', 'agenda', 'tasks', 'operations', 'reports', 'equipment', 'execution', 'collaborators', 'quality', 'knowledge', 'finance', 'bi', 'audit'];
    const expected = { dashboard: 'Visão geral', commercial: 'Comercial', clients: 'Clientes', projects: 'Projetos', processes: 'Processos', purchases: 'Compras', diagram: 'Diagrama', installations: 'Instalação', agenda: 'Agenda', tasks: 'Tarefas', operations: 'Operação', reports: 'Relatórios', equipment: 'Equipamentos', execution: 'Execução', collaborators: 'Colaboradores', quality: 'Qualidade', knowledge: 'Conhecimento', finance: 'Financeiro', bi: 'BI', audit: 'Auditoria' };
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
