// server/collections.js
function groupProductsIntoCollections(products) {
  const groups = new Map();

  for (const product of products) {
    const name = product.productType || product.tags[0];
    if (!name) continue;

    const key = name.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, { key, name, productHandles: [] });
    }
    groups.get(key).productHandles.push(product.handle);
  }

  return Array.from(groups.values());
}

module.exports = { groupProductsIntoCollections };
