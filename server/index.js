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

if (!module.parent && process.argv[1]?.endsWith('index.js')) {
  main();
}

module.exports = { createApp };
