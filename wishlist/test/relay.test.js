import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const worker = (await import('../relay/worker.js')).default;
const { extractInBrowser, testRelay } = await import('../web/browser-extract.js');

const APP = 'https://dwigy.github.io';
const RELAY = 'https://wishlist-relay.example.workers.dev';
const PRODUCT = `<html><head><script type="application/ld+json">${JSON.stringify({
  '@type': 'Product', name: 'Nano Puff Jacket', brand: 'Patagonia', image: 'https://cdn.example.com/nano.jpg',
  offers: { price: '239', priceCurrency: 'USD' }, hasVariant: [{ size: 'S' }, { size: 'M' }],
})}</script></head><body></body></html>`;

const realFetch = globalThis.fetch;
let upstream; // (url) => Response for requests the worker makes to stores
let storeCalls;

beforeEach(() => {
  storeCalls = [];
  upstream = () => new Response(PRODUCT, { headers: { 'content-type': 'text/html' } });
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    // The app talking to the relay: route into the worker, as a browser on the app's site would.
    if (url.startsWith(RELAY)) {
      return worker.fetch(new Request(url, { headers: { Origin: APP, ...(init.headers || {}) } }), {});
    }
    storeCalls.push({ url, headers: init.headers || {} });
    const res = await upstream(url, init);
    if (res instanceof Error) throw res;
    return res;
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const call = (path, origin = APP, init = {}) =>
  worker.fetch(new Request(`${RELAY}${path}`, { ...init, headers: { ...(origin ? { Origin: origin } : {}), ...(init.headers || {}) } }), init.env || {});

test('only the Wishlist site may use the relay', async () => {
  assert.equal((await call('/?url=https://shop.example.com/p', 'https://evil.example')).status, 403);
  assert.equal((await call('/?url=https://shop.example.com/p', null)).status, 403);
  assert.equal(storeCalls.length, 0);
});

test('extra origins can be allowed with ALLOWED_ORIGINS', async () => {
  const res = await worker.fetch(new Request(`${RELAY}/`, { headers: { Origin: 'https://wishlist.example.com' } }), { ALLOWED_ORIGINS: 'https://wishlist.example.com, https://other.example' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://wishlist.example.com');
});

test('health check answers with CORS headers', async () => {
  const res = await call('/');
  assert.deepEqual(await res.json(), { ok: true, name: 'wishlist-relay' });
  assert.equal(res.headers.get('access-control-allow-origin'), APP);
});

test('preflight is answered', async () => {
  const res = await call('/?url=x', APP, { method: 'OPTIONS' });
  assert.equal(res.status, 204);
});

test('internal addresses are refused', async () => {
  for (const target of ['http://localhost/admin', 'http://127.0.0.1/', 'http://169.254.169.254/latest', 'http://10.0.0.5/', 'http://printer.local/', 'ftp://shop.example.com/']) {
    assert.equal((await call(`/?url=${encodeURIComponent(target)}`)).status, 400, target);
  }
  assert.equal(storeCalls.length, 0);
});

test('passes the store page through with its status and final URL', async () => {
  upstream = () => {
    const res = new Response('<html>blocked</html>', { status: 403, headers: { 'content-type': 'text/html' } });
    Object.defineProperty(res, 'url', { value: 'https://shop.example.com/final' });
    return res;
  };
  const res = await call(`/?url=${encodeURIComponent('https://shop.example.com/p')}`);
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('x-final-url'), 'https://shop.example.com/final');
  assert.equal(await res.text(), '<html>blocked</html>');
  assert.match(storeCalls[0].headers['User-Agent'], /Chrome/);
});

test('store outage becomes a clean error', async () => {
  upstream = () => new TypeError('network down');
  const res = await call(`/?url=${encodeURIComponent('https://shop.example.com/p')}`);
  assert.equal(res.status, 502);
});

test('end to end: the app reads a product through your relay first', async () => {
  const { item, blocked } = await extractInBrowser('https://www.patagonia.com/product/nano-puff', { relayUrl: `${RELAY}/` });
  assert.equal(blocked, false);
  assert.equal(item.title, 'Nano Puff Jacket');
  assert.equal(item.price, 239);
  assert.deepEqual(item.sizes, ['S', 'M']);
  assert.equal(item.via, 'your relay');
  assert.equal(item.category, 'Clothing');
  assert.ok(storeCalls.every((c) => !c.url.includes('jina') && !c.url.includes('allorigins')), 'public relays not needed');
});

test('testRelay confirms a working relay and rejects a wrong URL', async () => {
  assert.equal(await testRelay(RELAY), true);
  assert.equal(await testRelay('https://not-a-relay.example.com'), false);
});
