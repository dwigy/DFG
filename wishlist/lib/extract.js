// Pulls product details out of a store page. Strategies run from most to least
// reliable (store APIs, schema.org data, meta tags, then DOM heuristics) and the
// first good value for each field wins.
import * as cheerio from 'cheerio';
import { safeFetch, normalizeUrl, FetchError } from './fetchPage.js';

const CURRENCY_SYMBOLS = [
  ['C$', 'CAD'], ['CA$', 'CAD'], ['A$', 'AUD'], ['AU$', 'AUD'], ['NZ$', 'NZD'], ['HK$', 'HKD'],
  ['R$', 'BRL'], ['US$', 'USD'], ['$', 'USD'], ['£', 'GBP'], ['€', 'EUR'], ['¥', 'JPY'],
  ['₹', 'INR'], ['₩', 'KRW'], ['₽', 'RUB'], ['₺', 'TRY'], ['zł', 'PLN'], ['kr', 'SEK'], ['CHF', 'CHF'],
];

const SIZE_TOKEN =
  /^(?:XXS|XS|S|M|L|XL|XXL|XXXL|[2-6]XL|[2-6]X|OS|O\/S|One Size|Petite|Tall|Regular|Small|Medium|Large|X-Large|XX-Large|(?:US|UK|EU|IT|FR|JP)\s?\d{1,2}(?:[.,]5)?|\d{1,2}(?:[.,]5)?(?:\s?(?:W|M|Y|T|C|K))?|\d{2}\s?[WwXx/]\s?\d{2}|\d{2}[A-H]{1,3}|\d{1,3}\s?(?:cm|mm|in|ml|oz|g|kg|L|"|ft))$/i;

const PLACEHOLDER = /^(?:select|choose|pick|please|--|-|size$|sizes$|colou?r$|colou?rs$|size guide|find your size|view size|options?$)/i;

// ---------- small helpers ----------

const clean = (s) => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim());

const decodeEntities = (s) =>
  clean(s).replace(/&(amp|quot|#39|apos|lt|gt|nbsp);/g, (m, e) => ({ amp: '&', quot: '"', '#39': "'", apos: "'", lt: '<', gt: '>', nbsp: ' ' })[e]);

function cleanOption(s) {
  return clean(s)
    .replace(/\s*[-–(]\s*(sold out|out of stock|unavailable|notify me|low stock|only \d+ left|coming soon)\)?\s*$/i, '')
    .replace(/\s*[-–]\s*[$£€]\s?[\d.,]+\s*$/, '')
    .trim();
}

function uniq(list) {
  const seen = new Set();
  const out = [];
  for (const v of list) {
    const val = cleanOption(v);
    const key = val.toLowerCase();
    if (!val || PLACEHOLDER.test(val) || val.length > 40 || seen.has(key)) continue;
    seen.add(key);
    out.push(val);
  }
  return out;
}

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

export function parsePrice(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  const text = String(value);
  const m = text.match(/\d[\d.,\s ']*/);
  if (!m) return null;
  let num = m[0].replace(/[\s ']/g, '').replace(/[.,]$/, '');
  const lastDot = num.lastIndexOf('.');
  const lastComma = num.lastIndexOf(',');
  if (lastDot > -1 && lastComma > -1) {
    const dec = lastDot > lastComma ? '.' : ',';
    num = num.replace(dec === '.' ? /,/g : /\./g, '').replace(',', '.');
  } else if (lastComma > -1) {
    // "1,299" is thousands; "12,99" is a decimal comma.
    num = /,\d{1,2}$/.test(num) && (num.match(/,/g) || []).length === 1 ? num.replace(',', '.') : num.replace(/,/g, '');
  } else if ((num.match(/\./g) || []).length > 1) {
    num = num.replace(/\.(?=\d{3}(\.|$))/g, '');
  }
  const n = parseFloat(num);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function detectCurrency(text) {
  if (!text) return '';
  const t = String(text);
  const iso = t.match(/\b(USD|EUR|GBP|CAD|AUD|NZD|JPY|INR|CHF|SEK|NOK|DKK|PLN|BRL|MXN|HKD|SGD|KRW|ZAR|TRY)\b/);
  if (iso) return iso[1];
  for (const [sym, code] of CURRENCY_SYMBOLS) if (t.includes(sym)) return code;
  return '';
}

function absUrl(src, base) {
  if (!src || typeof src !== 'string') return '';
  const s = src.trim().split(/\s+/)[0];
  if (!s || s.startsWith('data:')) return '';
  // Protocol-relative CDN links: always use https so they load on an https app.
  if (s.startsWith('//')) return `https:${s}`;
  try {
    return new URL(s, base).href;
  } catch {
    return '';
  }
}

function titleFromSlug(url) {
  const parts = url.pathname.split('/').filter(Boolean);
  const slug = [...parts].reverse().find((p) => /[a-z]{3,}.*-.*[a-z]/i.test(p) && !/^(dp|p|product|products|item|ip)$/i.test(p));
  if (!slug) return '';
  return decodeURIComponent(slug)
    .replace(/\.(html?|aspx?|php)$/i, '')
    .replace(/[-_+]+/g, ' ')
    .replace(/\b[a-z0-9]*\d[a-z0-9]{5,}\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function siteName(url) {
  if (/^[\d.:[\]]+$/.test(url.hostname)) return url.hostname;
  const host = url.hostname.replace(/^(www|m|shop|store|us|en)\./, '');
  const base = host.split('.').slice(0, -1).join('.') || host;
  const name = base.split('.').pop();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ---------- strategy: Shopify product JSON ----------

async function fromShopify(url, html) {
  const looksShopify = /\/products\/[^/]+/.test(url.pathname) && (!html || /shopify/i.test(html));
  if (!looksShopify) return null;
  const handlePath = url.pathname.match(/^(.*\/products\/[^/?#]+)/)[1].replace(/\.(js|json)$/, '');
  try {
    const res = await safeFetch(new URL(`${handlePath}.js`, url), { accept: 'application/json', timeoutMs: 8000 });
    if (res.status !== 200) return null;
    const p = JSON.parse(res.body);
    if (!p || !p.title) return null;

    const variantId = url.searchParams.get('variant');
    const variant = (p.variants || []).find((v) => String(v.id) === variantId) || (p.variants || [])[0];
    const options = (p.options || []).map((o, i) =>
      typeof o === 'string'
        ? { name: o, values: (p.variants || []).map((v) => v[`option${i + 1}`]) }
        : { name: o.name, values: o.values },
    );
    const pick = (re) => options.filter((o) => re.test(o.name)).flatMap((o) => o.values);
    const cents = (v) => (typeof v === 'number' ? v / 100 : parsePrice(v));
    const price = cents(variant?.price ?? p.price);
    const compare = cents(variant?.compare_at_price ?? p.compare_at_price);

    const selected = {};
    if (variant) {
      options.forEach((o, i) => {
        const val = variant[`option${i + 1}`];
        if (/size/i.test(o.name)) selected.size = val;
        if (/colou?r|shade|finish/i.test(o.name)) selected.color = val;
      });
    }
    return {
      source: 'shopify',
      title: p.title,
      brand: p.vendor,
      description: cheerio.load(p.description || '').text(),
      price,
      originalPrice: compare && price && compare > price ? compare : null,
      images: [variant?.featured_image?.src, p.featured_image, ...(p.images || [])].map((s) => absUrl(s, url)),
      sizes: pick(/size|length|waist|fit/i),
      colors: pick(/colou?r|shade|finish|pattern/i),
      selectedSize: options.some((o) => /size/i.test(o.name)) ? selected.size : undefined,
      selectedColor: selected.color,
      productType: p.type,
      keywords: Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(','),
      inStock: variant ? variant.available !== false : undefined,
    };
  } catch {
    return null;
  }
}

// ---------- strategy: schema.org JSON-LD ----------

function collectJsonLd($) {
  const nodes = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    nodes.push(node);
    if (node['@graph']) walk(node['@graph']);
    if (node.mainEntity) walk(node.mainEntity);
    if (node.itemListElement && /ItemList/i.test(asArray(node['@type']).join())) walk(node.itemListElement);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      walk(JSON.parse(raw));
    } catch {
      try {
        // Some stores emit trailing commas or raw newlines inside strings.
        walk(JSON.parse(raw.replace(/,\s*([}\]])/g, '$1').replace(/[\r\n\t]+/g, ' ')));
      } catch {
        /* unparseable block */
      }
    }
  });
  return nodes;
}

const typeIs = (node, re) => asArray(node['@type']).some((t) => re.test(String(t)));

function ldImages(img, base) {
  return asArray(img).flatMap((i) => (typeof i === 'string' ? [i] : [i?.contentUrl, i?.url, ...(asArray(i?.thumbnail).map((t) => t?.url))])).map((s) => absUrl(s, base));
}

function ldName(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return ldName(v[0]);
  return v.name || v['@value'] || '';
}

function ldOffers(offers) {
  const list = asArray(offers).flatMap((o) => (o && o.offers ? asArray(o.offers) : [o])).filter(Boolean);
  for (const o of list) {
    const spec = asArray(o.priceSpecification)[0];
    const price = parsePrice(o.price ?? o.lowPrice ?? spec?.price);
    if (price) {
      return {
        price,
        currency: o.priceCurrency || spec?.priceCurrency || '',
        inStock: o.availability ? !/OutOfStock|SoldOut|Discontinued/i.test(o.availability) : undefined,
        listPrice: parsePrice(asArray(o.priceSpecification).find((s) => /ListPrice|StrikethroughPrice/i.test(s?.priceType || ''))?.price),
      };
    }
  }
  return {};
}

function fromJsonLd($, url) {
  const nodes = collectJsonLd($);
  const product =
    nodes.find((n) => typeIs(n, /^ProductGroup$/)) ||
    nodes.find((n) => typeIs(n, /Product$/) && (n.offers || n.image)) ||
    nodes.find((n) => typeIs(n, /Product/));
  const crumbs = nodes.find((n) => typeIs(n, /BreadcrumbList/));
  const breadcrumbs = crumbs
    ? asArray(crumbs.itemListElement)
        .sort((a, b) => (a.position || 0) - (b.position || 0))
        .map((li) => ldName(li.item) || li.name)
        .filter(Boolean)
    : [];
  if (!product) return breadcrumbs.length ? { source: 'json-ld', breadcrumbs } : null;

  const variants = asArray(product.hasVariant);
  const offer = ldOffers(product.offers) ;
  const variantOffer = !offer.price && variants.length ? ldOffers(variants.map((v) => v.offers)) : {};
  const props = asArray(product.additionalProperty);
  const prop = (re) => props.filter((p) => re.test(p?.name || '')).map((p) => p.value);

  return {
    source: 'json-ld',
    title: decodeEntities(product.name),
    brand: decodeEntities(ldName(product.brand) || ldName(product.manufacturer)),
    description: decodeEntities(product.description),
    price: offer.price || variantOffer.price,
    currency: offer.currency || variantOffer.currency,
    originalPrice: offer.listPrice && offer.price && offer.listPrice > offer.price ? offer.listPrice : null,
    inStock: offer.inStock ?? variantOffer.inStock,
    images: [...ldImages(product.image, url), ...variants.flatMap((v) => ldImages(v.image, url))],
    colors: [...asArray(product.color), ...variants.map((v) => v.color), ...prop(/colou?r/i)].map(ldName),
    sizes: [...asArray(product.size), ...variants.map((v) => v.size), ...prop(/^size/i)].map(ldName),
    productType: [ldName(product.category)].filter(Boolean).join(' > '),
    breadcrumbs,
  };
}

// ---------- strategy: microdata ----------

function fromMicrodata($, url) {
  const scope = $('[itemtype*="schema.org/Product" i]').first();
  if (!scope.length) return null;
  const prop = (name) => {
    const el = scope.find(`[itemprop="${name}"]`).first();
    if (!el.length) return '';
    return el.attr('content') || el.attr('href') || el.attr('src') || el.text();
  };
  return {
    source: 'microdata',
    title: clean(prop('name')),
    brand: clean(scope.find('[itemprop="brand"] [itemprop="name"]').attr('content') || prop('brand')),
    price: parsePrice(prop('price') || prop('lowPrice')),
    currency: clean(prop('priceCurrency')),
    images: scope.find('[itemprop="image"]').map((_, el) => absUrl($(el).attr('content') || $(el).attr('src') || $(el).attr('href'), url)).get(),
    colors: scope.find('[itemprop="color"]').map((_, el) => $(el).attr('content') || $(el).text()).get(),
  };
}

// ---------- strategy: Open Graph / meta tags ----------

function fromMeta($, url) {
  const meta = (...names) => {
    for (const n of names) {
      const v = $(`meta[property="${n}"], meta[name="${n}"], meta[itemprop="${n}"]`).first().attr('content');
      if (v && clean(v)) return clean(v);
    }
    return '';
  };
  const priceText = meta('product:price:amount', 'og:price:amount', 'product:sale_price:amount', 'twitter:data1', 'price');
  return {
    source: 'meta',
    title: meta('og:title', 'twitter:title') || clean($('title').first().text()).split(/\s[|–—-]\s/)[0],
    store: meta('og:site_name', 'application-name'),
    brand: meta('product:brand', 'og:brand', 'brand'),
    description: meta('og:description', 'description', 'twitter:description'),
    price: parsePrice(priceText),
    currency: meta('product:price:currency', 'og:price:currency') || detectCurrency(priceText),
    originalPrice: parsePrice(meta('product:original_price:amount')),
    images: [
      meta('og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'),
      $('link[rel="image_src"]').attr('href'),
    ].map((s) => absUrl(s, url)),
    colors: [meta('product:color')],
    sizes: [meta('product:size')],
    productType: meta('product:category', 'og:product:category'),
  };
}

// ---------- strategy: site adapters ----------

function fromAmazon($, url) {
  if (!/(^|\.)amazon\./i.test(url.hostname)) return null;
  const dyn = $('#landingImage').attr('data-a-dynamic-image');
  let dynImages = [];
  try {
    dynImages = dyn ? Object.keys(JSON.parse(dyn)) : [];
  } catch { /* ignore */ }
  const priceText =
    $('#corePrice_feature_div .a-offscreen').first().text() ||
    $('#corePriceDisplay_desktop_feature_div .a-offscreen').first().text() ||
    $('.a-price .a-offscreen').first().text() ||
    $('#priceblock_ourprice, #priceblock_dealprice').first().text();
  return {
    source: 'amazon',
    title: clean($('#productTitle').text()),
    brand: clean($('#bylineInfo').text()).replace(/^(Visit the|Brand:)\s*/i, '').replace(/\s*Store$/i, ''),
    price: parsePrice(priceText),
    currency: detectCurrency(priceText),
    originalPrice: parsePrice($('.basisPrice .a-offscreen, .a-text-price .a-offscreen').first().text()),
    images: [$('#landingImage').attr('data-old-hires'), ...dynImages, $('#imgBlkFront').attr('src')].map((s) => absUrl(s, url)),
    sizes: [
      ...$('#native_dropdown_selected_size_name option').map((_, o) => $(o).text()).get(),
      ...$('#variation_size_name li, #inline-twister-expander-content-size_name li').map((_, li) => $(li).attr('title')?.replace(/^Click to select\s*/i, '') || $(li).text()).get(),
    ],
    colors: $('#variation_color_name li img, #inline-twister-expander-content-color_name li img').map((_, img) => $(img).attr('alt')).get(),
    breadcrumbs: $('#wayfinding-breadcrumbs_feature_div li a').map((_, a) => clean($(a).text())).get(),
  };
}

// ---------- strategy: generic DOM heuristics ----------

function optionsNear($, re) {
  const values = [];
  $('select').each((_, sel) => {
    const $sel = $(sel);
    const id = $sel.attr('id');
    const label = [
      $sel.attr('name'), id, $sel.attr('aria-label'), $sel.attr('data-option-name'), $sel.attr('class'),
      id ? $(`label[for="${id}"]`).text() : '',
      $sel.closest('fieldset, [class*="option" i], [class*="variant" i], div').first().find('label, legend').first().text(),
    ].join(' ');
    if (re.test(label)) values.push(...$sel.find('option').map((_, o) => $(o).text()).get());
  });
  $('fieldset').each((_, fs) => {
    if (re.test($(fs).find('legend').first().text())) {
      values.push(...$(fs).find('label').map((_, l) => $(l).attr('aria-label') || $(l).text()).get());
    }
  });
  return values;
}

function fromHeuristics($, url) {
  const sizeContainers = $('[class*="size" i], [id*="size" i], [data-testid*="size" i]').not('select, option, html, body').slice(0, 20);
  const sizeButtons = sizeContainers
    .find('button, li, label, a, span, input[type="radio"]')
    .map((_, el) => clean($(el).attr('aria-label') || $(el).attr('data-value') || $(el).attr('value') || $(el).text()))
    .get()
    .map((s) => s.replace(/^size[:\s]*/i, ''))
    .filter((s) => SIZE_TOKEN.test(s));

  const colorSwatches = $('[class*="color" i], [class*="colour" i], [class*="swatch" i], [id*="color" i]')
    .not('html, body')
    .slice(0, 20)
    .find('[aria-label], [title], [data-color], img[alt]')
    .map((_, el) => clean($(el).attr('data-color') || $(el).attr('aria-label') || $(el).attr('title') || $(el).attr('alt')))
    .get()
    .map((s) => s.replace(/^(colou?r|select colou?r)[:\s]*/i, '').replace(/\s*(selected|swatch)$/i, ''))
    .filter((s) => s.length > 1 && s.length <= 30 && !/\d{3,}|http|select|close|zoom|image/i.test(s));

  const priceEl = $('[class*="price" i]:not([class*="old" i]):not([class*="was" i]):not([class*="compare" i]), [data-price], [id*="price" i]')
    .filter((_, el) => /[\d]/.test($(el).text()) && $(el).text().length < 40)
    .first();
  const priceText = priceEl.attr('data-price') || priceEl.text();

  const mainImg = $('img')
    .filter((_, el) => /product|gallery|hero|main|zoom|pdp/i.test(`${$(el).attr('class')} ${$(el).attr('id')} ${$(el).parent().attr('class')}`))
    .map((_, el) => absUrl($(el).attr('data-zoom-image') || $(el).attr('data-src') || $(el).attr('src') || $(el).attr('srcset'), url))
    .get();

  return {
    source: 'heuristics',
    title: clean($('h1').first().text()),
    price: parsePrice(priceText),
    currency: detectCurrency(priceText),
    images: mainImg,
    sizes: [...optionsNear($, /\bsizes?\b/i), ...sizeButtons],
    colors: [...optionsNear($, /\bcolou?rs?\b|\bshade\b/i), ...colorSwatches],
    breadcrumbs: $('nav[aria-label*="breadcrumb" i] a, [class*="breadcrumb" i] a')
      .map((_, a) => clean($(a).text()))
      .get()
      .filter((t) => t && t.length < 40),
  };
}

// ---------- merge ----------

function merge(parts, url) {
  const first = (key) => {
    for (const p of parts) {
      const v = p?.[key];
      if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) return v;
    }
    return undefined;
  };
  const firstList = (key) => {
    for (const p of parts) {
      const list = uniq(asArray(p?.[key]).filter((v) => typeof v === 'string'));
      if (list.length) return list;
    }
    return [];
  };
  const images = [];
  for (const p of parts) {
    for (const src of asArray(p?.images)) {
      if (src && /^https?:/.test(src) && !images.includes(src) && !/sprite|logo|icon|placeholder|blank|pixel|1x1/i.test(src)) images.push(src);
    }
  }
  const price = first('price') ?? null;
  const originalPrice = first('originalPrice') ?? null;
  return {
    url: url.href,
    domain: url.hostname.replace(/^www\./, ''),
    store: first('store') || siteName(url),
    title: first('title') || titleFromSlug(url) || siteName(url),
    brand: first('brand') || '',
    description: (first('description') || '').slice(0, 600),
    price,
    currency: (first('currency') || '').toUpperCase().slice(0, 3) || '',
    originalPrice: originalPrice && price && originalPrice > price ? originalPrice : null,
    image: images[0] || '',
    images: images.slice(0, 12),
    sizes: firstList('sizes').slice(0, 40),
    colors: firstList('colors').slice(0, 40),
    selectedSize: first('selectedSize') || '',
    selectedColor: first('selectedColor') || '',
    inStock: first('inStock'),
    breadcrumbs: firstList('breadcrumbs').filter((b) => !/^(home|shop|all|products?)$/i.test(b)),
    productType: first('productType') || '',
    keywords: uniq(asArray(first('keywords'))).slice(0, 20),
    sources: parts.filter(Boolean).map((p) => p.source),
  };
}

export function pageText($) {
  const $c = cheerio.load($.html());
  $c('script, style, noscript, svg, iframe, header nav, footer, [aria-hidden="true"]').remove();
  return clean($c('main').text() || $c('body').text());
}

const BLOCK_SIGNS = /captcha|are you a robot|access denied|request blocked|px-captcha|cf-chl|verify you are human|unusual traffic/i;

/**
 * Extract product info from a URL.
 * Returns { product, html, blocked, $ } — html/$ let callers run extra passes.
 */
export async function extractProduct(input) {
  const url = normalizeUrl(input);
  let res;
  let fetchError;
  try {
    res = await safeFetch(url);
  } catch (err) {
    if (err instanceof FetchError && err.status === 400) throw err;
    fetchError = err;
  }
  const finalUrl = res?.url || url;
  const html = res && /html|xml|text\/plain|^$/i.test(res.contentType) ? res.body : '';
  const $ = cheerio.load(html || '<html></html>');
  const blocked = !res || res.status >= 400 || (html.length < 200000 && BLOCK_SIGNS.test(html) && !$('script[type="application/ld+json"]').length);

  const shopify = await fromShopify(finalUrl, html);
  const parts = blocked && !shopify
    ? [fromMeta($, finalUrl)]
    : [shopify, fromJsonLd($, finalUrl), fromAmazon($, finalUrl), fromMicrodata($, finalUrl), fromMeta($, finalUrl), fromHeuristics($, finalUrl)];

  const product = merge(parts, finalUrl);
  if (blocked && !shopify) {
    // Block pages often carry a generic title; prefer the URL slug.
    const slug = titleFromSlug(finalUrl);
    if (slug && (!product.title || BLOCK_SIGNS.test(product.title) || product.title === product.store)) product.title = slug;
  }
  return { product, $, blocked: blocked && !shopify, fetchError: fetchError?.message };
}
