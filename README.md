# Shopify Site Bot

Local tool that installs the bundled "Shopfinity" theme into an existing
Shopify store and populates it with AI-rewritten products, collections,
and pages from your own product CSV.

## What this does NOT do

This tool never creates or verifies a Shopify account/store. You create
the store yourself in the normal Shopify signup flow, then generate an
Admin API access token for it before running this tool.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`.
3. `npm start`, then open `http://localhost:3000`.

## Getting a store's Admin API token

In the target store's Shopify admin: **Settings → Apps and sales
channels → Develop apps → Create an app**. Grant these Admin API access
scopes: `write_themes`, `write_products`, `write_content`,
`write_files`. Note: `write_files` is easy to miss but required —
without it the logo/image upload step will fail. Install the app and
copy the Admin API access token — paste it into the form.

## Using it

1. Enter the store domain and Admin API token, click **Bağlan**.
2. Once connected, fill in store name, primary color, logo, and a
   standard Shopify product export CSV.
3. Click **Mağazayı Oluştur** and watch the live log. This takes about
   5-8 minutes (theme upload is 439 files, uploaded sequentially to
   respect Shopify's rate limits — it's the dominant cost).

## Known limitations

- Several homepage sections reference leftover demo content from the
  original Shopfinity demo store's live export and won't resolve on a
  new store — review and replace all of them in the theme editor after
  a run, not just the featured product:
  - `featured_product` references a specific demo product handle.
  - `featured_collection` references a specific demo collection handle.
  - The two "custom columns" sections reference demo product handles
    and demo image files under `shopify://shop_images/ChatGPT_Image_*`
    and `shopify://products/...`.
- The logo `shopify://shop_images/<filename>` reference relies on a
  long-standing but not officially documented Shopify behavior. If the
  logo doesn't appear after a run, open the theme editor and re-select
  it manually from Files — the file will already be uploaded.
- Admin REST endpoints are used for products/collections/pages/theme
  assets. If Shopify returns deprecation errors for your store's app
  type, the equivalent GraphQL mutations (`productCreate`,
  `collectionCreate`, `pageCreate`) would need to replace the REST calls
  in `server/shopify.js`.

## Manual end-to-end checklist

Run this once against a real (or Shopify Partner dev) store before
relying on the tool for a real launch:

- [ ] Connect succeeds and shows the correct shop name
- [ ] Theme appears in Online Store → Themes as a new (unpublished, then
      published) theme
- [ ] Logo and primary color show correctly on the storefront
- [ ] Homepage hero heading/text/button match what was generated
- [ ] All CSV products exist with AI-rewritten titles/descriptions and
      correct variants/images
- [ ] Collections exist and contain the right products
- [ ] About/Contact/Shipping pages exist with sensible copy
- [ ] The theme is actually live (published), not just uploaded
