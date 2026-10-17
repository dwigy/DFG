# Smart Wishlist

Paste a product link from any store. The app pulls the **photo, price, sizes and colors** and files the item under a **category with tags**, so you can sort and filter the list by type.

**Live app:** https://dwigy.github.io/DFG/wishlist/

## Two ways it runs

- **Hosted on GitHub Pages (static):** extraction runs in your browser, and pages are fetched through public relays. Jina Reader goes first because it loads the page in a real browser, so prices and photos that stores add with JavaScript are included. AllOrigins, CodeTabs and corsproxy.io are backups (corsproxy.io's free tier only works on localhost). If a relay returns a block page, the next one is tried and the most complete result wins. Remaining gaps are filled from Jina's text version of the page and Microlink's metadata. Items still missing a price or photo get a "Try again" button. There's no Claude enrichment in this mode.
- **With the Node server (below):** pages are fetched server-side, Claude enrichment is available, and nothing goes through third-party relays. The front end detects the server automatically.

After changing anything in `lib/`, run `npm run build:web` to rebuild `public/extract.bundle.js`.

## Run it

```bash
cd wishlist
npm install
npm start            # http://localhost:3000
```

Requires Node 20+.

### Optional: Claude-powered extraction

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start
```

With a key set, Claude reads each page after the parsers run. It fills in anything they missed (a price shown only in page text, sizes buried in custom widgets), cleans up titles and picks the category and tags. Structured store data still wins wherever it exists, and Claude can only choose a photo that actually appears on the page. Without a key, the rule-based categorizer handles sorting.

| Env var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Turns on Claude enrichment |
| `WISHLIST_AI=0` | Forces Claude off even when a key is present |
| `WISHLIST_MODEL` | Overrides the model (default `claude-opus-5-5`, low effort) |
| `PORT` | Server port (default 3000) |

## How extraction works

Strategies run from most to least reliable, and the first good value for each field wins:

1. **Shopify product JSON** (`/products/<handle>.js`): exact variants, sizes, colors and compare-at price. This covers a large share of independent brands.
2. **schema.org JSON-LD**: `Product` / `ProductGroup` with variants, offers and breadcrumbs. Most major retailers publish it.
3. **Site adapters**: Amazon.
4. **Microdata** (`itemprop`).
5. **Open Graph and product meta tags**.
6. **DOM heuristics**: size and color `<select>`s, swatches, price elements and gallery images.
7. **Claude** (optional): fills gaps and assigns the category.

If a store blocks automated reading (captcha or 403), the item is still added, with a readable title taken from the URL and a category guessed from it. A prompt then asks you to fill in the price and photo.

## Features

- **Shop (home):** your wishlist laid out like a store, with New arrivals, Favorites, Shop by category, Small gifts (you pick the limit: $25 to $150), Big gifts ($250+), On sale, and a shelf for each main category. Every shelf has "See all".
- **Full list:** search, one row of filters (favorites, sale, price, category, got it) and a sort
- **Clean cards:** a 3:2 photo with the name and price
- **Item view** (tap any card): full photo and gallery (tap a photo to make it the cover), the button to shop, your size and color, notes, section, favorite, got it, price check, edit and remove
- **Auto categories:** 16 sections with a specific type (Sneakers, Headphones, Dutch Oven)
- **Price tracking:** "Check price" on one item, or "Check all prices" in the ⋯ menu. Drops show up as badges and in the On sale shelf.
- **Add from anywhere:** the + button, pasting a link anywhere on the page, the bookmarklet, or sharing from your phone (Android, once installed)
- Backup export and import, a copyable list to share, works on phones, supports dark mode

Your list is saved in your browser (localStorage). The server never stores anything; it only reads product pages.

## Deploying

Any Node host works (Render, Railway, Fly.io, a VPS). The start command is `npm start`. The server:

- blocks requests to private and internal network addresses (SSRF protection), including after redirects
- rate-limits extraction to 30 requests per minute per IP
- caps page size at 6 MB and timeouts at 15 s

For local development behind a corporate proxy, set `NODE_USE_ENV_PROXY=1` along with `HTTPS_PROXY`.

## Tests

```bash
npm test
```

The tests serve fixture pages locally and cover Shopify, JSON-LD, Open Graph with DOM fallbacks, blocked pages, price parsing, URL cleanup, SSRF blocking and the Claude merge rules.
