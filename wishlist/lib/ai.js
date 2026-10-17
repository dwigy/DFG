// Optional Claude pass: reads the page text plus what the parsers found, fills
// gaps (price, sizes, colors) and picks a category and tags. Enabled when an
// Anthropic credential is configured; the app works without it.
import Anthropic from '@anthropic-ai/sdk';
import { CATEGORY_NAMES } from './categorize.js';

const MODEL = process.env.WISHLIST_MODEL || 'claude-opus-5-5';
const PAGE_TEXT_LIMIT = 30000;

export const aiEnabled = () =>
  process.env.WISHLIST_AI !== '0' &&
  Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.WISHLIST_AI === '1');

let client;
const getClient = () => (client ??= new Anthropic());

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'brand', 'price', 'currency', 'original_price', 'image_url', 'sizes', 'colors', 'category', 'subcategory', 'tags'],
  properties: {
    title: { type: 'string', description: 'Clean product name without store name or marketing suffixes' },
    brand: { type: 'string', description: 'Brand or maker, empty string if unknown' },
    price: { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'Current selling price as a number, null if not stated on the page' },
    currency: { type: 'string', description: 'ISO 4217 code, empty string if unknown' },
    original_price: { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'Pre-discount price if the item is on sale, else null' },
    image_url: { type: 'string', description: 'Best main product photo, copied exactly from the candidate list, or empty string' },
    sizes: { type: 'array', items: { type: 'string' }, description: 'Available size options, empty if the product has no sizes' },
    colors: { type: 'array', items: { type: 'string' }, description: 'Available color options, empty if none' },
    category: { type: 'string', enum: CATEGORY_NAMES },
    subcategory: { type: 'string', description: 'Specific product type, e.g. "Sneakers", "Headphones", "Dutch Oven"' },
    tags: { type: 'array', items: { type: 'string' }, description: '2-5 short sorting tags: type, style, material, occasion or recipient' },
  },
};

const SYSTEM = `You extract product details from online store pages for a personal wishlist app.
Use only facts present in the page content or parser output. Never guess a price: if no price is visible, return null.
Parser output comes from structured data on the page and is usually right; correct it only when the page text clearly disagrees.
Sizes and colors must be the purchasable options for this product, not site navigation or filters for other products.
Keep tags short (1-3 words, Title Case) and useful for sorting a wishlist.`;

/**
 * @param {object} args
 * @param {object} args.product  merged parser output
 * @param {string} args.text     visible page text
 * @param {boolean} args.blocked the store blocked the fetch, so text may be empty
 */
export async function enrichWithClaude({ product, text, blocked }) {
  const { description, images, ...parsed } = product;
  const truncated = text.length > PAGE_TEXT_LIMIT;
  const content = [
    `URL: ${product.url}`,
    blocked ? 'NOTE: The store blocked the page fetch. Work from the URL and parser output only; leave unknown fields empty.' : '',
    `Parser output:\n${JSON.stringify({ ...parsed, description: description?.slice(0, 300) }, null, 1)}`,
    `Candidate image URLs:\n${(images || []).slice(0, 12).join('\n') || '(none)'}`,
    text
      ? `Page text${truncated ? ` (first ${PAGE_TEXT_LIMIT} characters of ${text.length})` : ''}:\n${text.slice(0, PAGE_TEXT_LIMIT)}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content }],
    });
    if (response.stop_reason === 'refusal') {
      console.warn('[ai] declined:', response.stop_details?.category ?? 'unknown');
      return null;
    }
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock) return null;
    return JSON.parse(textBlock.text);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) console.warn('[ai] auth failed — check ANTHROPIC_API_KEY');
    else if (err instanceof Anthropic.RateLimitError) console.warn('[ai] rate limited, using parser results');
    else if (err instanceof Anthropic.APIError) console.warn(`[ai] API error ${err.status}: ${err.message}`);
    else console.warn('[ai] failed:', err.message);
    return null;
  }
}

const STRONG_SOURCES = new Set(['shopify', 'json-ld', 'amazon', 'microdata']);

/** Merge Claude's answer into the parser result, trusting structured data first. */
export function mergeAi(product, ai) {
  if (!ai) return product;
  const strong = product.sources.some((s) => STRONG_SOURCES.has(s));
  const out = { ...product, sources: [...product.sources, 'claude'] };
  if (!strong || !out.title || out.title.length > 120) out.title = ai.title || out.title;
  out.brand ||= ai.brand;
  if (out.price == null || (!strong && ai.price != null)) out.price = ai.price ?? out.price;
  out.currency ||= ai.currency;
  if (out.originalPrice == null && ai.original_price && out.price && ai.original_price > out.price) out.originalPrice = ai.original_price;
  // Only accept images that actually appeared on the page.
  if (ai.image_url && product.images.includes(ai.image_url) && (!out.image || !strong)) out.image = ai.image_url;
  if (!strong || !out.sizes.length) out.sizes = ai.sizes.length ? ai.sizes : out.sizes;
  if (!strong || !out.colors.length) out.colors = ai.colors.length ? ai.colors : out.colors;
  return out;
}
