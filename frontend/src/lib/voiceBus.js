// Tiny pub/sub so the global Lisa avatar can drive the Order/Items search pages.
const handlers = { orders: null, items: null };
const pending = { orders: null, items: null };
const results = { orders: [], items: [] };

export const registerSearchHandler = (page, fn) => {
  handlers[page] = fn;
  if (pending[page]) {
    const cmd = pending[page];
    pending[page] = null;
    setTimeout(() => fn(cmd), 0);
  }
  return () => {
    if (handlers[page] === fn) handlers[page] = null;
  };
};

export const dispatchSearch = (page, command) => {
  if (handlers[page]) handlers[page](command);
  else pending[page] = command; // page not mounted yet (e.g. right after navigation)
};

// Latest on-screen rows per page, so Lisa can read a row aloud.
export const publishResults = (page, rows) => {
  results[page] = rows || [];
};

export const getResults = (page) => results[page] || [];
