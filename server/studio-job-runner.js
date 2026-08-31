// server/studio-job-runner.js
const fs = require('node:fs');
const path = require('node:path');
const { classifyThemeFiles, uploadThemeFiles } = require('./theme-upload.js');
const { patchSettingsData, patchHeroSection, patchWhatsappPhone } = require('./theme-content.js');
const { buildSalesPageHtml } = require('./sales-page.js');

async function runCreateStudioProductJob(input, emit) {
  const {
    shopifyClient, aiClient, productProfileClient, salesImagesClient, salesCopyClient,
    themeTemplateDir, storeName, primaryColorHex, logoBuffer, logoFilename, logoMimeType,
    productName, whatItDoes, basicInfo, whatsappPhone,
    photoBuffer, photoBase64, photoMimeType,
  } = input;

  emit({ step: 'theme_upload', status: 'start', message: 'Tema yükleniyor...' });
  const { id: themeId } = await shopifyClient.createUnpublishedTheme(`${storeName} (site-bot studio)`);
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

  emit({ step: 'brand', status: 'start', message: 'Marka ve WhatsApp ayarlanıyor...' });
  try {
    const { filename: uploadedLogoFilename } = await shopifyClient.uploadLogoFile(logoBuffer, logoFilename, logoMimeType);
    const settingsDataRaw = fs.readFileSync(path.join(themeTemplateDir, 'config/settings_data.json'), 'utf8');
    const withBrand = patchSettingsData(settingsDataRaw, { primaryColorHex, logoFilename: uploadedLogoFilename });
    const withWhatsapp = patchWhatsappPhone(withBrand, whatsappPhone);
    await shopifyClient.putThemeAsset(themeId, 'config/settings_data.json', { value: withWhatsapp });
    emit({ step: 'brand', status: 'ok', message: 'Logo, renk ve WhatsApp numarası uygulandı.' });
  } catch (err) {
    emit({ step: 'brand', status: 'error', message: err.message });
  }

  let brandVoice;
  try {
    emit({ step: 'hero', status: 'start', message: 'Hero metni yazılıyor...' });
    ({ tone: brandVoice } = await aiClient.inferBrandVoice({ storeName, sampleProductTitles: [productName] }));
    const hero = await aiClient.writeHeroCopy({ storeName, brandVoice });
    const indexJsonRaw = fs.readFileSync(path.join(themeTemplateDir, 'templates/index.json'), 'utf8');
    const patchedIndex = patchHeroSection(indexJsonRaw, hero);
    await shopifyClient.putThemeAsset(themeId, 'templates/index.json', { value: patchedIndex });
    emit({ step: 'hero', status: 'ok', message: 'Hero metni uygulandı.' });
  } catch (err) {
    emit({ step: 'hero', status: 'error', message: err.message });
  }

  emit({ step: 'profile', status: 'start', message: 'Ürün fotoğrafı ve bilgisi analiz ediliyor...' });
  const productProfile = await productProfileClient.analyzeProduct({ productName, whatItDoes, basicInfo, photoBase64, photoMimeType });
  emit({ step: 'profile', status: 'ok', message: `Kategori: ${productProfile.category}` });

  emit({ step: 'images', status: 'start', message: '8 satış görseli üretiliyor...' });
  const generatedImages = await salesImagesClient.generateSalesImages({ productProfile, productName }, (scene, err) => {
    emit({ step: 'images', status: 'error', message: `${scene.key}: ${err.message}` });
  });
  emit({ step: 'images', status: 'ok', message: `${generatedImages.length} görsel üretildi.` });

  emit({ step: 'copy', status: 'start', message: 'Satış metinleri yazılıyor...' });
  const narrative = await salesCopyClient.writeSalesNarrative({ productName, productProfile });
  emit({ step: 'copy', status: 'ok', message: 'Metinler hazır.' });

  emit({ step: 'image_upload', status: 'start', message: 'Görseller mağazaya yükleniyor...' });
  const uploadedImages = [];
  const slug = productName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'product';
  for (const image of generatedImages) {
    try {
      const { url } = await shopifyClient.uploadImageFile(Buffer.from(image.base64, 'base64'), `${slug}-${image.key}.jpg`, 'image/jpeg');
      uploadedImages.push({ key: image.key, url });
    } catch (err) {
      emit({ step: 'image_upload', status: 'error', message: `${image.key}: ${err.message}` });
    }
  }
  emit({ step: 'image_upload', status: 'ok', message: `${uploadedImages.length}/${generatedImages.length} görsel yüklendi.` });

  const bodyHtml = buildSalesPageHtml({ images: uploadedImages, narrative });

  emit({ step: 'product', status: 'start', message: 'Ürün oluşturuluyor...' });
  const product = await shopifyClient.createProduct({
    title: productName,
    body_html: bodyHtml,
    images: [{ attachment: photoBase64 }],
  });
  emit({ step: 'product', status: 'ok', message: `Ürün oluşturuldu: ${product.handle}` });

  let published;
  if (uploadResult.failed.length > 0) {
    emit({
      step: 'publish',
      status: 'error',
      message: `${uploadResult.failed.length} tema dosyası yüklenemedi, tema yayınlanmadı — gözden geçirin.`,
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
    productId: product.id,
    productHandle: product.handle,
    category: productProfile.category,
    imagesGenerated: generatedImages.length,
    imagesUploaded: uploadedImages.length,
    published,
    themeFilesFailed: uploadResult.failed.length,
  };
  emit({ step: 'done', status: 'ok', message: 'Ürün sayfası hazır.', summary, images: uploadedImages });
  return summary;
}

module.exports = { runCreateStudioProductJob };
