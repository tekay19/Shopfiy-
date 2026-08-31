// server/sales-copy.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSalesCopyClient } = require('./sales-copy.js');

const CANNED_NARRATIVE = {
  hero: { title: 'H', body: '<p>hb</p>' },
  benefits: { title: 'B', body: 'bb' },
  problem_solution: { title: 'P', body: 'pb' },
  comparison: { title: 'C', body: 'cb' },
  usage: { title: 'U', body: 'ub' },
  authority: { title: 'A', body: 'ab' },
  social_proof: { title: 'S', body: 'sb' },
  final_cta: { title: 'F', body: 'fb', ctaLabel: 'Şimdi Al' },
  reviews: [{ name: 'Ayşe K.', text: 'Çok memnun kaldım.' }],
};

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

test('writeSalesNarrative returns the parsed narrative unchanged', async () => {
  const client = createSalesCopyClient(fakeOpenAiClient(CANNED_NARRATIVE));

  const result = await client.writeSalesNarrative({
    productName: 'Magic Bottle',
    productProfile: { category: 'genel_urun', keyFeatures: ['keeps cold 24h'], useCase: 'daily hydration' },
  });

  assert.deepEqual(result, CANNED_NARRATIVE);
});

test('the system prompt forbids verified-purchase claims, dates, and full surnames', () => {
  fakeOpenAiClient(CANNED_NARRATIVE); // reset lastParams via a throwaway client build below
  const openai = fakeOpenAiClient(CANNED_NARRATIVE);
  const client = createSalesCopyClient(openai);

  return client.writeSalesNarrative({
    productName: 'Magic Bottle',
    productProfile: { category: 'genel_urun', keyFeatures: [], useCase: '' },
  }).then(() => {
    const systemMessage = fakeOpenAiClient.lastParams.messages.find((m) => m.role === 'system');
    assert.match(systemMessage.content, /verified-purchase/);
    assert.match(systemMessage.content, /never a full surname/);
    assert.match(systemMessage.content, /never a date/);
  });
});

test('sends the product name and profile in the user prompt', async () => {
  const openai = fakeOpenAiClient(CANNED_NARRATIVE);
  const client = createSalesCopyClient(openai);

  await client.writeSalesNarrative({
    productName: 'Magic Bottle',
    productProfile: { category: 'genel_urun', keyFeatures: ['keeps cold 24h'], useCase: 'daily hydration' },
  });

  const userMessage = fakeOpenAiClient.lastParams.messages.find((m) => m.role === 'user');
  assert.match(userMessage.content, /Magic Bottle/);
  assert.match(userMessage.content, /keeps cold 24h/);
});
