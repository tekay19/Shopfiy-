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
