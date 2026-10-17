// Smart Wishlist server: serves the web app and the /api/extract endpoint.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractProduct, pageText } from './lib/extract.js';
import { categorize, priceBand } from './lib/categorize.js';
import { aiEnabled, enrichWithClaude, mergeAi } from './lib/ai.js';
import { FetchError } from './lib/fetchPage.js';

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Simple per-IP rate limit so a public deployment can't be used as a crawler.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 30;
}

export async function buildItem(url, { useAi = aiEnabled() } = {}) {
  const { product, $, blocked } = await extractProduct(url);
  let item = product;
  const rules = categorize(product);
  let category = rules.category;
  let subcategory = rules.subcategory;
  let tags = rules.tags;

  if (useAi) {
    const ai = await enrichWithClaude({ product, text: blocked ? '' : pageText($), blocked });
    if (ai) {
      item = mergeAi(product, ai);
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

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 20_000) throw new FetchError('Request too large', 413);
  }
  try {
    return JSON.parse(body || '{}');
  } catch {
    throw new FetchError('Invalid JSON', 400);
  }
}

function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': typeof data === 'object' && !Buffer.isBuffer(data) ? 'application/json' : 'text/plain',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(body);
}

async function serveStatic(req, res) {
  const { pathname } = new URL(req.url, 'http://x');
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
  try {
    const data = await fs.readFile(file);
    send(res, 200, data, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': rel === 'index.html' ? 'no-cache' : 'public, max-age=300',
    });
  } catch {
    // SPA fallback so ?add= links and refreshes always land on the app.
    const index = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'));
    send(res, 200, index, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  try {
    if (pathname === '/api/config' && req.method === 'GET') {
      return send(res, 200, { ai: aiEnabled() });
    }
    if (pathname === '/api/extract' && req.method === 'POST') {
      const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
      if (rateLimited(ip)) return send(res, 429, { error: 'Slow down a little — try again in a minute.' });
      const { url, ai } = await readJson(req);
      if (!url) return send(res, 400, { error: 'Paste a product link first.' });
      const started = Date.now();
      const result = await buildItem(url, { useAi: ai !== false && aiEnabled() });
      console.log(`[extract] ${result.item.domain} ${Date.now() - started}ms via ${result.item.sources.join('+')}${result.blocked ? ' (blocked)' : ''}`);
      return send(res, 200, result);
    }
    if (pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
    return serveStatic(req, res);
  } catch (err) {
    const status = err instanceof FetchError ? err.status : 500;
    if (status === 500) console.error(err);
    return send(res, status, { error: status === 500 ? 'Something went wrong reading that page.' : err.message });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => {
    console.log(`Smart Wishlist running at http://localhost:${PORT}`);
    console.log(aiEnabled() ? 'Claude enrichment: ON' : 'Claude enrichment: OFF (set ANTHROPIC_API_KEY to enable)');
  });
}

export { server };
