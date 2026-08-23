// Tiny pub/sub so the global Lisa avatar can drive the Order/Items search pages.
const handlers = { orders: null, items: null };
const pending = { orders: null, items: null };

export const registerSearchHandler = (page, fn) => {
  handlers[page] = fn;
  if (pending[page]) {
    const cmd = pending[page];
    pending[page] = null;
    // apply after mount tick
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
