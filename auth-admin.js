const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const dataDirectory = path.join(__dirname, 'data');
const usersFile = path.join(dataDirectory, 'users.json');
const username = String(process.argv[2] || '').trim().toLowerCase();
const role = process.argv[3] === 'admin' ? 'admin' : 'operador';

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
