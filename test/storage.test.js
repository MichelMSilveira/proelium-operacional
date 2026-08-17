const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { JsonStorage, PostgresStorage } = require('../storage');

test('JSON storage preserves revision conflicts and user records', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proelium-storage-'));
  const storage = new JsonStorage({
    dataFile: path.join(directory, 'shared-data.json'),
    usersFile: path.join(directory, 'users.json')
  });
  try {
    assert.deepEqual(await storage.readSharedData(), { data: null, updatedAt: null, revision: 0 });
    const first = await storage.writeSharedData({ clients: [] }, 0);
    assert.equal(first.conflict, false);
    assert.equal(first.value.revision, 1);
    const conflict = await storage.writeSharedData({ clients: [{ id: 'late' }] }, 0);
    assert.equal(conflict.conflict, true);
    assert.equal(conflict.current.revision, 1);
    await storage.writeUsers([{ username: 'admin', name: 'Admin', role: 'admin', active: true, salt: 'salt', hash: 'hash' }]);
    assert.equal((await storage.readUsers())[0].username, 'admin');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('PostgreSQL storage commits revisions and rejects stale writes', { skip: !process.env.DATABASE_URL }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proelium-postgres-'));
  const storage = new PostgresStorage({
    connectionString: process.env.DATABASE_URL,
    dataFile: path.join(directory, 'shared-data.json'),
    usersFile: path.join(directory, 'users.json'),
    mirrorJson: true
  });
  try {
    await storage.initialize();
    await storage.pool.query('truncate app_state_revisions, app_state, app_users');
    const first = await storage.writeSharedData({ clients: [{ id: 'client-1' }] }, 0, 'test');
    assert.equal(first.value.revision, 1);
    assert.equal((await storage.readSharedData()).data.clients[0].id, 'client-1');
    const conflict = await storage.writeSharedData({ clients: [] }, 0, 'test');
    assert.equal(conflict.conflict, true);
    await storage.writeUsers([{ username: 'admin', name: 'Admin', role: 'admin', active: true, salt: 'salt', hash: 'hash' }]);
    assert.equal((await storage.readUsers())[0].username, 'admin');
    assert.ok(fs.existsSync(path.join(directory, 'shared-data.json')));
  } finally {
    await storage.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('PostgreSQL storage serializes concurrent first writes', { skip: !process.env.DATABASE_URL }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'proelium-postgres-concurrency-'));
  const storage = new PostgresStorage({
    connectionString: process.env.DATABASE_URL,
    dataFile: path.join(directory, 'shared-data.json'),
    usersFile: path.join(directory, 'users.json'),
    mirrorJson: false
  });
  try {
    await storage.initialize();
    await storage.pool.query('truncate app_state_revisions, app_state, app_users');
    const results = await Promise.all([
      storage.writeSharedData({ writer: 'first' }, 0, 'test'),
      storage.writeSharedData({ writer: 'second' }, 0, 'test')
    ]);
    assert.equal(results.filter(result => result.conflict).length, 1);
    assert.equal(results.filter(result => !result.conflict).length, 1);
    assert.equal((await storage.readSharedData()).revision, 1);
  } finally {
    await storage.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
