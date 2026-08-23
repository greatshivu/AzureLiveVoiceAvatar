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

export const parseCommand = (raw, current = "orders") => {
  const t = (raw || "").toLowerCase().trim().replace(/[.?!,]+$/g, "");
  if (!t) return { type: "chat" };

  const target = detectTarget(t, current);

  // Pagination
  if (/\bnext page\b|\bgo forward\b/.test(t)) return { type: "search", target: current, page: "next" };
  if (/\b(previous|prev|last) page\b|\bgo back\b/.test(t)) return { type: "search", target: current, page: "prev" };
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
