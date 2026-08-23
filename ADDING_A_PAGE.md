# How to add a new page (config-driven)

Everything — the nav link, the filter bar, the data table, pagination, AND Lisa's
voice navigation / search / read-out / hint chips — is generated from one registry:

    /app/frontend/src/config/pages.jsx  ->  export const PAGES = [ ... ]

## Steps to add a page (e.g. "Invoices")

1. Backend: add a search endpoint `GET /api/invoices/search` that accepts the same
   shape (`page`, `page_size`, plus your filter query params) and returns
   `{ results, total, page, page_size, total_pages }`. (Seed a collection like the
   existing orders/items in `server.py::seed_data`.)

2. Frontend: append ONE object to `PAGES` in `config/pages.jsx`:

    {
      key: "invoices",              // unique; used by the voice bus
      prefix: "invoice",            // used for all data-testids
      title: "Invoice Search",
      subtitle: "…",
      route: "/invoices",
      navIcon: "files",             // cart | package | table | files
      noun: "invoices",
      endpoint: "/invoices/search",
      aliases: ["invoice", "invoices", "billing"],   // how users refer to it by voice
      searchPlaceholder: "Search by invoice number…",
      hints: ["Show overdue invoices", "Read the top invoice"],
      controls: [
        { id: "q", type: "text", param: "q", label: "Keyword",
          idPrefix: "INV-", idRegex: "inv[-\\s]?(\\d{3,})" },
        { id: "state", type: "select", param: "state", label: "State",
          options: [{ value: "Draft" }, { value: "Paid" }, { value: "Overdue" }] },
        { id: "range", type: "daterange", paramFrom: "date_from", paramTo: "date_to", label: "Date Range" },
        { id: "term", type: "radio", param: "term", label: "Term",
          options: [{ value: "Net15" }, { value: "Net30" }] },
        { id: "unpaid_only", type: "checkbox", param: "unpaid_only", label: "Unpaid only",
          shortLabel: "unpaid", onWords: ["unpaid", "outstanding"] },
      ],
      columns: [ { key: "invoice_number", label: "Invoice #", render: (r) => … }, … ],
      speakRow: (r) => `Invoice ${r.invoice_number} …`,
    }

That's it. No parser, router, or UI changes needed.

## Why Lisa "just works" on the new page
`lib/voiceCommands.js::parseCommand` reads `PAGES` at runtime:
- **Target detection** scores each page by matching the utterance against its
  `aliases` (weight 3) and every control's option values / `synonyms` / `onWords`
  (weight 2/1). Highest score wins, so "show overdue invoices" routes to Invoices.
- **Filter extraction** walks that page's `controls` and maps recognised words to
  each control's value (select/radio options, checkbox on/off words, text id/keyword).
- **Navigate / read / paginate / reset** intents are generic.
Lisa then navigates (if needed) and dispatches the parsed filters to the page via
`lib/voiceBus.js`; the page applies them through `lib/useSearch.js`.
