const { spawn } = require('node:child_process');
const { request, runSmokeBot } = require('./smoke-bot');

const baseUrl = process.argv[2] || process.env.PROELIUM_TEST_URL || 'http://127.0.0.1:4173';
const explicitUrl = Boolean(process.argv[2] || process.env.PROELIUM_TEST_URL);
const timeout = Number(process.env.PROELIUM_TEST_TIMEOUT || 8_000);

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await request(baseUrl, '/api/health', { timeout: 1_000 });
      if (response.status === 200) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Servidor não respondeu em ${baseUrl} dentro do prazo.`);
}

async function main() {
  let child;
  if (!explicitUrl) {
    child = spawn(process.execPath, ['server.js'], { stdio: 'inherit', env: process.env });
    child.once('error', error => { throw error; });
    await waitForServer();
  }

  try {
    const report = await runSmokeBot({
      baseUrl,
      username: process.env.PROELIUM_TEST_USER,
      password: process.env.PROELIUM_TEST_PASSWORD,
      timeout
    });
    const passed = report.results.filter(result => result.ok).length;
    console.log(`\n${report.ok ? 'Bot concluído' : 'Bot encontrou falhas'}: ${passed}/${report.results.length} verificações aprovadas em ${report.baseUrl}.`);
    if (!report.ok) process.exitCode = 1;
  } finally {
    if (child) child.kill();
  }
}

main().catch(error => {
  console.error(`[FALHA] Não foi possível executar o bot — ${error.message}`);
  process.exitCode = 1;
});
