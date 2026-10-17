// Browser build of the extractor, used when the app is hosted as static files
// (e.g. GitHub Pages) with no server. Browsers can't read other sites' pages
// directly (CORS), so pages are fetched through public CORS relays.
import { buildItem } from '../lib/build.js';
import { FetchError } from '../lib/url.js';

const RELAYS = [
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
];

const MAX_CHARS = 6 * 1024 * 1024;

// Remember which relay last worked so later requests try it first.
let preferred = 0;

async function relayFetch(input, { timeoutMs = 15000 } = {}) {
  const url = input instanceof URL ? input : new URL(input);
  if (!/^https?:$/.test(url.protocol)) throw new FetchError('Only http(s) links are supported', 400);
  let last;
  for (let n = 0; n < RELAYS.length; n++) {
    const i = (preferred + n) % RELAYS.length;
    try {
      const res = await fetch(RELAYS[i](url.href), { signal: AbortSignal.timeout(timeoutMs) });
      const body = (await res.text()).slice(0, MAX_CHARS);
      last = { url, status: res.status, contentType: res.headers.get('content-type') || '', body };
      if (res.ok && body.length > 0) {
        preferred = i;
        return last;
      }
    } catch {
      // Relay down, slow or rate limited: try the next one.
    }
  }
  if (last) return last;
  throw new FetchError("Couldn't reach the store", 502);
}

export function extractInBrowser(url) {
  return buildItem(url, { fetchPage: relayFetch });
}
