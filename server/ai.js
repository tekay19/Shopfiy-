// server/ai.js
const MODEL = 'gpt-4o-mini';

function createAiClient(openaiClient) {
  async function askForJson(systemPrompt, userPrompt) {
    const res = await openaiClient.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    return JSON.parse(res.choices[0].message.content);
  }

  async function inferBrandVoice({ storeName, sampleProductTitles }) {
    return askForJson(
      'You infer a short brand voice description for an e-commerce store. Respond as JSON: {"tone": string}.',
      `Store name: ${storeName}\nSample products: ${sampleProductTitles.join(', ')}`,
    );
  }

  async function rewriteProduct({ product, brandVoice }) {
    return askForJson(
      `You write e-commerce product copy in this brand voice: ${brandVoice}. ` +
      'Respond as JSON: {"title": string, "bodyHtml": string, "seoTitle": string, "seoDescription": string}. ' +
      'bodyHtml may contain simple HTML tags like <p> and <ul>.',
      `Rewrite this product listing:\nTitle: ${product.title}\nDescription: ${product.bodyHtml}`,
    );
  }

  async function writeCollectionCopy({ collectionName, brandVoice }) {
    return askForJson(
      `You write e-commerce collection page copy in this brand voice: ${brandVoice}. ` +
      'Respond as JSON: {"title": string, "bodyHtml": string}.',
      `Write a short collection intro for the category "${collectionName}".`,
    );
  }

  async function writePageCopy({ pageType, storeName, brandVoice }) {
    return askForJson(
      `You write Shopify store pages in this brand voice: ${brandVoice}. ` +
      'Respond as JSON: {"title": string, "bodyHtml": string}.',
      `Write the "${pageType}" page for the store "${storeName}".`,
    );
  }

  async function writeHeroCopy({ storeName, brandVoice }) {
    return askForJson(
      `You write homepage hero copy for a Shopify store in this brand voice: ${brandVoice}. ` +
      'Respond as JSON: {"heading": string, "text": string, "buttonLabel": string}. ' +
      'text may contain a single <p> tag. buttonLabel is 1-3 words.',
      `Store name: ${storeName}`,
    );
  }

  return { inferBrandVoice, rewriteProduct, writeCollectionCopy, writePageCopy, writeHeroCopy };
}

module.exports = { createAiClient };
