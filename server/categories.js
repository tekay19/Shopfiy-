// server/categories.js
const BASE_SCENES = [
  { slot: 1, key: 'hero', brief: 'Clean, bright studio background. The product centered and clearly visible. 3-4 small benefit icons arranged around it.' },
  { slot: 2, key: 'benefits', brief: "A clear visual breakdown of the product's key features and benefits, with icon or label callouts pointing at parts of the product." },
  { slot: 3, key: 'problem_solution', brief: 'A split or before/after style scene showing the everyday problem the product solves, and the product presented as the solution.' },
  { slot: 4, key: 'comparison', brief: 'A side-by-side comparison: an ordinary/generic alternative versus this product, visually highlighting the difference.' },
  { slot: 5, key: 'usage', brief: 'A person actively using the product in a natural, everyday setting.' },
  { slot: 6, key: 'authority', brief: "A trustworthy, professional setting that builds confidence in the product's quality." },
  { slot: 7, key: 'social_proof', brief: 'A warm, lifestyle scene suggesting a satisfied customer, evoking positive testimonial energy.' },
  { slot: 8, key: 'final_cta', brief: 'The product shown in its real usage context, styled for a final, attention-grabbing call-to-action image.' },
];

const CATEGORY_OVERRIDES = {
  genel_urun: {},
  saglik_bebek: {
    hero: 'A friendly doctor or health expert in a clean clinical setting, presenting the product with confidence.',
    authority: 'A doctor or pediatric health expert examining or endorsing the product in a professional medical setting.',
  },
  guzellik_bakim: {
    comparison: "A clear before-and-after beauty transformation split image related to the product's effect.",
  },
  moda_aksesuar: {
    usage: 'A stylish model wearing or using the product in a fashion-editorial style setting.',
  },
  ev_yasam: {
    usage: 'The product being used naturally inside a real, warm home environment.',
  },
  elektronik: {
    benefits: "A technical breakdown of the product's specs and features with clean label callouts, like a tech spec sheet.",
    comparison: "A size/scale comparison image showing the product's dimensions relative to a common everyday object.",
  },
  diger: {},
};

const CATEGORY_KEYS = Object.keys(CATEGORY_OVERRIDES);

function getSceneBriefs(categoryKey) {
  const overrides = CATEGORY_OVERRIDES[categoryKey];
  if (!overrides) {
    throw new Error(`Unknown category: ${categoryKey}`);
  }
  return BASE_SCENES.map((scene) => ({
    slot: scene.slot,
    key: scene.key,
    brief: overrides[scene.key] || scene.brief,
  }));
}

module.exports = { CATEGORY_KEYS, getSceneBriefs };
