import { format, parseISO } from "date-fns";
import { StatusBadge } from "../components/StatusBadge";
import { getPagesConfig } from "../lib/api";
import rawPagesConfig from "./pages_config.json";

// ---------------------------------------------------------------------------
// PAGE REGISTRY (Driven by pages_config.json & Backend API /api/pages)
// ---------------------------------------------------------------------------

const money = (n) => <span className="font-medium tabular-nums">${Number(n).toLocaleString()}</span>;
const date = (v) => <span className="text-slate-500 tabular-nums">{format(parseISO(v), "MMM d, yyyy")}</span>;

export const buildColumnRender = (col) => {
  if (col.type === "bold") return (r) => <span className="font-medium text-slate-900">{r[col.key]}</span>;
  if (col.type === "badge") return (r) => <StatusBadge value={r[col.key]} />;
  if (col.type === "boolean") return (r) => <span className={r[col.key] ? "text-emerald-600 font-medium" : "text-slate-400"}>{r[col.key] ? "Paid" : "Unpaid"}</span>;
  if (col.type === "currency") return (r) => money(r[col.key]);
  if (col.type === "date") return (r) => date(r[col.key]);
  if (col.type === "stock") return (r) => <span className={r.in_stock ? "text-slate-700 tabular-nums" : "text-red-500 font-medium"}>{r.in_stock ? `${r.stock} units` : "Out of stock"}</span>;
  return (r) => <span>{r[col.key]}</span>;
};

const mapPageConfig = (ap) => ({
  ...ap,
  columns: (ap.columns || []).map((c) => ({
    ...c,
    render: buildColumnRender(c),
  })),
  speakRow: (r) => {
    if (ap.speak_template) {
      let s = ap.speak_template;
      for (const [k, v] of Object.entries(r)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v ?? ""));
      }
      return s;
    }
    return `${ap.title} record: ${JSON.stringify(r)}`;
  },
});

export const PAGES = (rawPagesConfig || []).map(mapPageConfig);

const listeners = [];
export const onPagesUpdated = (cb) => {
  listeners.push(cb);
  return () => {
    const idx = listeners.indexOf(cb);
    if (idx !== -1) listeners.splice(idx, 1);
  };
};

export const loadPagesFromApi = async () => {
  try {
    const apiPages = await getPagesConfig();
    if (Array.isArray(apiPages) && apiPages.length > 0) {
      const merged = apiPages.map(mapPageConfig);
      PAGES.splice(0, PAGES.length, ...merged);
      listeners.forEach((cb) => {
        try { cb(PAGES); } catch (e) { }
      });
      return PAGES;
    }
  } catch (err) {
    console.warn("Could not load pages from API, using default fallback:", err);
  }
  return PAGES;
};

// Initial API fetch
loadPagesFromApi();

export const pageByKey = (k) => PAGES.find((p) => p.key === k) || PAGES[0];
export const pageByRoute = (path) => PAGES.find((p) => path.startsWith(p.route)) || PAGES[0];
export const routeFor = (k) => (pageByKey(k) || PAGES[0]).route;
export const controlById = (page, id) => page?.controls?.find((c) => c.id === id);
