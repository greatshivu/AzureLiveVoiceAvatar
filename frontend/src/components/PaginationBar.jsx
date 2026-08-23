import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Button } from "./ui/button";

export const PaginationBar = ({ prefix, page, totalPages, total, pageSize, onPage }) => {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const windowPages = () => {
    const pages = [];
    const from = Math.max(1, page - 2);
    const to = Math.min(totalPages, from + 4);
    for (let p = Math.max(1, to - 4); p <= to; p++) pages.push(p);
    return pages;
  };

  return (
    <div
      data-testid={`${prefix}-pagination`}
      className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4"
    >
      <p className="text-xs text-slate-500" data-testid={`${prefix}-result-count`}>
        Showing <span className="font-semibold text-slate-700">{start}</span>–
        <span className="font-semibold text-slate-700">{end}</span> of{" "}
        <span className="font-semibold text-slate-700">{total.toLocaleString()}</span> records
      </p>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          data-testid={`${prefix}-prev-btn`}
          className="border-slate-200 h-8 px-2"
        >
          <CaretLeft size={16} />
        </Button>
        {windowPages().map((p) => (
          <Button
            key={p}
            variant={p === page ? "default" : "outline"}
            size="sm"
            onClick={() => onPage(p)}
            data-testid={`${prefix}-page-${p}`}
            className={
              p === page
                ? "bg-blue-600 hover:bg-blue-700 text-white h-8 w-8 p-0"
                : "border-slate-200 h-8 w-8 p-0"
            }
          >
            {p}
          </Button>
        ))}
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          data-testid={`${prefix}-next-btn`}
          className="border-slate-200 h-8 px-2"
        >
          <CaretRight size={16} />
        </Button>
      </div>
    </div>
  );
};
