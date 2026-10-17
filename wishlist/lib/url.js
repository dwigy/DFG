// URL cleanup and the error type shared by the server and the in-browser extractor.

export class FetchError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function normalizeUrl(input) {
  let raw = String(input || '').trim();
  // Pull the first URL out of pasted share text like "Check this out! https://..."
  const found = raw.match(/https?:\/\/[^\s<>"']+/i);
  if (found) raw = found[0];
  else if (!/^[a-z]+:\/\//i.test(raw)) raw = `https://${raw}`;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchError("That doesn't look like a link", 400);
  }
  if (!url.hostname.includes('.')) throw new FetchError("That doesn't look like a link", 400);
  // Strip common tracking params so duplicates are detectable.
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|mc_|_ga|ref_?$|igsh|si$)/i.test(key)) url.searchParams.delete(key);
  }
  url.hash = '';
  return url;
}
