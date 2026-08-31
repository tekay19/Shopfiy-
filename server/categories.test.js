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
