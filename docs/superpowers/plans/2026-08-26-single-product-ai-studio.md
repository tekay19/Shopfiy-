# Single-Product AI Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second mode to `shopify-site-bot`: given one product (name, photo, description, WhatsApp number), the tool installs the bundled theme + a floating WhatsApp button, then uses AI to classify the product's category, generate 8 category-styled marketing images and matching sales copy in a fixed order, and publishes it all as one Shopify product page.

**Architecture:** New pure modules (`categories.js`, `sales-page.js`) and AI-client modules (`product-profile.js`, `sales-images.js`, `sales-copy.js`) follow the exact dependency-injection pattern already used by `server/ai.js` (constructor-injected OpenAI client, easy to fake in tests). A new orchestrator (`server/studio-job-runner.js`) mirrors `server/job-runner.js`'s shape and reuses its lower-level building blocks (`classifyThemeFiles`, `uploadThemeFiles`, `patchSettingsData`, `patchHeroSection`, `aiClient.inferBrandVoice`/`writeHeroCopy`) — the studio installs its own copy of the theme rather than depending on the CSV-mode flow having run first. A new route and a new tab in the existing UI plug it into the app already built.

**Tech Stack:** Same as the base plan (Node.js >=18.17, Express, Multer, `openai` SDK, `node:test`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-26-single-product-ai-studio-design.md`

**Depends on:** the base plan (`docs/superpowers/plans/2026-08-26-shopify-site-bot.md`) through its Task 9 — this plan's tasks call `createShopifyClient`, `createAiClient`, `createJobStore`, `classifyThemeFiles`/`uploadThemeFiles`, and `patchSettingsData`/`patchHeroSection`, all of which must already exist. Do not start Task 1 of this plan until the base plan's Task 9 is complete and reviewed.

## Global Constraints

- The 8-image sequence order is always identical across every product: `hero, benefits, problem_solution, comparison, usage, authority, social_proof, final_cta`. Only the per-slot content/style adapts to category — never the order.
- Images are generated from scratch (text-to-image) — never composited from the uploaded photo. The uploaded photo is used only for AI vision analysis and as the product's real Shopify gallery image.
- Category is always exactly one of: `genel_urun, saglik_bebek, guzellik_bakim, moda_aksesuar, ev_yasam, elektronik, diger`.
- Generated review/testimonial copy must never include a full surname, a date, or any verified-purchase/star-rating claim — first name + last initial only (e.g. "Ayşe K.").
- A single failed image generation, image upload, or theme asset upload must not abort the run — log it and continue, matching the base plan's per-item resilience principle.
- Shopify Admin API version: `2024-10` (same constant already defined in `server/shopify.js`).
- The studio installs its own theme copy per run (its own `createUnpublishedTheme` call) — it does not assume any theme already exists on the store.

---

## Task 1: WhatsApp Button Theme Addition + Settings Patch

**Files:**
- Create: `server/theme-template/snippets/whatsapp-button.liquid`
- Modify: `server/theme-template/layout/theme.liquid`
- Modify: `server/theme-template/config/settings_schema.json`
- Modify: `server/theme-content.js` (add `patchWhatsappPhone`)
- Modify: `server/theme-content.test.js` (add its test)

**Interfaces:**
- Consumes: nothing new.
- Produces: `patchWhatsappPhone(settingsDataJsonText: string, whatsappPhone: string) -> string` (same string-in/string-out convention as `patchSettingsData`). Task 8 (studio job runner) calls this.

- [ ] **Step 1: Create the WhatsApp button snippet**

Create `server/theme-template/snippets/whatsapp-button.liquid`:

```liquid
{%- if settings.whatsapp_phone != blank -%}
  <a
    href="https://wa.me/{{ settings.whatsapp_phone | remove: '+' | remove: ' ' | remove: '-' }}"
    class="whatsapp-float-button"
    target="_blank"
    rel="noopener"
    aria-label="WhatsApp"
    style="position:fixed;right:20px;bottom:20px;z-index:999;width:56px;height:56px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);"
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" fill="#ffffff" aria-hidden="true"><path d="M16 3C9.373 3 4 8.373 4 15c0 2.39.7 4.61 1.9 6.48L4 29l7.72-1.86A11.94 11.94 0 0 0 16 27c6.627 0 12-5.373 12-12S22.627 3 16 3zm0 21.8c-2.02 0-3.9-.55-5.51-1.5l-.4-.24-4.58 1.1 1.12-4.46-.26-.42A9.77 9.77 0 0 1 6.2 15C6.2 9.6 10.6 5.2 16 5.2S25.8 9.6 25.8 15 21.4 24.8 16 24.8zm5.4-7.34c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.66.15-.2.3-.76.97-.93 1.17-.17.2-.34.22-.63.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.34.44-.5.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.66-1.6-.9-2.18-.24-.58-.48-.5-.66-.5h-.56c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.87 1.22 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35z"/></svg>
  </a>
{%- endif -%}
```

- [ ] **Step 2: Include the snippet in the theme layout**

In `server/theme-template/layout/theme.liquid`, find this exact text near the end of the file (the closing body tag, preceded by a blank line and the cart-drawer script block):

```
      if (!customElements.get('cart-discount-block')) {
        customElements.define('cart-discount-block', CartDiscountBlock);
      }
    </script>
  </body>
```

Replace it with:

```
      if (!customElements.get('cart-discount-block')) {
        customElements.define('cart-discount-block', CartDiscountBlock);
      }
    </script>
    {% render 'whatsapp-button' %}
  </body>
```

- [ ] **Step 3: Add the `whatsapp_phone` setting**

In `server/theme-template/config/settings_schema.json`, the file ends with exactly this text (the last three lines of the file, no trailing newline after the final `]`):

```
    ]
  }
]
```

Replace it with:

```
    ]
  },
  {
    "name": "WhatsApp",
    "settings": [
      {
        "type": "text",
        "id": "whatsapp_phone",
        "label": "WhatsApp phone number",
        "info": "Include the country code, e.g. +905551234567. Leave blank to hide the button."
      }
    ]
  }
]
```

- [ ] **Step 4: Write the failing test for `patchWhatsappPhone`**

Add to `server/theme-content.test.js` (append; do not remove the existing two tests):

```js
test('patchWhatsappPhone sets the whatsapp_phone setting', () => {
  const original = JSON.stringify({ current: { colors_accent_1: '#dd1d1d' } });
  const patched = JSON.parse(patchWhatsappPhone(original, '+905551234567'));
  assert.equal(patched.current.whatsapp_phone, '+905551234567');
  assert.equal(patched.current.colors_accent_1, '#dd1d1d');
});
```

Add `patchWhatsappPhone` to the destructured import at the top of the test file:

```js
const { patchSettingsData, patchHeroSection, patchWhatsappPhone } = require('./theme-content.js');
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `patchWhatsappPhone` is not exported from `server/theme-content.js`.

- [ ] **Step 6: Implement `patchWhatsappPhone` in `server/theme-content.js`**

Add this function to the file (after `patchHeroSection`):

```js
function patchWhatsappPhone(settingsDataJsonText, whatsappPhone) {
  const data = JSON.parse(settingsDataJsonText);
  data.current = data.current || {};
  data.current.whatsapp_phone = whatsappPhone;
  return JSON.stringify(data, null, 2);
}
```

Update the `module.exports` line to include it:

```js
module.exports = { patchSettingsData, patchHeroSection, patchWhatsappPhone, HERO_SECTION_ID, HERO_BLOCK_ID };
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all tests pass, including the new one.

- [ ] **Step 8: Manually verify the theme.liquid and settings_schema.json edits are valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('server/theme-template/config/settings_schema.json','utf8')); console.log('settings_schema.json is valid JSON')"`
Expected: prints `settings_schema.json is valid JSON` with no error.

Run: `grep -c "render 'whatsapp-button'" server/theme-template/layout/theme.liquid`
Expected: `1`

- [ ] **Step 9: Commit**

```bash
git add server/theme-template/snippets/whatsapp-button.liquid server/theme-template/layout/theme.liquid server/theme-template/config/settings_schema.json server/theme-content.js server/theme-content.test.js
git commit -m "Add WhatsApp floating button to bundled theme and its settings patch"
```

---

## Task 2: Category Rules

**Files:**
- Create: `server/categories.js`
- Test: `server/categories.test.js`

**Interfaces:**
- Consumes: nothing (pure data + lookup).
- Produces:
  - `CATEGORY_KEYS: string[]` — the 7 valid category keys, in a stable order.
  - `getSceneBriefs(categoryKey: string) -> [{ slot: number, key: string, brief: string }]` — always 8 items, `slot` 1-8, `key` one of `hero, benefits, problem_solution, comparison, usage, authority, social_proof, final_cta`. Throws for an unknown `categoryKey`.
  Task 4 (`product-profile.js`) uses `CATEGORY_KEYS` to validate AI output; Task 5 (`sales-images.js`) calls `getSceneBriefs`.

- [ ] **Step 1: Write the failing test**

```js
// server/categories.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CATEGORY_KEYS, getSceneBriefs } = require('./categories.js');

test('CATEGORY_KEYS has exactly the 7 fixed categories', () => {
  assert.deepEqual(CATEGORY_KEYS, [
    'genel_urun', 'saglik_bebek', 'guzellik_bakim', 'moda_aksesuar', 'ev_yasam', 'elektronik', 'diger',
  ]);
});

test('getSceneBriefs returns 8 scenes in fixed order for a category with no overrides', () => {
  const scenes = getSceneBriefs('genel_urun');
  assert.equal(scenes.length, 8);
  assert.deepEqual(scenes.map((s) => s.key), [
    'hero', 'benefits', 'problem_solution', 'comparison', 'usage', 'authority', 'social_proof', 'final_cta',
  ]);
  assert.deepEqual(scenes.map((s) => s.slot), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('saglik_bebek overrides the hero and authority briefs but keeps the rest identical to the base', () => {
  const base = getSceneBriefs('genel_urun');
  const overridden = getSceneBriefs('saglik_bebek');

  const baseByKey = Object.fromEntries(base.map((s) => [s.key, s.brief]));
  const overriddenByKey = Object.fromEntries(overridden.map((s) => [s.key, s.brief]));

  assert.notEqual(overriddenByKey.hero, baseByKey.hero);
  assert.match(overriddenByKey.hero, /doctor|health expert/i);
  assert.notEqual(overriddenByKey.authority, baseByKey.authority);
  assert.match(overriddenByKey.authority, /doctor|health expert/i);

  for (const key of ['benefits', 'problem_solution', 'comparison', 'usage', 'social_proof', 'final_cta']) {
    assert.equal(overriddenByKey[key], baseByKey[key]);
  }
});

test('getSceneBriefs throws for an unknown category', () => {
  assert.throws(() => getSceneBriefs('not_a_real_category'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `server/categories.js` does not exist.

- [ ] **Step 3: Implement `server/categories.js`**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/categories.js server/categories.test.js
git commit -m "Add fixed category taxonomy and per-scene visual overrides"
```

---

## Task 3: Shopify Client — Generic Image File Upload

**Files:**
- Modify: `server/shopify.js`
- Modify: `server/shopify.test.js`

**Interfaces:**
- Consumes: nothing new (extends the existing `ShopifyClient` factory from the base plan).
- Produces: `ShopifyClient.uploadImageFile(buffer: Buffer, filename: string, mimeType: string) -> Promise<{ url: string }>` — returns a public CDN URL (unlike `uploadLogoFile`, which only returns a filename). Task 8 (studio job runner) calls this for each of the 8 generated images.

- [ ] **Step 1: Write the failing test**

Add to `server/shopify.test.js` (append; do not remove existing tests):

```js
test('uploadImageFile returns the CDN url immediately when fileCreate resolves it right away', async () => {
  const fetchImpl = fakeFetch([
    { status: 200, body: { data: { stagedUploadsCreate: { stagedTargets: [{ url: 'https://upload.example/target', resourceUrl: 'https://upload.example/resource', parameters: [{ name: 'key', value: 'v' }] }], userErrors: [] } } } },
    { status: 200, body: {} },
    { status: 200, body: { data: { fileCreate: { files: [{ id: 'gid://shopify/MediaImage/1', fileStatus: 'READY', image: { url: 'https://cdn.example/img1.jpg' } }] }, userErrors: [] } } },
  ]);
  const client = createShopifyClient('acme.myshopify.com', 'shpat_test', { fetchImpl, delayMs: 0, pollIntervalMs: 0 });

  const result = await client.uploadImageFile(Buffer.from('fake'), 'img1.jpg', 'image/jpeg');

  assert.deepEqual(result, { url: 'https://cdn.example/img1.jpg' });
  assert.equal(fetchImpl.calls.length, 3);
});

test('uploadImageFile polls until the file becomes ready when not immediately resolved', async () => {
  const fetchImpl = fakeFetch([
    { status: 200, body: { data: { stagedUploadsCreate: { stagedTargets: [{ url: 'https://upload.example/target', resourceUrl: 'https://upload.example/resource', parameters: [] }], userErrors: [] } } } },
    { status: 200, body: {} },
    { status: 200, body: { data: { fileCreate: { files: [{ id: 'gid://shopify/MediaImage/2', fileStatus: 'UPLOADED' }] }, userErrors: [] } } },
    { status: 200, body: { data: { node: { fileStatus: 'READY', image: { url: 'https://cdn.example/img2.jpg' } } } } },
  ]);
  const client = createShopifyClient('acme.myshopify.com', 'shpat_test', { fetchImpl, delayMs: 0, pollIntervalMs: 0 });

  const result = await client.uploadImageFile(Buffer.from('fake'), 'img2.jpg', 'image/jpeg');

  assert.deepEqual(result, { url: 'https://cdn.example/img2.jpg' });
  assert.equal(fetchImpl.calls.length, 4);
});
```

Note: `graphqlRequest` in `server/shopify.js` returns `json.data` (it throws if `json.errors` is present) — the test bodies above already nest their payload under `"data"` to match this, exactly like the existing `stagedUploadsCreate`/`fileCreate` calls inside `uploadLogoFile` do.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `uploadImageFile` does not exist on the client, and `pollIntervalMs` option is not read.

- [ ] **Step 3: Refactor `uploadLogoFile` into a shared helper and add `uploadImageFile`**

In `server/shopify.js`, find the existing `uploadLogoFile` function (the one using `stagedUploadsCreate`/`fileCreate`) and replace it entirely with:

```js
  async function stageAndCreateFile(buffer, filename, mimeType) {
    const stagedData = await graphqlRequest(
      `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets { url resourceUrl parameters { name value } }
          userErrors { field message }
        }
      }`,
      {
        input: [{
          filename,
          mimeType,
          httpMethod: 'POST',
          resource: 'FILE',
          fileSize: String(buffer.length),
        }],
      },
    );

    const errors = stagedData.stagedUploadsCreate.userErrors;
    if (errors.length) throw new Error(`stagedUploadsCreate failed: ${JSON.stringify(errors)}`);

    const target = stagedData.stagedUploadsCreate.stagedTargets[0];
    const form = new FormData();
    for (const { name, value } of target.parameters) form.append(name, value);
    form.append('file', new Blob([buffer], { type: mimeType }), filename);

    const uploadRes = await fetchImpl(target.url, { method: 'POST', body: form });
    if (!uploadRes.ok) throw new Error(`File upload to staged URL failed: ${uploadRes.status}`);

    const fileData = await graphqlRequest(
      `mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files { id fileStatus ... on MediaImage { image { url } } }
          userErrors { field message }
        }
      }`,
      { files: [{ originalSource: target.resourceUrl, contentType: 'IMAGE', filename }] },
    );

    const fileErrors = fileData.fileCreate.userErrors;
    if (fileErrors.length) throw new Error(`fileCreate failed: ${JSON.stringify(fileErrors)}`);

    return fileData.fileCreate.files[0];
  }

  async function uploadLogoFile(buffer, filename, mimeType) {
    await stageAndCreateFile(buffer, filename, mimeType);
    return { filename };
  }

  async function pollForFileUrl(fileId) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await sleep(pollIntervalMs);
      const data = await graphqlRequest(
        `query($id: ID!) { node(id: $id) { ... on MediaImage { fileStatus image { url } } } }`,
        { id: fileId },
      );
      if (data.node && data.node.image && data.node.image.url) return data.node.image.url;
    }
    throw new Error(`Image file ${fileId} did not become ready in time`);
  }

  async function uploadImageFile(buffer, filename, mimeType) {
    const created = await stageAndCreateFile(buffer, filename, mimeType);
    if (created.image && created.image.url) return { url: created.image.url };
    const url = await pollForFileUrl(created.id);
    return { url };
  }
```

Near the top of `createShopifyClient`, alongside the existing `const delayMs = ...` line, add:

```js
  const pollIntervalMs = opts.pollIntervalMs === undefined ? 1000 : opts.pollIntervalMs;
```

Update the returned object to include `uploadImageFile`:

```js
  return {
    testConnection,
    createUnpublishedTheme,
    getThemeAsset,
    putThemeAsset,
    publishTheme,
    uploadLogoFile,
    uploadImageFile,
    createProduct,
    createCollection,
    addProductToCollection,
    createPage,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all shopify.test.js tests pass, including the two new ones, and the existing `uploadLogoFile`-related behavior is unchanged (same staged-upload flow, just now returning `{filename}` from the shared helper's result).

- [ ] **Step 5: Commit**

```bash
git add server/shopify.js server/shopify.test.js
git commit -m "Add generic image file upload with ready-polling to Shopify client"
```

---

## Task 4: Product Profile (AI Vision Analysis)

**Files:**
- Create: `server/product-profile.js`
- Test: `server/product-profile.test.js`

**Interfaces:**
- Consumes: `CATEGORY_KEYS` from `server/categories.js` (Task 2); an injected OpenAI SDK client.
- Produces: `createProductProfileClient(openaiClient) -> { analyzeProduct }` where
  `analyzeProduct({ productName, whatItDoes, basicInfo, photoBase64, photoMimeType }) -> Promise<{ category, colorPalette, material, form, keyFeatures: string[], useCase }>`.
  `category` is always coerced to one of `CATEGORY_KEYS` (falls back to `'diger'` if the model returns anything else). Task 8 (studio job runner) calls this.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `server/product-profile.js` does not exist.

- [ ] **Step 3: Implement `server/product-profile.js`**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/product-profile.js server/product-profile.test.js
git commit -m "Add AI vision-based product profile analysis"
```

---

## Task 5: Sales Images (AI Image Generation)

**Files:**
- Create: `server/sales-images.js`
- Test: `server/sales-images.test.js`

**Interfaces:**
- Consumes: `getSceneBriefs` from `server/categories.js` (Task 2); an injected OpenAI SDK client (its `.images.generate` method).
- Produces: `createSalesImagesClient(openaiClient) -> { generateSalesImages }` where
  `generateSalesImages({ productProfile, productName }) -> Promise<[{ slot, key, base64 }]>` — always 8 items, one per scene slot, in fixed order. Task 8 (studio job runner) calls this.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `server/sales-images.js` does not exist.

- [ ] **Step 3: Implement `server/sales-images.js`**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/sales-images.js server/sales-images.test.js
git commit -m "Add AI sales image generation across the fixed 8-scene sequence"
```

---

## Task 6: Sales Copy (AI Section Copy + Compliance-Safe Reviews)

**Files:**
- Create: `server/sales-copy.js`
- Test: `server/sales-copy.test.js`

**Interfaces:**
- Consumes: an injected OpenAI SDK client.
- Produces: `createSalesCopyClient(openaiClient) -> { writeSalesNarrative }` where
  `writeSalesNarrative({ productName, productProfile }) -> Promise<Narrative>`, and `Narrative` is:
  ```js
  {
    hero: { title, body }, benefits: { title, body }, problem_solution: { title, body },
    comparison: { title, body }, usage: { title, body }, authority: { title, body },
    social_proof: { title, body }, final_cta: { title, body, ctaLabel },
    reviews: [{ name, text }],
  }
  ```
  Task 7 (`sales-page.js`) consumes this exact shape.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `server/sales-copy.js` does not exist.

- [ ] **Step 3: Implement `server/sales-copy.js`**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/sales-copy.js server/sales-copy.test.js
git commit -m "Add AI sales copy generation with compliance-safe review guidance"
```

---

## Task 7: Sales Page Assembly

**Files:**
- Create: `server/sales-page.js`
- Test: `server/sales-page.test.js`

**Interfaces:**
- Consumes: `Narrative` shape from Task 6; `[{ key, url }]` image list (a subset of the 8 keys — some may be missing if upload failed).
- Produces: `buildSalesPageHtml({ images, narrative }) -> string` (pure). Task 8 (studio job runner) calls this and passes the result as the product's `body_html`.

- [ ] **Step 1: Write the failing test**

```js
// server/sales-page.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSalesPageHtml, SECTION_ORDER } = require('./sales-page.js');

const NARRATIVE = {
  hero: { title: 'H', body: '<p>hb</p>' },
  benefits: { title: 'B', body: 'bb' },
  problem_solution: { title: 'P', body: 'pb' },
  comparison: { title: 'C', body: 'cb' },
  usage: { title: 'U', body: 'ub' },
  authority: { title: 'A', body: 'ab' },
  social_proof: { title: 'S', body: 'sb' },
  final_cta: { title: 'F', body: 'fb', ctaLabel: 'Buy Now' },
  reviews: [{ name: 'Mehmet Y.', text: 'Loved it' }],
};

test('SECTION_ORDER matches the fixed 8-slot sequence', () => {
  assert.deepEqual(SECTION_ORDER, [
    'hero', 'benefits', 'problem_solution', 'comparison', 'usage', 'authority', 'social_proof', 'final_cta',
  ]);
});

test('renders sections in fixed order, images only where available, reviews after everything else', () => {
  const images = [{ key: 'hero', url: 'https://cdn/hero.jpg' }, { key: 'benefits', url: 'https://cdn/benefits.jpg' }];
  const html = buildSalesPageHtml({ images, narrative: NARRATIVE });

  const heroImgIdx = html.indexOf('hero.jpg');
  const benefitsImgIdx = html.indexOf('benefits.jpg');
  const finalCtaIdx = html.indexOf('Buy Now');
  const reviewIdx = html.indexOf('Loved it');

  assert.ok(heroImgIdx < benefitsImgIdx);
  assert.ok(benefitsImgIdx < finalCtaIdx);
  assert.ok(finalCtaIdx < reviewIdx);
  assert.ok(!html.includes('problem_solution.jpg'));
});

test('omits the image tag for a section with no uploaded image', () => {
  const html = buildSalesPageHtml({ images: [], narrative: NARRATIVE });
  assert.ok(!html.includes('<img'));
  assert.match(html, /<h2>H<\/h2>/);
});

test('escapes HTML in titles and review names but leaves body HTML intact', () => {
  const narrative = { ...NARRATIVE, hero: { title: '<script>x</script>', body: '<p>safe</p>' }, reviews: [{ name: '<b>X</b>', text: 'ok' }] };
  const html = buildSalesPageHtml({ images: [], narrative });

  assert.ok(!html.includes('<script>x</script>'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<p>safe<\/p>/);
  assert.ok(!html.includes('<b>X</b>'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `server/sales-page.js` does not exist.

- [ ] **Step 3: Implement `server/sales-page.js`**

```js
// server/sales-page.js
const SECTION_ORDER = [
  'hero', 'benefits', 'problem_solution', 'comparison', 'usage', 'authority', 'social_proof', 'final_cta',
];

function buildSalesPageHtml({ images, narrative }) {
  const imageUrlByKey = new Map(images.map((img) => [img.key, img.url]));
  const parts = [];

  for (const key of SECTION_ORDER) {
    const section = narrative[key];
    const imageUrl = imageUrlByKey.get(key);

    parts.push('<div class="ai-sales-section">');
    if (imageUrl) parts.push(`<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(section.title)}">`);
    parts.push(`<h2>${escapeHtml(section.title)}</h2>`);
    parts.push(section.body);
    if (key === 'final_cta' && section.ctaLabel) {
      parts.push(`<p><a href="#" class="ai-sales-cta-button">${escapeHtml(section.ctaLabel)}</a></p>`);
    }
    parts.push('</div>');
  }

  if (Array.isArray(narrative.reviews) && narrative.reviews.length) {
    parts.push('<div class="ai-sales-reviews">');
    parts.push('<h2>Müşteri Yorumları</h2>');
    for (const review of narrative.reviews) {
      parts.push(`<blockquote><p>${escapeHtml(review.text)}</p><cite>${escapeHtml(review.name)}</cite></blockquote>`);
    }
    parts.push('</div>');
  }

  return parts.join('\n');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { buildSalesPageHtml, SECTION_ORDER };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/sales-page.js server/sales-page.test.js
git commit -m "Add pure sales-page body_html assembly in fixed section order"
```

---

## Task 8: Studio Job Runner (Orchestration)

**Files:**
- Create: `server/studio-job-runner.js`
- Test: `server/studio-job-runner.test.js`

**Interfaces:**
- Consumes: `classifyThemeFiles`/`uploadThemeFiles` (base plan Task 6), `patchSettingsData`/`patchHeroSection`/`patchWhatsappPhone` (Task 1 + base plan Task 3), `ShopifyClient` (base plan Task 5 + this plan's Task 3), `AiClient.inferBrandVoice`/`writeHeroCopy` (base plan Task 7), `createProductProfileClient` (Task 4), `createSalesImagesClient` (Task 5), `createSalesCopyClient` (Task 6), `buildSalesPageHtml` (Task 7).
- Produces: `runCreateStudioProductJob(input, emit) -> Promise<Summary>` where
  - `input = { shopifyClient, aiClient, productProfileClient, salesImagesClient, salesCopyClient, themeTemplateDir, storeName, primaryColorHex, logoBuffer, logoFilename, logoMimeType, productName, whatItDoes, basicInfo, whatsappPhone, photoBuffer, photoBase64, photoMimeType }`
  - `Summary = { themeId, productId, productHandle, category, imagesGenerated, imagesUploaded, published }`
  Task 9 (Express route) calls this and forwards `emit` events to the SSE stream — same pattern as the base plan's `/api/create-store` route.

- [ ] **Step 1: Write the failing test**

```js
// server/studio-job-runner.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runCreateStudioProductJob } = require('./studio-job-runner.js');

function makeFakeShopifyClient() {
  return {
    createUnpublishedTheme: async () => ({ id: 999 }),
    getThemeAsset: async () => JSON.stringify({ current: {} }),
    putThemeAsset: async () => {},
    publishTheme: async () => {},
    uploadLogoFile: async (buf, filename) => ({ filename }),
    uploadImageFile: async (buf, filename) => ({ url: `https://cdn.example/${filename}` }),
    createProduct: async () => ({ id: 1, handle: 'magic-bottle' }),
  };
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `server/studio-job-runner.js` does not exist.

- [ ] **Step 3: Implement `server/studio-job-runner.js`**

```js
// server/studio-job-runner.js
const { classifyThemeFiles, uploadThemeFiles } = require('./theme-upload.js');
const { patchSettingsData, patchHeroSection, patchWhatsappPhone } = require('./theme-content.js');
const { buildSalesPageHtml } = require('./sales-page.js');

async function runCreateStudioProductJob(input, emit) {
  const {
    shopifyClient, aiClient, productProfileClient, salesImagesClient, salesCopyClient,
    themeTemplateDir, storeName, primaryColorHex, logoBuffer, logoFilename, logoMimeType,
    productName, whatItDoes, basicInfo, whatsappPhone,
    photoBuffer, photoBase64, photoMimeType,
  } = input;

  emit({ step: 'theme_upload', status: 'start', message: 'Tema yükleniyor...' });
  const { id: themeId } = await shopifyClient.createUnpublishedTheme(`${storeName} (site-bot studio)`);
  const files = classifyThemeFiles(themeTemplateDir);
  const uploadResult = await uploadThemeFiles(shopifyClient, themeId, files);
  emit({ step: 'theme_upload', status: 'ok', message: `Tema yüklendi: ${uploadResult.uploaded}/${files.length} dosya (${uploadResult.failed.length} hata)` });

  emit({ step: 'brand', status: 'start', message: 'Marka ve WhatsApp ayarlanıyor...' });
  const { filename: uploadedLogoFilename } = await shopifyClient.uploadLogoFile(logoBuffer, logoFilename, logoMimeType);
  const settingsDataRaw = await shopifyClient.getThemeAsset(themeId, 'config/settings_data.json');
  const withBrand = patchSettingsData(settingsDataRaw, { primaryColorHex, logoFilename: uploadedLogoFilename });
  const withWhatsapp = patchWhatsappPhone(withBrand, whatsappPhone);
  await shopifyClient.putThemeAsset(themeId, 'config/settings_data.json', { value: withWhatsapp });
  emit({ step: 'brand', status: 'ok', message: 'Logo, renk ve WhatsApp numarası uygulandı.' });

  emit({ step: 'hero', status: 'start', message: 'Hero metni yazılıyor...' });
  const { tone: brandVoice } = await aiClient.inferBrandVoice({ storeName, sampleProductTitles: [productName] });
  const hero = await aiClient.writeHeroCopy({ storeName, brandVoice });
  const indexJsonRaw = await shopifyClient.getThemeAsset(themeId, 'templates/index.json');
  const patchedIndex = patchHeroSection(indexJsonRaw, hero);
  await shopifyClient.putThemeAsset(themeId, 'templates/index.json', { value: patchedIndex });
  emit({ step: 'hero', status: 'ok', message: 'Hero metni uygulandı.' });

  emit({ step: 'profile', status: 'start', message: 'Ürün fotoğrafı ve bilgisi analiz ediliyor...' });
  const productProfile = await productProfileClient.analyzeProduct({ productName, whatItDoes, basicInfo, photoBase64, photoMimeType });
  emit({ step: 'profile', status: 'ok', message: `Kategori: ${productProfile.category}` });

  emit({ step: 'images', status: 'start', message: '8 satış görseli üretiliyor...' });
  const generatedImages = await salesImagesClient.generateSalesImages({ productProfile, productName });
  emit({ step: 'images', status: 'ok', message: `${generatedImages.length} görsel üretildi.` });

  emit({ step: 'copy', status: 'start', message: 'Satış metinleri yazılıyor...' });
  const narrative = await salesCopyClient.writeSalesNarrative({ productName, productProfile });
  emit({ step: 'copy', status: 'ok', message: 'Metinler hazır.' });

  emit({ step: 'image_upload', status: 'start', message: 'Görseller mağazaya yükleniyor...' });
  const uploadedImages = [];
  const slug = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'product';
  for (const image of generatedImages) {
    try {
      const { url } = await shopifyClient.uploadImageFile(Buffer.from(image.base64, 'base64'), `${slug}-${image.key}.jpg`, 'image/jpeg');
      uploadedImages.push({ key: image.key, url });
    } catch (err) {
      emit({ step: 'image_upload', status: 'error', message: `${image.key}: ${err.message}` });
    }
  }
  emit({ step: 'image_upload', status: 'ok', message: `${uploadedImages.length}/${generatedImages.length} görsel yüklendi.` });

  const bodyHtml = buildSalesPageHtml({ images: uploadedImages, narrative });

  emit({ step: 'product', status: 'start', message: 'Ürün oluşturuluyor...' });
  const product = await shopifyClient.createProduct({
    title: productName,
    body_html: bodyHtml,
    images: [{ attachment: photoBase64 }],
  });
  emit({ step: 'product', status: 'ok', message: `Ürün oluşturuldu: ${product.handle}` });

  emit({ step: 'publish', status: 'start', message: 'Tema yayınlanıyor...' });
  await shopifyClient.publishTheme(themeId);
  emit({ step: 'publish', status: 'ok', message: 'Tema yayınlandı.' });

  const summary = {
    themeId,
    productId: product.id,
    productHandle: product.handle,
    category: productProfile.category,
    imagesGenerated: generatedImages.length,
    imagesUploaded: uploadedImages.length,
    published: true,
  };
  emit({ step: 'done', status: 'ok', message: 'Ürün sayfası hazır.', summary, images: uploadedImages });
  return summary;
}

module.exports = { runCreateStudioProductJob };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/studio-job-runner.js server/studio-job-runner.test.js
git commit -m "Add studio job runner orchestrating theme, profile, images, copy, and publish"
```

---

## Task 9: Studio Route

**Files:**
- Modify: `server/index.js`
- Test: `server/studio-routes.test.js`

**Interfaces:**
- Consumes: `runCreateStudioProductJob` (Task 8), `createProductProfileClient` (Task 4), `createSalesImagesClient` (Task 5), `createSalesCopyClient` (Task 6), the existing `jobStore`/`createShopifyClient`/`createAiClient` already wired in `createApp` (base plan Task 9).
- Produces: `POST /api/studio/create-product` — multipart form fields `shopDomain, accessToken, storeName, primaryColorHex, productName, whatItDoes, basicInfo, whatsappPhone` + files `logo, photo` → `{ jobId }`. Reuses the existing `GET /api/progress/:jobId` SSE route unchanged. Task 10 (frontend) calls this route.

- [ ] **Step 1: Write the failing test**

```js
// server/studio-routes.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('./index.js');

function startTestServer(deps) {
  const app = createApp(deps);
  const server = app.listen(0);
  return once(server, 'listening').then(() => ({
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  }));
}

test('POST /api/studio/create-product starts a job and streams progress to done', async () => {
  const deps = {
    createShopifyClient: () => ({}),
    createAiClient: () => ({}),
    createOpenAiClient: () => ({}),
    createProductProfileClient: () => ({}),
    createSalesImagesClient: () => ({}),
    createSalesCopyClient: () => ({}),
    runCreateStudioProductJob: async (input, emit) => {
      emit({ step: 'theme_upload', status: 'ok', message: 'done uploading' });
      emit({ step: 'done', status: 'ok', message: 'ready' });
      return { themeId: 1, productId: 1, productHandle: 'x', category: 'genel_urun', imagesGenerated: 8, imagesUploaded: 8, published: true };
    },
  };
  const { server, baseUrl } = await startTestServer(deps);

  const form = new FormData();
  form.append('shopDomain', 'acme.myshopify.com');
  form.append('accessToken', 'shpat_x');
  form.append('storeName', 'Acme');
  form.append('primaryColorHex', '#112233');
  form.append('productName', 'Magic Bottle');
  form.append('whatItDoes', 'keeps water cold');
  form.append('basicInfo', 'BPA-free');
  form.append('whatsappPhone', '+905551234567');
  form.append('logo', new Blob([Buffer.from('fake')], { type: 'image/png' }), 'logo.png');
  form.append('photo', new Blob([Buffer.from('photo')], { type: 'image/jpeg' }), 'photo.jpg');

  const createRes = await fetch(`${baseUrl}/api/studio/create-product`, { method: 'POST', body: form });
  const { jobId } = await createRes.json();
  assert.ok(jobId);

  const progressRes = await fetch(`${baseUrl}/api/progress/${jobId}`);
  const text = await progressRes.text();

  assert.match(text, /theme_upload/);
  assert.match(text, /"step":"done"/);
  server.close();
});

test('POST /api/studio/create-product rejects a request missing required fields', async () => {
  const { server, baseUrl } = await startTestServer({});

  const form = new FormData();
  form.append('shopDomain', 'acme.myshopify.com');
  // missing everything else

  const res = await fetch(`${baseUrl}/api/studio/create-product`, { method: 'POST', body: form });
  assert.equal(res.status, 400);
  server.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `/api/studio/create-product` does not exist.

- [ ] **Step 3: Add the route to `server/index.js`**

Update the destructured `deps` at the top of `createApp` to include the new factories (the base plan's Task 9 already added `createOpenAiClient` to this same block — keep it, just add the four new entries below it):

```js
  const {
    createShopifyClient = require('./shopify.js').createShopifyClient,
    createAiClient = require('./ai.js').createAiClient,
    runCreateStoreJob = require('./job-runner.js').runCreateStoreJob,
    createOpenAiClient = () => new (require('openai'))(),
    createProductProfileClient = require('./product-profile.js').createProductProfileClient,
    createSalesImagesClient = require('./sales-images.js').createSalesImagesClient,
    createSalesCopyClient = require('./sales-copy.js').createSalesCopyClient,
    runCreateStudioProductJob = require('./studio-job-runner.js').runCreateStudioProductJob,
  } = deps;
```

Add this route (after the existing `/api/create-store` route, before `/api/progress/:jobId`):

```js
  app.post('/api/studio/create-product', upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'photo', maxCount: 1 }]), (req, res) => {
    const {
      shopDomain, accessToken, storeName, primaryColorHex,
      productName, whatItDoes, basicInfo, whatsappPhone,
    } = req.body;
    const logoFile = req.files.logo && req.files.logo[0];
    const photoFile = req.files.photo && req.files.photo[0];

    if (!shopDomain || !accessToken || !storeName || !primaryColorHex || !productName || !whatItDoes || !whatsappPhone || !logoFile || !photoFile) {
      return res.status(400).json({ error: 'Eksik alan var.' });
    }

    const shopifyClient = createShopifyClient(shopDomain, accessToken);
    const openaiClient = createOpenAiClient();
    const aiClient = createAiClient(openaiClient);
    const productProfileClient = createProductProfileClient(openaiClient);
    const salesImagesClient = createSalesImagesClient(openaiClient);
    const salesCopyClient = createSalesCopyClient(openaiClient);
    const themeTemplateDir = path.join(__dirname, 'theme-template');

    const jobId = jobStore.startJob((emit) => runCreateStudioProductJob({
      shopifyClient, aiClient, productProfileClient, salesImagesClient, salesCopyClient,
      themeTemplateDir,
      storeName, primaryColorHex,
      logoBuffer: logoFile.buffer,
      logoFilename: `${shopDomain.replace(/[^a-z0-9]/gi, '-')}-logo${path.extname(logoFile.originalname) || '.png'}`,
      logoMimeType: logoFile.mimetype,
      productName, whatItDoes, basicInfo: basicInfo || '',
      whatsappPhone,
      photoBuffer: photoFile.buffer,
      photoBase64: photoFile.buffer.toString('base64'),
      photoMimeType: photoFile.mimetype,
    }, emit));

    res.json({ jobId });
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all tests pass, including the two new studio route tests, and every existing test still passes (the CSV-mode `/api/create-store` route is untouched).

- [ ] **Step 5: Commit**

```bash
git add server/index.js server/studio-routes.test.js
git commit -m "Add studio create-product route reusing the existing SSE progress stream"
```

---

## Task 10: Frontend — Studio Tab

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`

**Interfaces:**
- Consumes: `POST /api/studio/create-product`, `GET /api/progress/:jobId` (Task 9).
- Produces: nothing consumed by later tasks. Manually tested in a browser.

- [ ] **Step 1: Add a tab switcher and the studio form to `public/index.html`**

After the existing `<h1>Shopify Site Bot</h1>` line, add a tab switcher, and wrap the existing CSV-mode fieldsets (`storeFields` and everything below it) so they only show under the "CSV" tab. Insert the studio form as a sibling panel. The resulting relevant section of the file should read:

```html
  <h1>Shopify Site Bot</h1>

  <div class="tabs">
    <button id="tabCsvBtn" class="tab-btn active">Toplu Katalog (CSV)</button>
    <button id="tabStudioBtn" class="tab-btn">Tek Ürün AI Stüdyosu</button>
  </div>

  <fieldset>
    <legend>1. Mağazaya bağlan</legend>
    <label for="shopDomain">Mağaza domaini (örn. dryvex2.myshopify.com)</label>
    <input id="shopDomain" type="text" placeholder="magaza.myshopify.com">
    <label for="accessToken">Admin API access token</label>
    <input id="accessToken" type="password" placeholder="shpat_...">
    <button id="connectBtn">Bağlan</button>
    <div id="connectStatus"></div>
  </fieldset>

  <div id="csvPanel">
    <fieldset id="storeFields">
      <legend>2. Mağaza bilgileri (CSV toplu mod)</legend>
      <label for="storeName">Mağaza adı</label>
      <input id="storeName" type="text">
      <label for="primaryColorHex">Ana renk</label>
      <input id="primaryColorHex" type="color" value="#dd1d1d">
      <label for="logo">Logo</label>
      <input id="logo" type="file" accept="image/*">
      <label for="productsCsv">Ürün CSV</label>
      <input id="productsCsv" type="file" accept=".csv">
      <button id="createBtn">Mağazayı Oluştur</button>
    </fieldset>
  </div>

  <div id="studioPanel" style="display:none">
    <fieldset id="studioFields">
      <legend>2. Ürün ve mağaza bilgileri (AI Stüdyosu)</legend>
      <label for="studioStoreName">Mağaza adı</label>
      <input id="studioStoreName" type="text">
      <label for="studioPrimaryColorHex">Ana renk</label>
      <input id="studioPrimaryColorHex" type="color" value="#dd1d1d">
      <label for="studioLogo">Logo</label>
      <input id="studioLogo" type="file" accept="image/*">
      <label for="productName">Ürün adı</label>
      <input id="productName" type="text">
      <label for="productPhoto">Ürün fotoğrafı</label>
      <input id="productPhoto" type="file" accept="image/*">
      <label for="whatItDoes">Ne işe yarıyor</label>
      <input id="whatItDoes" type="text">
      <label for="basicInfo">Temel bilgiler (opsiyonel)</label>
      <input id="basicInfo" type="text">
      <label for="whatsappPhone">WhatsApp telefon numarası</label>
      <input id="whatsappPhone" type="text" placeholder="+905551234567">
      <button id="studioCreateBtn">AI ile Oluştur</button>
    </fieldset>
    <div id="studioResults"></div>
  </div>

  <div id="log"></div>

  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Add tab-switching and studio-panel styles**

In the existing `<style>` block, add:

```css
    .tabs { margin-bottom: 16px; }
    .tab-btn { padding: 8px 16px; margin-right: 8px; cursor: pointer; }
    .tab-btn.active { font-weight: 700; border-bottom: 2px solid #111; }
    #studioResults img { max-width: 160px; margin: 4px; }
```

- [ ] **Step 3: Add tab-switching and the studio submit flow to `public/app.js`**

Append to the end of `public/app.js`:

```js
const tabCsvBtn = document.getElementById('tabCsvBtn');
const tabStudioBtn = document.getElementById('tabStudioBtn');
const csvPanel = document.getElementById('csvPanel');
const studioPanel = document.getElementById('studioPanel');

tabCsvBtn.addEventListener('click', () => {
  tabCsvBtn.classList.add('active');
  tabStudioBtn.classList.remove('active');
  csvPanel.style.display = 'block';
  studioPanel.style.display = 'none';
});

tabStudioBtn.addEventListener('click', () => {
  tabStudioBtn.classList.add('active');
  tabCsvBtn.classList.remove('active');
  studioPanel.style.display = 'block';
  csvPanel.style.display = 'none';
});

document.getElementById('studioCreateBtn').addEventListener('click', async () => {
  const form = new FormData();
  form.append('shopDomain', document.getElementById('shopDomain').value.trim());
  form.append('accessToken', document.getElementById('accessToken').value.trim());
  form.append('storeName', document.getElementById('studioStoreName').value.trim());
  form.append('primaryColorHex', document.getElementById('studioPrimaryColorHex').value);
  form.append('logo', document.getElementById('studioLogo').files[0]);
  form.append('productName', document.getElementById('productName').value.trim());
  form.append('photo', document.getElementById('productPhoto').files[0]);
  form.append('whatItDoes', document.getElementById('whatItDoes').value.trim());
  form.append('basicInfo', document.getElementById('basicInfo').value.trim());
  form.append('whatsappPhone', document.getElementById('whatsappPhone').value.trim());

  logEl.textContent = '';
  document.getElementById('studioResults').innerHTML = '';
  appendLog('AI Stüdyosu başlatılıyor...');

  const res = await fetch('/api/studio/create-product', { method: 'POST', body: form });
  const { jobId, error } = await res.json();
  if (error) {
    appendLog(`✗ ${error}`);
    return;
  }

  const source = new EventSource(`/api/progress/${jobId}`);
  source.onmessage = (msg) => {
    const event = JSON.parse(msg.data);
    const icon = event.status === 'error' ? '✗' : event.status === 'ok' ? '✓' : '…';
    appendLog(`${icon} [${event.step}] ${event.message}`);
    if (event.step === 'done') {
      source.close();
      renderStudioResults(event);
    }
  };
});

function renderStudioResults(doneEvent) {
  const container = document.getElementById('studioResults');
  if (Array.isArray(doneEvent.images)) {
    for (const image of doneEvent.images) {
      const link = document.createElement('a');
      link.href = image.url;
      link.target = '_blank';
      link.rel = 'noopener';
      const img = document.createElement('img');
      img.src = image.url;
      img.alt = image.key;
      link.appendChild(img);
      container.appendChild(link);
    }
  }
}
```

- [ ] **Step 4: Manual verification (no automated test — this is UI)**

Run: `npm start`, open `http://localhost:3000` in a browser.
Expected: the tab switcher toggles between the CSV panel and the studio panel; the studio form's fields are all present. Full exercise requires a real Shopify store and OpenAI key (see README checklist).

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/app.js
git commit -m "Add Single-Product AI Studio tab to the frontend"
```

---

## Task 11: README Update

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing. Produces: nothing (terminal task).

- [ ] **Step 1: Add a Studio section to `README.md`**

After the existing "## Using it" section, add:

```markdown
## Tek Ürün AI Stüdyosu (Single-Product AI Studio)

A second mode for building a single-product sales page: enter a product
name, photo, what it does, and a WhatsApp number. The tool installs its
own copy of the theme (with a floating WhatsApp button), then uses AI to:

1. Classify the product into one of 7 fixed categories from the photo + text
2. Generate 8 marketing images in a fixed sequence (hero, benefits,
   problem/solution, comparison, usage, authority, social proof, final
   CTA), styled per category
3. Write matching sales copy for each section, plus a short reviews block
4. Assemble it all into the product's description and publish

**Images are AI-generated from scratch, not edited from your photo** —
review each one (the results page links to every generated image) before
relying on the page for real sales traffic.

**Reviews are AI-drafted, not real.** They deliberately avoid dates,
full surnames, or verified-purchase claims, but they are still
fabricated. Replace them with real customer feedback as it comes in —
publishing fabricated reviews as genuine, verified testimonials can
violate consumer protection rules in many jurisdictions.
```

Add to the "Known limitations" section:

```markdown
- The studio installs its own theme copy per run — running it twice for
  the same store creates two theme installs (the second becomes the
  live one). This is intentional (no shared-state assumptions between
  runs) but means old unpublished theme installs accumulate in
  Online Store → Themes; delete old ones manually if that bothers you.
```

Add to the manual end-to-end checklist:

```markdown
- [ ] (Studio mode) All 8 generated images are visible on the product
      page in the correct fixed order
- [ ] (Studio mode) The WhatsApp button appears on the storefront and
      links to the correct number
- [ ] (Studio mode) The reviews block at the bottom reads as draft
      copy you'd still want to replace, not as real customer reviews
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Document the Single-Product AI Studio mode in the README"
```
