import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { registerSearchHandler } from "./voiceBus";

const emptyState = {
  search: "",
  select: "all",
  radio: "all",
  checkbox: false,
  range: undefined,
};

export const useSearch = (fetchFn, buildExtra, pageKey) => {
  const [filters, setFilters] = useState(emptyState);
  const applied = useRef({ ...emptyState });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ results: [], total: 0, total_pages: 1, page_size: 10 });
  const [loading, setLoading] = useState(false);

  const set = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const run = useCallback(
    async (state, pageArg) => {
      setLoading(true);
      try {
        const params = { page: pageArg, page_size: 10, ...buildExtra(state) };
        if (state.range?.from) params.date_from = format(state.range.from, "yyyy-MM-dd");
        if (state.range?.to) params.date_to = format(state.range.to, "yyyy-MM-dd");
        if (state.search) params.q = state.search;
        const res = await fetchFn(params);
        setData(res);
      } catch (e) {
        console.error("search failed", e);
        setData({ results: [], total: 0, total_pages: 1, page_size: 10 });
      } finally {
        setLoading(false);
      }
    },
    [fetchFn, buildExtra]
  );

  useEffect(() => {
    applied.current = { ...emptyState };
    run(emptyState, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearch = () => {
    applied.current = { ...filters };
    setPage(1);
    run(filters, 1);
  };

  const onReset = () => {
    setFilters(emptyState);
    applied.current = { ...emptyState };
    setPage(1);
    run(emptyState, 1);
  };

  const onPage = (p) => {
    setPage(p);
    run(applied.current, p);
  };

  // Voice-command handler: Lisa dispatches parsed commands here.
  const applyCommand = useCallback(
    (cmd) => {
      if (!cmd) return;
      if (cmd.reset) {
        onReset();
        return;
      }
      if (cmd.page) {
        setPage((p) => {
          const np =
            cmd.page === "next"
              ? p + 1
              : cmd.page === "prev"
              ? Math.max(1, p - 1)
              : Math.max(1, cmd.page);
          run(applied.current, np);
          return np;
        });
        return;
      }
      const next = { ...emptyState, ...(cmd.filters || {}) };
      setFilters(next);
      applied.current = next;
      setPage(1);
      run(next, 1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run]
  );

  useEffect(() => {
    if (!pageKey) return;
    return registerSearchHandler(pageKey, applyCommand);
  }, [pageKey, applyCommand]);

  return { filters, set, page, data, loading, onSearch, onReset, onPage };
};
