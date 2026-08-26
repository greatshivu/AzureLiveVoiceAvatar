import { useSearch } from "../lib/useSearch";
import { DynamicFilterBar } from "../components/DynamicFilterBar";
import { ResultsTable } from "../components/ResultsTable";
import { PaginationBar } from "../components/PaginationBar";

export default function SearchPage({ page }) {
  const { filters, set, page: pageNo, data, loading, onSearch, onReset, onPage } = useSearch(page);

  return (
    <div data-testid={`${page.prefix}-search-page`} className="p-6 md:p-8 lg:p-10 pb-28 max-w-7xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{page.title}</h1>
        <p className="text-sm text-slate-500 mt-1">{page.subtitle}</p>
      </div>

      <DynamicFilterBar page={page} filters={filters} set={set} onSearch={onSearch} onReset={onReset} />

      <ResultsTable prefix={page.prefix} columns={page.columns} rows={data.results} loading={loading} />
      <PaginationBar
        prefix={page.prefix}
        page={pageNo}
        totalPages={data.total_pages}
        total={data.total}
        pageSize={data.page_size}
        onPage={onPage}
      />
    </div>
  );
}
