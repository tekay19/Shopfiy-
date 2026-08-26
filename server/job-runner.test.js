// server/job-runner.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runCreateStoreJob } = require('./job-runner.js');

function makeFakeShopifyClient() {
  let nextProductId = 1;
  let publishThemeCalls = 0;
  const client = {
    createUnpublishedTheme: async () => ({ id: 555 }),
    putThemeAsset: async () => {},
    publishTheme: async () => { publishThemeCalls += 1; },
    uploadLogoFile: async (buf, filename) => ({ filename }),
    createProduct: async () => ({ id: nextProductId++, handle: 'x' }),
    createCollection: async () => ({ id: 777 }),
    addProductToCollection: async () => {},
    createPage: async () => ({ id: 888 }),
  };
  Object.defineProperty(client, 'publishThemeCalls', { get: () => publishThemeCalls });
  return client;
}

function makeFakeAiClient() {
  return {
    inferBrandVoice: async () => ({ tone: 'playful' }),
    rewriteProduct: async ({ product }) => ({
      title: product.title,
      bodyHtml: product.bodyHtml,
      seoTitle: product.title,
      seoDescription: product.bodyHtml,
    }),
    writeCollectionCopy: async ({ collectionName }) => ({ title: collectionName, bodyHtml: '<p>copy</p>' }),
    writePageCopy: async ({ pageType }) => ({ title: pageType, bodyHtml: '<p>copy</p>' }),
    writeHeroCopy: async () => ({ heading: 'H', text: '<p>T</p>', buttonLabel: 'Shop' }),
  };
}

const SAMPLE_CSV = [
  'Handle,Title,Body (HTML),Vendor,Type,Tags,SEO Title,SEO Description,Option1 Name,Option1 Value,Variant SKU,Variant Price,Variant Compare At Price,Variant Inventory Qty,Image Src',
  'red-mug,Red Mug,<p>A mug.</p>,Acme,Mugs,kitchen,,,,,MUG-RED,9.99,,25,https://example.com/red-mug.jpg',
].join('\n');

test('runs the full pipeline and returns a summary', async () => {
  const events = [];
  const summary = await runCreateStoreJob({
    shopifyClient: makeFakeShopifyClient(),
    aiClient: makeFakeAiClient(),
    themeTemplateDir: path.join(__dirname, 'theme-template'),
    storeName: 'Acme',
    primaryColorHex: '#112233',
    logoBuffer: Buffer.from('fake'),
    logoFilename: 'acme-logo.png',
    logoMimeType: 'image/png',
    csvText: SAMPLE_CSV,
  }, (event) => events.push(event));

  assert.equal(summary.themeId, 555);
  assert.equal(summary.productsCreated, 1);
  assert.equal(summary.productsFailed, 0);
  assert.equal(summary.collectionsCreated, 1);
  assert.equal(summary.pagesCreated, 3);
  assert.equal(summary.published, true);
  assert.ok(events.some((e) => e.step === 'theme_upload' && e.status === 'ok'));
  assert.ok(events.some((e) => e.step === 'done'));
  const themeUploadEvents = events.filter((e) => e.step === 'theme_upload');
  assert.ok(themeUploadEvents.length > 2, 'expected multiple theme_upload progress events, not just start+ok');
});

test('a single failing product does not abort the run', async () => {
  const client = makeFakeShopifyClient();
  client.createProduct = async () => { throw new Error('boom'); };

  const summary = await runCreateStoreJob({
    shopifyClient: client,
    aiClient: makeFakeAiClient(),
    themeTemplateDir: path.join(__dirname, 'theme-template'),
    storeName: 'Acme',
    primaryColorHex: '#112233',
    logoBuffer: Buffer.from('fake'),
    logoFilename: 'acme-logo.png',
    logoMimeType: 'image/png',
    csvText: SAMPLE_CSV,
  }, () => {});

  assert.equal(summary.productsCreated, 0);
  assert.equal(summary.productsFailed, 1);
  assert.equal(summary.published, true);
});

test('a partial theme file upload failure skips publish and reports themeFilesFailed', async () => {
  const client = makeFakeShopifyClient();
  let thrown = false;
  client.putThemeAsset = async (themeId, key) => {
    if (!thrown && key.includes('sections/')) {
      thrown = true;
      throw new Error('upload failed for this file');
    }
  };

  const summary = await runCreateStoreJob({
    shopifyClient: client,
    aiClient: makeFakeAiClient(),
    themeTemplateDir: path.join(__dirname, 'theme-template'),
    storeName: 'Acme',
    primaryColorHex: '#112233',
    logoBuffer: Buffer.from('fake'),
    logoFilename: 'acme-logo.png',
    logoMimeType: 'image/png',
    csvText: SAMPLE_CSV,
  }, () => {});

  assert.equal(summary.published, false);
  assert.ok(summary.themeFilesFailed > 0);
  assert.equal(client.publishThemeCalls, 0);
});

test('a thrown logo-upload error does not abort the run', async () => {
  const client = makeFakeShopifyClient();
  client.uploadLogoFile = async () => { throw new Error('logo upload boom'); };

  const events = [];
  const summary = await runCreateStoreJob({
    shopifyClient: client,
    aiClient: makeFakeAiClient(),
    themeTemplateDir: path.join(__dirname, 'theme-template'),
    storeName: 'Acme',
    primaryColorHex: '#112233',
    logoBuffer: Buffer.from('fake'),
    logoFilename: 'acme-logo.png',
    logoMimeType: 'image/png',
    csvText: SAMPLE_CSV,
  }, (event) => events.push(event));

  assert.equal(summary.productsCreated, 1);
  assert.equal(summary.collectionsCreated, 1);
  assert.equal(summary.pagesCreated, 3);
  assert.equal(summary.published, true);
  assert.ok(events.some((e) => e.step === 'brand_customization' && e.status === 'error'));
  assert.ok(!events.some((e) => e.step === 'brand_customization' && e.status === 'ok'));
});
