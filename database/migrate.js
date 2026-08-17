const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const migrationsDirectory = path.join(__dirname, 'migrations');
    await pool.query(`create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )`);
    const applied = new Set((await pool.query('select filename from schema_migrations')).rows.map(row => row.filename));
    const files = fs.readdirSync(migrationsDirectory).filter(file => file.endsWith('.sql')).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDirectory, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into schema_migrations (filename) values ($1)', [file]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
      console.log(`Migração aplicada: ${file}`);
    }
    console.log('Schema PostgreSQL atualizado.');
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
