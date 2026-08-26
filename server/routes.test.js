// server/routes.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('./index.js');

function startTestServer(deps) {
  const app = createApp(deps);
  const server = app.listen(0);
  return once(server, 'listening').then(() => ({
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  }));
}

test('POST /api/connect returns shop name on success', async () => {
  const deps = {
    createShopifyClient: () => ({
      testConnection: async () => ({ ok: true, shopName: 'Acme Store' }),
    }),
  };
  const { server, baseUrl } = await startTestServer(deps);

  const res = await fetch(`${baseUrl}/api/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shopDomain: 'acme.myshopify.com', accessToken: 'shpat_x' }),
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(body, { ok: true, shopName: 'Acme Store' });
  server.close();
});

test('POST /api/create-store starts a job and GET /api/progress streams events to done', async () => {
  const deps = {
    createShopifyClient: () => ({}),
    createAiClient: () => ({}),
    createOpenAiClient: () => ({}),
    runCreateStoreJob: async (input, emit) => {
      emit({ step: 'theme_upload', status: 'ok', message: 'done uploading' });
      emit({ step: 'done', status: 'ok', message: 'ready' });
      return { themeId: 1, productsCreated: 0, productsFailed: 0, collectionsCreated: 0, pagesCreated: 0, published: true };
    },
  };
  const { server, baseUrl } = await startTestServer(deps);

  const form = new FormData();
  form.append('shopDomain', 'acme.myshopify.com');
  form.append('accessToken', 'shpat_x');
  form.append('storeName', 'Acme');
  form.append('primaryColorHex', '#112233');
  form.append('logo', new Blob([Buffer.from('fake')], { type: 'image/png' }), 'logo.png');
  form.append('productsCsv', new Blob(['Handle,Title\n'], { type: 'text/csv' }), 'products.csv');

  const createRes = await fetch(`${baseUrl}/api/create-store`, { method: 'POST', body: form });
  const { jobId } = await createRes.json();
  assert.ok(jobId);

  const progressRes = await fetch(`${baseUrl}/api/progress/${jobId}`);
  const text = await progressRes.text();

  assert.match(text, /theme_upload/);
  assert.match(text, /"step":"done"/);
  server.close();
});

test('GET /api/progress streams live events emitted after the request starts, not just replayed ones', async () => {
  const deps = {
    createShopifyClient: () => ({}),
    createAiClient: () => ({}),
    createOpenAiClient: () => ({}),
    runCreateStoreJob: (input, emit) => new Promise((resolve) => {
      emit({ step: 'theme_upload', status: 'start', message: 'starting' });
      setTimeout(() => {
        emit({ step: 'theme_upload', status: 'ok', message: 'done uploading' });
        emit({ step: 'done', status: 'ok', message: 'ready' });
        resolve({ themeId: 1, productsCreated: 0, productsFailed: 0, collectionsCreated: 0, pagesCreated: 0, published: true });
      }, 50);
    }),
  };
  const { server, baseUrl } = await startTestServer(deps);

  const form = new FormData();
  form.append('shopDomain', 'acme.myshopify.com');
  form.append('accessToken', 'shpat_x');
  form.append('storeName', 'Acme');
  form.append('primaryColorHex', '#112233');
  form.append('logo', new Blob([Buffer.from('fake')], { type: 'image/png' }), 'logo.png');
  form.append('productsCsv', new Blob(['Handle,Title\n'], { type: 'text/csv' }), 'products.csv');

  const createRes = await fetch(`${baseUrl}/api/create-store`, { method: 'POST', body: form });
  const { jobId } = await createRes.json();

  const progressRes = await fetch(`${baseUrl}/api/progress/${jobId}`);
  const text = await progressRes.text();

  assert.match(text, /"step":"theme_upload"/);
  assert.match(text, /"step":"done"/);
  server.close();
});

test('POST /api/connect rejects invalid shopDomain', async () => {
  const deps = {
    createShopifyClient: () => ({
      testConnection: async () => ({ ok: true, shopName: 'Store' }),
    }),
  };
  const { server, baseUrl } = await startTestServer(deps);

  const res = await fetch(`${baseUrl}/api/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shopDomain: 'evil.com', accessToken: 'shpat_x' }),
  });
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.match(body.error, /Geçersiz shopDomain/);
  server.close();
});

test('POST /api/create-store rejects invalid shopDomain', async () => {
  const deps = {
    createShopifyClient: () => ({}),
    createAiClient: () => ({}),
    createOpenAiClient: () => ({}),
    runCreateStoreJob: async () => ({}),
  };
  const { server, baseUrl } = await startTestServer(deps);

  const form = new FormData();
  form.append('shopDomain', 'internal.local');
  form.append('accessToken', 'shpat_x');
  form.append('storeName', 'Store');
  form.append('primaryColorHex', '#112233');
  form.append('logo', new Blob([Buffer.from('fake')], { type: 'image/png' }), 'logo.png');
  form.append('productsCsv', new Blob(['Handle,Title\n'], { type: 'text/csv' }), 'products.csv');

  const res = await fetch(`${baseUrl}/api/create-store`, { method: 'POST', body: form });
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.match(body.error, /Geçersiz shopDomain/);
  server.close();
});
