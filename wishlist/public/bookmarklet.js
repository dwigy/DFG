// "Add to Wishlist" browser button (bookmarklet).
//
// Stores like REI block every server and relay, but they always load in the
// shopper's own browser. The button runs on the product page you're looking
// at, copies the parts of the page that describe the product (structured data,
// meta tags, title, price, size and color pickers, photos), compresses them
// and opens the wishlist with that snapshot in the URL fragment. The fragment
// never leaves your browser, and the app reads it with the same extractor it
// uses for everything else.

// Runs on the store's page. Must be self-contained: it's serialized into the bookmark.
export function capture(app) {
  (async () => {
    const add = (extra) => {
      const url = `${app}#import=${encodeURIComponent(location.href)}${extra}`;
      if (!window.open(url, '_blank')) location.href = url;
    };
    try {
      const d = document;
      const head = [...d.querySelectorAll('script[type="application/ld+json"],meta[property],meta[name],meta[itemprop],title,link[rel=canonical],link[rel=image_src]')]
        .map((e) => e.outerHTML)
        .join('');
      const SEL = 'h1,[itemprop],[class*="brand" i],[data-ui*="brand" i],select,fieldset,nav[aria-label*="readcrumb" i],[class*="breadcrumb" i],[class*="price" i],[id*="price" i],[data-price],[data-ui*="price" i],[class*="size" i],[id*="size" i],[class*="color" i],[class*="colour" i],[class*="swatch" i],[class*="variant" i],[class*="gallery" i],[class*="product-image" i],[class*="media" i] img,main img';
      const picked = [];
      for (const el of d.body.querySelectorAll(SEL)) {
        if (picked.some((p) => p.contains(el))) continue;
        picked.push(el);
        if (picked.length > 400) break;
      }
      let body = '';
      for (const el of picked) {
        const c = el.cloneNode(true);
        c.querySelectorAll('script,style,noscript,svg,iframe,template,link').forEach((x) => x.remove());
        body += c.outerHTML.replace(/\s(style|d|class)="[^"]{400,}"/g, '').slice(0, 40000);
        if (body.length > 300000) break;
      }
      const html = `<html><head>${head.slice(0, 400000)}</head><body>${body}</body></html>`;
      if (!window.CompressionStream) return add(`&h=${encodeURIComponent(html.slice(0, 60000))}`);
      const stream = new Blob([html]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
      add(`&z=${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`);
    } catch {
      add('');
    }
  })();
}

/** The bookmark's address for an app hosted at `appUrl`. */
export function bookmarkletCode(appUrl) {
  return `javascript:${encodeURIComponent(`(${capture.toString()})(${JSON.stringify(appUrl)})`)}`;
}

/** Read a page snapshot from the app's URL fragment: {url, html} or null. */
export async function readSnapshot(hash) {
  if (!hash.startsWith('#import=')) return null;
  const params = new URLSearchParams(hash.slice(1));
  const url = params.get('import');
  if (!url) return null;
  try {
    if (params.get('h')) return { url, html: params.get('h') };
    const z = params.get('z');
    if (!z) return { url, html: '' };
    const b64 = z.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64 + '==='.slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return { url, html: await new Response(stream).text() };
  } catch {
    return { url, html: '' };
  }
}
