const test = require('node:test');
const assert = require('node:assert/strict');

const { ClientsService } = require('../dist/clients/clients.service');

const originalFetch = global.fetch;
const originalDatabaseUrl = process.env.DATABASE_URL;

test.afterEach(() => {
  global.fetch = originalFetch;
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

function serviceWithPool(pool, user) {
  // Avoid a real connection; these tests must never read production data.
  delete process.env.DATABASE_URL;
  const service = new ClientsService();
  service.pool = pool;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ user }),
  });
  return service;
}

test('clients rejects reads without a session before querying the database', async () => {
  let queries = 0;
  const service = serviceWithPool({ query: async () => { queries += 1; } }, {
    username: 'reader', companyId: 'company-a', role: 'leitura', permissions: ['clients'], modules: [],
  });

  await assert.rejects(service.list(), (error) => error.getStatus?.() === 401);
  assert.equal(queries, 0);
});

test('clients rejects a profile without access before querying the database', async () => {
  let queries = 0;
  const service = serviceWithPool({ query: async () => { queries += 1; } }, {
    username: 'reader', companyId: 'company-a', role: 'leitura', permissions: [], modules: [],
  });

  await assert.rejects(service.list('session=test'), (error) => error.getStatus?.() === 403);
  assert.equal(queries, 0);
});

test('clients list scopes every database query to the authenticated company', async () => {
  const queries = [];
  const pool = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.includes('clients_domain_entries')) return { rows: [{ id: 'client-1', name: 'Example' }] };
      if (sql.includes('clients_domain_activities')) return { rows: [] };
      return { rows: [{ revision: 3 }] };
    },
  };
  const service = serviceWithPool(pool, {
    username: 'reader', companyId: 'company-a', role: 'leitura', permissions: ['clients'], modules: [],
  });

  const result = await service.list('session=test');
  assert.equal(result.clients[0].id, 'client-1');
  assert.equal(result.revision, 3);
  assert.equal(queries.length, 3);
  for (const query of queries) assert.deepEqual(query.params, ['company-a']);
});

test('clients refuses writes from a read-only profile before opening a transaction', async () => {
  let connections = 0;
  const service = serviceWithPool({ connect: async () => { connections += 1; } }, {
    username: 'reader', companyId: 'company-a', role: 'leitura', permissions: ['clients'], modules: [],
  });

  await assert.rejects(
    service.save({ client: { id: 'client-1', name: 'Example' }, baseRevision: 0 }, 'session=test'),
    (error) => error.getStatus?.() === 403,
  );
  assert.equal(connections, 0);
});

test('clients returns conflict and does not mutate data on stale revision', async () => {
  const statements = [];
  let released = false;
  const connection = {
    query: async (sql) => {
      statements.push(sql);
      if (sql.includes('for update')) return { rowCount: 1, rows: [{ revision: 5 }] };
      return { rowCount: 0, rows: [] };
    },
    release: () => { released = true; },
  };
  const service = serviceWithPool({ connect: async () => connection }, {
    username: 'seller', companyId: 'company-a', role: 'comercial', permissions: ['clients'], modules: [],
  });

  const result = await service.save(
    { client: { id: 'client-1', name: 'Example' }, baseRevision: 4 }, 'session=test',
  );
  assert.equal(result.status, 409);
  assert.deepEqual(JSON.parse(result.body), {
    conflict: true, revision: 5, error: 'Os dados foram alterados por outro usuario.',
  });
  assert.ok(statements.includes('rollback'));
  assert.equal(statements.some((sql) => /^\s*(insert|update|delete)\b/i.test(sql)), false);
  assert.equal(released, true);
});
