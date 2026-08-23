import { format, parseISO } from "date-fns";
import { StatusBadge } from "../components/StatusBadge";

// ---------------------------------------------------------------------------
// PAGE REGISTRY
// Add a new object here to get a fully working page: nav link, generic filter
// bar, data table, pagination AND Lisa voice navigation + search + read-out.
// The avatar analyzes this config at runtime to map user commands to actions.
//
//   control types: "text" | "select" | "radio" | "checkbox" | "daterange"
//   - select/radio: options: [{ value, synonyms?: [] }]
//   - checkbox: onWords / offWords used by the voice parser
//   - text: idPrefix + idRegex to recognise ids (e.g. "ord 100200" -> ORD-100200)
// ---------------------------------------------------------------------------

const money = (n) => <span className="font-medium tabular-nums">${Number(n).toLocaleString()}</span>;
const date = (v) => <span className="text-slate-500 tabular-nums">{format(parseISO(v), "MMM d, yyyy")}</span>;

export const PAGES = [
  {
    key: "orders",
    prefix: "order",
    title: "Order Search",
    subtitle: "Search and filter across 1,000 customer orders.",
    route: "/orders",
    navIcon: "cart",
    noun: "orders",
    endpoint: "/orders/search",
    aliases: ["order", "orders", "order search", "sales", "purchase", "purchases"],
    searchPlaceholder: "Search by order number or customer…",
    hints: ["Show delivered orders", "High priority paid orders", "Read the top order", "Next page"],
    controls: [
      { id: "q", type: "text", param: "q", label: "Keyword", idPrefix: "ORD-", idRegex: "ord[-\\s]?(\\d{3,})" },
      {
        id: "status",
        type: "select",
        param: "status",
        label: "Status",
        options: [
          { value: "Pending" },
          { value: "Processing" },
          { value: "Shipped" },
          { value: "Delivered" },
          { value: "Cancelled", synonyms: ["cancelled", "canceled"] },
        ],
      },
      { id: "range", type: "daterange", paramFrom: "date_from", paramTo: "date_to", label: "Date Range" },
      {
        id: "priority",
        type: "radio",
        param: "priority",
        label: "Priority",
        options: [{ value: "Low" }, { value: "Medium" }, { value: "High" }],
      },
      {
        id: "paid_only",
        type: "checkbox",
        param: "paid_only",
        label: "Paid orders only",
        shortLabel: "paid",
        onWords: ["paid"],
        offWords: ["unpaid"],
      },
    ],
    columns: [
      { key: "order_number", label: "Order #", render: (r) => <span className="font-medium text-slate-900">{r.order_number}</span> },
      { key: "customer_name", label: "Customer" },
      { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
      { key: "priority", label: "Priority", render: (r) => <StatusBadge value={r.priority} /> },
      { key: "region", label: "Region" },
      { key: "is_paid", label: "Paid", render: (r) => <span className={r.is_paid ? "text-emerald-600 font-medium" : "text-slate-400"}>{r.is_paid ? "Paid" : "Unpaid"}</span> },
      { key: "amount", label: "Amount", align: "right", render: (r) => money(r.amount) },
      { key: "order_date", label: "Date", align: "right", render: (r) => date(r.order_date) },
    ],
    speakRow: (r) =>
      `Order ${r.order_number} for ${r.customer_name}. Status ${r.status}, ${r.priority} priority, ${r.is_paid ? "paid" : "unpaid"}. Amount ${Math.round(r.amount)} dollars, region ${r.region}.`,
  },
  {
    key: "items",
    prefix: "item",
    title: "Items Search",
    subtitle: "Browse and filter the full catalog of 1,000 items.",
    route: "/items",
    navIcon: "package",
    noun: "items",
    endpoint: "/items/search",
    aliases: ["item", "items", "items search", "product", "products", "catalog", "inventory"],
    searchPlaceholder: "Search by item name or SKU…",
    hints: ["Electronics in stock", "Refurbished items", "Read the top item", "Reset filters"],
    controls: [
      { id: "q", type: "text", param: "q", label: "Keyword", idPrefix: "SKU-", idRegex: "sku[-\\s]?(\\d{3,})" },
      {
        id: "category",
        type: "select",
        param: "category",
        label: "Category",
        options: [
          { value: "Electronics", synonyms: ["electronic", "gadget", "device"] },
          { value: "Apparel", synonyms: ["clothing", "clothes", "wear"] },
          { value: "Home & Garden", synonyms: ["home", "garden", "kitchen", "furniture"] },
          { value: "Sports", synonyms: ["sport", "fitness", "gym"] },
          { value: "Books", synonyms: ["book", "novel", "reading"] },
        ],
      },
      { id: "range", type: "daterange", paramFrom: "date_from", paramTo: "date_to", label: "Date Range" },
      {
        id: "condition",
        type: "radio",
        param: "condition",
        label: "Condition",
        options: [{ value: "New" }, { value: "Used" }, { value: "Refurbished", synonyms: ["refurb", "refurbished"] }],
      },
      {
        id: "in_stock_only",
        type: "checkbox",
        param: "in_stock_only",
        label: "In stock only",
        shortLabel: "in-stock",
        onWords: ["in stock", "in-stock", "available", "stocked"],
        offWords: ["out of stock"],
      },
    ],
    columns: [
      { key: "sku", label: "SKU", render: (r) => <span className="font-medium text-slate-900">{r.sku}</span> },
      { key: "name", label: "Item Name" },
      { key: "category", label: "Category" },
      { key: "condition", label: "Condition", render: (r) => <StatusBadge value={r.condition} /> },
      { key: "supplier", label: "Supplier" },
      { key: "stock", label: "Stock", render: (r) => <span className={r.in_stock ? "text-slate-700 tabular-nums" : "text-red-500 font-medium"}>{r.in_stock ? `${r.stock} units` : "Out of stock"}</span> },
      { key: "price", label: "Price", align: "right", render: (r) => money(r.price) },
      { key: "added_date", label: "Added", align: "right", render: (r) => date(r.added_date) },
    ],
    speakRow: (r) =>
      `${r.name}, SKU ${r.sku}. Category ${r.category}, condition ${r.condition}. ${r.in_stock ? `${r.stock} in stock` : "Out of stock"}, priced at ${Math.round(r.price)} dollars, supplied by ${r.supplier}.`,
  },
];

export const pageByKey = (k) => PAGES.find((p) => p.key === k);
export const pageByRoute = (path) => PAGES.find((p) => path.startsWith(p.route)) || PAGES[0];
export const routeFor = (k) => (pageByKey(k) || PAGES[0]).route;
export const controlById = (page, id) => page.controls.find((c) => c.id === id);
