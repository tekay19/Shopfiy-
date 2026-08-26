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
