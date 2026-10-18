import { test } from 'node:test';
import assert from 'node:assert/strict';

const { readSnapshot, bookmarkletCode } = await import('../public/bookmarklet.js');
const { extractFromHtml } = await import('../web/browser-extract.js');

// Same encoding the button uses on the store page.
async function encode(html) {
  const stream = new Blob([html]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const REI_SNAPSHOT = `<html><head>
  <meta property="og:title" content="Arc'teryx Gamma MX Hoody - Men's">
  <meta property="og:site_name" content="REI">
  <meta property="og:image" content="https://www.rei.com/media/product/gamma.jpg">
</head><body>
  <a class="product-brand" href="/b/arcteryx">Arc'teryx</a>
  <h1>Arc'teryx Gamma MX Hoody - Men's</h1>
  <span class="price-value" data-ui="sale-price">$400.00</span>
  <div class="color-swatches"><button aria-label="Dark Jade"></button><button aria-label="Black Sapphire"></button></div>
  <div class="size-selector"><button aria-label="Size S">S</button><button aria-label="Size M">M</button></div>
</body></html>`;

test('a snapshot survives the trip through the URL fragment', async () => {
  const url = 'https://www.rei.com/product/204056/arcteryx-gamma-mx-hoody-mens';
  const hash = `#import=${encodeURIComponent(url)}&z=${await encode(REI_SNAPSHOT)}`;
  const snap = await readSnapshot(hash);
  assert.equal(snap.url, url);
  assert.equal(snap.html, REI_SNAPSHOT);
});

test('a REI page read in the browser yields every field, without any network', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('no network should be needed');
  };
  try {
    const { item, blocked, missing } = await extractFromHtml('https://www.rei.com/product/204056/arcteryx-gamma-mx-hoody-mens', REI_SNAPSHOT);
    assert.equal(blocked, false);
    assert.deepEqual(missing, []);
    assert.equal(item.title, "Arc'teryx Gamma MX Hoody - Men's");
    assert.equal(item.brand, "Arc'teryx");
    assert.equal(item.store, 'REI');
    assert.equal(item.price, 400);
    assert.equal(item.image, 'https://www.rei.com/media/product/gamma.jpg');
    assert.deepEqual(item.sizes, ['S', 'M']);
    assert.deepEqual(item.colors, ['Dark Jade', 'Black Sapphire']);
    assert.equal(item.category, 'Clothing');
    assert.equal(item.via, 'your browser');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('the button code is a self-contained javascript: bookmark for this app', () => {
  const code = bookmarkletCode('https://dwigy.github.io/DFG/wishlist/public/');
  assert.ok(code.startsWith('javascript:'));
  const src = decodeURIComponent(code.slice('javascript:'.length));
  assert.ok(src.includes('"https://dwigy.github.io/DFG/wishlist/public/"'));
  assert.doesNotThrow(() => new Function(src));
  assert.ok(code.length < 6000, `bookmark is ${code.length} chars`);
});

test('a missing or broken snapshot falls back to just the link', async () => {
  assert.equal(await readSnapshot('#shop'), null);
  assert.deepEqual(await readSnapshot('#import=https%3A%2F%2Fwww.rei.com%2Fp&z=not-valid'), { url: 'https://www.rei.com/p', html: '' });
});
