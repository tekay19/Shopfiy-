// server/sales-page.js
const SECTION_ORDER = [
  'hero', 'benefits', 'problem_solution', 'comparison', 'usage', 'authority', 'social_proof', 'final_cta',
];

function buildSalesPageHtml({ images, narrative }) {
  const imageUrlByKey = new Map(images.map((img) => [img.key, img.url]));
  const parts = [];

  for (const key of SECTION_ORDER) {
    const rawSection = narrative[key];
    const hasUsableSection = rawSection && typeof rawSection.title === 'string' && typeof rawSection.body === 'string';
    const section = hasUsableSection ? rawSection : { title: 'İçerik oluşturulamadı.', body: '<p>İçerik oluşturulamadı.</p>' };
    const imageUrl = imageUrlByKey.get(key);

    parts.push('<div class="ai-sales-section">');
    if (imageUrl) parts.push(`<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(section.title)}">`);
    parts.push(`<h2>${escapeHtml(section.title)}</h2>`);
    parts.push(section.body);
    if (key === 'final_cta' && section.ctaLabel) {
      parts.push(`<p><a href="#" class="ai-sales-cta-button">${escapeHtml(section.ctaLabel)}</a></p>`);
    }
    parts.push('</div>');
  }

  if (Array.isArray(narrative.reviews) && narrative.reviews.length) {
    parts.push('<div class="ai-sales-reviews">');
    parts.push('<h2>Müşteri Yorumları</h2>');
    for (const review of narrative.reviews) {
      parts.push(`<blockquote><p>${escapeHtml(review.text)}</p><cite>${escapeHtml(review.name)}</cite></blockquote>`);
    }
    parts.push('</div>');
  }

  return parts.join('\n');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { buildSalesPageHtml, SECTION_ORDER };
