// Fetches a product page the way a desktop browser would, with guards so the
// server can't be pointed at internal network addresses (SSRF).
import dns from 'node:dns/promises';
import net from 'node:net';
import { FetchError, normalizeUrl } from './url.js';

export { FetchError, normalizeUrl };

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Upgrade-Insecure-Requests': '1',
};

const MAX_BYTES = 6 * 1024 * 1024;
const MAX_REDIRECTS = 6;
const TIMEOUT_MS = 15000;

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return (
    v6 === '::' || v6 === '::1' ||
    v6.startsWith('fc') || v6.startsWith('fd') ||
    v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb')
  );
}

async function assertPublicHost(url) {
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new FetchError('Only http(s) links are supported', 400);
  }
  if (process.env.ALLOW_PRIVATE_HOSTS === '1') return;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new FetchError('That address is not allowed', 400);
  }
  let addrs;
  try {
    addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  } catch {
    // Behind an outbound proxy (NODE_USE_ENV_PROXY=1) the proxy resolves names, not us.
    if (process.env.NODE_USE_ENV_PROXY === '1' && (process.env.HTTPS_PROXY || process.env.https_proxy)) return;
    throw new FetchError(`Couldn't find ${host}`, 400);
  }
  if (addrs.some((a) => isPrivateIp(a.address))) {
    throw new FetchError('That address is not allowed', 400);
  }
}


/**
 * Fetch a URL with redirect-by-redirect host checks.
 * Returns { url, status, contentType, body }.
 */
export async function safeFetch(input, { accept, timeoutMs = TIMEOUT_MS } = {}) {
  let url = input instanceof URL ? input : normalizeUrl(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicHost(url);
      const res = await fetch(url, {
        headers: accept ? { ...BROWSER_HEADERS, Accept: accept } : BROWSER_HEADERS,
        redirect: 'manual',
        signal: controller.signal,
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        url = new URL(res.headers.get('location'), url);
        await res.body?.cancel();
        continue;
      }
      const body = await readCapped(res);
      return { url, status: res.status, contentType: res.headers.get('content-type') || '', body };
    }
    throw new FetchError('Too many redirects', 502);
  } catch (err) {
    if (err instanceof FetchError) throw err;
    if (err.name === 'AbortError') throw new FetchError('The store took too long to respond', 504);
    throw new FetchError(`Couldn't reach the store (${err.cause?.code || err.message})`, 502);
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(res) {
  if (!res.body) return '';
  const reader = res.body.getReader();
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
  return Buffer.concat(chunks).toString('utf8');
}
