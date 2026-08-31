// server/studio-routes.test.js
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

test('POST /api/studio/create-product starts a job and streams progress to done', async () => {
  const deps = {
    createShopifyClient: () => ({}),
    createAiClient: () => ({}),
    createOpenAiClient: () => ({}),
    createProductProfileClient: () => ({}),
    createSalesImagesClient: () => ({}),
    createSalesCopyClient: () => ({}),
    runCreateStudioProductJob: async (input, emit) => {
      emit({ step: 'theme_upload', status: 'ok', message: 'done uploading' });
      emit({ step: 'done', status: 'ok', message: 'ready' });
      return { themeId: 1, productId: 1, productHandle: 'x', category: 'genel_urun', imagesGenerated: 8, imagesUploaded: 8, published: true };
    },
  };
  const { server, baseUrl } = await startTestServer(deps);

  const form = new FormData();
  form.append('shopDomain', 'acme.myshopify.com');
  form.append('accessToken', 'shpat_x');
  form.append('storeName', 'Acme');
  form.append('primaryColorHex', '#112233');
  form.append('productName', 'Magic Bottle');
  form.append('whatItDoes', 'keeps water cold');
  form.append('basicInfo', 'BPA-free');
  form.append('whatsappPhone', '+905551234567');
  form.append('logo', new Blob([Buffer.from('fake')], { type: 'image/png' }), 'logo.png');
  form.append('photo', new Blob([Buffer.from('photo')], { type: 'image/jpeg' }), 'photo.jpg');

  const createRes = await fetch(`${baseUrl}/api/studio/create-product`, { method: 'POST', body: form });
  const { jobId } = await createRes.json();
  assert.ok(jobId);

  const progressRes = await fetch(`${baseUrl}/api/progress/${jobId}`);
  const text = await progressRes.text();

  assert.match(text, /theme_upload/);
  assert.match(text, /"step":"done"/);
  server.close();
});

test('POST /api/studio/create-product rejects a request missing required fields', async () => {
  const { server, baseUrl } = await startTestServer({});

  const form = new FormData();
  form.append('shopDomain', 'acme.myshopify.com');
  // missing everything else

  const res = await fetch(`${baseUrl}/api/studio/create-product`, { method: 'POST', body: form });
  assert.equal(res.status, 400);
  server.close();
});
