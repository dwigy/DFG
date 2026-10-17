// Wishlist relay: a private Cloudflare Worker that fetches store pages for the
// Wishlist app. Browsers can't read other sites directly (CORS), so the app
// asks this relay instead of shared public ones.
//
//   GET /?url=<product page>  -> the page, with CORS headers for the app
//   GET /                     -> {"ok": true}  (used by the app's "Test" button)
//
// Only the origins below may use it, so it can't be borrowed as an open proxy.
// To allow another site, add it here (or set an ALLOWED_ORIGINS variable in
// Cloudflare as a comma-separated list).

const DEFAULT_ALLOWED_ORIGINS = [
  'https://dwigy.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

const MAX_BYTES = 6 * 1024 * 1024;
const TIMEOUT_MS = 15000;

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Upgrade-Insecure-Requests': '1',
};

function allowedOrigins(env) {
  const extra = String(env?.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept',
    'Access-Control-Expose-Headers': 'X-Final-Url, X-Upstream-Status',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (data, status, headers) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

// Refuse obvious internal targets. (Workers can't reach private networks
// anyway, but there's no reason to try.)
function isPublicTarget(url) {
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return false;
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return false;
  }
  if (host.includes(':')) return false; // IPv6 literals: not needed for stores
  return true;
}

async function readCapped(res) {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(Math.min(size, MAX_BYTES));
  let offset = 0;
  for (const c of chunks) {
    out.set(c.subarray(0, out.length - offset), offset);
    offset += c.byteLength;
    if (offset >= out.length) break;
  }
  return out;
}

export default {
  async fetch(request, env) {
    const origin = (request.headers.get('Origin') || '').replace(/\/$/, '');
    if (!allowedOrigins(env).has(origin)) {
      return json({ error: 'This relay only serves the Wishlist app.' }, 403, {});
    }
    const headers = cors(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET') return json({ error: 'Use GET' }, 405, headers);

    const target = new URL(request.url).searchParams.get('url');
    if (!target) return json({ ok: true, name: 'wishlist-relay' }, 200, headers);

    let url;
    try {
      url = new URL(target);
    } catch {
      return json({ error: 'Invalid url' }, 400, headers);
    }
    if (!isPublicTarget(url)) return json({ error: 'That address is not allowed' }, 400, headers);

    let upstream;
    try {
      upstream = await fetch(url.href, {
        headers: { ...BROWSER_HEADERS, ...(request.headers.get('Accept')?.includes('json') ? { Accept: 'application/json' } : {}) },
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      return json({ error: timedOut ? 'The store took too long to respond' : "Couldn't reach the store" }, timedOut ? 504 : 502, headers);
    }

    const body = await readCapped(upstream);
    return new Response(body, {
      // Pass the store's status through so the app can tell a block page from a
      // product page (statuses that can't carry a body become 200).
      status: upstream.status < 200 || [204, 205, 304].includes(upstream.status) ? 200 : upstream.status,
      headers: {
        ...headers,
        'Content-Type': upstream.headers.get('Content-Type') || 'text/html; charset=utf-8',
        'X-Final-Url': upstream.url || url.href,
        'X-Upstream-Status': String(upstream.status),
        'Cache-Control': 'no-store',
      },
    });
  },
};
