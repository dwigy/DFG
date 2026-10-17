import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const { extractInBrowser, parseReaderMarkdown } = await import('../web/browser-extract.js');

const PRODUCT = `<html><head>
  <meta property="og:site_name" content="Arc'teryx">
  <script type="application/ld+json">${JSON.stringify({
    '@type': 'Product', name: "Gamma MX Hoody Men's", brand: { name: "Arc'teryx" },
    image: 'https://images.example.com/gamma.jpg',
    offers: { price: '400.00', priceCurrency: 'USD' },
    hasVariant: [{ size: 'S', color: 'Dark Jade' }, { size: 'M', color: 'Black' }],
  })}</script></head><body></body></html>`;

const CAPTCHA = '<html><head><title>Access Denied</title></head><body>Please verify you are human (captcha)</body></html>';

const READER_MD = `Title: Gamma MX Hoody Men's | Arc'teryx

URL Source: https://www.arcteryx.com/us/en/shop/mens/gamma-mx-hoody

Markdown Content:
Free shipping on orders over $50
![Image 1: Arc'teryx logo](https://www.arcteryx.com/logo.svg)
# Gamma MX Hoody Men's
$400.00
![Image 2: Gamma MX Hoody](https://images.arcteryx.com/gamma-mx-hoody.jpg)
`;

let routes;
let calls;
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  routes = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, headers: init.headers || {} });
    for (const [match, respond] of routes) {
      if (match(url, init.headers || {})) {
        const r = await respond(url);
        if (r instanceof Error) throw r;
        return new Response(r.body, { status: r.status ?? 200, headers: { 'content-type': r.type || 'text/html' } });
      }
    }
    throw new TypeError('Failed to fetch');
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const isJinaHtml = (u, h) => u.startsWith('https://r.jina.ai/') && h['X-Return-Format'] === 'html';
const isJinaText = (u, h) => u.startsWith('https://r.jina.ai/') && !h['X-Return-Format'];

test('skips a relay that returns a block page and uses the next one', async () => {
  routes = [
    [isJinaHtml, () => ({ body: CAPTCHA })],
    [(u) => u.includes('allorigins'), () => ({ body: PRODUCT })],
  ];
  const { item, blocked } = await extractInBrowser('https://www.arcteryx.com/us/en/shop/mens/gamma-mx-hoody');
  assert.equal(blocked, false);
  assert.equal(item.title, "Gamma MX Hoody Men's");
  assert.equal(item.price, 400);
  assert.equal(item.image, 'https://images.example.com/gamma.jpg');
  assert.deepEqual(item.sizes, ['S', 'M']);
  assert.equal(item.via, 'allorigins');
  assert.equal(item.category, 'Clothing');
});

test('when every relay fails, the text reader still gets title, photo and price', async () => {
  routes = [
    [isJinaHtml, () => new TypeError('CORS')],
    [(u) => u.includes('allorigins'), () => ({ status: 403, body: 'nope' })],
    [(u) => u.includes('codetabs'), () => ({ status: 500, body: 'err' })],
    [(u) => u.includes('corsproxy'), () => ({ status: 403, body: 'localhost only' })],
    [isJinaText, () => ({ body: READER_MD, type: 'text/plain' })],
  ];
  const { item, blocked, missing } = await extractInBrowser('https://www.arcteryx.com/us/en/shop/mens/gamma-mx-hoody');
  assert.equal(blocked, false);
  assert.equal(item.title, "Gamma MX Hoody Men's");
  assert.equal(item.price, 400, 'ignores "orders over $50"');
  assert.equal(item.image, 'https://images.arcteryx.com/gamma-mx-hoody.jpg', 'skips the logo');
  assert.equal(item.via, 'jina-text');
  assert.deepEqual(missing, []);
});

test('Microlink fills the photo when nothing else can', async () => {
  routes = [
    [(u) => u.includes('api.microlink.io'), () => ({ type: 'application/json', body: JSON.stringify({ status: 'success', data: { title: 'Aeron Chair', image: { url: 'https://cdn.example.com/aeron.jpg' }, publisher: 'Herman Miller' } }) })],
  ];
  const { item, missing } = await extractInBrowser('https://store.example.com/aeron-chair');
  assert.equal(item.title, 'Aeron Chair');
  assert.equal(item.image, 'https://cdn.example.com/aeron.jpg');
  assert.equal(item.store, 'Herman Miller');
  assert.deepEqual(missing, ['price']);
});

test("Shopify's JSON endpoint is never sent through the rendering relay", async () => {
  const shopifyPage = '<html><head><script>Shopify={}</script></head><body></body></html>';
  const productJs = JSON.stringify({ title: 'Tree Runner', vendor: 'Allbirds', price: 9800, featured_image: '//cdn.shopify.com/runner.jpg', options: [{ name: 'Size', values: ['9', '10'] }], variants: [{ id: 1, option1: '9', price: 9800 }] });
  routes = [
    [(u, h) => isJinaHtml(u, h) && !u.endsWith('.js'), () => ({ body: shopifyPage })],
    [(u) => u.includes('allorigins') && u.includes('.js'), () => ({ type: 'application/json', body: productJs })],
    [(u) => u.includes('allorigins'), () => ({ body: shopifyPage })],
  ];
  const { item } = await extractInBrowser('https://www.allbirds.com/products/tree-runner');
  assert.equal(item.price, 98);
  assert.deepEqual(item.sizes, ['9', '10']);
  assert.ok(!calls.some((c) => c.url.includes('r.jina.ai') && c.url.endsWith('.js')));
});

test('a bad link fails fast without trying every relay', async () => {
  await assert.rejects(extractInBrowser('ftp://example.com/x'), /http/);
});

test('parseReaderMarkdown ignores promo prices before the product name', () => {
  const r = parseReaderMarkdown(READER_MD);
  assert.equal(r.price.amount, 400);
  assert.equal(r.price.currency, 'USD');
});
