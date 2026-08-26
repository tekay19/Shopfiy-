const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { classifyThemeFiles, uploadThemeFiles } = require('./theme-upload.js');

test('classifyThemeFiles marks liquid/json/css/js as TEXT and images as BASE64', () => {
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
