import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.ALLOW_PRIVATE_HOSTS = '1';
process.env.WISHLIST_AI = '0';
// Tests hit 127.0.0.1 directly, never through an outbound proxy.
delete process.env.NODE_USE_ENV_PROXY;

const { buildItem } = await import('../server.js');
const { parsePrice } = await import('../lib/extract.js');
const { normalizeUrl } = await import('../lib/fetchPage.js');

const PAGES = {
  '/products/tree-runner': `<!doctype html><html><head>
    <title>Men's Tree Runner – Allbirds</title>
    <meta property="og:site_name" content="Allbirds">
    <meta property="og:price:currency" content="USD">
    <script>window.Shopify = {shop: "allbirds.myshopify.com"};</script>
    </head><body><h1>Men's Tree Runner</h1></body></html>`,

  '/products/tree-runner.js': JSON.stringify({
    title: "Men's Tree Runner",
    vendor: 'Allbirds',
    type: 'Shoes',
    tags: ['mens', 'sneakers'],
    price: 9800,
    compare_at_price: 11000,
    featured_image: '//cdn.shopify.com/s/files/runner.jpg',
    images: ['//cdn.shopify.com/s/files/runner.jpg', '//cdn.shopify.com/s/files/runner-side.jpg'],
    options: [
      { name: 'Color', position: 1, values: ['Natural White', 'Jet Black'] },
      { name: 'Size', position: 2, values: ['8', '9', '10', '11'] },
    ],
    variants: [{ id: 1, option1: 'Natural White', option2: '8', price: 9800, compare_at_price: 11000, available: true }],
  }),

  '/dress-123.html': `<!doctype html><html><head>
    <title>Linen Midi Dress | Shop</title>
    <script type="application/ld+json">{
      "@context": "https://schema.org",
      "@graph": [
        {"@type": "BreadcrumbList", "itemListElement": [
          {"@type": "ListItem", "position": 1, "name": "Home"},
          {"@type": "ListItem", "position": 2, "name": "Women"},
          {"@type": "ListItem", "position": 3, "name": "Dresses"}]},
        {"@type": "ProductGroup", "name": "Linen Midi Dress", "brand": {"@type": "Brand", "name": "Reformation"},
         "image": ["/img/dress.jpg"], "variesBy": ["color", "size"],
         "hasVariant": [
           {"@type": "Product", "color": "Sage", "size": "XS", "offers": {"@type": "Offer", "price": "248.00", "priceCurrency": "USD"}},
           {"@type": "Product", "color": "Sage", "size": "S"},
           {"@type": "Product", "color": "Ivory", "size": "M"}
         ]}
      ]}</script>
    </head><body></body></html>`,

  '/item/espresso': `<!doctype html><html><head>
    <meta property="og:title" content="Breville Bambino Plus Espresso Machine">
    <meta property="og:image" content="https://cdn.example.com/bambino.jpg">
    <meta property="og:site_name" content="Kitchen Co">
    </head><body>
    <h1>Breville Bambino Plus Espresso Machine</h1>
    <span class="product-price">1.299,00 €</span>
    <label for="c">Color</label>
    <select id="c" name="attribute_color"><option>Select a color</option><option>Brushed Stainless Steel</option><option>Black Truffle - Sold Out</option></select>
    </body></html>`,

  '/blocked/cozy-wool-cardigan-sweater': `<html><head><title>Access Denied</title></head><body>Please verify you are human (captcha)</body></html>`,
};

let server;
let base;

before(async () => {
  server = http.createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    const body = PAGES[path];
    if (path.startsWith('/blocked/')) {
      res.writeHead(403, { 'Content-Type': 'text/html' });
      return res.end(PAGES[path]);
    }
    if (!body) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': path.endsWith('.js') ? 'application/json' : 'text/html' });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test('Shopify store: price, compare-at, sizes, colors, image, category', async () => {
  const { item } = await buildItem(`${base}/products/tree-runner?variant=1&utm_source=ig`, { useAi: false });
  assert.equal(item.title, "Men's Tree Runner");
  assert.equal(item.brand, 'Allbirds');
  assert.equal(item.price, 98);
  assert.equal(item.originalPrice, 110);
  assert.equal(item.currency, 'USD');
  assert.deepEqual(item.sizes, ['8', '9', '10', '11']);
  assert.deepEqual(item.colors, ['Natural White', 'Jet Black']);
  assert.equal(item.selectedColor, 'Natural White');
  assert.equal(item.image, 'https://cdn.shopify.com/s/files/runner.jpg');
  assert.equal(item.category, 'Shoes');
  assert.equal(item.subcategory, 'Sneakers');
  assert.ok(item.tags.includes('On Sale'));
  assert.ok(!item.url.includes('utm_source'));
});

test('JSON-LD ProductGroup: variants, breadcrumbs, relative image', async () => {
  const { item } = await buildItem(`${base}/dress-123.html`, { useAi: false });
  assert.equal(item.title, 'Linen Midi Dress');
  assert.equal(item.brand, 'Reformation');
  assert.equal(item.price, 248);
  assert.deepEqual(item.sizes, ['XS', 'S', 'M']);
  assert.deepEqual(item.colors, ['Sage', 'Ivory']);
  assert.equal(item.image, `${base}/img/dress.jpg`);
  assert.deepEqual(item.breadcrumbs, ['Women', 'Dresses']);
  assert.equal(item.category, 'Clothing');
  assert.equal(item.subcategory, 'Dresses');
  assert.ok(item.tags.includes('Women'));
});

test('Open Graph + DOM fallback: European price, color select', async () => {
  const { item } = await buildItem(`${base}/item/espresso`, { useAi: false });
  assert.equal(item.title, 'Breville Bambino Plus Espresso Machine');
  assert.equal(item.store, 'Kitchen Co');
  assert.equal(item.price, 1299);
  assert.equal(item.currency, 'EUR');
  assert.deepEqual(item.colors, ['Brushed Stainless Steel', 'Black Truffle']);
  assert.equal(item.image, 'https://cdn.example.com/bambino.jpg');
  assert.equal(item.category, 'Kitchen');
});

test('blocked page falls back to a readable title from the URL', async () => {
  const result = await buildItem(`${base}/blocked/cozy-wool-cardigan-sweater`, { useAi: false });
  assert.equal(result.blocked, true);
  assert.equal(result.item.title, 'Cozy Wool Cardigan Sweater');
  assert.equal(result.item.category, 'Clothing');
  assert.deepEqual(result.missing, ['price', 'image']);
});

test('parsePrice handles common formats', () => {
  assert.equal(parsePrice('$1,299.99'), 1299.99);
  assert.equal(parsePrice('1.299,99 €'), 1299.99);
  assert.equal(parsePrice('£45'), 45);
  assert.equal(parsePrice('12,50'), 12.5);
  assert.equal(parsePrice('From $20.00 - $40.00'), 20);
  assert.equal(parsePrice('Free'), null);
});

test('normalizeUrl pulls the link out of shared text and strips tracking', () => {
  const url = normalizeUrl('Look at this!! https://shop.com/p/thing?utm_medium=x&color=red&fbclid=abc');
  assert.equal(url.href, 'https://shop.com/p/thing?color=red');
  assert.equal(normalizeUrl('shop.com/p/thing').href, 'https://shop.com/p/thing');
});

test('private addresses are refused without the dev override', async () => {
  delete process.env.ALLOW_PRIVATE_HOSTS;
  try {
    await assert.rejects(buildItem('http://127.0.0.1:1/x', { useAi: false }), /not allowed/);
    await assert.rejects(buildItem('http://169.254.169.254/latest/meta-data', { useAi: false }), /not allowed/);
  } finally {
    process.env.ALLOW_PRIVATE_HOSTS = '1';
  }
});

test('Claude results fill gaps but never override structured data or invent images', async () => {
  const { mergeAi } = await import('../lib/ai.js');
  const parsed = {
    title: 'Linen Midi Dress', price: 248, originalPrice: null, currency: 'USD', brand: '',
    image: 'https://cdn/a.jpg', images: ['https://cdn/a.jpg', 'https://cdn/b.jpg'],
    sizes: ['XS', 'S'], colors: [], sources: ['json-ld', 'meta'],
  };
  const ai = {
    title: 'Different', brand: 'Reformation', price: 199, currency: 'USD', original_price: 300,
    image_url: 'https://made-up.example/x.jpg', sizes: ['M'], colors: ['Sage'],
    category: 'Clothing', subcategory: 'Dresses', tags: ['Linen'],
  };
  const out = mergeAi(parsed, ai);
  assert.equal(out.title, 'Linen Midi Dress');
  assert.equal(out.price, 248);
  assert.equal(out.originalPrice, 300);
  assert.equal(out.brand, 'Reformation');
  assert.equal(out.image, 'https://cdn/a.jpg');
  assert.deepEqual(out.sizes, ['XS', 'S']);
  assert.deepEqual(out.colors, ['Sage']);
  assert.ok(out.sources.includes('claude'));
});
