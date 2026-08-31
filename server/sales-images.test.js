// server/sales-images.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSalesImagesClient } = require('./sales-images.js');

test('generates one image per scene slot for the resolved category', async () => {
  let calls = 0;
  const fakeOpenAi = {
    images: {
      generate: async () => {
        calls += 1;
        return { data: [{ b64_json: `img${calls}` }] };
      },
    },
  };
  const client = createSalesImagesClient(fakeOpenAi);

  const images = await client.generateSalesImages({
    productProfile: { category: 'genel_urun', colorPalette: 'blue', material: 'plastic', form: 'bottle' },
    productName: 'Test Bottle',
  });

  assert.equal(images.length, 8);
  assert.equal(calls, 8);
  assert.equal(images[0].key, 'hero');
  assert.equal(images[0].slot, 1);
  assert.equal(images[0].base64, 'img1');
  assert.equal(images[7].key, 'final_cta');
});

test('category overrides change the prompt for the affected slot', async () => {
  const prompts = [];
  const fakeOpenAi = {
    images: {
      generate: async (params) => {
        prompts.push(params.prompt);
        return { data: [{ b64_json: 'x' }] };
      },
    },
  };
  const client = createSalesImagesClient(fakeOpenAi);

  await client.generateSalesImages({
    productProfile: { category: 'saglik_bebek', colorPalette: '', material: '', form: '' },
    productName: 'Baby Thermometer',
  });

  assert.match(prompts[0], /doctor|health expert/i);
});

test('a single failing image generation does not abort the loop and returns the successful ones', async () => {
  let calls = 0;
  const fakeOpenAi = {
    images: {
      generate: async () => {
        calls += 1;
        if (calls === 3) throw new Error('content policy refusal');
        return { data: [{ b64_json: `img${calls}` }] };
      },
    },
  };
  const client = createSalesImagesClient(fakeOpenAi);

  const errors = [];
  const images = await client.generateSalesImages({
    productProfile: { category: 'genel_urun', colorPalette: 'blue', material: 'plastic', form: 'bottle' },
    productName: 'Test Bottle',
  }, (scene, err) => errors.push({ scene, err }));

  assert.equal(calls, 8);
  assert.equal(images.length, 7);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].err.message, 'content policy refusal');
  assert.ok(errors[0].scene.key);
});
