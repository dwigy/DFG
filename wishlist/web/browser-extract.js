// Browser build of the extractor, used when the app is hosted as static files
// (e.g. GitHub Pages) with no server. Browsers can't read other sites' pages
// directly (CORS), so pages are fetched through public relay services:
//
//   1. Jina Reader renders the page in a real browser, so prices and photos
//      that stores add with JavaScript are present. Free, rate-limited.
//   2. Plain CORS relays as backups.
//   3. If every relay comes back blocked or incomplete, Jina's text version
//      of the page and Microlink's metadata fill in title, photo and price.
//
// With a private relay connected (relay/worker.js on Cloudflare), it goes
// first. Each relay is tried until one yields a complete item; otherwise the
// most complete result wins.
import { buildItem } from '../lib/build.js';
import { FetchError } from '../lib/url.js';
import { parsePrice, detectCurrency } from '../lib/extract.js';

const enc = encodeURIComponent;
const RELAYS = [
  { name: 'jina', url: (u) => `https://r.jina.ai/${u}`, headers: { 'X-Return-Format': 'html' }, rendered: true },
  { name: 'allorigins', url: (u) => `https://api.allorigins.win/raw?url=${enc(u)}` },
  { name: 'codetabs', url: (u) => `https://api.codetabs.com/v1/proxy/?quest=${enc(u)}` },
  // Free use is limited to localhost, so it's last.
  { name: 'corsproxy', url: (u) => `https://corsproxy.io/?url=${enc(u)}` },
];

const MAX_CHARS = 6 * 1024 * 1024;
const TOTAL_BUDGET_MS = 35000;

// The public relay that last produced a complete item is tried first next time.
let preferred = 'jina';

function ownRelay(relayUrl) {
  const base = relayUrl.replace(/\/+$/, '');
  return { name: 'your relay', url: (u) => `${base}/?url=${enc(u)}`, own: true };
}

async function viaRelay(relay, href, timeoutMs, accept) {
  const headers = { ...relay.headers, ...(relay.own && accept ? { Accept: accept } : {}) };
  const res = await fetch(relay.url(href), { headers, signal: AbortSignal.timeout(timeoutMs) });
  const body = (await res.text()).slice(0, MAX_CHARS);
  // Your relay reports where redirects ended (short links, region redirects).
  const finalUrl = res.headers.get('x-final-url');
  return { status: res.status, contentType: res.headers.get('content-type') || '', body, finalUrl };
}

// Fetcher bound to one relay. JSON requests (Shopify's product endpoint) skip
// the rendering relay, which would wrap the JSON in HTML.
function fetcherFor(relay, relays) {
  return async (input, { accept, timeoutMs = 20000 } = {}) => {
    const url = input instanceof URL ? input : new URL(input);
    if (!/^https?:$/.test(url.protocol)) throw new FetchError('Only http(s) links are supported', 400);
    const candidates = accept?.includes('json') && relay.rendered ? relays.filter((r) => !r.rendered) : [relay];
    let last;
    for (const r of candidates) {
      try {
        const { finalUrl, ...res } = await viaRelay(r, url.href, timeoutMs, accept);
        let resolved = url;
        try {
          if (finalUrl) resolved = new URL(finalUrl);
        } catch { /* keep the requested URL */ }
        last = { url: resolved, ...res };
        if (last.status < 400 && last.body) return last;
      } catch {
        // Relay down, slow, rate limited or refused: try the next candidate.
      }
    }
    if (last) return last;
    throw new FetchError("Couldn't reach the store", 502);
  };
}

function score(result) {
  if (!result || result.blocked) return 0;
  const i = result.item;
  return 1 + (i.price != null ? 4 : 0) + (i.image ? 4 : 0) + (i.sizes.length ? 1 : 0) + (i.colors.length ? 1 : 0) + (i.brand ? 0.5 : 0);
}

const complete = (r) => r && !r.blocked && r.item.price != null && r.item.image;

// ---------- last-resort sources ----------

const attr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function syntheticPage({ title, image, price, siteName, description }) {
  return `<html><head>
    ${title ? `<meta property="og:title" content="${attr(title)}">` : ''}
    ${image ? `<meta property="og:image" content="${attr(image)}">` : ''}
    ${siteName ? `<meta property="og:site_name" content="${attr(siteName)}">` : ''}
    ${description ? `<meta property="og:description" content="${attr(description)}">` : ''}
    ${price ? `<meta property="product:price:amount" content="${attr(price.amount)}"><meta property="product:price:currency" content="${attr(price.currency)}">` : ''}
  </head><body></body></html>`;
}

const PRICE_RE = /(?:US\$|C\$|A\$|[$£€¥₹])\s?\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{2})?|\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{2})?\s?(?:USD|EUR|GBP|CAD|AUD|€|£)/g;
const NOT_PRODUCT_PRICE = /(over|orders?|shipping|spend|off|save|gift card|credit|up to|from)\s*$/i;

// Jina's text version: "Title: …", "URL Source: …", then the page as Markdown.
export function parseReaderMarkdown(md) {
  const title = (md.match(/^Title:\s*(.+)$/m)?.[1] || '').split(/\s[|–—]\s/)[0].trim();
  const content = md.split(/^Markdown Content:\s*$/m)[1] || md;
  const images = [...content.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)/g)]
    .map((m) => m[1])
    .filter((src) => !/logo|icon|sprite|badge|flag|payment|placeholder|\.svg(\?|$)|1x1|pixel/i.test(src));
  // Prefer the first real price after the product name appears in the page body.
  const titleAt = title ? content.toLowerCase().indexOf(title.toLowerCase().slice(0, 30)) : -1;
  let price = null;
  for (const m of content.matchAll(PRICE_RE)) {
    if (titleAt > -1 && m.index < titleAt) continue;
    if (NOT_PRODUCT_PRICE.test(content.slice(Math.max(0, m.index - 30), m.index))) continue;
    const amount = parsePrice(m[0]);
    if (amount) {
      price = { amount, currency: detectCurrency(m[0]) || 'USD' };
      break;
    }
  }
  return { title, image: images[0] || '', price };
}

async function readerFallback(href) {
  try {
    const res = await fetch(`https://r.jina.ai/${href}`, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return null;
    const parsed = parseReaderMarkdown(await res.text());
    return parsed.title || parsed.image ? parsed : null;
  } catch {
    return null;
  }
}

async function microlinkFallback(href) {
  try {
    const res = await fetch(`https://api.microlink.io/?url=${enc(href)}`, { signal: AbortSignal.timeout(15000) });
    const json = await res.json();
    if (json.status !== 'success') return null;
    const d = json.data || {};
    return { title: d.title || '', image: d.image?.url || '', siteName: d.publisher || '', description: d.description || '' };
  } catch {
    return null;
  }
}

// ---------- entry point ----------

/**
 * @param {string} url
 * @param {{relayUrl?: string}} [opts] relayUrl: your Cloudflare relay, tried first
 */
export async function extractInBrowser(url, { relayUrl } = {}) {
  const started = Date.now();
  const i = Math.max(0, RELAYS.findIndex((r) => r.name === preferred));
  const publicOrder = [...RELAYS.slice(i), ...RELAYS.slice(0, i)];
  const order = relayUrl ? [ownRelay(relayUrl), ...publicOrder] : publicOrder;
  let best = null;

  for (const relay of order) {
    if (Date.now() - started > TOTAL_BUDGET_MS) break;
    try {
      const result = await buildItem(url, { fetchPage: fetcherFor(relay, order) });
      result.item.via = relay.name;
      if (score(result) > score(best) || !best) best = result;
      if (complete(result)) {
        if (!relay.own) preferred = relay.name;
        return result;
      }
    } catch (err) {
      if (err.status === 400) throw err; // bad link: no relay will help
    }
  }

  // Fill gaps from the text-only reader, then Microlink's metadata.
  const href = best?.item.url || url;
  for (const source of [readerFallback, microlinkFallback]) {
    if (complete(best) || Date.now() - started > TOTAL_BUDGET_MS + 20000) break;
    const found = await source(href);
    if (!found) continue;
    const page = syntheticPage(found);
    const fallback = await buildItem(href, {
      fetchPage: async (input) => ({ url: input instanceof URL ? input : new URL(input), status: 200, contentType: 'text/html', body: page }),
    }).catch(() => null);
    if (!fallback) continue;
    fallback.item.via = source === readerFallback ? 'jina-text' : 'microlink';
    if (!best || best.blocked) {
      best = fallback;
    } else {
      const item = best.item;
      if (item.price == null && fallback.item.price != null) {
        item.price = fallback.item.price;
        item.currency ||= fallback.item.currency;
      }
      if (!item.image && fallback.item.image) {
        item.image = fallback.item.image;
        item.images = [fallback.item.image, ...item.images];
      }
      item.via += `+${fallback.item.via}`;
    }
  }

  if (!best) throw new FetchError("Couldn't reach the store", 502);
  best.missing = ['price', 'image'].filter((k) => !best.item[k] && best.item[k] !== 0);
  if (best.blocked && (best.item.image || best.item.price != null)) best.blocked = false;
  return best;
}

/** Check a relay URL: resolves true when it answers for this site. */
export async function testRelay(relayUrl) {
  try {
    const res = await fetch(`${relayUrl.replace(/\/+$/, '')}/`, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    return res.ok && data.ok === true;
  } catch {
    return false;
  }
}
