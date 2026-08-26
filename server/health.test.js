const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('./index.js');

test('GET /health returns ok status', async () => {
  const app = createApp();
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address();

  const res = await fetch(`http://127.0.0.1:${port}/health`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(body, { status: 'ok' });

  server.close();
});
