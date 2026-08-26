// server/job-runner.js
const fs = require('node:fs');
const path = require('node:path');
const { classifyThemeFiles, uploadThemeFiles } = require('./theme-upload.js');
const { patchSettingsData, patchHeroSection } = require('./theme-content.js');
const { parseProductsCsv } = require('./csv.js');
const { groupProductsIntoCollections } = require('./collections.js');

const PAGE_TYPES = ['about', 'contact', 'shipping'];

async function runCreateStoreJob(input, emit) {
  const {
    shopifyClient, aiClient, themeTemplateDir,
    storeName, primaryColorHex, logoBuffer, logoFilename, logoMimeType, csvText,
  } = input;

  const products = parseProductsCsv(csvText);

  emit({ step: 'theme_upload', status: 'start', message: 'Tema yükleniyor...' });
  const { id: themeId } = await shopifyClient.createUnpublishedTheme(`${storeName} (site-bot)`);
  const files = classifyThemeFiles(themeTemplateDir);
  const uploadResult = await uploadThemeFiles(shopifyClient, themeId, files, (done, total) => {
    if (done % 25 === 0 || done === total) {
      emit({ step: 'theme_upload', status: 'start', message: `Tema dosyaları yükleniyor: ${done}/${total}` });
    }
  });
  emit({
    step: 'theme_upload',
    status: 'ok',
    message: `Tema yüklendi: ${uploadResult.uploaded}/${files.length} dosya (${uploadResult.failed.length} hata)`,
  });

  emit({ step: 'brand_customization', status: 'start', message: 'Marka özelleştiriliyor...' });
  try {
    const { filename: uploadedLogoFilename } = await shopifyClient.uploadLogoFile(logoBuffer, logoFilename, logoMimeType);
    const settingsDataRaw = fs.readFileSync(path.join(themeTemplateDir, 'config/settings_data.json'), 'utf8');
    const patchedSettings = patchSettingsData(settingsDataRaw, {
      primaryColorHex,
      logoFilename: uploadedLogoFilename,
    });
    await shopifyClient.putThemeAsset(themeId, 'config/settings_data.json', { value: patchedSettings });
    emit({ step: 'brand_customization', status: 'ok', message: 'Logo ve renkler uygulandı.' });
  } catch (err) {
    emit({ step: 'brand_customization', status: 'error', message: err.message });
  }

  let brandVoice;
  try {
    emit({ step: 'brand_voice', status: 'start', message: 'AI marka tonu belirliyor...' });
    ({ tone: brandVoice } = await aiClient.inferBrandVoice({
      storeName,
      sampleProductTitles: products.slice(0, 5).map((p) => p.title),
    }));
    emit({ step: 'brand_voice', status: 'ok', message: `Marka tonu: ${brandVoice}` });

    emit({ step: 'hero', status: 'start', message: 'Hero metni yazılıyor...' });
    const hero = await aiClient.writeHeroCopy({ storeName, brandVoice });
    const indexJsonRaw = fs.readFileSync(path.join(themeTemplateDir, 'templates/index.json'), 'utf8');
    const patchedIndex = patchHeroSection(indexJsonRaw, hero);
    await shopifyClient.putThemeAsset(themeId, 'templates/index.json', { value: patchedIndex });
    emit({ step: 'hero', status: 'ok', message: 'Hero metni uygulandı.' });
  } catch (err) {
    emit({ step: 'hero', status: 'error', message: err.message });
  }

  emit({ step: 'products', status: 'start', message: `${products.length} ürün ekleniyor...` });
  let productsCreated = 0;
  let productsFailed = 0;
  const productIdByHandle = new Map();
  for (let i = 0; i < products.length; i += 1) {
    const product = products[i];
    try {
      const rewritten = await aiClient.rewriteProduct({ product, brandVoice });
      const created = await shopifyClient.createProduct({
        title: rewritten.title,
        body_html: rewritten.bodyHtml,
        vendor: product.vendor,
        product_type: product.productType,
        tags: product.tags.join(', '),
        images: product.images.map((src) => ({ src })),
        variants: product.variants.length ? product.variants.map((v) => ({
          sku: v.sku,
          price: v.price,
          compare_at_price: v.compareAtPrice || null,
          option1: v.option1 || undefined,
          option2: v.option2 || undefined,
          option3: v.option3 || undefined,
          inventory_quantity: v.inventoryQty,
        })) : undefined,
        ...(product.optionNames.length > 0 ? { options: product.optionNames.map((name) => ({ name })) } : {}),
        metafields_global_title_tag: rewritten.seoTitle,
        metafields_global_description_tag: rewritten.seoDescription,
      });
      productIdByHandle.set(product.handle, created.id);
      productsCreated += 1;
    } catch (err) {
      productsFailed += 1;
      emit({ step: 'products', status: 'error', message: `${product.title || product.handle}: ${err.message}` });
    }
    if (products.length > 1) {
      emit({ step: 'products', status: 'start', message: `Ürün işleniyor: ${i + 1}/${products.length}` });
    }
  }
  emit({ step: 'products', status: 'ok', message: `${productsCreated} ürün eklendi, ${productsFailed} hata.` });

  emit({ step: 'collections', status: 'start', message: 'Koleksiyonlar oluşturuluyor...' });
  const groups = groupProductsIntoCollections(products);
  let collectionsCreated = 0;
  for (const group of groups) {
    try {
      const copy = await aiClient.writeCollectionCopy({ collectionName: group.name, brandVoice });
      const collection = await shopifyClient.createCollection(copy.title, copy.bodyHtml);
      for (const handle of group.productHandles) {
        const productId = productIdByHandle.get(handle);
        if (productId) await shopifyClient.addProductToCollection(productId, collection.id);
      }
      collectionsCreated += 1;
    } catch (err) {
      emit({ step: 'collections', status: 'error', message: `${group.name}: ${err.message}` });
    }
  }
  emit({ step: 'collections', status: 'ok', message: `${collectionsCreated} koleksiyon oluşturuldu.` });

  emit({ step: 'pages', status: 'start', message: 'Sayfalar yazılıyor...' });
  let pagesCreated = 0;
  for (let i = 0; i < PAGE_TYPES.length; i += 1) {
    const pageType = PAGE_TYPES[i];
    try {
      const copy = await aiClient.writePageCopy({ pageType, storeName, brandVoice });
      await shopifyClient.createPage(copy.title, copy.bodyHtml);
      pagesCreated += 1;
    } catch (err) {
      emit({ step: 'pages', status: 'error', message: `${pageType}: ${err.message}` });
    }
    if (PAGE_TYPES.length > 1) {
      emit({ step: 'pages', status: 'start', message: `Sayfa işleniyor: ${i + 1}/${PAGE_TYPES.length}` });
    }
  }
  emit({ step: 'pages', status: 'ok', message: `${pagesCreated} sayfa oluşturuldu.` });

  let published;
  if (uploadResult.failed.length > 0) {
    emit({
      step: 'publish',
      status: 'error',
      message: `${uploadResult.failed.length} tema dosyası yüklenemedi, mağaza yayınlanmadı — gözden geçirin.`,
    });
    published = false;
  } else {
    emit({ step: 'publish', status: 'start', message: 'Tema yayınlanıyor...' });
    await shopifyClient.publishTheme(themeId);
    emit({ step: 'publish', status: 'ok', message: 'Tema yayınlandı.' });
    published = true;
  }

  const summary = {
    themeId,
    productsCreated,
    productsFailed,
    collectionsCreated,
    pagesCreated,
    published,
    themeFilesFailed: uploadResult.failed.length,
  };
  emit({ step: 'done', status: 'ok', message: 'Mağaza hazır.', summary });
  return summary;
}

module.exports = { runCreateStoreJob };
