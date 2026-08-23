import { format, parseISO } from "date-fns";
import { searchItems } from "../lib/api";
import { useSearch } from "../lib/useSearch";
import { FilterBar } from "../components/FilterBar";
import { ResultsTable } from "../components/ResultsTable";
import { PaginationBar } from "../components/PaginationBar";
import { StatusBadge } from "../components/StatusBadge";

const CATEGORIES = ["Electronics", "Apparel", "Home & Garden", "Sports", "Books"];
const CONDITIONS = ["New", "Used", "Refurbished"];

const buildExtra = (s) => ({
  category: s.select,
  condition: s.radio,
  in_stock_only: s.checkbox,
});

const columns = [
  { key: "sku", label: "SKU", render: (r) => <span className="font-medium text-slate-900">{r.sku}</span> },
  { key: "name", label: "Item Name" },
  { key: "category", label: "Category" },
  { key: "condition", label: "Condition", render: (r) => <StatusBadge value={r.condition} /> },
  { key: "supplier", label: "Supplier" },
  {
    key: "stock",
    label: "Stock",
    render: (r) => (
      <span className={r.in_stock ? "text-slate-700 tabular-nums" : "text-red-500 font-medium"}>
        {r.in_stock ? `${r.stock} units` : "Out of stock"}
      </span>
    ),
  },
  {
    key: "price",
    label: "Price",
    align: "right",
    render: (r) => <span className="font-medium tabular-nums">${r.price.toLocaleString()}</span>,
  },
  {
    key: "added_date",
    label: "Added",
    align: "right",
    render: (r) => <span className="text-slate-500 tabular-nums">{format(parseISO(r.added_date), "MMM d, yyyy")}</span>,
  },
];

export default function ItemsSearch() {
  const { filters, set, page, data, loading, onSearch, onReset, onPage } = useSearch(
    searchItems,
    buildExtra
  );

  return (
    <div data-testid="items-search-page" className="p-6 md:p-8 lg:p-10 max-w-7xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          Items Search
        </h1>
        <p className="text-sm text-slate-500 mt-1">Browse and filter the full catalog of 1,000 items.</p>
      </div>

      <FilterBar
        prefix="item"
        search={filters.search}
        onSearchChange={(v) => set("search", v)}
        searchPlaceholder="Search by item name or SKU…"
        selectLabel="Category"
        selectValue={filters.select}
        onSelectChange={(v) => set("select", v)}
        selectOptions={CATEGORIES}
        radioLabel="Condition"
        radioValue={filters.radio}
        onRadioChange={(v) => set("radio", v)}
        radioOptions={CONDITIONS}
        checkboxLabel="In stock only"
        checkboxChecked={filters.checkbox}
        onCheckboxChange={(v) => set("checkbox", !!v)}
        range={filters.range}
        onRangeChange={(v) => set("range", v)}
        onSearch={onSearch}
        onReset={onReset}
      />

      <ResultsTable prefix="item" columns={columns} rows={data.results} loading={loading} />
      <PaginationBar
        prefix="item"
        page={page}
        totalPages={data.total_pages}
        total={data.total}
        pageSize={data.page_size}
        onPage={onPage}
      />
    </div>
  );
}
