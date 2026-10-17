// Rule-based categorizer: scores each category by keyword hits across the
// title, breadcrumbs, store product type, URL and description, then emits
// the winning category plus specific type tags (e.g. "sneakers", "hoodie").

export const CATEGORIES = {
  Clothing: {
    icon: '👕',
    types: {
      Tops: ['t-shirt', 'tee', 'shirt', 'blouse', 'top', 'tank', 'camisole', 'polo', 'henley', 'bodysuit', 'crop top'],
      Sweaters: ['sweater', 'cardigan', 'pullover', 'jumper', 'knit', 'turtleneck', 'crewneck', 'crew'],
      Hoodies: ['hoodie', 'sweatshirt', 'zip-up', 'fleece'],
      Outerwear: ['jacket', 'coat', 'parka', 'puffer', 'blazer', 'vest', 'gilet', 'windbreaker', 'trench', 'anorak', 'raincoat', 'bomber'],
      Pants: ['pants', 'trousers', 'chinos', 'joggers', 'sweatpants', 'leggings', 'cargo', 'slacks', 'trouser'],
      Jeans: ['jeans', 'denim'],
      Shorts: ['shorts'],
      Dresses: ['dress', 'gown', 'romper', 'jumpsuit', 'sundress'],
      Skirts: ['skirt'],
      Suits: ['suit', 'tuxedo'],
      Activewear: ['activewear', 'sports bra', 'yoga pants', 'running shorts', 'athletic', 'tracksuit', 'compression'],
      Swimwear: ['swimsuit', 'bikini', 'swim trunks', 'swimwear', 'boardshorts', 'one-piece'],
      'Underwear & Sleep': ['underwear', 'boxers', 'briefs', 'bra', 'lingerie', 'pajamas', 'pyjamas', 'sleepwear', 'robe', 'socks', 'loungewear'],
    },
    hints: ['clothing', 'apparel', 'menswear', 'womenswear', 'fashion', 'wear', 'garment'],
  },
  Shoes: {
    icon: '👟',
    types: {
      Sneakers: ['sneaker', 'trainer', 'runner', 'running shoe', 'basketball shoe', 'air max', 'air force', 'jordan', 'yeezy', 'dunk', 'new balance', 'chuck taylor', 'vans old skool'],
      Boots: ['boot', 'chelsea', 'combat boot', 'hiking boot', 'ankle boot', 'timberland'],
      Sandals: ['sandal', 'slide', 'flip flop', 'flip-flop', 'birkenstock', 'espadrille'],
      Heels: ['heel', 'pump', 'stiletto', 'platform', 'wedge'],
      'Flats & Loafers': ['loafer', 'flat', 'ballet flat', 'mule', 'moccasin', 'oxford', 'derby', 'brogue', 'dress shoe'],
      Slippers: ['slipper'],
    },
    hints: ['shoes', 'shoe', 'footwear'],
  },
  'Bags & Accessories': {
    icon: '👜',
    types: {
      Bags: ['bag', 'handbag', 'tote', 'backpack', 'purse', 'clutch', 'crossbody', 'duffel', 'satchel', 'messenger', 'fanny pack', 'belt bag', 'luggage', 'suitcase'],
      Wallets: ['wallet', 'card holder', 'cardholder'],
      Hats: ['hat', 'cap', 'beanie', 'bucket hat', 'fedora', 'snapback'],
      Sunglasses: ['sunglasses', 'eyewear', 'glasses', 'frames', 'ray-ban'],
      Belts: ['belt'],
      'Scarves & Gloves': ['scarf', 'gloves', 'mittens', 'bandana'],
    },
    hints: ['accessories', 'accessory', 'leather goods'],
  },
  'Jewelry & Watches': {
    icon: '💍',
    types: {
      Rings: ['ring', 'band ring', 'engagement ring'],
      Necklaces: ['necklace', 'pendant', 'chain', 'choker'],
      Earrings: ['earring', 'studs', 'hoops', 'huggies'],
      Bracelets: ['bracelet', 'bangle', 'cuff'],
      Watches: ['watch', 'smartwatch', 'chronograph', 'rolex', 'seiko', 'casio'],
    },
    hints: ['jewelry', 'jewellery', 'fine jewelry', '14k', '18k', 'sterling silver', 'gold vermeil'],
  },
  Beauty: {
    icon: '💄',
    types: {
      Skincare: ['serum', 'moisturizer', 'moisturiser', 'cleanser', 'sunscreen', 'spf', 'toner', 'retinol', 'face mask', 'eye cream', 'skincare', 'exfoliant'],
      Makeup: ['lipstick', 'mascara', 'foundation', 'concealer', 'eyeshadow', 'blush', 'bronzer', 'highlighter', 'lip gloss', 'eyeliner', 'makeup', 'palette', 'primer'],
      Fragrance: ['perfume', 'cologne', 'eau de parfum', 'eau de toilette', 'fragrance', 'parfum'],
      Hair: ['shampoo', 'conditioner', 'hair oil', 'hair dryer', 'straightener', 'curling', 'dyson airwrap', 'hair mask'],
      'Bath & Body': ['body wash', 'lotion', 'body butter', 'deodorant', 'bath', 'soap'],
      Nails: ['nail polish', 'nail'],
    },
    hints: ['beauty', 'cosmetics', 'sephora', 'ulta', 'personal care'],
  },
  Electronics: {
    icon: '🎧',
    types: {
      Phones: ['iphone', 'smartphone', 'phone', 'galaxy s', 'pixel'],
      Computers: ['laptop', 'macbook', 'notebook pc', 'desktop', 'chromebook', 'monitor', 'keyboard', 'mouse', 'imac', 'ssd', 'gpu', 'graphics card'],
      Tablets: ['ipad', 'tablet', 'kindle', 'e-reader'],
      Audio: ['headphones', 'earbuds', 'airpods', 'speaker', 'soundbar', 'headset', 'turntable', 'record player', 'amplifier'],
      'TV & Video': ['tv', 'television', 'projector', 'streaming stick', 'roku', 'apple tv'],
      Cameras: ['camera', 'lens', 'gopro', 'mirrorless', 'dslr', 'drone'],
      Gaming: ['playstation', 'ps5', 'xbox', 'nintendo', 'switch 2', 'controller', 'gaming', 'steam deck', 'console'],
      'Smart Home': ['smart home', 'alexa', 'echo dot', 'nest', 'smart plug', 'ring doorbell', 'smart bulb', 'security camera'],
      Wearables: ['apple watch', 'fitbit', 'garmin', 'oura', 'smart ring', 'fitness tracker'],
      Accessories: ['charger', 'cable', 'power bank', 'phone case', 'adapter', 'usb-c', 'magsafe', 'dock'],
    },
    hints: ['electronics', 'tech', 'wireless', 'bluetooth', 'gadget', 'best buy', 'apple', 'samsung', 'sony', 'bose'],
  },
  Home: {
    icon: '🛋️',
    types: {
      Furniture: ['sofa', 'couch', 'chair', 'table', 'desk', 'bed frame', 'dresser', 'nightstand', 'bookshelf', 'shelf', 'cabinet', 'ottoman', 'stool', 'sectional', 'bench', 'armchair'],
      Bedding: ['sheets', 'duvet', 'comforter', 'pillow', 'blanket', 'throw', 'quilt', 'mattress', 'bedding'],
      Decor: ['vase', 'candle', 'mirror', 'frame', 'wall art', 'print', 'poster', 'rug', 'plant', 'planter', 'decor', 'sculpture', 'cushion'],
      Lighting: ['lamp', 'pendant light', 'chandelier', 'sconce', 'light fixture', 'floor lamp'],
      'Bath': ['towel', 'bath mat', 'shower curtain'],
      Storage: ['storage', 'organizer', 'basket', 'bin', 'hamper'],
      Appliances: ['vacuum', 'air purifier', 'humidifier', 'fan', 'heater', 'washer', 'dryer', 'roomba'],
    },
    hints: ['home', 'furniture', 'decor', 'living room', 'bedroom', 'interior', 'ikea', 'wayfair', 'west elm', 'crate'],
  },
  Kitchen: {
    icon: '🍳',
    types: {
      Cookware: ['pan', 'skillet', 'pot', 'dutch oven', 'wok', 'cookware', 'saucepan', 'cast iron', 'baking sheet'],
      'Small Appliances': ['blender', 'espresso machine', 'coffee maker', 'air fryer', 'toaster', 'kettle', 'stand mixer', 'instant pot', 'grinder', 'juicer', 'nespresso', 'kitchenaid', 'vitamix'],
      'Knives & Tools': ['knife', 'knives', 'cutting board', 'spatula', 'whisk', 'utensil'],
      'Dining & Bar': ['plate', 'bowl', 'mug', 'glass', 'glasses set', 'cup', 'dinnerware', 'flatware', 'wine glass', 'tumbler', 'water bottle', 'carafe', 'cocktail', 'stanley', 'yeti'],
    },
    hints: ['kitchen', 'cooking', 'dining', 'cook', 'chef', 'baking'],
  },
  'Books & Media': {
    icon: '📚',
    types: {
      Books: ['book', 'hardcover', 'paperback', 'novel', 'isbn', 'edition', 'audiobook'],
      Music: ['vinyl', 'record', 'album', 'cd', 'lp'],
      Movies: ['blu-ray', 'dvd', '4k uhd'],
      Stationery: ['notebook', 'journal', 'planner', 'pen', 'stationery', 'notepad'],
    },
    hints: ['books', 'author', 'publisher', 'bookshop', 'barnes'],
  },
  'Toys & Games': {
    icon: '🧸',
    types: {
      Toys: ['toy', 'plush', 'doll', 'action figure', 'stuffed animal', 'squishmallow'],
      'Building Sets': ['lego', 'building set', 'building kit', 'magna-tiles'],
      'Board Games & Puzzles': ['board game', 'puzzle', 'card game', 'jigsaw', 'tabletop', 'dice'],
      Collectibles: ['funko', 'collectible', 'trading card', 'figurine', 'pokemon'],
    },
    hints: ['toys', 'games', 'kids', 'ages'],
  },
  'Sports & Outdoors': {
    icon: '🏕️',
    types: {
      Fitness: ['dumbbell', 'kettlebell', 'yoga mat', 'treadmill', 'resistance band', 'weights', 'peloton', 'exercise bike', 'foam roller'],
      Camping: ['tent', 'sleeping bag', 'camping', 'hammock', 'lantern', 'cooler', 'backpacking'],
      Cycling: ['bike', 'bicycle', 'helmet', 'cycling', 'e-bike'],
      'Golf & Racquet': ['golf', 'tennis', 'pickleball', 'racket', 'racquet', 'padel'],
      'Water & Snow': ['surfboard', 'paddle board', 'snowboard', 'ski', 'wetsuit', 'goggles', 'kayak'],
      'Team Sports': ['soccer', 'football', 'basketball', 'baseball', 'jersey', 'cleats'],
    },
    hints: ['outdoor', 'outdoors', 'sports', 'fitness', 'hiking', 'rei', 'patagonia', 'north face', 'arc\'teryx', 'gear'],
  },
  'Baby & Kids': {
    icon: '🍼',
    types: {
      Baby: ['stroller', 'car seat', 'crib', 'onesie', 'diaper', 'baby monitor', 'high chair', 'pacifier', 'bassinet', 'baby carrier'],
      Kids: ['kids', 'toddler', 'youth', 'boys', 'girls'],
    },
    hints: ['baby', 'infant', 'newborn', 'nursery', 'maternity'],
  },
  Pets: {
    icon: '🐾',
    types: {
      Dog: ['dog', 'puppy', 'leash', 'collar', 'dog bed', 'chew'],
      Cat: ['cat', 'kitten', 'litter', 'scratching post', 'cat tree'],
    },
    hints: ['pet', 'pets', 'chewy'],
  },
  'Tools & Garden': {
    icon: '🛠️',
    types: {
      Tools: ['drill', 'saw', 'wrench', 'screwdriver', 'tool set', 'toolbox', 'socket set', 'dewalt', 'milwaukee', 'makita', 'ryobi'],
      Garden: ['garden', 'lawn', 'mower', 'hose', 'grill', 'patio', 'outdoor furniture', 'firepit', 'fire pit', 'seeds'],
      Auto: ['car', 'automotive', 'tire', 'dash cam', 'car mount'],
    },
    hints: ['hardware', 'home depot', 'lowes', 'diy', 'workshop'],
  },
  Food: {
    icon: '🍫',
    types: {
      Snacks: ['chocolate', 'candy', 'snack', 'cookies', 'chips'],
      Drinks: ['coffee beans', 'tea', 'wine', 'whiskey', 'bourbon', 'champagne', 'beer', 'gin', 'tequila'],
      Pantry: ['olive oil', 'sauce', 'spice', 'honey', 'gift basket'],
    },
    hints: ['food', 'gourmet', 'grocery', 'edible'],
  },
  Experiences: {
    icon: '🎟️',
    types: {
      Travel: ['flight', 'hotel', 'airbnb', 'vacation', 'trip', 'resort'],
      Events: ['ticket', 'tickets', 'concert', 'show', 'festival', 'class', 'workshop'],
      Subscriptions: ['subscription', 'membership', 'gift card'],
    },
    hints: ['experience', 'booking', 'ticketmaster'],
  },
};

export const CATEGORY_NAMES = [...Object.keys(CATEGORIES), 'Other'];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Whole-word match that allows simple plurals ("boot" matches "boots", not "booth").
const wordRe = (kw) => new RegExp(`(?:^|[^a-z0-9])${escapeRe(kw).replace(/[-\s]+/g, '[\\s-]?')}(?:s|es)?(?=$|[^a-z0-9])`, 'i');

const compiled = Object.entries(CATEGORIES).map(([name, def]) => ({
  name,
  types: Object.entries(def.types).map(([type, kws]) => ({ type, kws: kws.map((k) => ({ k, re: wordRe(k) })) })),
  hints: def.hints.map((k) => ({ k, re: wordRe(k) })),
}));

// Brand-name sniffing for clothing items with vague titles ("The Everyday Crew").
const KIDS_RE = /\b(kids?|toddler|baby|infant|boys|girls|youth|junior)\b/i;

/**
 * @param {object} p product from extractProduct
 * @returns {{category: string, subcategory: string, tags: string[]}}
 */
export function categorize(p) {
  const fields = [
    { text: p.title, w: 4 },
    { text: [...(p.breadcrumbs || []), p.productType].join(' / '), w: 5 },
    { text: (p.keywords || []).join(', '), w: 2 },
    { text: safePath(p.url), w: 2 },
    { text: [p.brand, p.store].join(' '), w: 1 },
    { text: (p.description || '').slice(0, 400), w: 1 },
  ].filter((f) => f.text);

  let best = { name: 'Other', score: 0, type: '' };
  const typeHits = [];

  for (const cat of compiled) {
    let score = 0;
    let topType = { type: '', score: 0 };
    for (const t of cat.types) {
      let tScore = 0;
      for (const { k, re } of t.kws) {
        for (const f of fields) {
          if (re.test(f.text)) {
            // Multi-word keywords are more specific, so they count more.
            const s = f.w * (k.includes(' ') ? 1.5 : 1);
            tScore += s;
            typeHits.push({ cat: cat.name, type: t.type, k, s });
          }
        }
      }
      score += tScore;
      if (tScore > topType.score) topType = { type: t.type, score: tScore };
    }
    for (const { re } of cat.hints) for (const f of fields) if (re.test(f.text)) score += f.w * 0.6;
    if (score > best.score) best = { name: cat.name, score, type: topType.type };
  }

  // Avoid weak, accidental matches (a single description hit).
  if (best.score < 2) best = { name: 'Other', score: 0, type: '' };

  const tags = [];
  if (best.type && best.type !== 'Accessories') tags.push(best.type);
  const kwTags = typeHits
    .filter((h) => h.cat === best.name)
    .sort((a, b) => b.s - a.s)
    .map((h) => h.k)
    .filter((k) => k.length > 2 && !/^(top|tee|flat|pan|pot|cap|print|throw|frame|record|edition|show|class)$/.test(k));
  // Skip keywords that just repeat the type ("Earring" under "Earrings") or a longer keyword ("Shirt" after "T-Shirt").
  const stem = (s) => s.toLowerCase().replace(/[\s-]+/g, '').replace(/e?s$/, '');
  const picked = [];
  for (const k of kwTags) {
    if (picked.length === 2) break;
    const overlaps = (x) => stem(x).includes(stem(k)) || stem(k).includes(stem(x));
    if (overlaps(best.type) || picked.some(overlaps)) continue;
    picked.push(k);
  }
  for (const k of picked) tags.push(titleCase(k));

  const blob = fields.map((f) => f.text).join(' ');
  if (best.name !== 'Baby & Kids' && KIDS_RE.test(p.title || '')) tags.push('Kids');
  if (/\b(women'?s?|ladies|for her)\b/i.test(blob)) tags.push('Women');
  else if (/\b(men'?s?|for him)\b/i.test(blob)) tags.push('Men');
  if (/\b(unisex)\b/i.test(blob)) tags.push('Unisex');
  if (p.originalPrice && p.price && p.originalPrice > p.price) tags.push('On Sale');
  if (p.brand && p.brand.length < 30) tags.push(p.brand);
  if (p.price != null) tags.push(priceBand(p.price));

  return { category: best.name, subcategory: best.type || '', tags: dedupe(tags) };
}

export function priceBand(price) {
  if (price < 25) return 'Under $25';
  if (price < 50) return '$25–50';
  if (price < 100) return '$50–100';
  if (price < 250) return '$100–250';
  if (price < 500) return '$250–500';
  return '$500+';
}

function safePath(url) {
  try {
    return decodeURIComponent(new URL(url).pathname).replace(/[/_+-]+/g, ' ');
  } catch {
    return '';
  }
}

const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

function dedupe(tags) {
  const seen = new Set();
  return tags.filter((t) => {
    const k = t.toLowerCase();
    if (!t || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
