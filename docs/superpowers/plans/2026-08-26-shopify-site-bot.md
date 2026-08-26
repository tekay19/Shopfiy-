# Shopify Site Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web app that, given an already-created Shopify store and an Admin API token, pushes the bundled "Shopfinity" theme, brands it (logo/color/hero copy), and populates it with AI-rewritten products/collections/pages from the owner's product CSV — repeatable for any number of stores, one run at a time.

**Architecture:** Node.js + Express server with a static HTML/JS form UI. No database or persistence beyond the bundled theme template and a `.env`-held OpenAI key; each run is a single in-memory job that streams progress to the browser over SSE. Shopify Admin REST API is used for theme assets, products, collections, and pages; Shopify Admin GraphQL API is used only for the one thing REST can't do — uploading the logo into the shop's file library (`stagedUploadsCreate` + `fileCreate`).

**Tech Stack:** Node.js >=18.17 (built-in `fetch`/`FormData`/`Blob`, built-in `node:test` runner — no test framework dependency), Express, Multer (multipart form uploads), `csv-parse` (Shopify product CSV parsing), `openai` (official SDK), `dotenv`.

**Spec:** `docs/superpowers/specs/2026-08-26-shopify-site-bot-design.md`

## Global Constraints

- Store account creation and Shopify signup/verification are out of scope — never automate them.
- The Admin API access token is entered per run in the form and is never written to disk.
- One store per run — no batch/queue processing.
- Products come only from the owner-supplied CSV — no scraping or supplier integration.
- A single failed product/collection/page must not abort the run — log it and continue.
- Shopify Admin API version used throughout: `2024-10`.
- The bundled theme in `server/theme-template/` is the fixed source for every run — it is not user-uploadable.

---

## Task 1: Project Scaffolding + Bundled Theme Template

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `server/index.js`
- Create: `public/index.html`
- Create: `server/theme-template/` (populated from the provided theme export)
- Test: `server/health.test.js`

**Interfaces:**
- Produces: an Express app importable indirectly by starting `node server/index.js`; a `GET /health` route returning `{ status: 'ok' }`; static file serving of `public/` at `/`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "shopify-site-bot",
  "version": "1.0.0",
  "private": true,
  "description": "Local tool that installs the Shopfinity theme and AI-generated content into an existing Shopify store via the Admin API.",
  "main": "server/index.js",
  "engines": {
    "node": ">=18.17.0"
  },
  "scripts": {
    "start": "node server/index.js",
    "test": "node --test server"
  },
  "dependencies": {
    "csv-parse": "^5.5.6",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "multer": "^1.4.5-lts.1",
    "openai": "^4.55.0"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
.env
```

- [ ] **Step 3: Create `.env.example`**

```
OPENAI_API_KEY=sk-...
PORT=3000
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` written, no errors.

- [ ] **Step 5: Bundle the theme template**

Unzip the provided theme export into `server/theme-template/` so its contents (`assets/`, `blocks/`, `config/`, `layout/`, `locales/`, `sections/`, `snippets/`, `templates/`) sit directly under that directory — no nested extra folder.

Run (from the project root, adjust the source path if it differs on this machine):
```bash
mkdir -p server/theme-template
unzip -o "C:/Users/semih/Downloads/Telegram Desktop/theme_export__dryvex-co-shopfinity__18AUG2026-0237pm.zip" -d server/theme-template
```
Expected: `server/theme-template/config/settings_schema.json` and `server/theme-template/templates/index.json` both exist.

- [ ] **Step 6: Write the failing test for the health route**

```js
// server/health.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('./index.js');

test('GET /health returns ok status', async () => {
  const app = createApp();
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address();

  const res = await fetch(`http://127.0.0.1:${port}/health`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(body, { status: 'ok' });

  server.close();
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `server/index.js` does not export `createApp` yet (module not found or undefined export).

- [ ] **Step 8: Write minimal `server/index.js`**

```js
// server/index.js
const path = require('node:path');
const express = require('express');

function createApp() {
  const app = express();
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  return app;
}

function main() {
  require('dotenv').config();
  const app = createApp();
  const port = process.env.PORT || 3000;
  app.listen(port, '127.0.0.1', () => console.log(`shopify-site-bot listening on http://localhost:${port}`));
}

if (require.main === module) {
  main();
}

module.exports = { createApp };
```

- [ ] **Step 9: Create a minimal placeholder `public/index.html`**

```html
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Shopify Site Bot</title>
</head>
<body>
  <h1>Shopify Site Bot</h1>
  <p>Form geliyor (Task 9).</p>
</body>
</html>
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 1 test passed.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example server/index.js server/health.test.js public/index.html server/theme-template
git commit -m "Scaffold project, bundle theme template, add health route"
```

---

## Task 2: Product CSV Parser

**Files:**
- Create: `server/csv.js`
- Test: `server/csv.test.js`

**Interfaces:**
- Consumes: nothing (pure function over CSV text).
- Produces: `parseProductsCsv(csvText: string) -> Product[]`, where `Product` is:
  ```js
  {
    handle: string,
    title: string,
    bodyHtml: string,
    vendor: string,
    productType: string,
    tags: string[],
    seoTitle: string,
    seoDescription: string,
    images: string[],          // Image Src URLs, de-duplicated, in row order
    variants: [{
      sku: string,
      price: string,
      compareAtPrice: string,
      option1: string,
      option2: string,
      option3: string,
      inventoryQty: number,
    }],
  }
  ```
  Later tasks (product creation, collection grouping, AI rewriting) consume this exact shape.

- [ ] **Step 1: Write the failing test**

```js
// server/csv.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseProductsCsv } = require('./csv.js');

const SAMPLE_CSV = [
  'Handle,Title,Body (HTML),Vendor,Type,Tags,SEO Title,SEO Description,Option1 Name,Option1 Value,Variant SKU,Variant Price,Variant Compare At Price,Variant Inventory Qty,Image Src',
  'red-mug,Red Mug,<p>A mug.</p>,Acme,Mugs,"kitchen, gift",Red Mug SEO,Buy the red mug,Color,Red,MUG-RED,9.99,14.99,25,https://example.com/red-mug-1.jpg',
  'red-mug,,,,,,,,Color,Blue,MUG-BLUE,9.99,14.99,10,https://example.com/red-mug-2.jpg',
  'green-hat,Green Hat,<p>A hat.</p>,Acme,Hats,outdoor,,,,,HAT-GRN,19.99,,5,https://example.com/green-hat.jpg',
].join('\n');

test('groups variant rows under one product by handle', () => {
  const products = parseProductsCsv(SAMPLE_CSV);
  assert.equal(products.length, 2);

  const mug = products.find((p) => p.handle === 'red-mug');
  assert.equal(mug.title, 'Red Mug');
  assert.equal(mug.vendor, 'Acme');
  assert.equal(mug.productType, 'Mugs');
  assert.deepEqual(mug.tags, ['kitchen', 'gift']);
  assert.equal(mug.variants.length, 2);
  assert.equal(mug.variants[1].sku, 'MUG-BLUE');
  assert.equal(mug.variants[1].inventoryQty, 10);
  assert.deepEqual(mug.images, [
    'https://example.com/red-mug-1.jpg',
    'https://example.com/red-mug-2.jpg',
  ]);
});

test('handles a single-variant product', () => {
  const products = parseProductsCsv(SAMPLE_CSV);
  const hat = products.find((p) => p.handle === 'green-hat');
  assert.equal(hat.variants.length, 1);
  assert.equal(hat.variants[0].price, '19.99');
  assert.deepEqual(hat.tags, ['outdoor']);
});

test('returns an empty array for a header-only CSV', () => {
  const header = 'Handle,Title,Body (HTML),Vendor,Type,Tags,SEO Title,SEO Description,Option1 Name,Option1 Value,Variant SKU,Variant Price,Variant Compare At Price,Variant Inventory Qty,Image Src';
  assert.deepEqual(parseProductsCsv(header), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `server/csv.js` does not exist.

- [ ] **Step 3: Implement `server/csv.js`**

```js
// server/csv.js
const { parse } = require('csv-parse/sync');

function parseProductsCsv(csvText) {
  const rows = parse(csvText, { columns: true, skip_empty_lines: true });
  const productsByHandle = new Map();

  for (const row of rows) {
    const handle = row['Handle'];
    if (!handle) continue;

    if (!productsByHandle.has(handle)) {
      productsByHandle.set(handle, {
        handle,
        title: row['Title'] || '',
        bodyHtml: row['Body (HTML)'] || '',
        vendor: row['Vendor'] || '',
        productType: row['Type'] || '',
        tags: splitTags(row['Tags']),
        seoTitle: row['SEO Title'] || '',
        seoDescription: row['SEO Description'] || '',
        images: [],
        variants: [],
      });
    }

    const product = productsByHandle.get(handle);

    const imageSrc = row['Image Src'];
    if (imageSrc && !product.images.includes(imageSrc)) {
      product.images.push(imageSrc);
    }

    const hasVariantData = row['Variant SKU'] || row['Option1 Value'] || row['Variant Price'];
    if (hasVariantData) {
      product.variants.push({
        sku: row['Variant SKU'] || '',
        price: row['Variant Price'] || '',
        compareAtPrice: row['Variant Compare At Price'] || '',
        option1: row['Option1 Value'] || '',
        option2: row['Option2 Value'] || '',
        option3: row['Option3 Value'] || '',
        inventoryQty: row['Variant Inventory Qty'] ? Number(row['Variant Inventory Qty']) : 0,
      });
    }
  }

  return Array.from(productsByHandle.values());
}

function splitTags(tagsField) {
  if (!tagsField) return [];
  return tagsField.split(',').map((t) => t.trim()).filter(Boolean);
}

module.exports = { parseProductsCsv };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all csv.test.js tests pass, health test still passes.

- [ ] **Step 5: Commit**

```bash
git add server/csv.js server/csv.test.js package.json package-lock.json
git commit -m "Add Shopify product CSV parser"
```

---

## Task 3: Pure Theme-Content Patch Functions

**Files:**
- Create: `server/theme-content.js`
- Test: `server/theme-content.test.js`

**Interfaces:**
- Consumes: nothing (pure string/JSON transforms). These operate on the exact `config/settings_data.json` and `templates/index.json` shipped in `server/theme-template/` — the section/block IDs below (`slideshow_hero_dEdbwc`, `slide_PahNLV`) are literal IDs from that bundled file, verified against it; they are stable because the template itself is fixed and not user-editable.
- Produces:
  - `patchSettingsData(settingsDataJsonText: string, { primaryColorHex: string, logoFilename: string }) -> string`
  - `patchHeroSection(indexJsonText: string, { heading: string, text: string, buttonLabel: string }) -> string`
  Task 5 (Shopify client) uploads the original asset content, Task 8 (job runner) calls these two functions on that content before re-uploading.

- [ ] **Step 1: Write the failing test**

```js
// server/theme-content.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { patchSettingsData, patchHeroSection } = require('./theme-content.js');

test('patchSettingsData sets accent colors and logo reference', () => {
  const original = JSON.stringify({ current: { colors_accent_1: '#dd1d1d', colors_accent_2: '#dd1d1d' } });
  const patched = JSON.parse(patchSettingsData(original, {
    primaryColorHex: '#123456',
    logoFilename: 'acme-logo.png',
  }));

  assert.equal(patched.current.colors_accent_1, '#123456');
  assert.equal(patched.current.colors_accent_2, '#123456');
  assert.equal(patched.current.logo, 'shopify://shop_images/acme-logo.png');
});

test('patchHeroSection sets the bundled hero slide heading/text/button', () => {
  const themeDir = path.join(__dirname, 'theme-template');
  const original = fs.readFileSync(path.join(themeDir, 'templates', 'index.json'), 'utf8');

  const patched = JSON.parse(patchHeroSection(original, {
    heading: 'Acme Store',
    text: '<p>Handpicked gear for every trip.</p>',
    buttonLabel: 'Shop Now',
  }));

  const slide = patched.sections.slideshow_hero_dEdbwc.blocks.slide_PahNLV.settings;
  assert.equal(slide.heading, 'Acme Store');
  assert.equal(slide.text, '<p>Handpicked gear for every trip.</p>');
  assert.equal(slide.button_label_1, 'Shop Now');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `server/theme-content.js` does not exist.

- [ ] **Step 3: Implement `server/theme-content.js`**

```js
// server/theme-content.js
const HERO_SECTION_ID = 'slideshow_hero_dEdbwc';
const HERO_BLOCK_ID = 'slide_PahNLV';

function patchSettingsData(settingsDataJsonText, { primaryColorHex, logoFilename }) {
  const data = JSON.parse(settingsDataJsonText);
  data.current = data.current || {};
  data.current.colors_accent_1 = primaryColorHex;
  data.current.colors_accent_2 = primaryColorHex;
  data.current.logo = `shopify://shop_images/${logoFilename}`;
  return JSON.stringify(data, null, 2);
}

function patchHeroSection(indexJsonText, { heading, text, buttonLabel }) {
  const data = JSON.parse(indexJsonText);
  const settings = data.sections[HERO_SECTION_ID].blocks[HERO_BLOCK_ID].settings;
  settings.heading = heading;
  settings.text = text;
  settings.button_label_1 = buttonLabel;
  return JSON.stringify(data, null, 2);
}

module.exports = { patchSettingsData, patchHeroSection, HERO_SECTION_ID, HERO_BLOCK_ID };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/theme-content.js server/theme-content.test.js
git commit -m "Add pure theme settings/hero content patch functions"
```

---

## Task 4: Product Grouping into Collections

**Files:**
- Create: `server/collections.js`
- Test: `server/collections.test.js`

**Interfaces:**
- Consumes: `Product[]` shape from Task 2.
- Produces: `groupProductsIntoCollections(products: Product[]) -> [{ key: string, name: string, productHandles: string[] }]`. Task 8 (job runner) calls this after CSV parsing to decide what collections to create.

- [ ] **Step 1: Write the failing test**

```js
// server/collections.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { groupProductsIntoCollections } = require('./collections.js');

test('groups by productType when present', () => {
  const products = [
    { handle: 'a', productType: 'Mugs', tags: [] },
    { handle: 'b', productType: 'Mugs', tags: [] },
    { handle: 'c', productType: 'Hats', tags: [] },
  ];
  const groups = groupProductsIntoCollections(products);
  assert.equal(groups.length, 2);
  const mugs = groups.find((g) => g.name === 'Mugs');
  assert.deepEqual(mugs.productHandles, ['a', 'b']);
});

test('falls back to the first tag when productType is blank', () => {
  const products = [
    { handle: 'a', productType: '', tags: ['outdoor', 'summer'] },
    { handle: 'b', productType: '', tags: ['outdoor'] },
  ];
  const groups = groupProductsIntoCollections(products);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, 'outdoor');
});

test('skips products with neither productType nor tags', () => {
  const products = [{ handle: 'a', productType: '', tags: [] }];
  assert.deepEqual(groupProductsIntoCollections(products), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `server/collections.js` does not exist.

- [ ] **Step 3: Implement `server/collections.js`**

```js
// server/collections.js
function groupProductsIntoCollections(products) {
  const groups = new Map();

  for (const product of products) {
    const name = product.productType || product.tags[0];
    if (!name) continue;

    const key = name.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, { key, name, productHandles: [] });
    }
    groups.get(key).productHandles.push(product.handle);
  }

  return Array.from(groups.values());
}

module.exports = { groupProductsIntoCollections };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/collections.js server/collections.test.js
git commit -m "Add product-to-collection grouping logic"
```

---

## Task 5: Shopify Admin API Client

**Files:**
- Create: `server/shopify.js`
- Test: `server/shopify.test.js`

**Interfaces:**
- Consumes: `theme-content.js` is NOT called from here (job runner wires them together); this module only talks to Shopify.
- Produces: `createShopifyClient(shopDomain: string, accessToken: string, opts?: { fetchImpl?, delayMs?: number }) -> ShopifyClient` where `ShopifyClient` has:
  - `testConnection() -> Promise<{ ok: boolean, shopName?: string, error?: string }>`
  - `createUnpublishedTheme(name: string) -> Promise<{ id: number }>`
  - `getThemeAsset(themeId: number, key: string) -> Promise<string>`
  - `putThemeAsset(themeId: number, key: string, content: { value?: string, attachment?: string }) -> Promise<void>`
  - `publishTheme(themeId: number) -> Promise<void>`
  - `uploadLogoFile(buffer: Buffer, filename: string, mimeType: string) -> Promise<{ filename: string }>`
  - `createProduct(payload: object) -> Promise<{ id: number, handle: string }>`
  - `createCollection(title: string, bodyHtml: string) -> Promise<{ id: number }>`
  - `addProductToCollection(productId: number, collectionId: number) -> Promise<void>`
  - `createPage(title: string, bodyHtml: string) -> Promise<{ id: number }>`
  Task 6 (theme upload orchestration), Task 7 (AI content), and Task 8 (job runner) all consume `createShopifyClient`'s return value.

- [ ] **Step 1: Write the failing test**

```js
// server/shopify.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createShopifyClient } = require('./shopify.js');

function fakeFetch(responses) {
  let call = 0;
  const calls = [];
  const impl = async (url, opts) => {
    calls.push({ url, opts });
    const r = responses[call++];
    if (!r) throw new Error('fakeFetch: no more responses queued');
    return {
      ok: r.status < 400,
      status: r.status,
      headers: new Map(Object.entries(r.headers || {})),
      json: async () => r.body,
    };
  };
  impl.calls = calls;
  return impl;
}

test('testConnection returns shop name on success', async () => {
  const fetchImpl = fakeFetch([{ status: 200, body: { shop: { name: 'Acme Store' } } }]);
  const client = createShopifyClient('acme.myshopify.com', 'shpat_test', { fetchImpl, delayMs: 0 });

  const result = await client.testConnection();

  assert.deepEqual(result, { ok: true, shopName: 'Acme Store' });
  assert.match(fetchImpl.calls[0].url, /\/admin\/api\/2024-10\/shop\.json$/);
  assert.equal(fetchImpl.calls[0].opts.headers['X-Shopify-Access-Token'], 'shpat_test');
});

test('testConnection returns ok:false on 401', async () => {
  const fetchImpl = fakeFetch([{ status: 401, body: { errors: 'Invalid API key' } }]);
  const client = createShopifyClient('acme.myshopify.com', 'bad-token', { fetchImpl, delayMs: 0 });

  const result = await client.testConnection();

  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test('putThemeAsset retries once on 429 then succeeds', async () => {
  const fetchImpl = fakeFetch([
    { status: 429, headers: { 'Retry-After': '0' }, body: {} },
    { status: 200, body: { asset: { key: 'templates/index.json' } } },
  ]);
  const client = createShopifyClient('acme.myshopify.com', 'shpat_test', { fetchImpl, delayMs: 0 });

  await client.putThemeAsset(123, 'templates/index.json', { value: '{}' });

  assert.equal(fetchImpl.calls.length, 2);
});

test('createProduct posts to products.json and returns id/handle', async () => {
  const fetchImpl = fakeFetch([
    { status: 201, body: { product: { id: 999, handle: 'red-mug' } } },
  ]);
  const client = createShopifyClient('acme.myshopify.com', 'shpat_test', { fetchImpl, delayMs: 0 });

  const result = await client.createProduct({ title: 'Red Mug' });

  assert.deepEqual(result, { id: 999, handle: 'red-mug' });
  assert.match(fetchImpl.calls[0].url, /\/products\.json$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `server/shopify.js` does not exist.

- [ ] **Step 3: Implement `server/shopify.js`**

```js
// server/shopify.js
const API_VERSION = '2024-10';

function createShopifyClient(shopDomain, accessToken, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const delayMs = opts.delayMs === undefined ? 550 : opts.delayMs;

  function baseUrl(path) {
    return `https://${shopDomain}/admin/api/${API_VERSION}/${path}`;
  }

  async function sleep(ms) {
    if (ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function restRequest(method, path, body) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const res = await fetchImpl(baseUrl(path), {
        method,
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get ? res.headers.get('Retry-After') : res.headers['Retry-After']) || 1;
        await sleep(retryAfter * 1000);
        continue;
      }

      await sleep(delayMs);

      const json = await res.json();
      if (!res.ok) {
        const err = new Error(`Shopify REST ${method} ${path} failed: ${res.status} ${JSON.stringify(json)}`);
        err.status = res.status;
        err.body = json;
        throw err;
      }
      return json;
    }
    throw new Error(`Shopify REST ${method} ${path} failed after retries (rate limited)`);
  }

  async function graphqlRequest(query, variables) {
    const res = await fetchImpl(baseUrl('graphql.json'), {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
    await sleep(delayMs);
    const json = await res.json();
    if (!res.ok || json.errors) {
      throw new Error(`Shopify GraphQL request failed: ${res.status} ${JSON.stringify(json.errors || json)}`);
    }
    return json.data;
  }

  async function testConnection() {
    try {
      const data = await restRequest('GET', 'shop.json');
      return { ok: true, shopName: data.shop.name };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async function createUnpublishedTheme(name) {
    const data = await restRequest('POST', 'themes.json', {
      theme: { name, role: 'unpublished' },
    });
    return { id: data.theme.id };
  }

  async function getThemeAsset(themeId, key) {
    const data = await restRequest('GET', `themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`);
    return data.asset.value;
  }

  async function putThemeAsset(themeId, key, content) {
    await restRequest('PUT', `themes/${themeId}/assets.json`, {
      asset: { key, ...content },
    });
  }

  async function publishTheme(themeId) {
    await restRequest('PUT', `themes/${themeId}.json`, {
      theme: { id: themeId, role: 'main' },
    });
  }

  async function uploadLogoFile(buffer, filename, mimeType) {
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
    if (!uploadRes.ok) throw new Error(`Logo upload to staged URL failed: ${uploadRes.status}`);

    const fileData = await graphqlRequest(
      `mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files { id }
          userErrors { field message }
        }
      }`,
      { files: [{ originalSource: target.resourceUrl, contentType: 'IMAGE', filename }] },
    );

    const fileErrors = fileData.fileCreate.userErrors;
    if (fileErrors.length) throw new Error(`fileCreate failed: ${JSON.stringify(fileErrors)}`);

    return { filename };
  }

  async function createProduct(payload) {
    const data = await restRequest('POST', 'products.json', { product: payload });
    return { id: data.product.id, handle: data.product.handle };
  }

  async function createCollection(title, bodyHtml) {
    const data = await restRequest('POST', 'custom_collections.json', {
      custom_collection: { title, body_html: bodyHtml, published: true },
    });
    return { id: data.custom_collection.id };
  }

  async function addProductToCollection(productId, collectionId) {
    await restRequest('POST', 'collects.json', {
      collect: { product_id: productId, collection_id: collectionId },
    });
  }

  async function createPage(title, bodyHtml) {
    const data = await restRequest('POST', 'pages.json', {
      page: { title, body_html: bodyHtml, published: true },
    });
    return { id: data.page.id };
  }

  return {
    testConnection,
    createUnpublishedTheme,
    getThemeAsset,
    putThemeAsset,
    publishTheme,
    uploadLogoFile,
    createProduct,
    createCollection,
    addProductToCollection,
    createPage,
  };
}

module.exports = { createShopifyClient, API_VERSION };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all shopify.test.js tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/shopify.js server/shopify.test.js
git commit -m "Add Shopify Admin API client (REST + logo file upload via GraphQL)"
```

---

## Task 6: Theme Upload Orchestration

**Files:**
- Create: `server/theme-upload.js`
- Test: `server/theme-upload.test.js`

**Interfaces:**
- Consumes: a `ShopifyClient` (Task 5, specifically `createUnpublishedTheme`/`putThemeAsset`).
- Produces:
  - `classifyThemeFiles(themeDir: string) -> [{ key: string, absPath: string, encoding: 'TEXT'|'BASE64' }]` (pure, filesystem-read only)
  - `uploadThemeFiles(shopifyClient, themeId: number, files: Array<ClassifiedFile>, onProgress?: (done: number, total: number, file: object) => void) -> Promise<{ uploaded: number, failed: [{ key: string, error: string }] }>`
  Task 8 (job runner) calls `classifyThemeFiles(THEME_TEMPLATE_DIR)` then `uploadThemeFiles(...)`.

- [ ] **Step 1: Write the failing test**

```js
// server/theme-upload.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { classifyThemeFiles, uploadThemeFiles } = require('./theme-upload.js');

test('classifyThemeFiles marks liquid/json/css/js as TEXT and images as BASE64', () => {
  const os = require('node:os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-classify-'));
  fs.writeFileSync(path.join(tmpDir, 'settings.json'), '{}');
  fs.mkdirSync(path.join(tmpDir, 'assets'));
  fs.writeFileSync(path.join(tmpDir, 'assets', 'logo.png'), Buffer.from([0, 1, 2, 3]));

  const files = classifyThemeFiles(tmpDir);

  const jsonFile = files.find((f) => f.key === 'settings.json');
  assert.equal(jsonFile.encoding, 'TEXT');

  const imageFile = files.find((f) => f.key === 'assets/logo.png');
  assert.equal(imageFile.encoding, 'BASE64');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('classifyThemeFiles finds the full bundled theme file count and classifies real files as TEXT', () => {
  const themeDir = path.join(__dirname, 'theme-template');
  const files = classifyThemeFiles(themeDir);

  assert.ok(files.length > 400, 'expected the full bundled theme file count');

  const settingsSchema = files.find((f) => f.key === 'config/settings_schema.json');
  assert.equal(settingsSchema.encoding, 'TEXT');
});

test('uploadThemeFiles uploads every file and reports failures without stopping', async () => {
  let calls = 0;
  const fakeClient = {
    putThemeAsset: async (themeId, key) => {
      calls += 1;
      if (key === 'sections/broken.liquid') throw new Error('boom');
    },
  };
  const files = [
    { key: 'templates/index.json', absPath: __filename, encoding: 'TEXT' },
    { key: 'sections/broken.liquid', absPath: __filename, encoding: 'TEXT' },
    { key: 'assets/logo.png', absPath: __filename, encoding: 'BASE64' },
  ];

  const result = await uploadThemeFiles(fakeClient, 123, files);

  assert.equal(calls, 3);
  assert.equal(result.uploaded, 2);
  assert.deepEqual(result.failed, [{ key: 'sections/broken.liquid', error: 'boom' }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `server/theme-upload.js` does not exist.

- [ ] **Step 3: Implement `server/theme-upload.js`**

```js
// server/theme-upload.js
const fs = require('node:fs');
const path = require('node:path');

const TEXT_EXTENSIONS = new Set(['.liquid', '.json', '.css', '.js', '.svg', '.txt', '.md']);

function classifyThemeFiles(themeDir) {
  const files = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absPath);
        continue;
      }
      const key = path.relative(themeDir, absPath).split(path.sep).join('/');
      const ext = path.extname(entry.name).toLowerCase();
      files.push({
        key,
        absPath,
        encoding: TEXT_EXTENSIONS.has(ext) ? 'TEXT' : 'BASE64',
      });
    }
  }

  walk(themeDir);
  return files;
}

async function uploadThemeFiles(shopifyClient, themeId, files, onProgress) {
  let uploaded = 0;
  const failed = [];

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    try {
      const content = file.encoding === 'TEXT'
        ? { value: fs.readFileSync(file.absPath, 'utf8') }
        : { attachment: fs.readFileSync(file.absPath).toString('base64') };

      await shopifyClient.putThemeAsset(themeId, file.key, content);
      uploaded += 1;
    } catch (err) {
      failed.push({ key: file.key, error: err.message });
    }
    if (onProgress) onProgress(i + 1, files.length, file);
  }

  return { uploaded, failed };
}

module.exports = { classifyThemeFiles, uploadThemeFiles };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/theme-upload.js server/theme-upload.test.js
git commit -m "Add theme file classification and batch upload with per-file resilience"
```

---

## Task 7: AI Content Module

**Files:**
- Create: `server/ai.js`
- Test: `server/ai.test.js`

**Interfaces:**
- Consumes: an injected OpenAI SDK client instance (constructor injection, so tests use a fake).
- Produces: `createAiClient(openaiClient) -> AiClient` where `AiClient` has:
  - `inferBrandVoice({ storeName: string, sampleProductTitles: string[] }) -> Promise<{ tone: string }>`
  - `rewriteProduct({ product: Product, brandVoice: string }) -> Promise<{ title: string, bodyHtml: string, seoTitle: string, seoDescription: string }>`
  - `writeCollectionCopy({ collectionName: string, brandVoice: string }) -> Promise<{ title: string, bodyHtml: string }>`
  - `writePageCopy({ pageType: 'about'|'contact'|'shipping', storeName: string, brandVoice: string }) -> Promise<{ title: string, bodyHtml: string }>`
  - `writeHeroCopy({ storeName: string, brandVoice: string }) -> Promise<{ heading: string, text: string, buttonLabel: string }>`
  Task 8 (job runner) calls `createAiClient(new OpenAI())` and uses every method above.

- [ ] **Step 1: Write the failing test**

```js
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

test('writeHeroCopy returns heading/text/buttonLabel', async () => {
  const client = createAiClient(fakeOpenAiClient({ heading: 'Acme', text: '<p>Hi</p>', buttonLabel: 'Shop Now' }));
  const result = await client.writeHeroCopy({ storeName: 'Acme', brandVoice: 'playful' });
  assert.deepEqual(result, { heading: 'Acme', text: '<p>Hi</p>', buttonLabel: 'Shop Now' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `server/ai.js` does not exist.

- [ ] **Step 3: Implement `server/ai.js`**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/ai.js server/ai.test.js
git commit -m "Add AI content generation module"
```

---

## Task 8: Job Runner (Orchestration)

**Files:**
- Create: `server/job-runner.js`
- Test: `server/job-runner.test.js`

**Interfaces:**
- Consumes: `createShopifyClient` (Task 5), `classifyThemeFiles`/`uploadThemeFiles` (Task 6), `createAiClient` (Task 7), `patchSettingsData`/`patchHeroSection` (Task 3), `groupProductsIntoCollections` (Task 4), `parseProductsCsv` (Task 2).
- Produces: `runCreateStoreJob(input, emit) -> Promise<Summary>` where:
  - `input = { shopifyClient, aiClient, themeTemplateDir, storeName, primaryColorHex, logoBuffer, logoFilename, logoMimeType, csvText }`
  - `emit(event: { step: string, status: 'start'|'ok'|'error', message: string })` is called at each stage transition
  - `Summary = { themeId, productsCreated, productsFailed, collectionsCreated, pagesCreated, published }`
  Task 9 (Express routes) calls `runCreateStoreJob` and forwards `emit` events to the SSE stream.

- [ ] **Step 1: Write the failing test**

```js
// server/job-runner.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runCreateStoreJob } = require('./job-runner.js');

function makeFakeShopifyClient() {
  let nextProductId = 1;
  return {
    createUnpublishedTheme: async () => ({ id: 555 }),
    getThemeAsset: async (themeId, key) => {
      if (key === 'config/settings_data.json') return JSON.stringify({ current: {} });
      if (key === 'templates/index.json') {
        return JSON.stringify({
          sections: { slideshow_hero_dEdbwc: { blocks: { slide_PahNLV: { settings: {} } } } },
        });
      }
      throw new Error(`unexpected asset key in test: ${key}`);
    },
    putThemeAsset: async () => {},
    publishTheme: async () => {},
    uploadLogoFile: async (buf, filename) => ({ filename }),
    createProduct: async () => ({ id: nextProductId++, handle: 'x' }),
    createCollection: async () => ({ id: 777 }),
    addProductToCollection: async () => {},
    createPage: async () => ({ id: 888 }),
  };
}

function makeFakeAiClient() {
  return {
    inferBrandVoice: async () => ({ tone: 'playful' }),
    rewriteProduct: async ({ product }) => ({
      title: product.title,
      bodyHtml: product.bodyHtml,
      seoTitle: product.title,
      seoDescription: product.bodyHtml,
    }),
    writeCollectionCopy: async ({ collectionName }) => ({ title: collectionName, bodyHtml: '<p>copy</p>' }),
    writePageCopy: async ({ pageType }) => ({ title: pageType, bodyHtml: '<p>copy</p>' }),
    writeHeroCopy: async () => ({ heading: 'H', text: '<p>T</p>', buttonLabel: 'Shop' }),
  };
}

const SAMPLE_CSV = [
  'Handle,Title,Body (HTML),Vendor,Type,Tags,SEO Title,SEO Description,Option1 Name,Option1 Value,Variant SKU,Variant Price,Variant Compare At Price,Variant Inventory Qty,Image Src',
  'red-mug,Red Mug,<p>A mug.</p>,Acme,Mugs,kitchen,,,,,MUG-RED,9.99,,25,https://example.com/red-mug.jpg',
].join('\n');

test('runs the full pipeline and returns a summary', async () => {
  const events = [];
  const summary = await runCreateStoreJob({
    shopifyClient: makeFakeShopifyClient(),
    aiClient: makeFakeAiClient(),
    themeTemplateDir: path.join(__dirname, 'theme-template'),
    storeName: 'Acme',
    primaryColorHex: '#112233',
    logoBuffer: Buffer.from('fake'),
    logoFilename: 'acme-logo.png',
    logoMimeType: 'image/png',
    csvText: SAMPLE_CSV,
  }, (event) => events.push(event));

  assert.equal(summary.themeId, 555);
  assert.equal(summary.productsCreated, 1);
  assert.equal(summary.productsFailed, 0);
  assert.equal(summary.collectionsCreated, 1);
  assert.equal(summary.pagesCreated, 3);
  assert.equal(summary.published, true);
  assert.ok(events.some((e) => e.step === 'theme_upload' && e.status === 'ok'));
  const themeUploadEvents = events.filter((e) => e.step === 'theme_upload');
  assert.ok(themeUploadEvents.length > 2, 'expected multiple theme_upload progress events, not just start+ok');
  assert.ok(events.some((e) => e.step === 'done'));
});

test('a single failing product does not abort the run', async () => {
  const client = makeFakeShopifyClient();
  client.createProduct = async () => { throw new Error('boom'); };

  const summary = await runCreateStoreJob({
    shopifyClient: client,
    aiClient: makeFakeAiClient(),
    themeTemplateDir: path.join(__dirname, 'theme-template'),
    storeName: 'Acme',
    primaryColorHex: '#112233',
    logoBuffer: Buffer.from('fake'),
    logoFilename: 'acme-logo.png',
    logoMimeType: 'image/png',
    csvText: SAMPLE_CSV,
  }, () => {});

  assert.equal(summary.productsCreated, 0);
  assert.equal(summary.productsFailed, 1);
  assert.equal(summary.published, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `server/job-runner.js` does not exist.

- [ ] **Step 3: Implement `server/job-runner.js`**

```js
// server/job-runner.js
const { classifyThemeFiles, uploadThemeFiles } = require('./theme-upload.js');
const { patchSettingsData, patchHeroSection } = require('./theme-content.js');
const { parseProductsCsv } = require('./csv.js');
const { groupProductsIntoCollections } = require('./collections.js');

const PAGE_TYPES = ['about', 'contact', 'shipping'];

async function runCreateStoreJob(input, emit) {
  const {
    shopifyClient, aiClient, themeTemplateDir,
    storeName, primaryColorHex, logoBuffer, logoFilename, logoMimeType, csvText,
  } = input;

  emit({ step: 'theme_upload', status: 'start', message: 'Tema yükleniyor...' });
  const { id: themeId } = await shopifyClient.createUnpublishedTheme(`${storeName} (site-bot)`);
  const files = classifyThemeFiles(themeTemplateDir);
  const uploadResult = await uploadThemeFiles(shopifyClient, themeId, files, (done, total) => {
    if (done % 25 === 0 || done === total) {
      emit({ step: 'theme_upload', status: 'start', message: `Tema dosyaları yükleniyor: ${done}/${total}` });
    }
  });
  emit({
    step: 'theme_upload',
    status: 'ok',
    message: `Tema yüklendi: ${uploadResult.uploaded}/${files.length} dosya (${uploadResult.failed.length} hata)`,
  });

  emit({ step: 'brand_customization', status: 'start', message: 'Marka özelleştiriliyor...' });
  const { filename: uploadedLogoFilename } = await shopifyClient.uploadLogoFile(logoBuffer, logoFilename, logoMimeType);
  const settingsDataRaw = await shopifyClient.getThemeAsset(themeId, 'config/settings_data.json');
  const patchedSettings = patchSettingsData(settingsDataRaw, {
    primaryColorHex,
    logoFilename: uploadedLogoFilename,
  });
  await shopifyClient.putThemeAsset(themeId, 'config/settings_data.json', { value: patchedSettings });
  emit({ step: 'brand_customization', status: 'ok', message: 'Logo ve renkler uygulandı.' });

  const products = parseProductsCsv(csvText);

  emit({ step: 'brand_voice', status: 'start', message: 'AI marka tonu belirliyor...' });
  const { tone: brandVoice } = await aiClient.inferBrandVoice({
    storeName,
    sampleProductTitles: products.slice(0, 5).map((p) => p.title),
  });
  emit({ step: 'brand_voice', status: 'ok', message: `Marka tonu: ${brandVoice}` });

  emit({ step: 'hero', status: 'start', message: 'Hero metni yazılıyor...' });
  const hero = await aiClient.writeHeroCopy({ storeName, brandVoice });
  const indexJsonRaw = await shopifyClient.getThemeAsset(themeId, 'templates/index.json');
  const patchedIndex = patchHeroSection(indexJsonRaw, hero);
  await shopifyClient.putThemeAsset(themeId, 'templates/index.json', { value: patchedIndex });
  emit({ step: 'hero', status: 'ok', message: 'Hero metni uygulandı.' });

  emit({ step: 'products', status: 'start', message: `${products.length} ürün ekleniyor...` });
  let productsCreated = 0;
  let productsFailed = 0;
  const productIdByHandle = new Map();
  for (const product of products) {
    try {
      const rewritten = await aiClient.rewriteProduct({ product, brandVoice });
      const created = await shopifyClient.createProduct({
        title: rewritten.title,
        body_html: rewritten.bodyHtml,
        vendor: product.vendor,
        product_type: product.productType,
        tags: product.tags.join(', '),
        images: product.images.map((src) => ({ src })),
        variants: product.variants.length ? product.variants.map((v) => ({
          sku: v.sku,
          price: v.price,
          compare_at_price: v.compareAtPrice || null,
          option1: v.option1 || undefined,
          option2: v.option2 || undefined,
          option3: v.option3 || undefined,
          inventory_quantity: v.inventoryQty,
        })) : undefined,
        metafields_global_title_tag: rewritten.seoTitle,
        metafields_global_description_tag: rewritten.seoDescription,
      });
      productIdByHandle.set(product.handle, created.id);
      productsCreated += 1;
    } catch (err) {
      productsFailed += 1;
      emit({ step: 'products', status: 'error', message: `${product.title || product.handle}: ${err.message}` });
    }
  }
  emit({ step: 'products', status: 'ok', message: `${productsCreated} ürün eklendi, ${productsFailed} hata.` });

  emit({ step: 'collections', status: 'start', message: 'Koleksiyonlar oluşturuluyor...' });
  const groups = groupProductsIntoCollections(products);
  let collectionsCreated = 0;
  for (const group of groups) {
    try {
      const copy = await aiClient.writeCollectionCopy({ collectionName: group.name, brandVoice });
      const collection = await shopifyClient.createCollection(copy.title, copy.bodyHtml);
      for (const handle of group.productHandles) {
        const productId = productIdByHandle.get(handle);
        if (productId) await shopifyClient.addProductToCollection(productId, collection.id);
      }
      collectionsCreated += 1;
    } catch (err) {
      emit({ step: 'collections', status: 'error', message: `${group.name}: ${err.message}` });
    }
  }
  emit({ step: 'collections', status: 'ok', message: `${collectionsCreated} koleksiyon oluşturuldu.` });

  emit({ step: 'pages', status: 'start', message: 'Sayfalar yazılıyor...' });
  let pagesCreated = 0;
  for (const pageType of PAGE_TYPES) {
    try {
      const copy = await aiClient.writePageCopy({ pageType, storeName, brandVoice });
      await shopifyClient.createPage(copy.title, copy.bodyHtml);
      pagesCreated += 1;
    } catch (err) {
      emit({ step: 'pages', status: 'error', message: `${pageType}: ${err.message}` });
    }
  }
  emit({ step: 'pages', status: 'ok', message: `${pagesCreated} sayfa oluşturuldu.` });

  emit({ step: 'publish', status: 'start', message: 'Tema yayınlanıyor...' });
  await shopifyClient.publishTheme(themeId);
  emit({ step: 'publish', status: 'ok', message: 'Tema yayınlandı.' });

  const summary = {
    themeId,
    productsCreated,
    productsFailed,
    collectionsCreated,
    pagesCreated,
    published: true,
  };
  emit({ step: 'done', status: 'ok', message: 'Mağaza hazır.', summary });
  return summary;
}

module.exports = { runCreateStoreJob };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/job-runner.js server/job-runner.test.js
git commit -m "Add job runner orchestrating theme, brand, AI content, and publish steps"
```

---

## Task 9: Express Routes (Connect, Create Store, SSE Progress)

**Files:**
- Modify: `server/index.js`
- Create: `server/jobs.js`
- Test: `server/routes.test.js`

**Interfaces:**
- Consumes: `createShopifyClient` (Task 5), `createAiClient` (Task 7), `runCreateStoreJob` (Task 8).
- Produces:
  - `server/jobs.js` exports `createJobStore()` returning `{ startJob(runFn) -> jobId, getEvents(jobId) -> event[], subscribe(jobId, listener) -> unsubscribe, isDone(jobId) -> boolean }` — an in-memory event buffer + pub/sub used by the SSE route.
  - `createApp()` (already exported by Task 1) now also has:
    - `POST /api/connect` — body `{ shopDomain, accessToken }` → `{ ok, shopName? , error? }`
    - `POST /api/create-store` — multipart form fields `shopDomain, accessToken, storeName, primaryColorHex` + files `logo, productsCsv` → `{ jobId }`
    - `GET /api/progress/:jobId` — SSE stream of job events, closing after the `done` event
  Task 10 (frontend) calls exactly these three routes.

- [ ] **Step 1: Write the failing test**

```js
// server/routes.test.js
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

test('POST /api/connect returns shop name on success', async () => {
  const deps = {
    createShopifyClient: () => ({
      testConnection: async () => ({ ok: true, shopName: 'Acme Store' }),
    }),
  };
  const { server, baseUrl } = await startTestServer(deps);

  const res = await fetch(`${baseUrl}/api/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shopDomain: 'acme.myshopify.com', accessToken: 'shpat_x' }),
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(body, { ok: true, shopName: 'Acme Store' });
  server.close();
});

test('POST /api/create-store starts a job and GET /api/progress streams events to done', async () => {
  const deps = {
    createShopifyClient: () => ({}),
    createAiClient: () => ({}),
    createOpenAiClient: () => ({}),
    runCreateStoreJob: async (input, emit) => {
      emit({ step: 'theme_upload', status: 'ok', message: 'done uploading' });
      emit({ step: 'done', status: 'ok', message: 'ready' });
      return { themeId: 1, productsCreated: 0, productsFailed: 0, collectionsCreated: 0, pagesCreated: 0, published: true };
    },
  };
  const { server, baseUrl } = await startTestServer(deps);

  const form = new FormData();
  form.append('shopDomain', 'acme.myshopify.com');
  form.append('accessToken', 'shpat_x');
  form.append('storeName', 'Acme');
  form.append('primaryColorHex', '#112233');
  form.append('logo', new Blob([Buffer.from('fake')], { type: 'image/png' }), 'logo.png');
  form.append('productsCsv', new Blob(['Handle,Title\n'], { type: 'text/csv' }), 'products.csv');

  const createRes = await fetch(`${baseUrl}/api/create-store`, { method: 'POST', body: form });
  const { jobId } = await createRes.json();
  assert.ok(jobId);

  const progressRes = await fetch(`${baseUrl}/api/progress/${jobId}`);
  const text = await progressRes.text();

  assert.match(text, /theme_upload/);
  assert.match(text, /"step":"done"/);
  server.close();
});

test('GET /api/progress streams live events emitted after the request starts, not just replayed ones', async () => {
  const deps = {
    createShopifyClient: () => ({}),
    createAiClient: () => ({}),
    createOpenAiClient: () => ({}),
    runCreateStoreJob: (input, emit) => new Promise((resolve) => {
      emit({ step: 'theme_upload', status: 'start', message: 'starting' });
      setTimeout(() => {
        emit({ step: 'theme_upload', status: 'ok', message: 'done uploading' });
        emit({ step: 'done', status: 'ok', message: 'ready' });
        resolve({ themeId: 1, productsCreated: 0, productsFailed: 0, collectionsCreated: 0, pagesCreated: 0, published: true });
      }, 50);
    }),
  };
  const { server, baseUrl } = await startTestServer(deps);

  const form = new FormData();
  form.append('shopDomain', 'acme.myshopify.com');
  form.append('accessToken', 'shpat_x');
  form.append('storeName', 'Acme');
  form.append('primaryColorHex', '#112233');
  form.append('logo', new Blob([Buffer.from('fake')], { type: 'image/png' }), 'logo.png');
  form.append('productsCsv', new Blob(['Handle,Title\n'], { type: 'text/csv' }), 'products.csv');

  const createRes = await fetch(`${baseUrl}/api/create-store`, { method: 'POST', body: form });
  const { jobId } = await createRes.json();

  const progressRes = await fetch(`${baseUrl}/api/progress/${jobId}`);
  const text = await progressRes.text();

  assert.match(text, /"step":"theme_upload"/);
  assert.match(text, /"step":"done"/);
  server.close();
});

test('GET /api/progress returns 404 for an unknown jobId instead of hanging', async () => {
  const { server, baseUrl } = await startTestServer({});

  const res = await fetch(`${baseUrl}/api/progress/not-a-real-job-id`);

  assert.equal(res.status, 404);
  server.close();
});

test('POST /api/connect rejects a non-myshopify.com shopDomain', async () => {
  const { server, baseUrl } = await startTestServer({});

  const res = await fetch(`${baseUrl}/api/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shopDomain: 'evil.com', accessToken: 'shpat_x' }),
  });

  assert.equal(res.status, 400);
  server.close();
});

test('POST /api/create-store rejects a non-myshopify.com shopDomain', async () => {
  const { server, baseUrl } = await startTestServer({});

  const form = new FormData();
  form.append('shopDomain', 'evil.com');
  form.append('accessToken', 'shpat_x');
  form.append('storeName', 'Acme');
  form.append('primaryColorHex', '#112233');
  form.append('logo', new Blob([Buffer.from('fake')], { type: 'image/png' }), 'logo.png');
  form.append('productsCsv', new Blob(['Handle,Title\n'], { type: 'text/csv' }), 'products.csv');

  const res = await fetch(`${baseUrl}/api/create-store`, { method: 'POST', body: form });

  assert.equal(res.status, 400);
  server.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `/api/connect` and `/api/create-store` routes don't exist yet, `createApp` doesn't accept `deps`.

- [ ] **Step 3: Implement `server/jobs.js`**

```js
// server/jobs.js
const { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');

function createJobStore() {
  const eventsByJob = new Map();
  const emitters = new Map();
  const doneJobs = new Set();

  function startJob(runFn) {
    const jobId = randomUUID();
    eventsByJob.set(jobId, []);
    const emitter = new EventEmitter();
    emitters.set(jobId, emitter);

    function emit(event) {
      eventsByJob.get(jobId).push(event);
      emitter.emit('event', event);
      if (event.step === 'done') doneJobs.add(jobId);
    }

    runFn(emit).catch((err) => {
      emit({ step: 'done', status: 'error', message: err.message });
    });

    return jobId;
  }

  function getEvents(jobId) {
    return eventsByJob.get(jobId) || [];
  }

  function subscribe(jobId, listener) {
    const emitter = emitters.get(jobId);
    if (!emitter) return () => {};
    emitter.on('event', listener);
    return () => emitter.off('event', listener);
  }

  function isDone(jobId) {
    return doneJobs.has(jobId);
  }

  function jobExists(jobId) {
    return eventsByJob.has(jobId);
  }

  return { startJob, getEvents, subscribe, isDone, jobExists };
}

module.exports = { createJobStore };
```

- [ ] **Step 4: Implement the routes in `server/index.js`**

```js
// server/index.js
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const { createJobStore } = require('./jobs.js');

const SHOP_DOMAIN_PATTERN = /^[a-z0-9-]+\.myshopify\.com$/i;

function isValidShopDomain(domain) {
  return typeof domain === 'string' && SHOP_DOMAIN_PATTERN.test(domain);
}

function createApp(deps = {}) {
  const {
    createShopifyClient = require('./shopify.js').createShopifyClient,
    createAiClient = require('./ai.js').createAiClient,
    runCreateStoreJob = require('./job-runner.js').runCreateStoreJob,
    createOpenAiClient = () => new (require('openai'))(),
  } = deps;

  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
  const jobStore = createJobStore();

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.post('/api/connect', async (req, res) => {
    const { shopDomain, accessToken } = req.body;
    if (!shopDomain || !accessToken) {
      return res.status(400).json({ ok: false, error: 'shopDomain ve accessToken zorunlu' });
    }
    if (!isValidShopDomain(shopDomain)) {
      return res.status(400).json({ ok: false, error: 'Geçersiz shopDomain (örn: magaza.myshopify.com olmalı)' });
    }
    const client = createShopifyClient(shopDomain, accessToken);
    const result = await client.testConnection();
    res.status(result.ok ? 200 : 400).json(result);
  });

  app.post('/api/create-store', upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'productsCsv', maxCount: 1 }]), (req, res) => {
    const { shopDomain, accessToken, storeName, primaryColorHex } = req.body;
    const logoFile = req.files.logo && req.files.logo[0];
    const csvFile = req.files.productsCsv && req.files.productsCsv[0];

    if (!shopDomain || !accessToken || !storeName || !primaryColorHex || !logoFile || !csvFile) {
      return res.status(400).json({ error: 'Eksik alan var.' });
    }
    if (!isValidShopDomain(shopDomain)) {
      return res.status(400).json({ error: 'Geçersiz shopDomain (örn: magaza.myshopify.com olmalı)' });
    }

    const shopifyClient = createShopifyClient(shopDomain, accessToken);
    const aiClient = createAiClient(createOpenAiClient());
    const themeTemplateDir = path.join(__dirname, 'theme-template');

    const jobId = jobStore.startJob((emit) => runCreateStoreJob({
      shopifyClient,
      aiClient,
      themeTemplateDir,
      storeName,
      primaryColorHex,
      logoBuffer: logoFile.buffer,
      logoFilename: `${shopDomain.replace(/[^a-z0-9]/gi, '-')}-logo${path.extname(logoFile.originalname) || '.png'}`,
      logoMimeType: logoFile.mimetype,
      csvText: csvFile.buffer.toString('utf8'),
    }, emit));

    res.json({ jobId });
  });

  app.get('/api/progress/:jobId', (req, res) => {
    const { jobId } = req.params;
    if (!jobStore.jobExists(jobId)) {
      return res.status(404).json({ error: 'Bilinmeyen jobId' });
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    for (const event of jobStore.getEvents(jobId)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    if (jobStore.isDone(jobId)) {
      return res.end();
    }

    const unsubscribe = jobStore.subscribe(jobId, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (event.step === 'done') {
        unsubscribe();
        res.end();
      }
    });

    req.on('close', unsubscribe);
  });

  return app;
}

function main() {
  require('dotenv').config();
  const app = createApp();
  const port = process.env.PORT || 3000;
  app.listen(port, '127.0.0.1', () => console.log(`shopify-site-bot listening on http://localhost:${port}`));
}

if (require.main === module) {
  main();
}

module.exports = { createApp };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all route tests pass, along with every earlier task's tests.

- [ ] **Step 6: Commit**

```bash
git add server/index.js server/jobs.js server/routes.test.js
git commit -m "Add connect/create-store/progress routes with SSE job streaming"
```

---

## Task 10: Frontend Form UI

**Files:**
- Modify: `public/index.html`
- Create: `public/app.js`

**Interfaces:**
- Consumes: `POST /api/connect`, `POST /api/create-store`, `GET /api/progress/:jobId` (Task 9).
- Produces: nothing consumed by later tasks — this is the last task. Manually tested in a browser.

- [ ] **Step 1: Replace `public/index.html`**

```html
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Shopify Site Bot</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 16px; }
    fieldset { margin-bottom: 16px; }
    label { display: block; margin-top: 8px; font-weight: 600; }
    input { width: 100%; padding: 6px; box-sizing: border-box; }
    button { margin-top: 12px; padding: 8px 16px; }
    #log { background: #111; color: #0f0; font-family: monospace; padding: 12px; height: 240px; overflow-y: auto; white-space: pre-wrap; }
    #storeFields { display: none; }
    #connectStatus { margin-top: 8px; font-weight: 600; }
  </style>
</head>
<body>
  <h1>Shopify Site Bot</h1>

  <fieldset>
    <legend>1. Mağazaya bağlan</legend>
    <label for="shopDomain">Mağaza domaini (örn. dryvex2.myshopify.com)</label>
    <input id="shopDomain" type="text" placeholder="magaza.myshopify.com">
    <label for="accessToken">Admin API access token</label>
    <input id="accessToken" type="password" placeholder="shpat_...">
    <button id="connectBtn">Bağlan</button>
    <div id="connectStatus"></div>
  </fieldset>

  <fieldset id="storeFields">
    <legend>2. Mağaza bilgileri</legend>
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

  <div id="log"></div>

  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `public/app.js`**

```js
const connectStatus = document.getElementById('connectStatus');
const storeFields = document.getElementById('storeFields');
const logEl = document.getElementById('log');

function appendLog(line) {
  logEl.textContent += line + '\n';
  logEl.scrollTop = logEl.scrollHeight;
}

document.getElementById('connectBtn').addEventListener('click', async () => {
  const shopDomain = document.getElementById('shopDomain').value.trim();
  const accessToken = document.getElementById('accessToken').value.trim();
  connectStatus.textContent = 'Bağlanıyor...';

  const res = await fetch('/api/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shopDomain, accessToken }),
  });
  const body = await res.json();

  if (body.ok) {
    connectStatus.textContent = `✓ Bağlandı: ${body.shopName}`;
    storeFields.style.display = 'block';
  } else {
    connectStatus.textContent = `✗ Bağlanamadı: ${body.error || 'bilinmeyen hata'}`;
    storeFields.style.display = 'none';
  }
});

document.getElementById('createBtn').addEventListener('click', async () => {
  const form = new FormData();
  form.append('shopDomain', document.getElementById('shopDomain').value.trim());
  form.append('accessToken', document.getElementById('accessToken').value.trim());
  form.append('storeName', document.getElementById('storeName').value.trim());
  form.append('primaryColorHex', document.getElementById('primaryColorHex').value);
  form.append('logo', document.getElementById('logo').files[0]);
  form.append('productsCsv', document.getElementById('productsCsv').files[0]);

  logEl.textContent = '';
  appendLog('Mağaza oluşturma başlatılıyor...');

  const res = await fetch('/api/create-store', { method: 'POST', body: form });
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
    }
  };
});
```

- [ ] **Step 3: Manual verification (no automated test — this is UI)**

Run: `npm start`, open `http://localhost:3000` in a browser.
Expected: the connect form is visible; after Task 1-9 are all in place this can only be fully exercised against a real Shopify store (see README checklist in the final commit).

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/app.js
git commit -m "Add frontend form with connect flow and live SSE progress log"
```

---

## Task 11: README + Manual End-to-End Verification

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing (terminal task).

- [ ] **Step 1: Write `README.md`**

```markdown
# Shopify Site Bot

Local tool that installs the bundled "Shopfinity" theme into an existing
Shopify store and populates it with AI-rewritten products, collections,
and pages from your own product CSV.

## What this does NOT do

This tool never creates or verifies a Shopify account/store. You create
the store yourself in the normal Shopify signup flow, then generate an
Admin API access token for it before running this tool.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`.
3. `npm start`, then open `http://localhost:3000`.

## Getting a store's Admin API token

In the target store's Shopify admin: **Settings → Apps and sales
channels → Develop apps → Create an app**. Grant Admin API scopes for
themes, products, collections, and pages (read and write). Install the
app and copy the Admin API access token — paste it into the form.

## Using it

1. Enter the store domain and Admin API token, click **Bağlan**.
2. Once connected, fill in store name, primary color, logo, and a
   standard Shopify product export CSV.
3. Click **Mağazayı Oluştur** and watch the live log. This takes a few
   minutes (theme upload is ~350 files, uploaded sequentially to respect
   Shopify's rate limits).

## Known limitations

- The theme's `featured_product` homepage section references a specific
  product handle from the original Shopfinity demo store. It will not
  match your products — review and update that section in the Shopify
  theme editor after a run.
- The logo `shopify://shop_images/<filename>` reference relies on a
  long-standing but not officially documented Shopify behavior. If the
  logo doesn't appear after a run, open the theme editor and re-select
  it manually from Files — the file will already be uploaded.
- Admin REST endpoints are used for products/collections/pages/theme
  assets. If Shopify returns deprecation errors for your store's app
  type, the equivalent GraphQL mutations (`productCreate`,
  `collectionCreate`, `pageCreate`) would need to replace the REST calls
  in `server/shopify.js`.

## Manual end-to-end checklist

Run this once against a real (or Shopify Partner dev) store before
relying on the tool for a real launch:

- [ ] Connect succeeds and shows the correct shop name
- [ ] Theme appears in Online Store → Themes as a new (unpublished, then
      published) theme
- [ ] Logo and primary color show correctly on the storefront
- [ ] Homepage hero heading/text/button match what was generated
- [ ] All CSV products exist with AI-rewritten titles/descriptions and
      correct variants/images
- [ ] Collections exist and contain the right products
- [ ] About/Contact/Shipping pages exist with sensible copy
- [ ] The theme is actually live (published), not just uploaded
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Add README with setup, usage, and manual E2E checklist"
```
