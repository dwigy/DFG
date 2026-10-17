// Shared pipeline: extract, categorize, optionally enrich. No Node-only imports,
// so the browser build (static hosting) runs the exact same code.
import { extractProduct, pageText } from './extract.js';
import { categorize, priceBand } from './categorize.js';

/**
 * Read a product page and file it under a category.
 * @param {string} url
 * @param {object} opts
 * @param {Function} opts.fetchPage  page fetcher (see extractProduct)
 * @param {Function} [opts.enrich]   optional ({product, text, blocked}) => AI answer or null
 * @param {Function} [opts.merge]    merges that answer into the parser result
 */
export async function buildItem(url, { fetchPage, enrich, merge }) {
  const { product, $, blocked } = await extractProduct(url, { fetchPage });
  let item = product;
  const rules = categorize(product);
  let category = rules.category;
  let subcategory = rules.subcategory;
  let tags = rules.tags;

  if (enrich) {
    const ai = await enrich({ product, text: blocked ? '' : pageText($), blocked });
    if (ai) {
      item = merge(product, ai);
      category = ai.category || category;
      subcategory = ai.subcategory || subcategory;
      // Keep the rule-derived facts (sale, brand, price band, gender) alongside Claude's descriptive tags.
      const facts = rules.tags.filter((t) => /^(On Sale|Kids|Women|Men|Unisex)$/.test(t) || t === product.brand);
      tags = [...ai.tags, ...facts];
      if (item.price != null) tags.push(priceBand(item.price));
      tags = tags.filter((t, i) => t && tags.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i);
    }
  }

  const missing = ['price', 'image'].filter((k) => !item[k]);
  return {
    item: { ...item, category, subcategory, tags },
    blocked,
    missing,
  };
}
