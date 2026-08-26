// server/ai.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAiClient } = require('./ai.js');

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

test('inferBrandVoice returns the parsed tone', async () => {
  const client = createAiClient(fakeOpenAiClient({ tone: 'playful and budget-friendly' }));
  const result = await client.inferBrandVoice({ storeName: 'Acme', sampleProductTitles: ['Red Mug'] });
  assert.equal(result.tone, 'playful and budget-friendly');
  assert.match(JSON.stringify(fakeOpenAiClient.lastParams.messages), /Acme/);
});

test('rewriteProduct sends the product context and returns rewritten fields', async () => {
  const openai = fakeOpenAiClient({
    title: 'The Perfect Red Mug',
    bodyHtml: '<p>Great mug.</p>',
    seoTitle: 'Red Mug | Acme',
    seoDescription: 'Buy the best red mug.',
  });
  const client = createAiClient(openai);

  const result = await client.rewriteProduct({
    product: { title: 'Red Mug', bodyHtml: '<p>A mug.</p>' },
    brandVoice: 'playful',
  });

  assert.equal(result.title, 'The Perfect Red Mug');
  assert.match(JSON.stringify(fakeOpenAiClient.lastParams.messages), /playful/);
  assert.match(JSON.stringify(fakeOpenAiClient.lastParams.messages), /Red Mug/);
});

test('writeCollectionCopy returns title and bodyHtml', async () => {
  const client = createAiClient(fakeOpenAiClient({
    title: 'Stunning Mugs',
    bodyHtml: '<p>Explore our collection of beautiful mugs.</p>',
  }));
  const result = await client.writeCollectionCopy({ collectionName: 'Mugs', brandVoice: 'playful' });
  assert.deepEqual(result, {
    title: 'Stunning Mugs',
    bodyHtml: '<p>Explore our collection of beautiful mugs.</p>',
  });
  assert.match(JSON.stringify(fakeOpenAiClient.lastParams.messages), /Mugs/);
});

test('writePageCopy returns title and bodyHtml for a specific page type', async () => {
  const client = createAiClient(fakeOpenAiClient({
    title: 'About Acme',
    bodyHtml: '<p>We are committed to quality.</p>',
  }));
  const result = await client.writePageCopy({ pageType: 'about', storeName: 'Acme', brandVoice: 'professional' });
  assert.deepEqual(result, {
    title: 'About Acme',
    bodyHtml: '<p>We are committed to quality.</p>',
  });
  assert.match(JSON.stringify(fakeOpenAiClient.lastParams.messages), /about/);
  assert.match(JSON.stringify(fakeOpenAiClient.lastParams.messages), /Acme/);
});

test('writeHeroCopy returns heading/text/buttonLabel', async () => {
  const client = createAiClient(fakeOpenAiClient({ heading: 'Acme', text: '<p>Hi</p>', buttonLabel: 'Shop Now' }));
  const result = await client.writeHeroCopy({ storeName: 'Acme', brandVoice: 'playful' });
  assert.deepEqual(result, { heading: 'Acme', text: '<p>Hi</p>', buttonLabel: 'Shop Now' });
  assert.match(JSON.stringify(fakeOpenAiClient.lastParams.messages), /Acme/);
});
