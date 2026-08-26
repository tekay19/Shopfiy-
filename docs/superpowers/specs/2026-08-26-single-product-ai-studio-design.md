# Single-Product AI Studio — Design

## Purpose

A second mode inside the same `shopify-site-bot` local tool (alongside the
CSV bulk-catalog mode already being built). Instead of importing many
products from a CSV, the owner enters **one product** (name, a photo,
what it does, a few basic facts) and the tool produces a complete,
narrative-driven sales page for it: 8 category-aware marketing images in
a fixed visual sequence, matching sales copy for each section, a draft
reviews section, and a standardized WhatsApp contact button — all
following the same page structure every time, based on the bundled
"Shopfinity" theme.

This targets the common "single-product landing page" style store: the
product page IS the sales pitch, told in a fixed narrative order, not a
general multi-product catalog page.

## Scope

**In scope:**
- A second form/tab in the existing UI: product name, product photo,
  "what it does", free-text basic info, WhatsApp phone number
- AI vision analysis of the photo + text into a structured product
  profile (category + visual attributes)
- Category classification into one of 7 fixed categories, each with its
  own visual-language rules for the 8-image sequence
- 8 AI-generated marketing images per product, in a fixed order, styled
  per the product's category (text-to-image generation — no reference
  photo compositing; see Decisions below)
- AI-written copy for all 8 sections, plus a CTA and a draft reviews
  block
- Assembly into the product's `body_html` in fixed section order
- The real uploaded product photo becomes the product's actual Shopify
  gallery image (what shows in cart/search/related products)
- A standardized floating WhatsApp button added to the bundled theme
  (one-time theme change), with the phone number set per store
- Per-image download links in the UI so the owner can save any generated
  image as a JPEG

**Out of scope:**
- Reference-photo-based image editing/compositing (explicitly declined —
  see Decisions)
- A downloadable zip of all images (per-image download links are
  sufficient; avoids adding a zip-library dependency for marginal gain)
- Presenting generated reviews as verified/dated/attributed to real
  people (see Compliance Note)
- Reordering the 8-section structure per product — the order is always
  identical; only the content/style within each section adapts to
  category

## Decisions

**Image generation method — text-to-image, not photo editing.** The
owner explicitly chose full from-scratch AI image generation over an
image-editing approach that would preserve the real product's exact
appearance. This means generated images may visually diverge from the
real product (proportions, color, small details) — the owner has
accepted this and expects to review/regenerate before using them. The
uploaded photo is still used, but only as input to the vision-analysis
step (Decisions → Product Profile), not as a compositing base for image
generation.

**Fixed category taxonomy — not free-form.** 7 categories:
`genel_urun`, `saglik_bebek`, `guzellik_bakim`, `moda_aksesuar`,
`ev_yasam`, `elektronik`, `diger` (fallback). Each category defines
style overrides for specific scene slots (see Category Rules below).
Chosen over free-form AI decision-making for consistency and
testability.

## Compliance Note — AI-generated reviews

Presenting fabricated customer testimonials as genuine, verified reviews
(fake reviewer names with dates, "verified buyer" badges, star ratings
tied to specific claimed transactions) risks violating consumer
protection rules against fake reviews (e.g. FTC rules in the US, EU
Unfair Commercial Practices Directive amendments, and Turkish consumer
protection law). This tool will generate short, generic testimonial-style
copy (first name + initial only, no surname, no date, no "verified
buyer"/star-rating markup) as a **draft** the owner reviews before or
shortly after launch — matching the owner's own stated workflow ("metinleri
kontrol edeceğim"). The tool's UI/report will label this section as
AI-drafted so the owner knows to treat it as a starting point, not
finished, truthful copy — this labeling is for the owner's own tooling
context, not rendered on the live storefront.

## Architecture

Extends the existing `shopify-site-bot` server (built in the CSV-mode
plan). Reuses: `createShopifyClient` (Admin API), the Files-upload
staged-upload flow already built for the logo, `createJobStore`/SSE
progress pattern, and the existing "Bağlan" connect step. Adds:

```
server/
  product-profile.js   AI vision analysis: photo + text -> structured
                        product profile (category + visual attributes)
  categories.js         The 7 fixed categories and their per-scene style
                        overrides (pure data + a lookup function)
  sales-images.js        Builds the 8 image-generation prompts from a
                        product profile + category rules, calls OpenAI
                        image generation, returns 8 image buffers
  sales-copy.js          AI-written copy for all 8 sections + CTA + draft
                        reviews, from the same product profile
  sales-page.js           Assembles body_html from the 8 (image url, copy)
                        pairs in fixed order
  studio-job-runner.js    Orchestrates: profile -> images -> copy ->
                        upload images -> assemble body_html -> create
                        product -> patch WhatsApp phone setting
  theme-template/
    snippets/whatsapp-button.liquid   (new, one-time addition)
    layout/theme.liquid                (modified: renders the snippet)
    config/settings_schema.json        (modified: adds `whatsapp_phone`)
public/
  studio.html / studio.js   Second form/tab: product intake, live
                            progress, generated image previews + download
                            links
```

`server/shopify.js` gets one addition: a generalized
`uploadImageFile(buffer, filename, mimeType) -> Promise<{ url: string }>`
that extends the existing logo-upload staged-upload flow to also poll
the created file until Shopify reports it `READY` and return its public
CDN URL (needed to embed `<img src>` in `body_html` — the
`shopify://shop_images/...` reference used for the logo only works
inside theme settings, not in arbitrary HTML).

## Data Flow

1. Owner fills the studio form (product name, photo, description,
   WhatsApp phone) and submits.
2. **Product profile:** a vision-capable AI call reads the photo + text
   and returns `{ category, colorPalette, material, form, keyFeatures[],
   useCase }`. `category` is forced to one of the 7 fixed values.
3. **8 images:** for each of the 8 fixed scene slots, the category's
   rules (if any) override that slot's scene brief; the profile's
   attributes are woven into an image-generation prompt; OpenAI image
   generation produces one image per slot.
4. **Copy:** one AI call (or one per section) produces title/body copy
   for all 8 sections plus a CTA and 2-3 draft testimonial lines, all in
   a consistent voice derived from the product profile.
5. **Upload:** each of the 8 images is uploaded via
   `uploadImageFile`, returning a CDN URL for each.
6. **Assemble:** `body_html` is built as 8 ordered
   `<img src="..."><h2>...</h2><p>...</p>` blocks (fixed order — hero,
   benefits, problem/solution, comparison, usage, authority, reviews,
   final CTA) plus the CTA block.
7. **Create product:** the product is created via the existing
   `createProduct` (Admin API), with `body_html` from step 6 and the
   owner's original uploaded photo as the actual product image
   (`images: [{ attachment: base64 }]`).
8. **WhatsApp:** the store's `whatsapp_phone` theme setting is patched to
   the submitted phone number (only if not already set for this store).
9. UI shows all 8 generated images with individual download links, plus
   a link to the created product.

## Error Handling

Same per-item resilience principle as the CSV mode: a single image or
copy-section failure does not abort the run — it's logged, a placeholder
note is left in that section, and the run continues so the owner gets a
mostly-complete page to fix rather than nothing.

## Testing

Same approach as the CSV-mode plan: pure logic (category rules lookup,
prompt building, body_html assembly) gets unit tests with no network
calls; the AI/image-generation/Admin-API integration is verified
end-to-end manually against a real store, since it isn't meaningfully
mockable.

## Sequencing

This sub-project's plan will be written now but its implementation
should not start until the CSV-mode plan's Task 9 (Express routes) is
complete and reviewed — this sub-project's `studio-job-runner.js` and
routes directly reuse `createShopifyClient`, `createJobStore`, and the
SSE progress pattern that Task 9 finishes building.
