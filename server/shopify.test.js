// server/shopify.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createShopifyClient } = require('./shopify.js');

function fakeFetch(responses) {
  let call = 0;
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url, opts });
    const r = responses[call++];
    if (!r) throw new Error('fakeFetch: no more responses queued');
    return {
      ok: r.status < 400,
      status: r.status,
      headers: new Map(Object.entries(r.headers || {})),
      json: async () => r.body,
    };
  };
  impl.calls = calls;
  return impl;
}

test('testConnection returns shop name on success', async () => {
  const fetchImpl = fakeFetch([{ status: 200, body: { shop: { name: 'Acme Store' } } }]);
  const client = createShopifyClient('acme.myshopify.com', 'shpat_test', { fetchImpl, delayMs: 0 });

  const result = await client.testConnection();

  assert.deepEqual(result, { ok: true, shopName: 'Acme Store' });
  assert.match(fetchImpl.calls[0].url, /\/admin\/api\/2024-10\/shop\.json$/);
  assert.equal(fetchImpl.calls[0].opts.headers['X-Shopify-Access-Token'], 'shpat_test');
});

test('testConnection returns ok:false on 401', async () => {
  const fetchImpl = fakeFetch([{ status: 401, body: { errors: 'Invalid API key' } }]);
  const client = createShopifyClient('acme.myshopify.com', 'bad-token', { fetchImpl, delayMs: 0 });

  const result = await client.testConnection();

  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test('putThemeAsset retries once on 429 then succeeds', async () => {
  const fetchImpl = fakeFetch([
    { status: 429, headers: { 'Retry-After': '0' }, body: {} },
    { status: 200, body: { asset: { key: 'templates/index.json' } } },
  ]);
  const client = createShopifyClient('acme.myshopify.com', 'shpat_test', { fetchImpl, delayMs: 0 });

  await client.putThemeAsset(123, 'templates/index.json', { value: '{}' });

  assert.equal(fetchImpl.calls.length, 2);
});

test('restRequest retries once on a 500 response then succeeds', async () => {
  const fetchImpl = fakeFetch([
    { status: 500, body: { errors: 'internal error' } },
    { status: 200, body: { asset: { key: 'templates/index.json' } } },
  ]);
  const client = createShopifyClient('acme.myshopify.com', 'shpat_test', { fetchImpl, delayMs: 0 });

  await client.putThemeAsset(123, 'templates/index.json', { value: '{}' });

  assert.equal(fetchImpl.calls.length, 2);
});

test('restRequest retries after a thrown network error then succeeds', async () => {
  let call = 0;
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    call += 1;
    if (call === 1) throw new Error('network down');
    return {
      ok: true,
      status: 200,
      headers: new Map(),
      json: async () => ({ asset: { key: 'templates/index.json' } }),
    };
  };
  fetchImpl.calls = calls;
  const client = createShopifyClient('acme.myshopify.com', 'shpat_test', { fetchImpl, delayMs: 0 });

  await client.putThemeAsset(123, 'templates/index.json', { value: '{}' });

  assert.equal(fetchImpl.calls.length, 2);
});

test('Retry-After: 0 does not incorrectly wait a full second before retrying', async () => {
  const fetchImpl = fakeFetch([
    { status: 429, headers: { 'Retry-After': '0' }, body: {} },
    { status: 200, body: { asset: { key: 'templates/index.json' } } },
  ]);
  const client = createShopifyClient('acme.myshopify.com', 'shpat_test', { fetchImpl, delayMs: 0 });

  const start = Date.now();
  await client.putThemeAsset(123, 'templates/index.json', { value: '{}' });
  const elapsed = Date.now() - start;

  assert.equal(fetchImpl.calls.length, 2);
  assert.ok(elapsed < 500, `expected near-immediate retry, took ${elapsed}ms`);
});

test('createProduct posts to products.json and returns id/handle', async () => {
  const fetchImpl = fakeFetch([
    { status: 201, body: { product: { id: 999, handle: 'red-mug' } } },
  ]);
  const client = createShopifyClient('acme.myshopify.com', 'shpat_test', { fetchImpl, delayMs: 0 });

  const result = await client.createProduct({ title: 'Red Mug' });

  assert.deepEqual(result, { id: 999, handle: 'red-mug' });
  assert.match(fetchImpl.calls[0].url, /\/products\.json$/);
});

test('uploadImageFile returns the CDN url immediately when fileCreate resolves it right away', async () => {
  const fetchImpl = fakeFetch([
    { status: 200, body: { data: { stagedUploadsCreate: { stagedTargets: [{ url: 'https://upload.example/target', resourceUrl: 'https://upload.example/resource', parameters: [{ name: 'key', value: 'v' }] }], userErrors: [] } } } },
    { status: 200, body: {} },
    { status: 200, body: { data: { fileCreate: { files: [{ id: 'gid://shopify/MediaImage/1', fileStatus: 'READY', image: { url: 'https://cdn.example/img1.jpg' } }], userErrors: [] } } } },
  ]);
  const client = createShopifyClient('acme.myshopify.com', 'shpat_test', { fetchImpl, delayMs: 0, pollIntervalMs: 0 });

  const result = await client.uploadImageFile(Buffer.from('fake'), 'img1.jpg', 'image/jpeg');

  assert.deepEqual(result, { url: 'https://cdn.example/img1.jpg' });
  assert.equal(fetchImpl.calls.length, 3);
});

test('uploadImageFile polls until the file becomes ready when not immediately resolved', async () => {
  const fetchImpl = fakeFetch([
    { status: 200, body: { data: { stagedUploadsCreate: { stagedTargets: [{ url: 'https://upload.example/target', resourceUrl: 'https://upload.example/resource', parameters: [] }], userErrors: [] } } } },
    { status: 200, body: {} },
    { status: 200, body: { data: { fileCreate: { files: [{ id: 'gid://shopify/MediaImage/2', fileStatus: 'UPLOADED' }], userErrors: [] } } } },
    { status: 200, body: { data: { node: { fileStatus: 'READY', image: { url: 'https://cdn.example/img2.jpg' } } } } },
  ]);
  const client = createShopifyClient('acme.myshopify.com', 'shpat_test', { fetchImpl, delayMs: 0, pollIntervalMs: 0 });

  const result = await client.uploadImageFile(Buffer.from('fake'), 'img2.jpg', 'image/jpeg');

  assert.deepEqual(result, { url: 'https://cdn.example/img2.jpg' });
  assert.equal(fetchImpl.calls.length, 4);
});
