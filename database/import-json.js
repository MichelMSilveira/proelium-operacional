const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
  const dataDirectory = process.env.PROELIUM_DATA_DIR || path.join(__dirname, '..', 'data');
  const state = readJson(path.join(dataDirectory, 'shared-data.json'), null);
  const users = readJson(path.join(dataDirectory, 'users.json'), []);
  if (!state?.data || !Number.isFinite(Number(state.revision))) throw new Error('shared-data.json ausente ou inválido.');
  if (!Array.isArray(users) || !users.length) throw new Error('users.json ausente ou inválido.');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    await client.query('begin');
    const existing = await client.query("select revision from app_state where state_key = 'shared' for update");
    if (existing.rowCount) throw new Error(`Banco já possui dados na revisão ${existing.rows[0].revision}. Importação cancelada.`);
    const updatedAt = state.updatedAt || new Date().toISOString();
    const revision = Number(state.revision);
    await client.query(
      "insert into app_state (state_key, data, revision, updated_at) values ('shared', $1::jsonb, $2, $3)",
      [JSON.stringify(state.data), revision, updatedAt]
    );
    await client.query(
      "insert into app_state_revisions (state_key, revision, data, updated_at, actor) values ('shared', $1, $2::jsonb, $3, 'json-import')",
      [revision, JSON.stringify(state.data), updatedAt]
    );
    for (const user of users) {
      await client.query(
        `insert into app_users (username, name, role, active, salt, password_hash, created_at)
         values ($1, $2, $3, $4, $5, $6, coalesce($7::timestamptz, now()))`,
        [user.username, user.name || user.username, user.role || 'operador', user.active !== false, user.salt, user.hash, user.createdAt || null]
      );
    }
    await client.query('commit');
    console.log(`Importação concluída: revisão ${revision}, ${users.length} usuário(s).`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
