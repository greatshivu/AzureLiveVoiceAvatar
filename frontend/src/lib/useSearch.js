import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { registerSearchHandler, publishResults } from "./voiceBus";

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
  const pageRef = useRef(1);
  const [data, setData] = useState({ results: [], total: 0, total_pages: 1, page_size: 10 });
  const [loading, setLoading] = useState(false);

  const set = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

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
        if (pageKey) publishResults(pageKey, res.results);
        return res;
      } catch (e) {
        console.error("search failed", e);
        const empty = { results: [], total: 0, total_pages: 1, page_size: 10 };
        setData(empty);
        return empty;
      } finally {
        setLoading(false);
      }
    },
    [fetchFn, buildExtra, pageKey]
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
    async (cmd) => {
      if (!cmd) return;
      let res;
      if (cmd.reset) {
        setFilters(emptyState);
        applied.current = { ...emptyState };
        setPage(1);
        res = await run(emptyState, 1);
      } else if (cmd.page) {
        const np =
          cmd.page === "next"
            ? pageRef.current + 1
            : cmd.page === "prev"
            ? Math.max(1, pageRef.current - 1)
            : Math.max(1, cmd.page);
        setPage(np);
        res = await run(applied.current, np);
      } else {
        const next = { ...emptyState, ...(cmd.filters || {}) };
        setFilters(next);
        applied.current = next;
        setPage(1);
        res = await run(next, 1);
      }
      if (cmd.onResult) cmd.onResult(res?.total ?? 0);
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
