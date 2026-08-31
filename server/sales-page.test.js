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

test('renders a placeholder instead of throwing when a narrative section key is missing', () => {
  const { benefits, ...narrative } = NARRATIVE;
  const html = buildSalesPageHtml({ images: [], narrative });

  assert.match(html, /İçerik oluşturulamadı\./);
});

test('escapes HTML in titles and review names but leaves body HTML intact', () => {
  const narrative = { ...NARRATIVE, hero: { title: '<script>x</script>', body: '<p>safe</p>' }, reviews: [{ name: '<b>X</b>', text: 'ok' }] };
  const html = buildSalesPageHtml({ images: [], narrative });

  assert.ok(!html.includes('<script>x</script>'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<p>safe<\/p>/);
  assert.ok(!html.includes('<b>X</b>'));
});
