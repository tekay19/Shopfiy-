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
