import { format, parseISO } from "date-fns";
import { searchOrders } from "../lib/api";
import { useSearch } from "../lib/useSearch";
import { FilterBar } from "../components/FilterBar";
import { ResultsTable } from "../components/ResultsTable";
import { PaginationBar } from "../components/PaginationBar";
import { StatusBadge } from "../components/StatusBadge";

const STATUSES = ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"];
const PRIORITIES = ["Low", "Medium", "High"];

const buildExtra = (s) => ({
  status: s.select,
  priority: s.radio,
  paid_only: s.checkbox,
});

const columns = [
  { key: "order_number", label: "Order #", render: (r) => <span className="font-medium text-slate-900">{r.order_number}</span> },
  { key: "customer_name", label: "Customer" },
  { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
  { key: "priority", label: "Priority", render: (r) => <StatusBadge value={r.priority} /> },
  { key: "region", label: "Region" },
  {
    key: "is_paid",
    label: "Paid",
    render: (r) => (
      <span className={r.is_paid ? "text-emerald-600 font-medium" : "text-slate-400"}>
        {r.is_paid ? "Paid" : "Unpaid"}
      </span>
    ),
  },
  {
    key: "amount",
    label: "Amount",
    align: "right",
    render: (r) => <span className="font-medium tabular-nums">${r.amount.toLocaleString()}</span>,
  },
  {
    key: "order_date",
    label: "Date",
    align: "right",
    render: (r) => <span className="text-slate-500 tabular-nums">{format(parseISO(r.order_date), "MMM d, yyyy")}</span>,
  },
];

export default function OrderSearch() {
  const { filters, set, page, data, loading, onSearch, onReset, onPage } = useSearch(
    searchOrders,
    buildExtra,
    "orders"
  );

  return (
    <div data-testid="order-search-page" className="p-6 md:p-8 lg:p-10 pb-28 max-w-7xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          Order Search
        </h1>
        <p className="text-sm text-slate-500 mt-1">Search and filter across 1,000 customer orders.</p>
      </div>

      <FilterBar
        prefix="order"
        search={filters.search}
        onSearchChange={(v) => set("search", v)}
        searchPlaceholder="Search by order number or customer…"
        selectLabel="Status"
        selectValue={filters.select}
        onSelectChange={(v) => set("select", v)}
        selectOptions={STATUSES}
        radioLabel="Priority"
        radioValue={filters.radio}
        onRadioChange={(v) => set("radio", v)}
        radioOptions={PRIORITIES}
        checkboxLabel="Paid orders only"
        checkboxChecked={filters.checkbox}
        onCheckboxChange={(v) => set("checkbox", !!v)}
        range={filters.range}
        onRangeChange={(v) => set("range", v)}
        onSearch={onSearch}
        onReset={onReset}
      />

      <ResultsTable prefix="order" columns={columns} rows={data.results} loading={loading} />
      <PaginationBar
        prefix="order"
        page={page}
        totalPages={data.total_pages}
        total={data.total}
        pageSize={data.page_size}
        onPage={onPage}
      />
    </div>
  );
}
