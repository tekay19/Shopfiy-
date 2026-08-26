const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { classifyThemeFiles, uploadThemeFiles } = require('./theme-upload.js');

test('classifyThemeFiles marks liquid/json/css/js as TEXT and images as BASE64', () => {
  const themeDir = path.join(__dirname, 'theme-template');
  const files = classifyThemeFiles(themeDir);

  const settingsSchema = files.find((f) => f.key === 'config/settings_schema.json');
  assert.equal(settingsSchema.encoding, 'TEXT');

  const image = files.find((f) => f.key.startsWith('assets/') && /\.(png|jpg|jpeg|svg|gif|woff2?)$/.test(f.key));
  assert.ok(image, 'expected at least one binary asset in the bundled theme');

  assert.ok(files.length > 100, 'expected the full bundled theme file count');
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
