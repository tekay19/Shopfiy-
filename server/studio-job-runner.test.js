// server/studio-job-runner.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runCreateStudioProductJob } = require('./studio-job-runner.js');

function makeFakeShopifyClient() {
  let publishThemeCalls = 0;
  const client = {
    createUnpublishedTheme: async () => ({ id: 999 }),
    putThemeAsset: async () => {},
    publishTheme: async () => { publishThemeCalls += 1; },
    uploadLogoFile: async (buf, filename) => ({ filename }),
    uploadImageFile: async (buf, filename) => ({ url: `https://cdn.example/${filename}` }),
    createProduct: async () => ({ id: 1, handle: 'magic-bottle' }),
  };
  Object.defineProperty(client, 'publishThemeCalls', { get: () => publishThemeCalls });
  return client;
}

function makeFakeAiClient() {
  return {
    inferBrandVoice: async () => ({ tone: 'friendly' }),
    writeHeroCopy: async () => ({ heading: 'H', text: '<p>T</p>', buttonLabel: 'Shop' }),
  };
}

function makeFakeProductProfileClient() {
  return {
    analyzeProduct: async () => ({
      category: 'genel_urun', colorPalette: 'blue', material: 'plastic', form: 'bottle', keyFeatures: ['a'], useCase: 'u',
    }),
  };
}

const SCENE_KEYS = ['hero', 'benefits', 'problem_solution', 'comparison', 'usage', 'authority', 'social_proof', 'final_cta'];

function makeFakeSalesImagesClient() {
  return {
    generateSalesImages: async () => SCENE_KEYS.map((key, i) => ({ slot: i + 1, key, base64: 'abc' })),
  };
}

function makeFakeSalesCopyClient() {
  const section = { title: 'T', body: 'b' };
  return {
    writeSalesNarrative: async () => ({
      hero: section, benefits: section, problem_solution: section, comparison: section,
      usage: section, authority: section, social_proof: section,
      final_cta: { title: 'F', body: 'b', ctaLabel: 'Buy' },
      reviews: [{ name: 'A K.', text: 'Nice' }],
    }),
  };
}

function baseInput(overrides = {}) {
  return {
    shopifyClient: makeFakeShopifyClient(),
    aiClient: makeFakeAiClient(),
    productProfileClient: makeFakeProductProfileClient(),
    salesImagesClient: makeFakeSalesImagesClient(),
    salesCopyClient: makeFakeSalesCopyClient(),
    themeTemplateDir: path.join(__dirname, 'theme-template'),
    storeName: 'Acme', primaryColorHex: '#112233',
    logoBuffer: Buffer.from('fake'), logoFilename: 'acme-logo.png', logoMimeType: 'image/png',
    productName: 'Magic Bottle', whatItDoes: 'keeps water cold', basicInfo: 'BPA-free',
    whatsappPhone: '+905551234567',
    photoBuffer: Buffer.from('photo'), photoBase64: Buffer.from('photo').toString('base64'), photoMimeType: 'image/jpeg',
    ...overrides,
  };
}

test('runs the full studio pipeline and returns a summary', async () => {
  const events = [];
  const summary = await runCreateStudioProductJob(baseInput(), (e) => events.push(e));

  assert.equal(summary.themeId, 999);
  assert.equal(summary.productId, 1);
  assert.equal(summary.productHandle, 'magic-bottle');
  assert.equal(summary.category, 'genel_urun');
  assert.equal(summary.imagesGenerated, 8);
  assert.equal(summary.imagesUploaded, 8);
  assert.equal(summary.published, true);
  assert.equal(summary.themeFilesFailed, 0);
  assert.ok(events.some((e) => e.step === 'done'));
});

test('a single failing image upload does not abort the run', async () => {
  const client = makeFakeShopifyClient();
  let uploadCalls = 0;
  client.uploadImageFile = async (buf, filename) => {
    uploadCalls += 1;
    if (uploadCalls === 1) throw new Error('boom');
    return { url: `https://cdn.example/${filename}` };
  };

  const summary = await runCreateStudioProductJob(baseInput({ shopifyClient: client }), () => {});

  assert.equal(summary.imagesGenerated, 8);
  assert.equal(summary.imagesUploaded, 7);
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

  const summary = await runCreateStudioProductJob(baseInput({ shopifyClient: client }), () => {});

  assert.equal(summary.published, false);
  assert.ok(summary.themeFilesFailed > 0);
  assert.equal(client.publishThemeCalls, 0);
});

test('a thrown logo-upload error does not abort the run', async () => {
  const client = makeFakeShopifyClient();
  client.uploadLogoFile = async () => { throw new Error('logo upload boom'); };

  const events = [];
  const summary = await runCreateStudioProductJob(baseInput({ shopifyClient: client }), (e) => events.push(e));

  assert.equal(summary.productId, 1);
  assert.equal(summary.published, true);
  assert.ok(events.some((e) => e.step === 'brand' && e.status === 'error'));
  assert.ok(!events.some((e) => e.step === 'brand' && e.status === 'ok'));
});
