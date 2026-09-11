const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { Pool } = require('pg');

const dataDirectory = path.join(__dirname, 'data');
const usersFile = path.join(dataDirectory, 'users.json');
const username = String(process.argv[2] || '').trim().toLowerCase();
const roles = new Set(['admin', 'comercial', 'operacao', 'financeiro', 'leitura', 'operador']);
const role = roles.has(process.argv[3]) ? process.argv[3] : 'operador';

if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username)) {
  console.error('Uso: node auth-admin.js <usuario> [admin|operador]');
  process.exit(1);
}

const ask = question => new Promise(resolve => {
  const input = readline.createInterface({ input: process.stdin, output: process.stdout });
  input.question(question, answer => { input.close(); resolve(answer); });
});

(async () => {
  const password = await ask(`Senha para ${username}: `);
  if (password.length < 10) throw new Error('A senha deve ter pelo menos 10 caracteres.');
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    try {
      const result = await pool.query(
        `insert into app_users (username, name, role, active, email, company_id, account_type, founder,
                                profile_info, portfolio, modules, company_access_override, salt, password_hash,
                                created_at, updated_at)
         values ($1, $1, $2, true, null, null, 'support', false, '', '[]'::jsonb, '[]'::jsonb, null, $3, $4, now(), now())
         on conflict (username) do update set name = excluded.name, role = excluded.role, active = true,
           salt = excluded.salt, password_hash = excluded.password_hash, updated_at = now()`
        [username, role, salt.toString('base64'), hash.toString('base64')],
      );
      if (result.rowCount !== 1) throw new Error('Não foi possível atualizar o usuário no PostgreSQL.');
      console.log(`Usuário atualizado no PostgreSQL: ${username} (${role})`);
      return;
    } finally {
      await pool.end();
    }
  }
  fs.mkdirSync(dataDirectory, { recursive: true });
  let users = [];
  if (fs.existsSync(usersFile)) users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
  const record = { username, name: username, role, active: true, salt: salt.toString('base64'), hash: hash.toString('base64'), createdAt: new Date().toISOString() };
  const index = users.findIndex(user => user.username === username);
  if (index >= 0) users[index] = { ...users[index], ...record, createdAt: users[index].createdAt || record.createdAt };
  else users.push(record);
  const temporary = `${usersFile}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(users, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, usersFile);
  console.log(`${index >= 0 ? 'Usuário atualizado' : 'Usuário criado'}: ${username} (${role})`);
})().catch(error => { console.error(error.message); process.exit(1); });
