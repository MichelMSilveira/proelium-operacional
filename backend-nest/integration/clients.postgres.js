// Run explicitly against a disposable local database; never through the default unit suite.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');

const { ClientsService } = require('../dist/clients/clients.service');

test('clients uses migrated PostgreSQL tables without crossing company boundaries', async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  assert.ok(connectionString, 'TEST_DATABASE_URL is required for the integration test');
  const target = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(target.hostname), 'Only a local PostgreSQL is allowed');
  assert.equal(target.pathname, '/proelium_test', 'Only the disposable proelium_test database is allowed');

  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousFetch = global.fetch;
  const companies = [`integration-a-${randomUUID()}`, `integration-b-${randomUUID()}`];
  const clientId = `integration-client-${randomUUID()}`;
  let currentUser;
  process.env.DATABASE_URL = connectionString;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ user: currentUser }) });
  const service = new ClientsService();
  const cleanupPool = new Pool({ connectionString, max: 1 });
  const chooseUser = (companyId, role = 'comercial') => {
    currentUser = { username: 'integration-test', companyId, role, permissions: ['clients'], modules: [] };
  };

  try {
    chooseUser(companies[0]);
    const first = await service.save({ client: { id: clientId, name: 'Company A' }, baseRevision: 0 }, 'session=test');
    assert.equal(first.status, 201);
    const activity = await service.saveActivity({
      activity: { id: `activity-${randomUUID()}`, title: 'Contact A' }, baseRevision: 1,
    }, clientId, 'session=test');
    assert.equal(activity.status, 201);

    chooseUser(companies[1]);
    const second = await service.save({ client: { id: clientId, name: 'Company B' }, baseRevision: 0 }, 'session=test');
    assert.equal(second.status, 201);
    const companyB = await service.list('session=test');
    assert.deepEqual(companyB.clients.map((item) => item.name), ['Company B']);
    assert.deepEqual(companyB.activities, []);
    assert.equal(companyB.revision, 1);

    chooseUser(companies[0], 'leitura');
    const companyA = await service.list('session=test');
    assert.deepEqual(companyA.clients.map((item) => item.name), ['Company A']);
    assert.equal(companyA.activities.length, 1);
    assert.equal(companyA.revision, 2);
    await assert.rejects(
      service.save({ client: { id: clientId, name: 'Read-only update' }, baseRevision: 2 }, 'session=test', clientId),
      (error) => error.getStatus?.() === 403,
    );

    chooseUser(companies[0]);
    const stale = await service.save({ client: { id: clientId, name: 'Stale update' }, baseRevision: 1 }, 'session=test', clientId);
    assert.equal(stale.status, 409);
    assert.equal((await service.list('session=test')).clients[0].name, 'Company A');

    chooseUser(companies[1]);
    const removed = await service.remove({ baseRevision: 1 }, 'session=test', clientId);
    assert.equal(removed.status, 200);
    chooseUser(companies[0]);
    assert.equal((await service.list('session=test')).clients[0].name, 'Company A');
  } finally {
    global.fetch = previousFetch;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    await cleanupPool.query('delete from clients_domain_activities where company_id = any($1::text[])', [companies]);
    await cleanupPool.query('delete from clients_domain_entries where company_id = any($1::text[])', [companies]);
    await cleanupPool.query('delete from clients_domain_state where company_id = any($1::text[])', [companies]);
    await cleanupPool.end();
    await service.pool.end();
  }
});
