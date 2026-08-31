// server/product-profile.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createProductProfileClient } = require('./product-profile.js');

function fakeOpenAiClient(jsonResponse) {
  return {
    chat: {
      completions: {
        create: async (params) => {
          fakeOpenAiClient.lastParams = params;
          return { choices: [{ message: { content: JSON.stringify(jsonResponse) } }] };
        },
      },
    },
  };
}

test('analyzeProduct returns the parsed profile with a valid category as-is', async () => {
  const client = createProductProfileClient(fakeOpenAiClient({
    category: 'ev_yasam', colorPalette: 'beige', material: 'ceramic', form: 'bowl',
    keyFeatures: ['dishwasher safe'], useCase: 'daily kitchen use',
  }));

  const profile = await client.analyzeProduct({
    productName: 'Ceramic Bowl', whatItDoes: 'holds food', basicInfo: 'microwave safe',
    photoBase64: 'ZmFrZQ==', photoMimeType: 'image/jpeg',
  });

  assert.equal(profile.category, 'ev_yasam');
  assert.equal(profile.material, 'ceramic');
});

test('analyzeProduct coerces an invalid category to diger', async () => {
  const client = createProductProfileClient(fakeOpenAiClient({
    category: 'not_a_real_category', colorPalette: 'red', material: 'metal', form: 'box', keyFeatures: [], useCase: 'x',
  }));

  const profile = await client.analyzeProduct({
    productName: 'Mystery Box', whatItDoes: 'stores things', basicInfo: '',
    photoBase64: 'ZmFrZQ==', photoMimeType: 'image/jpeg',
  });

  assert.equal(profile.category, 'diger');
});

test('sends the photo as a data URL and the text fields in the prompt', async () => {
  const openai = fakeOpenAiClient({ category: 'genel_urun', colorPalette: '', material: '', form: '', keyFeatures: [], useCase: '' });
  const client = createProductProfileClient(openai);

  await client.analyzeProduct({
    productName: 'Widget', whatItDoes: 'does widget things', basicInfo: 'basic info here',
    photoBase64: 'ZmFrZQ==', photoMimeType: 'image/png',
  });

  const userMessage = openai.chat.completions.create ? fakeOpenAiClient.lastParams.messages.find((m) => m.role === 'user') : null;
  const content = JSON.stringify(userMessage.content);
  assert.match(content, /data:image\/png;base64,ZmFrZQ==/);
  assert.match(content, /Widget/);
  assert.match(content, /basic info here/);
});
