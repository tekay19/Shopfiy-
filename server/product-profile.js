// server/product-profile.js
const { CATEGORY_KEYS } = require('./categories.js');

const MODEL = 'gpt-4o-mini';

function createProductProfileClient(openaiClient) {
  async function analyzeProduct({ productName, whatItDoes, basicInfo, photoBase64, photoMimeType }) {
    const res = await openaiClient.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You analyze a product photo and description for an e-commerce sales page. Classify it into EXACTLY one of these categories: ${CATEGORY_KEYS.join(', ')}. Respond as JSON: {"category": string, "colorPalette": string, "material": string, "form": string, "keyFeatures": string[], "useCase": string}. category MUST be one of the listed values exactly.`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Product name: ${productName}\nWhat it does: ${whatItDoes}\nBasic info: ${basicInfo}` },
            { type: 'image_url', image_url: { url: `data:${photoMimeType};base64,${photoBase64}` } },
          ],
        },
      ],
    });

    const profile = JSON.parse(res.choices[0].message.content);
    if (!CATEGORY_KEYS.includes(profile.category)) {
      profile.category = 'diger';
    }
    return profile;
  }

  return { analyzeProduct };
}

module.exports = { createProductProfileClient };
