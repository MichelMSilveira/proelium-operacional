const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

const digest = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
  const dataDirectory = process.env.PROELIUM_DATA_DIR || path.join(__dirname, '..', 'data');
  const source = JSON.parse(fs.readFileSync(path.join(dataDirectory, 'shared-data.json'), 'utf8'));
  const sourceUsers = JSON.parse(fs.readFileSync(path.join(dataDirectory, 'users.json'), 'utf8'));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const stateResult = await pool.query("select data, revision from app_state where state_key = 'shared'");
    const usersResult = await pool.query('select username from app_users order by username');
    if (!stateResult.rowCount) throw new Error('Estado compartilhado não encontrado no PostgreSQL.');
    const stored = stateResult.rows[0];
    const checks = {
      revision: Number(stored.revision) === Number(source.revision),
      dataHash: digest(stored.data) === digest(source.data),
      users: usersResult.rowCount === sourceUsers.length
    };
    if (Object.values(checks).some(value => !value)) throw new Error(`Validação falhou: ${JSON.stringify(checks)}`);
    console.log(`Validação concluída: revisão ${stored.revision}, hash íntegro, ${usersResult.rowCount} usuário(s).`);
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
