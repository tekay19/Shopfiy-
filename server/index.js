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
  app.listen(port, () => console.log(`shopify-site-bot listening on http://localhost:${port}`));
}

if (!module.parent && process.argv[1]?.endsWith('index.js')) {
  main();
}

module.exports = { createApp };
