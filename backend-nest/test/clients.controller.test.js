const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');

const { Test } = require('@nestjs/testing');
const { ClientsController } = require('../dist/clients/clients.controller');
const { ClientsService } = require('../dist/clients/clients.service');

test('clients HTTP contract forwards the session and preserves a conflict response', async (context) => {
  const calls = [];
  const service = {
    list: async (cookie) => {
      calls.push({ operation: 'list', cookie });
      return { clients: [{ id: 'client-1', name: 'Example' }], activities: [], revision: 2 };
    },
    save: async (body, cookie) => {
      calls.push({ operation: 'save', body, cookie });
      return { status: 409, body: JSON.stringify({ conflict: true, revision: 3 }) };
    },
  };
  const module = await Test.createTestingModule({
    controllers: [ClientsController],
    providers: [{ provide: ClientsService, useValue: service }],
  }).compile();
  const app = module.createNestApplication({ bodyParser: false });
  context.after(() => app.close());
  app.useBodyParser('json', { limit: '6mb' });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  const base = `http://127.0.0.1:${address.port}`;

  const listResponse = await fetch(`${base}/api/clients`, { headers: { cookie: 'session=test' } });
  assert.equal(listResponse.status, 200);
  assert.equal((await listResponse.json()).clients[0].id, 'client-1');

  const saveResponse = await fetch(`${base}/api/clients`, {
    method: 'POST',
    headers: { cookie: 'session=test', 'content-type': 'application/json' },
    body: JSON.stringify({ client: { id: 'client-1' }, baseRevision: 2 }),
  });
  assert.equal(saveResponse.status, 409);
  assert.deepEqual(await saveResponse.json(), { conflict: true, revision: 3 });
  assert.deepEqual(calls, [
    { operation: 'list', cookie: 'session=test' },
    { operation: 'save', body: { client: { id: 'client-1' }, baseRevision: 2 }, cookie: 'session=test' },
  ]);
});
