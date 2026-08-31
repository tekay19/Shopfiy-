// server/shopify.js
const API_VERSION = '2024-10';

function createShopifyClient(shopDomain, accessToken, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const delayMs = opts.delayMs === undefined ? 550 : opts.delayMs;
  const pollIntervalMs = opts.pollIntervalMs === undefined ? 1000 : opts.pollIntervalMs;

  function baseUrl(path) {
    return `https://${shopDomain}/admin/api/${API_VERSION}/${path}`;
  }

  async function sleep(ms) {
    if (ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  const NETWORK_ERROR_BACKOFF_MS = 500;
  const SERVER_ERROR_BACKOFF_MS = 500;

  async function restRequest(method, path, body) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let res;
      try {
        res = await fetchImpl(baseUrl(path), {
          method,
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (err) {
        if (attempt < 2) {
          await sleep(NETWORK_ERROR_BACKOFF_MS);
          continue;
        }
        throw err;
      }

      if (res.status === 429) {
        const retryAfterHeader = Number(res.headers.get ? res.headers.get('Retry-After') : res.headers['Retry-After']);
        const retryAfter = Number.isFinite(retryAfterHeader) ? retryAfterHeader : 1;
        await res.json().catch(() => {});
        await sleep(retryAfter * 1000);
        continue;
      }

      if (res.status >= 500) {
        await res.json().catch(() => {});
        await sleep(SERVER_ERROR_BACKOFF_MS);
        continue;
      }

      await sleep(delayMs);

      const json = await res.json();
      if (!res.ok) {
        const err = new Error(`Shopify REST ${method} ${path} failed: ${res.status} ${JSON.stringify(json)}`);
        err.status = res.status;
        err.body = json;
        throw err;
      }
      return json;
    }
    throw new Error(`Shopify REST ${method} ${path} failed after retries (rate limited)`);
  }

  async function graphqlRequest(query, variables) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let res;
      try {
        res = await fetchImpl(baseUrl('graphql.json'), {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query, variables }),
        });
      } catch (err) {
        if (attempt < 2) {
          await sleep(NETWORK_ERROR_BACKOFF_MS);
          continue;
        }
        throw err;
      }

      if (res.status >= 500) {
        await res.json().catch(() => {});
        await sleep(SERVER_ERROR_BACKOFF_MS);
        continue;
      }

      await sleep(delayMs);
      const json = await res.json();
      if (!res.ok || json.errors) {
        throw new Error(`Shopify GraphQL request failed: ${res.status} ${JSON.stringify(json.errors || json)}`);
      }
      return json.data;
    }
    throw new Error('Shopify GraphQL request failed after retries (server error)');
  }

  async function testConnection() {
    try {
      const data = await restRequest('GET', 'shop.json');
      return { ok: true, shopName: data.shop.name };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async function createUnpublishedTheme(name) {
    const data = await restRequest('POST', 'themes.json', {
      theme: { name, role: 'unpublished' },
    });
    return { id: data.theme.id };
  }

  async function getThemeAsset(themeId, key) {
    const data = await restRequest('GET', `themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(key)}`);
    return data.asset.value;
  }

  async function putThemeAsset(themeId, key, content) {
    await restRequest('PUT', `themes/${themeId}/assets.json`, {
      asset: { key, ...content },
    });
  }

  async function publishTheme(themeId) {
    await restRequest('PUT', `themes/${themeId}.json`, {
      theme: { id: themeId, role: 'main' },
    });
  }

  async function stageAndCreateFile(buffer, filename, mimeType) {
    const stagedData = await graphqlRequest(
      `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets { url resourceUrl parameters { name value } }
          userErrors { field message }
        }
      }`,
      {
        input: [{
          filename,
          mimeType,
          httpMethod: 'POST',
          resource: 'FILE',
          fileSize: String(buffer.length),
        }],
      },
    );

    const errors = stagedData.stagedUploadsCreate.userErrors;
    if (errors.length) throw new Error(`stagedUploadsCreate failed: ${JSON.stringify(errors)}`);

    const target = stagedData.stagedUploadsCreate.stagedTargets[0];
    const form = new FormData();
    for (const { name, value } of target.parameters) form.append(name, value);
    form.append('file', new Blob([buffer], { type: mimeType }), filename);

    const uploadRes = await fetchImpl(target.url, { method: 'POST', body: form });
    if (!uploadRes.ok) throw new Error(`File upload to staged URL failed: ${uploadRes.status}`);

    const fileData = await graphqlRequest(
      `mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files { id fileStatus ... on MediaImage { image { url } } }
          userErrors { field message }
        }
      }`,
      { files: [{ originalSource: target.resourceUrl, contentType: 'IMAGE', filename }] },
    );

    const fileErrors = fileData.fileCreate.userErrors;
    if (fileErrors.length) throw new Error(`fileCreate failed: ${JSON.stringify(fileErrors)}`);

    return fileData.fileCreate.files[0];
  }

  async function uploadLogoFile(buffer, filename, mimeType) {
    await stageAndCreateFile(buffer, filename, mimeType);
    return { filename };
  }

  async function pollForFileUrl(fileId) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await sleep(pollIntervalMs);
      const data = await graphqlRequest(
        `query($id: ID!) { node(id: $id) { ... on MediaImage { fileStatus image { url } } } }`,
        { id: fileId },
      );
      if (data.node && data.node.image && data.node.image.url) return data.node.image.url;
    }
    throw new Error(`Image file ${fileId} did not become ready in time`);
  }

  async function uploadImageFile(buffer, filename, mimeType) {
    const created = await stageAndCreateFile(buffer, filename, mimeType);
    if (created.image && created.image.url) return { url: created.image.url };
    const url = await pollForFileUrl(created.id);
    return { url };
  }

  async function createProduct(payload) {
    const data = await restRequest('POST', 'products.json', { product: payload });
    return { id: data.product.id, handle: data.product.handle };
  }

  async function createCollection(title, bodyHtml) {
    const data = await restRequest('POST', 'custom_collections.json', {
      custom_collection: { title, body_html: bodyHtml, published: true },
    });
    return { id: data.custom_collection.id };
  }

  async function addProductToCollection(productId, collectionId) {
    await restRequest('POST', 'collects.json', {
      collect: { product_id: productId, collection_id: collectionId },
    });
  }

  async function createPage(title, bodyHtml) {
    const data = await restRequest('POST', 'pages.json', {
      page: { title, body_html: bodyHtml, published: true },
    });
    return { id: data.page.id };
  }

  return {
    testConnection,
    createUnpublishedTheme,
    getThemeAsset,
    putThemeAsset,
    publishTheme,
    uploadLogoFile,
    uploadImageFile,
    createProduct,
    createCollection,
    addProductToCollection,
    createPage,
  };
}

module.exports = { createShopifyClient, API_VERSION };
