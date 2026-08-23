// Parses a spoken/typed utterance into a UI intent:
//   { type: "navigate", target }
//   { type: "search", target, filters, page?, reset? }
//   { type: "chat" }  -> falls through to the Foundry agent

const ORDER_STATUSES = ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"];
const PRIORITIES = ["Low", "Medium", "High"];
const CONDITIONS = ["New", "Used", "Refurbished"];
const CATEGORY_MAP = [
  [/electronic|gadget|device/, "Electronics"],
  [/apparel|clothing|clothes|wear/, "Apparel"],
  [/home|garden|kitchen|furniture/, "Home & Garden"],
  [/sport|fitness|gym|outdoor/, "Sports"],
  [/book|novel|reading/, "Books"],
];

const NAV_VERB = /(navigate|go to|goto|open|switch to|take me to|bring up|jump to)/;
const SEARCH_VERB = /(search|find|show|filter|display|list|look up|lookup|pull up|get me)/;
const STOP_WORDS = new Set([
  "order", "orders", "item", "items", "product", "products", "search", "for",
  "the", "a", "an", "with", "only", "page", "records", "record", "priority",
  "condition", "status", "paid", "unpaid", "in", "stock", "of",
  ...ORDER_STATUSES.map((s) => s.toLowerCase()),
  ...PRIORITIES.map((s) => s.toLowerCase()),
  ...CONDITIONS.map((s) => s.toLowerCase()),
]);

const detectTarget = (t, current) => {
  const items = /\bitems?\b|\bproducts?\b|\bsku\b|electronic|apparel|clothing|home|garden|sport|book|refurbish|catalog/.test(t);
  const orders = /\borders?\b|customer|deliver|shipp|processing|pending|cancel|priority|\bpaid\b|\bunpaid\b|ord[-\s]?\d/.test(t);
  if (items && !orders) return "items";
  if (orders && !items) return "orders";
  return current;
};

const extractFilters = (t, target) => {
  const f = {};
  if (target === "orders") {
    for (const s of ORDER_STATUSES) {
      if (t.includes(s.toLowerCase())) f.select = s;
    }
    for (const p of PRIORITIES) {
      const re = new RegExp(`\\b${p.toLowerCase()}\\b`);
      if (re.test(t)) f.radio = p;
    }
    if (/\bpaid\b/.test(t) && !/\bunpaid\b/.test(t)) f.checkbox = true;
  } else {
    for (const [re, val] of CATEGORY_MAP) {
      if (re.test(t)) f.select = val;
    }
    for (const c of CONDITIONS) {
      if (t.includes(c.toLowerCase())) f.radio = c;
    }
    if (/\bin stock\b|\bin-stock\b|available\b/.test(t)) f.checkbox = true;
  }

  // keyword: explicit id first
  const idRe = target === "orders" ? /\bord[-\s]?(\d{3,})\b/ : /\bsku[-\s]?(\d{3,})\b/;
  const idMatch = t.match(idRe);
  if (idMatch) {
    f.search = `${target === "orders" ? "ORD-" : "SKU-"}${idMatch[1]}`;
  } else {
    const named = t.match(/(?:named|called|containing|contains|matching|for|about)\s+([a-z0-9][a-z0-9\s]*)/);
    if (named) {
      const cleaned = named[1]
        .split(/\s+/)
        .filter((w) => w && !STOP_WORDS.has(w))
        .slice(0, 3)
        .join(" ")
        .trim();
      if (cleaned.length >= 2) f.search = cleaned;
    }
  }
  return f;
};

const ORDINALS = [
  [/\b(top|first|1st|number one)\b/, 0],
  [/\b(second|2nd|number two)\b/, 1],
  [/\b(third|3rd|number three)\b/, 2],
  [/\b(fourth|4th)\b/, 3],
  [/\b(fifth|5th)\b/, 4],
  [/\b(last|bottom)\b/, -1],
];

const readIndex = (t) => {
  for (const [re, idx] of ORDINALS) {
    if (re.test(t)) return idx;
  }
  const rowNum = t.match(/\b(?:row|record|number|line|result)\s+(\d+)\b/);
  if (rowNum) return Math.max(0, parseInt(rowNum[1], 10) - 1);
  return 0; // default to the top row
};

export const parseCommand = (raw, current = "orders") => {
  const t = (raw || "").toLowerCase().trim().replace(/[.?!,]+$/g, "");
  if (!t) return { type: "chat" };

  const target = detectTarget(t, current);

  // Read a row aloud
  if (/\b(read|tell me|what(?:'s| is)|describe|speak)\b/.test(t) &&
      /\b(order|item|product|row|record|result|line)\b/.test(t)) {
    return { type: "read", target, index: readIndex(t) };
  }

  // Pagination
  if (/\bnext page\b|\bgo forward\b/.test(t)) return { type: "search", target: current, page: "next" };
  if (/\b(previous|prev) page\b|\bgo back\b/.test(t)) return { type: "search", target: current, page: "prev" };
  const pageNum = t.match(/\b(?:go to )?page (\d+)\b/);
  if (pageNum) return { type: "search", target: current, page: parseInt(pageNum[1], 10) };

  // Reset
  if (/\b(reset|clear)( all)?( the)?( filters?| search)?\b/.test(t)) {
    return { type: "search", target: current, reset: true };
  }

  const filters = extractFilters(t, target);
  const hasFilters = Object.keys(filters).length > 0;
  const isSearch = SEARCH_VERB.test(t) || hasFilters;
  const isNav = NAV_VERB.test(t) || /^(orders?|items?)( search)?( page)?$/.test(t);

  if (isSearch) return { type: "search", target, filters };
  if (isNav) return { type: "navigate", target };
  return { type: "chat" };
};

export const describeSearch = (intent, targetKey) => {
  const label = targetKey === "items" ? "items" : "orders";
  if (intent.reset) return `Cleared all filters on ${label}.`;
  if (intent.page === "next") return "Going to the next page.";
  if (intent.page === "prev") return "Going to the previous page.";
  if (typeof intent.page === "number") return `Going to page ${intent.page}.`;
  const f = intent.filters || {};
  const parts = [];
  if (f.select) parts.push(f.select);
  if (f.radio) parts.push(`${f.radio} ${targetKey === "orders" ? "priority" : "condition"}`);
  if (f.checkbox) parts.push(targetKey === "orders" ? "paid" : "in-stock");
  if (f.search) parts.push(`matching "${f.search}"`);
  const desc = parts.length ? parts.join(", ") : "all";
  return `Showing ${desc} ${label}.`;
};

export const readRow = (row, targetKey) => {
  if (!row) return "";
  if (targetKey === "items") {
    return `${row.name}, SKU ${row.sku}. Category ${row.category}, condition ${row.condition}. ` +
      `${row.in_stock ? `${row.stock} in stock` : "Out of stock"}, priced at ${Math.round(row.price)} dollars, supplied by ${row.supplier}.`;
  }
  return `Order ${row.order_number} for ${row.customer_name}. Status ${row.status}, ${row.priority} priority, ` +
    `${row.is_paid ? "paid" : "unpaid"}. Amount ${Math.round(row.amount)} dollars, region ${row.region}.`;
};
