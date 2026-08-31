// server/sales-images.js
const { getSceneBriefs } = require('./categories.js');

const IMAGE_MODEL = 'gpt-image-1';
const IMAGE_SIZE = '1024x1024';

function createSalesImagesClient(openaiClient) {
  async function generateSalesImages({ productProfile, productName }) {
    const scenes = getSceneBriefs(productProfile.category);
    const images = [];

    for (const scene of scenes) {
      const prompt = buildImagePrompt(scene, productProfile, productName);
      const res = await openaiClient.images.generate({
        model: IMAGE_MODEL,
        prompt,
        size: IMAGE_SIZE,
      });
      images.push({ slot: scene.slot, key: scene.key, base64: res.data[0].b64_json });
    }

    return images;
  }

  return { generateSalesImages };
}

function buildImagePrompt(scene, profile, productName) {
  return `Professional e-commerce marketing photograph for a product called "${productName}". Scene: ${scene.brief} Product visual details: color/palette ${profile.colorPalette || 'unspecified'}, material ${profile.material || 'unspecified'}, form ${profile.form || 'unspecified'}. Photorealistic, high quality, commercial product photography style. No text overlays.`;
}

module.exports = { createSalesImagesClient, buildImagePrompt };
