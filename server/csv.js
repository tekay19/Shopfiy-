// server/csv.js
const { parse } = require('csv-parse/sync');

function parseProductsCsv(csvText) {
  const rows = parse(csvText, { columns: true, skip_empty_lines: true });
  const productsByHandle = new Map();

  for (const row of rows) {
    const handle = row['Handle'];
    if (!handle) continue;

    if (!productsByHandle.has(handle)) {
      productsByHandle.set(handle, {
        handle,
        title: row['Title'] || '',
        bodyHtml: row['Body (HTML)'] || '',
        vendor: row['Vendor'] || '',
        productType: row['Type'] || '',
        tags: splitTags(row['Tags']),
        seoTitle: row['SEO Title'] || '',
        seoDescription: row['SEO Description'] || '',
        images: [],
        variants: [],
      });
    }

    const product = productsByHandle.get(handle);

    const imageSrc = row['Image Src'];
    if (imageSrc && !product.images.includes(imageSrc)) {
      product.images.push(imageSrc);
    }

    const hasVariantData = row['Variant SKU'] || row['Option1 Value'] || row['Variant Price'];
    if (hasVariantData) {
      product.variants.push({
        sku: row['Variant SKU'] || '',
        price: row['Variant Price'] || '',
        compareAtPrice: row['Variant Compare At Price'] || '',
        option1: row['Option1 Value'] || '',
        option2: row['Option2 Value'] || '',
        option3: row['Option3 Value'] || '',
        inventoryQty: row['Variant Inventory Qty'] ? Number(row['Variant Inventory Qty']) : 0,
      });
    }
  }

  return Array.from(productsByHandle.values());
}

function splitTags(tagsField) {
  if (!tagsField) return [];
  return tagsField.split(',').map((t) => t.trim()).filter(Boolean);
}

module.exports = { parseProductsCsv };
