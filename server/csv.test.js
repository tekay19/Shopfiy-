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
