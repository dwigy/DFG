// Smart Wishlist front end. Items live in localStorage; the server only reads product pages.

const STORE_KEY = 'smart-wishlist:v1';
const PREFS_KEY = 'smart-wishlist:prefs';

const CATEGORY_ICONS = {
  Clothing: '👕', Shoes: '👟', 'Bags & Accessories': '👜', 'Jewelry & Watches': '💍', Beauty: '💄',
  Electronics: '🎧', Home: '🛋️', Kitchen: '🍳', 'Books & Media': '📚', 'Toys & Games': '🧸',
  'Sports & Outdoors': '🏕️', 'Baby & Kids': '🍼', Pets: '🐾', 'Tools & Garden': '🛠️', Food: '🍫',
  Experiences: '🎟️', Other: '✨',
};

const $ = (sel, root = document) => root.querySelector(sel);
const els = {
  form: $('#addForm'), input: $('#urlInput'), addBtn: $('#addBtn'), hint: $('#hint'),
  cats: $('#cats'), tagBar: $('#tagBar'), list: $('#list'), empty: $('#empty'), summary: $('#summary'),
  search: $('#search'), sort: $('#sort'), showBought: $('#showBought'),
  menuBtn: $('#menuBtn'), menu: $('#menu'), toasts: $('#toasts'), importFile: $('#importFile'),
  editor: $('#editor'), editForm: $('#editForm'),
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

let items = safeStorage.get(STORE_KEY, []).filter((i) => i && i.id);
const prefs = { category: 'All', tags: [], sort: 'new', showBought: false, search: '', ...safeStorage.get(PREFS_KEY, {}) };
prefs.search = '';
let storageWarned = false;

function save() {
  const persisted = items.filter((i) => i.status !== 'loading');
  if (!safeStorage.set(STORE_KEY, persisted) && !storageWarned) {
    storageWarned = true;
    toast("Couldn't save in this browser (private mode?). Export your list to keep it.", { type: 'error', timeout: 8000 });
  }
}
const savePrefs = () => safeStorage.set(PREFS_KEY, { category: prefs.category, tags: prefs.tags, sort: prefs.sort, showBought: prefs.showBought });

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

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

function cssColor(name) {
  if (!name) return '';
  const words = name.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  const candidates = [words.join(''), ...words.reverse()];
  const aliases = { navy: 'navy', cream: '#f3ead7', ivory: 'ivory', natural: '#e8dcc8', sand: '#d8c3a5', oat: '#dfd3bf', camel: '#c19a6b', charcoal: '#36454f', heather: '#9aa0a6', sage: '#9caf88', olive: 'olive', rust: '#b7410e', burgundy: '#800020', wine: '#722f37', mauve: '#b784a7', blush: '#f4c2c2', nude: '#e3bc9a', mint: '#98ff98', denim: '#1560bd', khaki: 'khaki', stone: '#a8a29e', taupe: '#8b7d6b', multi: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' };
  for (const c of candidates) {
    if (aliases[c]) return aliases[c];
    if (window.CSS?.supports?.('color', c)) return c;
  }
  return '';
}

function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const units = [[31536000, 'y'], [2592000, 'mo'], [604800, 'w'], [86400, 'd'], [3600, 'h'], [60, 'm']];
  for (const [secs, label] of units) if (s >= secs) return `${Math.floor(s / secs)}${label} ago`;
  return '';
}

function priceChange(item) {
  const hist = item.priceHistory || [];
  if (hist.length < 2 || item.price == null) return 0;
  const first = hist[0].price;
  return first ? item.price - first : 0;
}

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

// ---------- API ----------

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
    toast('Already on your list');
    highlight(dup.id);
    return;
  }
  const placeholder = { id: uid(), url, status: 'loading', addedAt: Date.now(), title: url };
  items.unshift(placeholder);
  if (prefs.category !== 'All') prefs.category = 'All';
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
    if (blocked) {
      toast(`${item.store} blocked automatic reading. Add the price and photo yourself.`, { type: 'warn', timeout: 7000, action: { label: 'Edit', run: () => openEditor(placeholder.id) } });
    } else if (missing.length) {
      toast(`Added. Couldn't find the ${missing.join(' or ')}.`, { type: 'warn', action: { label: 'Edit', run: () => openEditor(placeholder.id) } });
    } else {
      toast(`Added to ${item.category}`);
    }
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
      if (!quiet) toast(`Couldn't read the current price for “${item.title}”`, { type: 'warn' });
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
      toast(old === fresh.price ? 'Price unchanged' : `Now ${money(fresh.price, item.currency)}`);
    }
    return fresh.price - (old ?? fresh.price);
  } catch (err) {
    if (!quiet) toast(err.message, { type: 'error' });
    return null;
  }
}

// ---------- filtering ----------

function visibleItems() {
  const q = prefs.search.toLowerCase();
  let out = items.filter((i) => {
    if (i.status === 'loading') return true;
    if (!prefs.showBought && i.purchased) return false;
    if (prefs.category !== 'All' && i.category !== prefs.category) return false;
    if (prefs.tags.length && !prefs.tags.every((t) => (i.tags || []).includes(t))) return false;
    if (q) {
      const hay = [i.title, i.brand, i.store, i.category, i.subcategory, i.notes, ...(i.tags || []), ...(i.colors || [])].join(' ').toLowerCase();
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  const price = (i) => i.price ?? (prefs.sort === 'price-asc' ? Infinity : -Infinity);
  const sorters = {
    new: (a, b) => b.addedAt - a.addedAt,
    old: (a, b) => a.addedAt - b.addedAt,
    'price-asc': (a, b) => price(a) - price(b),
    'price-desc': (a, b) => price(b) - price(a),
    drops: (a, b) => priceChange(a) - priceChange(b),
    category: (a, b) => (a.category || '').localeCompare(b.category || '') || b.addedAt - a.addedAt,
    store: (a, b) => (a.store || '').localeCompare(b.store || '') || b.addedAt - a.addedAt,
  };
  out = out.sort((a, b) => (a.status === 'loading' ? -1 : b.status === 'loading' ? 1 : 0) || (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || sorters[prefs.sort](a, b));
  return out;
}

// ---------- rendering ----------

function renderCategories() {
  const ready = items.filter((i) => i.status !== 'loading' && (prefs.showBought || !i.purchased));
  const counts = {};
  for (const i of ready) counts[i.category || 'Other'] = (counts[i.category || 'Other'] || 0) + 1;
  if (prefs.category !== 'All' && !counts[prefs.category]) prefs.category = 'All';
  const cats = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  els.cats.hidden = ready.length === 0;
  els.cats.innerHTML = [
    `<button class="chip ${prefs.category === 'All' ? 'on' : ''}" data-cat="All">All <b>${ready.length}</b></button>`,
    ...cats.map((c) => `<button class="chip ${prefs.category === c ? 'on' : ''}" data-cat="${esc(c)}"><span aria-hidden="true">${CATEGORY_ICONS[c] || '🏷️'}</span> ${esc(c)} <b>${counts[c]}</b></button>`),
  ].join('');
}

function renderTags() {
  const pool = items.filter((i) => i.status !== 'loading' && (prefs.showBought || !i.purchased) && (prefs.category === 'All' || i.category === prefs.category));
  const counts = {};
  for (const i of pool) for (const t of i.tags || []) counts[t] = (counts[t] || 0) + 1;
  prefs.tags = prefs.tags.filter((t) => counts[t]);
  // Descriptive tags first; price bands ("$50–100", "Under $25") at the end, cheapest first.
  const band = (t) => (/^Under \$/.test(t) ? 0 : /^\$\d/.test(t) ? parseFloat(t.slice(1).replace(/,/g, '')) : -1);
  const tags = Object.keys(counts)
    .sort((a, b) => (band(a) >= 0) - (band(b) >= 0) || band(a) - band(b) || counts[b] - counts[a] || a.localeCompare(b))
    .slice(0, 30);
  els.tagBar.innerHTML = tags
    .map((t) => `<button class="tag ${prefs.tags.includes(t) ? 'on' : ''}" data-tag="${esc(t)}">#${esc(t)} <small>${counts[t]}</small></button>`)
    .join('') + (prefs.tags.length ? '<button class="tag clear" data-tag="">✕ Clear tags</button>' : '');
}

function renderSummary(visible) {
  const active = items.filter((i) => i.status === 'ready' && !i.purchased);
  const shown = visible.filter((i) => i.status === 'ready' && !i.purchased && i.price != null);
  const currencies = new Set(shown.map((i) => i.currency || 'USD'));
  const total = shown.reduce((s, i) => s + i.price, 0);
  els.summary.innerHTML = active.length
    ? `<span>${active.length} item${active.length === 1 ? '' : 's'}</span>${shown.length && currencies.size === 1 ? `<span class="total">${money(total, [...currencies][0])}</span>` : ''}`
    : '';
}

function chipRow(item, kind) {
  const values = item[kind] || [];
  if (!values.length) return '';
  const selected = kind === 'sizes' ? item.selectedSize : item.selectedColor;
  const max = kind === 'sizes' ? 8 : 6;
  const shown = values.slice(0, max);
  const chips = shown
    .map((v) => {
      const swatch = kind === 'colors' ? cssColor(v) : '';
      return `<button class="opt ${v === selected ? 'on' : ''}" data-pick="${kind}" data-value="${esc(v)}" title="${esc(v)}">${swatch ? `<i style="background:${esc(swatch)}"></i>` : ''}${esc(v)}</button>`;
    })
    .join('');
  const more = values.length > max ? `<span class="more">+${values.length - max}</span>` : '';
  return `<div class="opts" aria-label="${kind === 'sizes' ? 'Sizes' : 'Colors'}">${chips}${more}</div>`;
}

function card(item) {
  if (item.status === 'loading') {
    let host = '';
    try {
      host = new URL(item.url).hostname.replace(/^www\./, '');
    } catch { /* ignore */ }
    return `<article class="card loading" data-id="${item.id}">
      <div class="media shimmer"></div>
      <div class="body"><div class="store">${esc(host)}</div><div class="line shimmer"></div><div class="line short shimmer"></div>
      <p class="muted small">Reading the product page…</p></div></article>`;
  }
  const change = priceChange(item);
  const onSale = item.originalPrice && item.price && item.originalPrice > item.price;
  const img = safeHref(item.image);
  return `<article class="card ${item.purchased ? 'bought' : ''}" data-id="${item.id}">
    <div class="media">
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-fallback>` : ''}
      <div class="noimg" ${img ? 'hidden' : ''}>${CATEGORY_ICONS[item.category] || '🛍️'}</div>
      <button class="star ${item.starred ? 'on' : ''}" data-act="star" aria-label="${item.starred ? 'Unpin' : 'Pin to top'}" title="Pin to top">★</button>
      ${change < 0 ? `<span class="badge good">↓ ${money(-change, item.currency)}</span>` : onSale ? `<span class="badge sale">Sale</span>` : ''}
      ${item.inStock === false ? '<span class="badge out">Sold out</span>' : ''}
      ${item.purchased ? '<span class="badge bought">✓ Got it</span>' : ''}
    </div>
    <div class="body">
      <div class="store">${esc(item.store || item.domain)}${item.brand && item.brand !== item.store ? ` · ${esc(item.brand)}` : ''}</div>
      <h3><a href="${esc(safeHref(item.url))}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h3>
      <div class="price">
        ${item.price != null ? `<strong>${money(item.price, item.currency)}</strong>` : '<button class="link" data-act="edit">Add price</button>'}
        ${onSale ? `<s>${money(item.originalPrice, item.currency)}</s>` : ''}
        ${change > 0 ? `<span class="up">↑ ${money(change, item.currency)}</span>` : ''}
      </div>
      ${chipRow(item, 'sizes')}
      ${chipRow(item, 'colors')}
      ${item.notes ? `<p class="notes">${esc(item.notes)}</p>` : ''}
      <div class="meta">
        <button class="cat-label" data-cat="${esc(item.category)}">${CATEGORY_ICONS[item.category] || '🏷️'} ${esc(item.category)}${item.subcategory ? ` · ${esc(item.subcategory)}` : ''}</button>
        ${(item.tags || []).filter((t) => t !== item.subcategory).slice(0, 4).map((t) => `<button class="mini-tag" data-tag="${esc(t)}">#${esc(t)}</button>`).join('')}
      </div>
    </div>
    <footer class="actions">
      <a class="act" href="${esc(safeHref(item.url))}" target="_blank" rel="noopener noreferrer" title="Open in store">↗ Shop</a>
      <button class="act" data-act="refresh" title="Check current price">↻</button>
      <button class="act" data-act="edit" title="Edit">✎</button>
      <button class="act" data-act="bought" title="${item.purchased ? 'Move back to wishlist' : 'Mark as purchased'}">${item.purchased ? '↺' : '✓'}</button>
      <button class="act danger" data-act="delete" title="Remove">🗑</button>
      <span class="age" title="${new Date(item.addedAt).toLocaleString()}">${timeAgo(item.addedAt)}</span>
    </footer>
  </article>`;
}

function render() {
  renderCategories();
  renderTags();
  const visible = visibleItems();
  renderSummary(visible);
  const grouped = prefs.sort === 'category' || prefs.sort === 'store';
  if (grouped) {
    const key = prefs.sort === 'category' ? 'category' : 'store';
    const groups = new Map();
    for (const i of visible) {
      const k = i.status === 'loading' ? 'Adding…' : i[key] || 'Other';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(i);
    }
    els.list.className = 'list grouped';
    els.list.innerHTML = [...groups]
      .map(([k, group]) => `<section class="group"><h2>${key === 'category' ? `${CATEGORY_ICONS[k] || ''} ` : ''}${esc(k)} <small>${group.length}</small></h2><div class="grid">${group.map(card).join('')}</div></section>`)
      .join('');
  } else {
    els.list.className = 'list grid';
    els.list.innerHTML = visible.map(card).join('');
  }
  const hasAny = items.length > 0;
  els.empty.hidden = hasAny;
  els.hint.hidden = hasAny;
  if (hasAny && !visible.length) {
    els.list.innerHTML = '<p class="no-match">Nothing matches these filters.</p>';
  }
  for (const img of els.list.querySelectorAll('img[data-fallback]')) {
    img.addEventListener('error', () => {
      img.remove();
      img.closest('.media')?.querySelector('.noimg')?.removeAttribute('hidden');
    }, { once: true });
  }
}

function highlight(id) {
  prefs.category = 'All';
  prefs.tags = [];
  render();
  const el = els.list.querySelector(`[data-id="${id}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1600);
}

// ---------- editor ----------

let editingId = null;

function openEditor(id) {
  const item = items.find((i) => i.id === id);
  if (!item) return;
  editingId = id;
  const f = els.editForm.elements;
  const cats = new Set([...Object.keys(CATEGORY_ICONS), ...items.map((i) => i.category).filter(Boolean)]);
  $('#eCategory').innerHTML = [...cats].map((c) => `<option ${c === item.category ? 'selected' : ''}>${esc(c)}</option>`).join('') + '<option value="__new">+ New category…</option>';
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
  f.selectedSize.value = item.selectedSize || '';
  f.selectedColor.value = item.selectedColor || '';
  f.notes.value = item.notes || '';
  f.url.value = item.url || '';
  $('#eSizeList').innerHTML = (item.sizes || []).map((s) => `<option value="${esc(s)}">`).join('');
  $('#eColorList').innerHTML = (item.colors || []).map((s) => `<option value="${esc(s)}">`).join('');
  updatePreview();
  $('#eThumbs').innerHTML = (item.images || [])
    .filter(safeHref)
    .slice(0, 8)
    .map((src) => `<button type="button" data-src="${esc(src)}" class="${src === item.image ? 'on' : ''}"><img src="${esc(src)}" alt="" referrerpolicy="no-referrer" loading="lazy"></button>`)
    .join('');
  els.editor.showModal();
}

function updatePreview() {
  const src = safeHref(els.editForm.elements.image.value);
  const img = $('#ePreview');
  img.hidden = !src;
  if (src) img.src = src;
}

els.editForm.elements.image.addEventListener('input', updatePreview);

$('#eThumbs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-src]');
  if (!btn) return;
  els.editForm.elements.image.value = btn.dataset.src;
  for (const b of $('#eThumbs').children) b.classList.toggle('on', b === btn);
  updatePreview();
});

$('#eCategory').addEventListener('change', (e) => {
  if (e.target.value !== '__new') return;
  const name = prompt('New category name')?.trim();
  if (name) {
    const opt = new Option(name, name, true, true);
    e.target.add(opt, e.target.options.length - 1);
  } else {
    e.target.selectedIndex = 0;
  }
});

$('#eRefetch').addEventListener('click', async () => {
  const item = items.find((i) => i.id === editingId);
  if (!item) return;
  const btn = $('#eRefetch');
  btn.disabled = true;
  btn.textContent = 'Reading…';
  try {
    const url = els.editForm.elements.url.value;
    const { item: fresh, blocked } = await extract(url);
    if (blocked) toast('The store blocked automatic reading.', { type: 'warn' });
    Object.assign(item, fresh, { notes: item.notes, starred: item.starred, purchased: item.purchased, priceHistory: item.priceHistory });
    save();
    openEditor(item.id);
    render();
  } catch (err) {
    toast(err.message, { type: 'error' });
  } finally {
    btn.disabled = false;
    btn.textContent = '↻ Re-read page';
  }
});

els.editor.addEventListener('close', () => {
  if (els.editor.returnValue !== 'save') return;
  const item = items.find((i) => i.id === editingId);
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
    selectedSize: f.selectedSize.value.trim(),
    selectedColor: f.selectedColor.value.trim(),
    notes: f.notes.value.trim(),
    url: f.url.value.trim() || item.url,
    updatedAt: Date.now(),
  });
  save();
  render();
});

// ---------- events ----------

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = els.input.value;
  els.input.value = '';
  addUrl(v);
});

document.addEventListener('paste', (e) => {
  const target = e.target;
  if (target.closest?.('input, textarea, dialog, [contenteditable]')) return;
  const text = e.clipboardData?.getData('text') || '';
  if (/https?:\/\//i.test(text)) {
    e.preventDefault();
    addUrl(text);
  }
});

els.cats.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-cat]');
  if (!btn) return;
  prefs.category = btn.dataset.cat;
  savePrefs();
  render();
});

els.tagBar.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tag]');
  if (!btn) return;
  const t = btn.dataset.tag;
  prefs.tags = !t ? [] : prefs.tags.includes(t) ? prefs.tags.filter((x) => x !== t) : [...prefs.tags, t];
  savePrefs();
  render();
});

els.search.addEventListener('input', () => {
  prefs.search = els.search.value;
  render();
});

els.sort.value = prefs.sort;
els.sort.addEventListener('change', () => {
  prefs.sort = els.sort.value;
  savePrefs();
  render();
});

els.showBought.checked = prefs.showBought;
els.showBought.addEventListener('change', () => {
  prefs.showBought = els.showBought.checked;
  savePrefs();
  render();
});

els.list.addEventListener('click', async (e) => {
  const cardEl = e.target.closest('.card');
  const item = cardEl && items.find((i) => i.id === cardEl.dataset.id);
  if (!item || item.status === 'loading') return;

  const pick = e.target.closest('[data-pick]');
  if (pick) {
    const field = pick.dataset.pick === 'sizes' ? 'selectedSize' : 'selectedColor';
    item[field] = item[field] === pick.dataset.value ? '' : pick.dataset.value;
    save();
    render();
    return;
  }
  const catBtn = e.target.closest('[data-cat]');
  if (catBtn) {
    prefs.category = catBtn.dataset.cat;
    savePrefs();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const tagBtn = e.target.closest('[data-tag]');
  if (tagBtn) {
    if (!prefs.tags.includes(tagBtn.dataset.tag)) prefs.tags = [...prefs.tags, tagBtn.dataset.tag];
    savePrefs();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act) return;
  if (act === 'edit') openEditor(item.id);
  if (act === 'star') {
    item.starred = !item.starred;
    save();
    render();
  }
  if (act === 'bought') {
    item.purchased = !item.purchased;
    save();
    render();
    if (item.purchased) toast('Marked as purchased 🎉', { action: { label: 'Undo', run: () => { item.purchased = false; save(); render(); } } });
  }
  if (act === 'delete') {
    const index = items.indexOf(item);
    items.splice(index, 1);
    save();
    render();
    toast('Removed', { action: { label: 'Undo', run: () => { items.splice(index, 0, item); save(); render(); } }, timeout: 6000 });
  }
  if (act === 'refresh') {
    const btn = e.target.closest('[data-act]');
    btn.classList.add('spin');
    await refreshPrice(item);
    render();
  }
});

// Menu
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
    const lines = visibleItems()
      .filter((i) => i.status === 'ready')
      .map((i) => `• ${i.title}${i.price != null ? ` — ${money(i.price, i.currency)}` : ''}${i.selectedSize ? ` (size ${i.selectedSize})` : ''}${i.selectedColor ? ` (${i.selectedColor})` : ''}\n  ${i.url}`);
    try {
      await navigator.clipboard.writeText(`My wishlist\n\n${lines.join('\n')}`);
      toast('Copied. Paste it anywhere to share.');
    } catch {
      toast("Couldn't copy to clipboard", { type: 'error' });
    }
  }
  if (action === 'refresh-all') {
    const targets = items.filter((i) => i.status === 'ready' && !i.purchased);
    if (!targets.length) return;
    toast(`Checking ${targets.length} price${targets.length === 1 ? '' : 's'}…`);
    let drops = 0;
    for (let i = 0; i < targets.length; i += 3) {
      const results = await Promise.all(targets.slice(i, i + 3).map((t) => refreshPrice(t, { quiet: true })));
      drops += results.filter((d) => d != null && d < 0).length;
      render();
    }
    toast(drops ? `${drops} price drop${drops === 1 ? '' : 's'} found!` : 'No price drops right now.', { type: drops ? 'good' : 'info' });
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
    toast(`Imported ${added} item${added === 1 ? '' : 's'}${incoming.length - added ? ` (${incoming.length - added} already here)` : ''}`);
  } catch {
    toast("That file isn't a wishlist export", { type: 'error' });
  }
});

// ---------- startup ----------

render();

// ?add=URL (bookmarklet) or share-target params (?url= / ?text=)
{
  const params = new URLSearchParams(location.search);
  const incoming = params.get('add') || params.get('url') || params.get('text');
  if (incoming) {
    history.replaceState(null, '', location.pathname);
    addUrl(incoming);
  }
}

serverConfig.then((cfg) => {
  if (cfg?.ai) document.body.classList.add('ai-on');
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
