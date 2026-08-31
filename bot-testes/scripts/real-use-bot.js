const { request, runSmokeBot } = require('./smoke-bot');
const DEFAULT_URL = 'http://127.0.0.1:4173';
function expect(condition, message) { if (!condition) throw new Error(message); }
async function runRealUseBot(options = {}) {
  const baseUrl = options.baseUrl || DEFAULT_URL, log = options.log || console.log, results = [];
  const check = async (name, action) => { try { const detail = await action(); results.push({ name, ok: true, detail }); log(`[OK] ${name}${detail ? ` — ${detail}` : ''}`); } catch (error) { results.push({ name, ok: false, detail: error.message }); log(`[FALHA] ${name} — ${error.message}`); } };
  await check('Servidor e shell', async () => { const response = await request(baseUrl, '/'); expect(response.status === 200, `HTTP ${response.status}`); expect(/<title>Proelium Operacional<\/title>/i.test(response.text), 'Título não encontrado.'); expect(/id=["']navigation["']/i.test(response.text), 'Navegação não encontrada.'); return 'página principal carregada'; });
  await check('Módulos publicados', async () => { const response = await request(baseUrl, '/app.js'); expect(response.status === 200, `HTTP ${response.status}`); const views = ['dashboard', 'commercial', 'clients', 'projects', 'operations', 'finance', 'reports']; const missing = views.filter(view => !new RegExp(`['"]${view}['"]`).test(response.text)); expect(!missing.length, `módulos ausentes: ${missing.join(', ')}`); return `${views.length} áreas essenciais presentes`; });
  const smoke = await runSmokeBot({ baseUrl, username: options.username, password: options.password, log: () => {} });
  results.push(...smoke.results.map(item => ({ name: `Base — ${item.name}`, ok: item.ok, detail: item.detail })));
  smoke.results.forEach(item => log(`[${item.ok ? 'OK' : 'FALHA'}] Base — ${item.name}${item.detail ? ` — ${item.detail}` : ''}`));
  return { ok: results.every(result => result.ok), baseUrl, mode: 'somente leitura', results };
}
if (require.main === module) runRealUseBot({ baseUrl: process.argv[2] || process.env.PROELIUM_TEST_URL || DEFAULT_URL, username: process.env.PROELIUM_TEST_USER, password: process.env.PROELIUM_TEST_PASSWORD }).then(report => { const passed = report.results.filter(result => result.ok).length; console.log(`\nBot de uso real (${report.mode}): ${passed}/${report.results.length} verificações aprovadas em ${report.baseUrl}.`); if (!report.ok) process.exitCode = 1; }).catch(error => { console.error(`[FALHA] Não foi possível executar o bot de uso real — ${error.message}`); process.exitCode = 1; });
module.exports = { runRealUseBot };
