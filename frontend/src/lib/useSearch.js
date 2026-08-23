import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { registerSearchHandler, publishResults } from "./voiceBus";
import { search as apiSearch } from "./api";

const initialState = (controls) => {
  const s = {};
  controls.forEach((c) => {
    if (c.type === "select" || c.type === "radio") s[c.id] = "all";
    else if (c.type === "checkbox") s[c.id] = false;
    else if (c.type === "text") s[c.id] = "";
    else if (c.type === "daterange") s[c.id] = undefined;
  });
  return s;
};

const buildParams = (controls, state) => {
  const params = {};
  controls.forEach((c) => {
    const v = state[c.id];
    if (c.type === "select" || c.type === "radio") {
      if (v && v !== "all") params[c.param] = v;
    } else if (c.type === "checkbox") {
      if (v) params[c.param] = true;
    } else if (c.type === "text") {
      if (v) params[c.param] = v;
    } else if (c.type === "daterange") {
      if (v?.from) params[c.paramFrom] = format(v.from, "yyyy-MM-dd");
      if (v?.to) params[c.paramTo] = format(v.to, "yyyy-MM-dd");
    }
  });
  return params;
};

export const useSearch = (page) => {
  const controls = page.controls;
  const empty = useRef(initialState(controls)).current;

  const [filters, setFilters] = useState(empty);
  const applied = useRef({ ...empty });
  const [pageNo, setPageNo] = useState(1);
  const pageRef = useRef(1);
  const [data, setData] = useState({ results: [], total: 0, total_pages: 1, page_size: 10 });
  const [loading, setLoading] = useState(false);

  const set = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    pageRef.current = pageNo;
  }, [pageNo]);

  const run = useCallback(
    async (state, pageArg) => {
      setLoading(true);
      try {
        const params = { page: pageArg, page_size: 10, ...buildParams(controls, state) };
        const res = await apiSearch(page.endpoint, params);
        setData(res);
        publishResults(page.key, res.results);
        return res;
      } catch (e) {
        console.error("search failed", e);
        const emptyRes = { results: [], total: 0, total_pages: 1, page_size: 10 };
        setData(emptyRes);
        return emptyRes;
      } finally {
        setLoading(false);
      }
    },
    [controls, page.endpoint, page.key]
  );

  useEffect(() => {
    applied.current = { ...empty };
    run(empty, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearch = () => {
    applied.current = { ...filters };
    setPageNo(1);
    run(filters, 1);
  };

  const onReset = () => {
    setFilters(empty);
    applied.current = { ...empty };
    setPageNo(1);
    run(empty, 1);
  };

  const onPage = (p) => {
    setPageNo(p);
    run(applied.current, p);
  };

  // Voice-command handler (Lisa) — commands are keyed by control id.
  const applyCommand = useCallback(
    async (cmd) => {
      if (!cmd) return;
      let res;
      if (cmd.reset) {
        setFilters(empty);
        applied.current = { ...empty };
        setPageNo(1);
        res = await run(empty, 1);
      } else if (cmd.page) {
        const np =
          cmd.page === "next"
            ? pageRef.current + 1
            : cmd.page === "prev"
            ? Math.max(1, pageRef.current - 1)
            : Math.max(1, cmd.page);
        setPageNo(np);
        res = await run(applied.current, np);
      } else {
        const next = { ...empty, ...(cmd.filters || {}) };
        setFilters(next);
        applied.current = next;
        setPageNo(1);
        res = await run(next, 1);
      }
      if (cmd.onResult) cmd.onResult(res?.total ?? 0);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [run]
  );

  useEffect(() => registerSearchHandler(page.key, applyCommand), [page.key, applyCommand]);

  return { filters, set, page: pageNo, data, loading, onSearch, onReset, onPage };
};
