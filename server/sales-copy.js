// server/sales-copy.js
const MODEL = 'gpt-4o-mini';

function createSalesCopyClient(openaiClient) {
  async function writeSalesNarrative({ productName, productProfile }) {
    const res = await openaiClient.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You write persuasive e-commerce sales-page copy in Turkish, section by section, for a fixed 8-section product page layout. '
            + 'Respond as JSON: {"hero": {"title": string, "body": string}, "benefits": {"title": string, "body": string}, '
            + '"problem_solution": {"title": string, "body": string}, "comparison": {"title": string, "body": string}, '
            + '"usage": {"title": string, "body": string}, "authority": {"title": string, "body": string}, '
            + '"social_proof": {"title": string, "body": string}, "final_cta": {"title": string, "body": string, "ctaLabel": string}, '
            + '"reviews": [{"name": string, "text": string}]}. '
            + 'body values may contain simple HTML like <p> and <ul>. '
            + 'reviews must be 2-3 short, generic testimonial lines. Each "name" must be a first name plus a single last-initial only '
            + '(e.g. "Ayşe K.") — never a full surname, never a date, never any verified-purchase or star-rating claim.',
        },
        {
          role: 'user',
          content: `Product: ${productName}\nCategory: ${productProfile.category}\nKey features: ${(productProfile.keyFeatures || []).join(', ')}\nUse case: ${productProfile.useCase || ''}`,
        },
      ],
    });

    return JSON.parse(res.choices[0].message.content);
  }

  return { writeSalesNarrative };
}

module.exports = { createSalesCopyClient };
