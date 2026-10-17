// Wishlist front end: a personal "shop" home, a full list, and an item detail view.
// Items live in localStorage; product pages are read by the server or, on static
// hosting, by the in-browser extractor.

const STORE_KEY = 'smart-wishlist:v1';
const PREFS_KEY = 'smart-wishlist:prefs';
const BIG_GIFT = 250;

const CATEGORY_ICONS = {
  Clothing: '👕', Shoes: '👟', 'Bags & Accessories': '👜', 'Jewelry & Watches': '💍', Beauty: '💄',
  Electronics: '🎧', Home: '🛋️', Kitchen: '🍳', 'Books & Media': '📚', 'Toys & Games': '🧸',
  'Sports & Outdoors': '🏕️', 'Baby & Kids': '🍼', Pets: '🐾', 'Tools & Garden': '🛠️', Food: '🍫',
  Experiences: '🎟️', Other: '✨',
};

const $ = (sel, root = document) => root.querySelector(sel);
const els = {
  shop: $('#shopView'), list: $('#listView'), grid: $('#grid'), filters: $('#filters'),
  search: $('#search'), sort: $('#sort'), listSummary: $('#listSummary'),
  addDlg: $('#addDlg'), addForm: $('#addForm'), input: $('#urlInput'),
  detailDlg: $('#detailDlg'), detail: $('#detail'),
  editor: $('#editor'), editForm: $('#editForm'),
  menuBtn: $('#menuBtn'), menu: $('#menu'), toasts: $('#toasts'), importFile: $('#importFile'),
};

// ---------- state ----------

const safeStorage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};

let items = safeStorage.get(STORE_KEY, []).filter((i) => i && i.id && i.status !== 'loading');
const prefs = { sort: 'new', giftLimit: 50, ...safeStorage.get(PREFS_KEY, {}) };
const state = { filter: 'all', search: '', detailId: null };
let storageWarned = false;

function save() {
  if (!safeStorage.set(STORE_KEY, items.filter((i) => i.status !== 'loading')) && !storageWarned) {
    storageWarned = true;
    toast("Couldn't save in this browser (private mode?). Export a backup to keep your list.", { type: 'error', timeout: 8000 });
  }
}
const savePrefs = () => safeStorage.set(PREFS_KEY, { sort: prefs.sort, giftLimit: prefs.giftLimit });

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const byId = (id) => items.find((i) => i.id === id);

// ---------- helpers ----------

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const safeHref = (u) => (/^https?:\/\//i.test(u || '') ? u : '');

function money(value, currency) {
  if (value == null || Number.isNaN(value)) return '';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: value % 1 ? 2 : 0 }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency || ''}`.trim();
  }
}

const num = (v) => {
  if (v === '' || v == null) return null;
  const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function cssColor(name) {
  if (!name) return '';
  const words = name.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  const candidates = [words.join(''), ...words.reverse()];
  const aliases = { navy: 'navy', cream: '#f3ead7', ivory: 'ivory', natural: '#e8dcc8', sand: '#d8c3a5', oat: '#dfd3bf', camel: '#c19a6b', charcoal: '#36454f', heather: '#9aa0a6', sage: '#9caf88', olive: 'olive', rust: '#b7410e', burgundy: '#800020', wine: '#722f37', mauve: '#b784a7', blush: '#f4c2c2', nude: '#e3bc9a', mint: '#98ff98', denim: '#1560bd', khaki: 'khaki', stone: '#a8a29e', taupe: '#8b7d6b', jade: '#00a86b', sapphire: '#0f52ba', cloud: '#e5e7eb', salt: '#eef0ec', bracken: '#7a6a3a', mongoose: '#8a7f6a', multi: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' };
  for (const c of candidates) {
    if (aliases[c]) return aliases[c];
    if (window.CSS?.supports?.('color', c)) return c;
  }
  return '';
}

function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const units = [[31536000, 'year'], [2592000, 'month'], [604800, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute']];
  for (const [secs, label] of units) if (s >= secs) return `${plural(Math.floor(s / secs), label)} ago`;
  return '';
}

// Change since the item was first added (negative = cheaper now).
function priceChange(item) {
  const hist = item.priceHistory || [];
  if (hist.length < 2 || item.price == null) return 0;
  return hist[0].price ? item.price - hist[0].price : 0;
}

const onSale = (i) => (i.originalPrice && i.price && i.originalPrice > i.price) || priceChange(i) < 0;
const wanted = () => items.filter((i) => i.status === 'ready' && !i.purchased);

function toast(message, { type = 'info', action, timeout = 4000 } = {}) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${esc(message)}</span>`;
  if (action) {
    const btn = document.createElement('button');
    btn.textContent = action.label;
    btn.onclick = () => {
      action.run();
      el.remove();
    };
    el.append(btn);
  }
  els.toasts.append(el);
  setTimeout(() => el.classList.add('out'), timeout);
  setTimeout(() => el.remove(), timeout + 400);
}

// ---------- reading product pages ----------

// With a server (npm start) extraction runs there; on static hosting (GitHub Pages)
// the same extractor runs in the browser via CORS relays.
const serverConfig = fetch('api/config')
  .then((r) => (r.ok && /json/.test(r.headers.get('content-type') || '') ? r.json() : null))
  .catch(() => null);

let browserExtractor;
const loadBrowserExtractor = () => (browserExtractor ??= import('./extract.bundle.js'));

async function extract(url, { ai = true } = {}) {
  if (!(await serverConfig)) {
    const { extractInBrowser } = await loadBrowserExtractor();
    try {
      return await extractInBrowser(url);
    } catch (err) {
      throw new Error(err.status === 400 ? err.message : "Couldn't read that link");
    }
  }
  const res = await fetch('api/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, ai }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const sameUrl = (a, b) => {
  const norm = (u) => {
    try {
      const x = new URL(u);
      return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/$/, '')).toLowerCase();
    } catch {
      return u;
    }
  };
  return norm(a) === norm(b);
};

async function addUrl(raw) {
  const text = String(raw || '').trim();
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  const url = match ? match[0] : text;
  if (!url) return;
  const dup = items.find((i) => i.status !== 'loading' && sameUrl(i.url, url));
  if (dup) {
    toast('Already on your list', { action: { label: 'View', run: () => openDetail(dup.id) } });
    return;
  }
  const placeholder = { id: uid(), url, status: 'loading', addedAt: Date.now(), title: '' };
  items.unshift(placeholder);
  render();
  try {
    const { item, blocked, missing } = await extract(url);
    Object.assign(placeholder, item, {
      status: 'ready',
      tags: item.tags || [],
      notes: '',
      purchased: false,
      starred: false,
      priceHistory: item.price != null ? [{ price: item.price, at: Date.now() }] : [],
    });
    save();
    render();
    const view = { label: 'View', run: () => openDetail(placeholder.id) };
    if (blocked) toast(`${item.store} didn't share its details. Add the price and photo yourself.`, { type: 'warn', timeout: 7000, action: { label: 'Edit', run: () => openEditor(placeholder.id) } });
    else if (missing.length) toast(`Added, but couldn't find the ${missing.join(' or ')}.`, { type: 'warn', action: { label: 'Edit', run: () => openEditor(placeholder.id) } });
    else toast(`Added to ${item.category}`, { action: view });
  } catch (err) {
    items = items.filter((i) => i !== placeholder);
    render();
    toast(err.message || "Couldn't read that link", { type: 'error', timeout: 6000 });
  }
}

async function refreshPrice(item, { quiet = false } = {}) {
  try {
    const { item: fresh, blocked } = await extract(item.url, { ai: false });
    if (blocked || fresh.price == null) {
      if (!quiet) toast(`Couldn't read the current price`, { type: 'warn' });
      return null;
    }
    const old = item.price;
    item.price = fresh.price;
    item.originalPrice = fresh.originalPrice ?? item.originalPrice;
    item.inStock = fresh.inStock;
    if (!item.image && fresh.image) item.image = fresh.image;
    item.priceHistory = [...(item.priceHistory || []), { price: fresh.price, at: Date.now() }].slice(-30);
    item.checkedAt = Date.now();
    save();
    if (old != null && fresh.price < old) {
      toast(`Price drop! ${item.title}: ${money(old, item.currency)} → ${money(fresh.price, item.currency)}`, { type: 'good', timeout: 8000 });
    } else if (!quiet) {
      toast(old === fresh.price ? 'Same price as before' : `Now ${money(fresh.price, item.currency)}`);
    }
    return fresh.price - (old ?? fresh.price);
  } catch (err) {
    if (!quiet) toast(err.message, { type: 'error' });
    return null;
  }
}

// ---------- cards ----------

function photo(item, cls = '') {
  const img = safeHref(item.image);
  const icon = CATEGORY_ICONS[item.category] || '🛍️';
  return `<div class="ph ${cls}">
    ${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-fallback>` : ''}
    <span class="ph-icon" ${img ? 'hidden' : ''} aria-hidden="true">${icon}</span>
  </div>`;
}

function badge(item) {
  if (item.purchased) return '<span class="badge dark">Got it</span>';
  if (item.inStock === false) return '<span class="badge muted">Sold out</span>';
  const drop = priceChange(item);
  if (drop < 0) return `<span class="badge good">↓ ${money(-drop, item.currency)}</span>`;
  if (onSale(item)) return '<span class="badge sale">Sale</span>';
  return '';
}

function card(item) {
  if (item.status === 'loading') {
    let host = '';
    try {
      host = new URL(item.url).hostname.replace(/^www\./, '');
    } catch { /* ignore */ }
    return `<article class="card loading" aria-busy="true">
      <div class="ph shimmer"></div>
      <div class="info"><div class="store">${esc(host)}</div><div class="line shimmer"></div><div class="line short shimmer"></div></div>
    </article>`;
  }
  const sale = item.originalPrice && item.price && item.originalPrice > item.price;
  return `<article class="card ${item.purchased ? 'bought' : ''}" data-id="${item.id}" role="button" tabindex="0" aria-label="${esc(item.title)}${item.price != null ? `, ${money(item.price, item.currency)}` : ''}">
    ${photo(item)}
    ${badge(item)}
    ${item.starred ? '<span class="fav" aria-label="Favorite">♥</span>' : ''}
    <div class="info">
      <div class="store">${esc(item.brand || item.store || item.domain)}</div>
      <div class="name">${esc(item.title)}</div>
      <div class="price">${item.price != null ? money(item.price, item.currency) : '<span class="muted">No price</span>'}${sale ? ` <s>${money(item.originalPrice, item.currency)}</s>` : ''}</div>
    </div>
  </article>`;
}

function wireImages(root) {
  for (const img of root.querySelectorAll('img[data-fallback]')) {
    img.addEventListener('error', () => {
      img.nextElementSibling?.removeAttribute('hidden');
      img.remove();
    }, { once: true });
  }
}

// ---------- shop (home) ----------

function shelf({ title, sub = '', items: shelfItems, filter, extra = '', wide = false, emptyText = '' }) {
  if (!shelfItems.length && !emptyText) return '';
  return `<section class="shelf ${wide ? 'wide' : ''}">
    <header class="shelf-head">
      <div><h2>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div>
      ${extra}
      ${filter && shelfItems.length ? `<a class="see-all" href="#list" data-filter="${esc(filter)}">See all</a>` : ''}
    </header>
    ${shelfItems.length ? `<div class="rail">${shelfItems.map(card).join('')}</div>` : `<p class="shelf-empty">${emptyText}</p>`}
  </section>`;
}

function categoryCounts(pool) {
  const map = new Map();
  for (const i of pool) {
    const c = i.category || 'Other';
    if (!map.has(c)) map.set(c, []);
    map.get(c).push(i);
  }
  return [...map].sort((a, b) => b[1].length - a[1].length);
}

function renderShop() {
  const pool = wanted();
  const loading = items.filter((i) => i.status === 'loading');
  const currencies = new Set(pool.filter((i) => i.price != null).map((i) => i.currency || 'USD'));
  const total = pool.reduce((s, i) => s + (i.price || 0), 0);

  if (!pool.length && !loading.length) {
    els.shop.innerHTML = `<div class="welcome">
      <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 28s-11-6.6-11-15a6 6 0 0 1 11-3.3A6 6 0 0 1 27 13c0 8.4-11 15-11 15z" fill="currentColor"/></svg>
      <h1 id="shopTitle">Your shop starts here</h1>
      <p>Paste a link to anything you want, from any store. It lands here with its photo, price, sizes and colors, sorted into the right section.</p>
      <form class="welcome-add" data-inline-add>
        <input type="text" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="Paste a product link" aria-label="Product link">
        <button class="primary" type="submit">Add</button>
      </form>
      ${items.some((i) => i.purchased) ? '<p><a href="#list" data-filter="bought">See things you already got</a></p>' : ''}
    </div>`;
    return;
  }

  const newest = [...loading, ...[...pool].sort((a, b) => b.addedAt - a.addedAt)].slice(0, 10);
  const favorites = pool.filter((i) => i.starred);
  const limit = prefs.giftLimit;
  const small = pool.filter((i) => i.price != null && i.price <= limit).sort((a, b) => a.price - b.price);
  const big = pool.filter((i) => i.price != null && i.price >= BIG_GIFT).sort((a, b) => b.price - a.price);
  const deals = pool.filter(onSale).sort((a, b) => priceChange(a) - priceChange(b));
  const cats = categoryCounts(pool);

  const limitPicker = `<label class="limit">Under
    <select data-gift-limit aria-label="Small gift price limit">
      ${[25, 50, 75, 100, 150].map((v) => `<option value="${v}" ${v === limit ? 'selected' : ''}>${money(v, 'USD')}</option>`).join('')}
    </select></label>`;

  const tiles = cats.length > 1
    ? `<section class="shelf">
        <header class="shelf-head"><div><h2>Shop by category</h2></div></header>
        <div class="tiles">${cats
          .map(([c, list]) => {
            const cover = list.find((i) => safeHref(i.image));
            return `<a class="tile" href="#list" data-filter="cat:${esc(c)}">
              ${cover ? `<img src="${esc(cover.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="tile-icon" aria-hidden="true">${CATEGORY_ICONS[c] || '🏷️'}</span>`}
              <span class="tile-label"><b>${esc(c)}</b><small>${plural(list.length, 'item')}</small></span>
            </a>`;
          })
          .join('')}</div>
      </section>`
    : '';

  const categoryShelves = cats
    .filter(([, list]) => list.length >= 2)
    .slice(0, 4)
    .map(([c, list]) => shelf({ title: esc(c), items: [...list].sort((a, b) => b.addedAt - a.addedAt).slice(0, 10), filter: `cat:${c}` }))
    .join('');

  els.shop.innerHTML = `
    <div class="hero">
      <h1 id="shopTitle">Your shop</h1>
      <p class="sub">${plural(pool.length, 'thing')} you want${currencies.size === 1 && total ? ` · ${money(total, [...currencies][0])} total` : ''}</p>
    </div>
    ${shelf({ title: 'New arrivals', items: newest, filter: 'all', wide: true })}
    ${shelf({ title: 'Favorites', items: favorites, filter: 'fav' })}
    ${tiles}
    ${shelf({ title: 'Small gifts', sub: 'Easy wins and stocking stuffers', items: small.slice(0, 12), filter: `under:${limit}`, extra: limitPicker, emptyText: pool.some((i) => i.price != null) ? `Nothing ${money(limit, 'USD')} or less yet.` : '' })}
    ${shelf({ title: 'Big gifts', sub: `${money(BIG_GIFT, 'USD')} and up`, items: big.slice(0, 12), filter: `over:${BIG_GIFT}` })}
    ${shelf({ title: 'On sale', sub: 'Marked down or cheaper than when you added it', items: deals.slice(0, 12), filter: 'sale' })}
    ${categoryShelves}
  `;
  wireImages(els.shop);
}

// ---------- full list ----------

function filterOptions(pool) {
  const opts = [{ key: 'all', label: 'All', n: pool.length }];
  const fav = pool.filter((i) => i.starred).length;
  if (fav) opts.push({ key: 'fav', label: '♥ Favorites', n: fav });
  const sale = pool.filter(onSale).length;
  if (sale) opts.push({ key: 'sale', label: 'On sale', n: sale });
  opts.push({ key: `under:${prefs.giftLimit}`, label: `Under ${money(prefs.giftLimit, 'USD')}` });
  opts.push({ key: `over:${BIG_GIFT}`, label: `${money(BIG_GIFT, 'USD')}+` });
  for (const [c, list] of categoryCounts(pool)) opts.push({ key: `cat:${c}`, label: c, n: list.length });
  const bought = items.filter((i) => i.purchased).length;
  if (bought) opts.push({ key: 'bought', label: '✓ Got it', n: bought });
  // A filter from a shop shelf (e.g. a different price limit) still gets a chip.
  if (!opts.some((o) => o.key === state.filter)) opts.splice(1, 0, { key: state.filter, label: filterLabel(state.filter) });
  return opts;
}

function filterLabel(key) {
  const [kind, val] = key.split(/:(.*)/s);
  if (kind === 'under') return `Under ${money(+val, 'USD')}`;
  if (kind === 'over') return `${money(+val, 'USD')}+`;
  if (kind === 'cat') return val;
  return { all: 'All', fav: 'Favorites', sale: 'On sale', bought: 'Got it' }[kind] || 'All';
}

function applyFilter(key) {
  const [kind, val] = key.split(/:(.*)/s);
  const pool = kind === 'bought' ? items.filter((i) => i.status === 'ready' && i.purchased) : wanted();
  const match = {
    fav: (i) => i.starred,
    sale: onSale,
    under: (i) => i.price != null && i.price <= +val,
    over: (i) => i.price != null && i.price >= +val,
    cat: (i) => (i.category || 'Other') === val,
  }[kind];
  return match ? pool.filter(match) : pool;
}

function renderList() {
  const pool = wanted();
  let shown = applyFilter(state.filter);
  const q = state.search.trim().toLowerCase();
  if (q) {
    shown = shown.filter((i) => {
      const hay = [i.title, i.brand, i.store, i.category, i.subcategory, i.notes, ...(i.tags || []), ...(i.colors || [])].join(' ').toLowerCase();
      return q.split(/\s+/).every((w) => hay.includes(w));
    });
  }
  const price = (i) => i.price ?? (prefs.sort === 'price-asc' ? Infinity : -Infinity);
  const sorters = {
    new: (a, b) => b.addedAt - a.addedAt,
    old: (a, b) => a.addedAt - b.addedAt,
    'price-asc': (a, b) => price(a) - price(b),
    'price-desc': (a, b) => price(b) - price(a),
  };
  shown.sort(sorters[prefs.sort] || sorters.new);
  if (state.filter === 'all' && !q) shown = [...items.filter((i) => i.status === 'loading'), ...shown];

  els.filters.innerHTML = filterOptions(pool)
    .map((o) => `<button class="chip ${o.key === state.filter ? 'on' : ''}" data-filter="${esc(o.key)}">${esc(o.label)}${o.n != null ? ` <small>${o.n}</small>` : ''}</button>`)
    .join('');

  const priced = shown.filter((i) => i.price != null);
  const currencies = new Set(priced.map((i) => i.currency || 'USD'));
  const total = priced.reduce((s, i) => s + i.price, 0);
  els.listSummary.textContent = `${plural(shown.filter((i) => i.status !== 'loading').length, 'item')}${currencies.size === 1 && total ? ` · ${money(total, [...currencies][0])}` : ''}`;

  els.grid.innerHTML = shown.length
    ? shown.map(card).join('')
    : `<p class="empty">${items.length ? 'Nothing here yet.' : 'Your list is empty. Add your first item with the + button.'}</p>`;
  wireImages(els.grid);
}

// ---------- detail ----------

function optionChips(item, kind) {
  const values = item[kind] || [];
  if (!values.length) return '';
  const field = kind === 'sizes' ? 'selectedSize' : 'selectedColor';
  const selected = item[field];
  return `<div class="pick">
    <div class="pick-head"><span>${kind === 'sizes' ? 'Your size' : 'Your color'}</span><b>${esc(selected || 'Not chosen')}</b></div>
    <div class="opts">${values
      .map((v) => {
        const sw = kind === 'colors' ? cssColor(v) : '';
        return `<button class="opt ${v === selected ? 'on' : ''}" data-pick="${field}" data-value="${esc(v)}" aria-pressed="${v === selected}">${sw ? `<i style="background:${esc(sw)}"></i>` : ''}${esc(v)}</button>`;
      })
      .join('')}</div>
  </div>`;
}

function missingNote(item) {
  const missing = [item.price == null && 'price', !safeHref(item.image) && 'photo'].filter(Boolean);
  if (!missing.length) return '';
  return `<div class="notice">
    <p>${esc(item.store || 'The store')} didn't share the ${missing.join(' or ')}.</p>
    <div><button data-act="retry">Try again</button><button data-act="edit">Add it myself</button></div>
  </div>`;
}

function renderDetail() {
  const item = byId(state.detailId);
  if (!item) return els.detailDlg.open && els.detailDlg.close();
  const change = priceChange(item);
  const sale = item.originalPrice && item.price && item.originalPrice > item.price;
  const images = [...new Set([item.image, ...(item.images || [])].filter(safeHref))].slice(0, 8);
  const cats = new Set([...Object.keys(CATEGORY_ICONS), ...items.map((i) => i.category).filter(Boolean)]);

  els.detail.innerHTML = `
    <button class="icon-btn close" data-close aria-label="Close">✕</button>
    <div class="d-media">
      ${photo(item, 'big')}
      ${images.length > 1 ? `<div class="thumbs" aria-label="Photos — tap to use as cover">${images
        .map((src) => `<button class="${src === item.image ? 'on' : ''}" data-cover="${esc(src)}" aria-label="Use this photo"><img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`)
        .join('')}</div>` : ''}
    </div>
    <div class="d-info">
      <div class="store">${esc([item.brand, item.store].filter((v, i, a) => v && a.indexOf(v) === i).join(' · ') || item.domain)}</div>
      <h2>${esc(item.title)}</h2>
      <div class="d-price">
        ${item.price != null ? `<strong>${money(item.price, item.currency)}</strong>` : '<button class="link" data-act="edit">Add a price</button>'}
        ${sale ? `<s>${money(item.originalPrice, item.currency)}</s>` : ''}
        ${change < 0 ? `<span class="good">${money(-change, item.currency)} less than when you added it</span>` : ''}
        ${change > 0 ? `<span class="bad">Up ${money(change, item.currency)} since you added it</span>` : ''}
        ${item.inStock === false ? '<span class="bad">Sold out</span>' : ''}
      </div>
      ${missingNote(item)}
      <a class="primary shop-btn" href="${esc(safeHref(item.url))}" target="_blank" rel="noopener noreferrer">Shop at ${esc(item.store || item.domain || 'store')} ↗</a>
      ${optionChips(item, 'sizes')}
      ${optionChips(item, 'colors')}
      <label class="notes">Notes
        <textarea data-notes rows="2" placeholder="Gift idea for…, wait for a sale, check the fit…">${esc(item.notes || '')}</textarea>
      </label>
      <label class="cat-pick">Section
        <select data-category>${[...cats].map((c) => `<option ${c === item.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      </label>
      <div class="d-actions">
        <button data-act="star" class="${item.starred ? 'on' : ''}">${item.starred ? '♥ Favorite' : '♡ Favorite'}</button>
        <button data-act="bought" class="${item.purchased ? 'on' : ''}">${item.purchased ? '✓ Got it' : '✓ Mark as got it'}</button>
        <button data-act="refresh">↻ Check price</button>
        <button data-act="edit">✎ Edit details</button>
        <button data-act="delete" class="danger">Remove</button>
      </div>
      <p class="muted small">Added ${timeAgo(item.addedAt)}${item.checkedAt ? ` · price checked ${timeAgo(item.checkedAt)}` : ''}${item.sources?.length ? ` · read from ${esc([item.via, ...item.sources].filter(Boolean).join(', '))}` : ''}</p>
    </div>`;
  wireImages(els.detail);
}

function openDetail(id) {
  if (!byId(id)) return;
  state.detailId = id;
  renderDetail();
  if (!els.detailDlg.open) {
    els.detailDlg.showModal();
    // A history entry lets the phone's back gesture close the detail view.
    history.pushState({ detail: id }, '');
  }
  els.detailDlg.scrollTop = 0;
}

els.detailDlg.addEventListener('close', () => {
  state.detailId = null;
  if (history.state?.detail) history.back();
});

window.addEventListener('popstate', () => {
  if (els.detailDlg.open && !history.state?.detail) els.detailDlg.close();
});

// Click on the backdrop closes the dialog.
for (const dlg of document.querySelectorAll('dialog')) {
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });
}

let notesTimer;
els.detail.addEventListener('input', (e) => {
  const item = byId(state.detailId);
  if (!item || !e.target.matches('[data-notes]')) return;
  item.notes = e.target.value;
  clearTimeout(notesTimer);
  notesTimer = setTimeout(save, 400);
});

els.detail.addEventListener('change', (e) => {
  const item = byId(state.detailId);
  if (!item || !e.target.matches('[data-category]')) return;
  item.category = e.target.value;
  item.subcategory = '';
  save();
  render();
  renderDetail();
});

els.detail.addEventListener('click', async (e) => {
  const item = byId(state.detailId);
  if (!item) return;
  if (e.target.closest('[data-close]')) return els.detailDlg.close();

  const pick = e.target.closest('[data-pick]');
  if (pick) {
    const field = pick.dataset.pick;
    item[field] = item[field] === pick.dataset.value ? '' : pick.dataset.value;
    save();
    return renderDetail();
  }
  const cover = e.target.closest('[data-cover]');
  if (cover) {
    item.image = cover.dataset.cover;
    save();
    render();
    return renderDetail();
  }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'star') {
    item.starred = !item.starred;
    save();
  }
  if (act === 'bought') {
    item.purchased = !item.purchased;
    save();
    if (item.purchased) toast('Nice! Moved to “Got it” 🎉');
  }
  if (act === 'edit') return openEditor(item.id);
  if (act === 'delete') {
    const index = items.indexOf(item);
    items.splice(index, 1);
    save();
    els.detailDlg.close();
    render();
    return toast('Removed', { action: { label: 'Undo', run: () => { items.splice(index, 0, item); save(); render(); } }, timeout: 6000 });
  }
  if (act === 'retry') {
    const btn = e.target.closest('[data-act]');
    btn.disabled = true;
    btn.textContent = 'Reading…';
    try {
      const { item: fresh } = await extract(item.url);
      // Keep everything the person chose; only fill what was missing or newly found.
      // If the first read got neither price nor photo, its name and section were
      // guesses from the link, so take the real ones (unless edited by hand).
      if (item.price == null && !safeHref(item.image) && !item.updatedAt && (fresh.price != null || fresh.image)) {
        Object.assign(item, { title: fresh.title, store: fresh.store, category: fresh.category, subcategory: fresh.subcategory, tags: fresh.tags });
      }
      if (item.price == null && fresh.price != null) {
        item.price = fresh.price;
        item.currency ||= fresh.currency;
        item.priceHistory = [{ price: fresh.price, at: Date.now() }];
      }
      if (!safeHref(item.image) && fresh.image) item.image = fresh.image;
      item.images = [...new Set([...(item.images || []), ...(fresh.images || [])])];
      if (!item.sizes?.length) item.sizes = fresh.sizes;
      if (!item.colors?.length) item.colors = fresh.colors;
      if (!item.brand) item.brand = fresh.brand;
      item.via = fresh.via;
      item.sources = fresh.sources;
      save();
      toast(item.price != null && safeHref(item.image) ? 'Got it this time' : 'Still missing some details. You can add them yourself.', { type: item.price != null && safeHref(item.image) ? 'good' : 'warn' });
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  }
  if (act === 'refresh') {
    const btn = e.target.closest('[data-act]');
    btn.disabled = true;
    btn.textContent = 'Checking…';
    await refreshPrice(item);
  }
  render();
  renderDetail();
});

// ---------- add ----------

function openAdd() {
  els.input.value = '';
  els.addDlg.showModal();
  els.input.focus();
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-open-add]')) openAdd();
});

els.addDlg.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) els.addDlg.close();
});

els.addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = els.input.value.trim();
  if (!v) return els.input.focus();
  els.addDlg.close();
  addUrl(v);
});

$('#pasteBtn').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return toast('Your clipboard is empty');
    els.input.value = text.trim();
    els.addForm.requestSubmit();
  } catch {
    toast('Long-press the box and choose Paste', { timeout: 3000 });
    els.input.focus();
  }
});

// Paste a link anywhere (outside inputs) to add it.
document.addEventListener('paste', (e) => {
  if (e.target.closest?.('input, textarea, [contenteditable]') || document.querySelector('dialog[open]')) return;
  const text = e.clipboardData?.getData('text') || '';
  if (/https?:\/\//i.test(text)) {
    e.preventDefault();
    addUrl(text);
  }
});

// ---------- editor ----------

let editingId = null;

function openEditor(id) {
  const item = byId(id);
  if (!item) return;
  editingId = id;
  const f = els.editForm.elements;
  const cats = new Set([...Object.keys(CATEGORY_ICONS), ...items.map((i) => i.category).filter(Boolean)]);
  $('#eCategory').innerHTML = [...cats].map((c) => `<option ${c === item.category ? 'selected' : ''}>${esc(c)}</option>`).join('') + '<option value="__new">+ New section…</option>';
  f.title.value = item.title || '';
  f.price.value = item.price ?? '';
  f.currency.value = item.currency || '';
  f.originalPrice.value = item.originalPrice ?? '';
  f.brand.value = item.brand || '';
  f.store.value = item.store || '';
  f.image.value = item.image || '';
  f.subcategory.value = item.subcategory || '';
  f.tags.value = (item.tags || []).join(', ');
  f.sizes.value = (item.sizes || []).join(', ');
  f.colors.value = (item.colors || []).join(', ');
  f.url.value = item.url || '';
  els.editor.showModal();
}

$('#eCategory').addEventListener('change', (e) => {
  if (e.target.value !== '__new') return;
  const name = prompt('Name the new section')?.trim();
  if (name) e.target.add(new Option(name, name, true, true), e.target.options.length - 1);
  else e.target.selectedIndex = 0;
});

$('#eRefetch').addEventListener('click', async () => {
  const item = byId(editingId);
  if (!item) return;
  const btn = $('#eRefetch');
  btn.disabled = true;
  btn.textContent = 'Reading…';
  try {
    const { item: fresh, blocked } = await extract(els.editForm.elements.url.value);
    if (blocked) toast("The store didn't share its details.", { type: 'warn' });
    Object.assign(item, fresh, {
      notes: item.notes, starred: item.starred, purchased: item.purchased, priceHistory: item.priceHistory,
      selectedSize: item.selectedSize, selectedColor: item.selectedColor,
    });
    save();
    openEditor(item.id);
    render();
  } catch (err) {
    toast(err.message, { type: 'error' });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Re-read page';
  }
});

els.editor.addEventListener('close', () => {
  if (els.editor.returnValue !== 'save') return;
  const item = byId(editingId);
  if (!item) return;
  const f = els.editForm.elements;
  const newPrice = num(f.price.value);
  if (newPrice != null && newPrice !== item.price) {
    item.priceHistory = [...(item.priceHistory || []), { price: newPrice, at: Date.now() }].slice(-30);
  }
  Object.assign(item, {
    title: f.title.value.trim() || item.title,
    price: newPrice,
    currency: f.currency.value.trim().toUpperCase(),
    originalPrice: num(f.originalPrice.value),
    brand: f.brand.value.trim(),
    store: f.store.value.trim(),
    image: f.image.value.trim(),
    category: f.category.value === '__new' ? item.category : f.category.value,
    subcategory: f.subcategory.value.trim(),
    tags: list(f.tags.value),
    sizes: list(f.sizes.value),
    colors: list(f.colors.value),
    url: f.url.value.trim() || item.url,
    updatedAt: Date.now(),
  });
  save();
  render();
  if (els.detailDlg.open) renderDetail();
});

// ---------- navigation ----------

function currentView() {
  return location.hash.startsWith('#list') ? 'list' : 'shop';
}

function render() {
  const view = currentView();
  els.shop.hidden = view !== 'shop';
  els.list.hidden = view !== 'list';
  for (const a of document.querySelectorAll('[data-view]')) a.classList.toggle('on', a.dataset.view === view);
  if (view === 'shop') renderShop();
  else renderList();
}

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});

// Cards open the detail view; "See all" links and category tiles set the list filter.
document.addEventListener('click', (e) => {
  const cardEl = e.target.closest('.card[data-id]');
  if (cardEl) return openDetail(cardEl.dataset.id);
  const filterEl = e.target.closest('[data-filter]');
  if (filterEl) {
    state.filter = filterEl.dataset.filter;
    if (currentView() === 'list') {
      render();
      window.scrollTo(0, 0);
    }
  }
});

document.addEventListener('keydown', (e) => {
  const cardEl = e.target.closest?.('.card[data-id]');
  if (cardEl && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    openDetail(cardEl.dataset.id);
  }
});

document.addEventListener('submit', (e) => {
  const inline = e.target.closest('[data-inline-add]');
  if (!inline) return;
  e.preventDefault();
  const input = inline.querySelector('input');
  const v = input.value.trim();
  input.value = '';
  if (v) addUrl(v);
});

document.addEventListener('change', (e) => {
  if (e.target.matches('[data-gift-limit]')) {
    prefs.giftLimit = +e.target.value;
    savePrefs();
    renderShop();
  }
});

els.search.addEventListener('input', () => {
  state.search = els.search.value;
  renderList();
});

els.sort.value = prefs.sort;
els.sort.addEventListener('change', () => {
  prefs.sort = els.sort.value;
  savePrefs();
  renderList();
});

// ---------- menu ----------

els.menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = els.menu.hidden;
  els.menu.hidden = !open;
  els.menuBtn.setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', () => {
  els.menu.hidden = true;
  els.menuBtn.setAttribute('aria-expanded', 'false');
});

els.menu.addEventListener('click', async (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'export') {
    const blob = new Blob([JSON.stringify({ app: 'smart-wishlist', version: 1, exportedAt: new Date().toISOString(), items: items.filter((i) => i.status !== 'loading') }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `wishlist-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  if (action === 'import') els.importFile.click();
  if (action === 'bookmarklet') {
    const origin = location.origin + location.pathname.replace(/[^/]*$/, '');
    $('#bookmarkletLink').href = `javascript:(()=>{window.open(${JSON.stringify(origin)}+'?add='+encodeURIComponent(location.href),'_blank')})()`;
    $('#bookmarkletDlg').showModal();
  }
  if (action === 'share') {
    const lines = wanted().map((i) => `• ${i.title}${i.price != null ? ` — ${money(i.price, i.currency)}` : ''}${i.selectedSize ? ` · size ${i.selectedSize}` : ''}${i.selectedColor ? ` · ${i.selectedColor}` : ''}\n  ${i.url}`);
    try {
      await navigator.clipboard.writeText(`My wishlist\n\n${lines.join('\n')}`);
      toast('Copied. Paste it into a text or email.');
    } catch {
      toast("Couldn't copy to clipboard", { type: 'error' });
    }
  }
  if (action === 'refresh-all') {
    const targets = wanted();
    if (!targets.length) return;
    toast(`Checking ${plural(targets.length, 'price')}…`);
    let drops = 0;
    for (let i = 0; i < targets.length; i += 3) {
      const results = await Promise.all(targets.slice(i, i + 3).map((t) => refreshPrice(t, { quiet: true })));
      drops += results.filter((d) => d != null && d < 0).length;
      render();
    }
    toast(drops ? `${plural(drops, 'price drop')} found!` : 'No price drops right now.', { type: drops ? 'good' : 'info' });
  }
});

els.importFile.addEventListener('change', async () => {
  const file = els.importFile.files[0];
  els.importFile.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = (Array.isArray(data) ? data : data.items || []).filter((i) => i && i.url && i.title);
    let added = 0;
    for (const i of incoming) {
      if (items.some((x) => x.id === i.id || sameUrl(x.url, i.url))) continue;
      items.push({ ...i, id: i.id || uid(), status: 'ready', addedAt: i.addedAt || Date.now() });
      added++;
    }
    save();
    render();
    toast(`Imported ${plural(added, 'item')}${incoming.length - added ? ` (${incoming.length - added} already here)` : ''}`);
  } catch {
    toast("That file isn't a wishlist backup", { type: 'error' });
  }
});

// ---------- startup ----------

render();

// ?add=URL (bookmarklet) or share-target params (?url= / ?text=)
{
  const params = new URLSearchParams(location.search);
  const incoming = params.get('add') || params.get('url') || params.get('text');
  if (incoming) {
    history.replaceState(null, '', location.pathname + location.hash);
    addUrl(incoming);
  }
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
