import { PAGES, pageByKey } from "../config/pages";

const NAV_VERB = /(navigate|go to|goto|open|switch to|take me to|bring up|jump to)/;
const SEARCH_VERB = /(search|find|show|filter|display|list|look up|lookup|pull up|get me)/;
const READ_VERB = /\b(read|tell me|what(?:'s| is)|describe|speak)\b/;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordMatch = (t, word) => new RegExp(`\\b${esc(word.toLowerCase())}\\b`).test(t);

const optionWords = (o) => [o.value, ...(o.synonyms || [])];

// Score how strongly the utterance points at each page (aliases + control values).
const detectTarget = (t, current) => {
    let bestKey = current;
    let best = 0;
    for (const page of PAGES) {
        let s = 0;
        for (const a of page.aliases) if (t.includes(a)) s += 3;
        for (const c of page.controls) {
            if (c.options) {
                for (const o of c.options) {
                    if (optionWords(o).some((w) => wordMatch(t, w))) s += 2;
                }
            }
            if (c.type === "checkbox") {
                if ((c.onWords || []).some((w) => wordMatch(t, w))) s += 1;
            }
        }
        if (s > best) {
            best = s;
            bestKey = page.key;
        }
    }
    return bestKey;
};

const buildStopWords = (page) => {
    const set = new Set([
        "order", "orders", "item", "items", "product", "products", "search", "for",
        "the", "a", "an", "with", "only", "page", "records", "record", "of", "in", "stock",
    ]);
    page.controls.forEach((c) => {
        if (c.options) c.options.forEach((o) => optionWords(o).forEach((w) => set.add(w.toLowerCase())));
        (c.onWords || []).forEach((w) => set.add(w.toLowerCase()));
        if (c.label) c.label.toLowerCase().split(/\s+/).forEach((w) => set.add(w));
    });
    return set;
};

const extractFilters = (page, t) => {
    const filters = {};
    for (const c of page.controls) {
        if (c.type === "select" || c.type === "radio") {
            for (const o of c.options) {
                if (optionWords(o).some((w) => wordMatch(t, w))) filters[c.id] = o.value;
            }
        } else if (c.type === "checkbox") {
            const on = (c.onWords || []).some((w) => wordMatch(t, w));
            const off = (c.offWords || []).some((w) => wordMatch(t, w));
            if (on && !off) filters[c.id] = true;
        } else if (c.type === "text") {
            if (c.idRegex) {
                const m = t.match(new RegExp(c.idRegex, "i"));
                if (m) {
                    filters[c.id] = `${c.idPrefix || ""}${m[1]}`;
                    continue;
                }
            }
            const named = t.match(/(?:named|called|containing|contains|matching|about)\s+([a-z0-9][a-z0-9\s]*)/);
            if (named) {
                const stop = buildStopWords(page);
                const cleaned = named[1].split(/\s+/).filter((w) => w && !stop.has(w)).slice(0, 3).join(" ").trim();
                if (cleaned.length >= 2) filters[c.id] = cleaned;
            }
        }
    }
    return filters;
};

const ORDINALS = [
    [/\b(top|first|1st|number one)\b/, 0],
    [/\b(second|2nd|number two)\b/, 1],
    [/\b(third|3rd|number three)\b/, 2],
    [/\b(fourth|4th)\b/, 3],
    [/\b(fifth|5th)\b/, 4],
    [/\b(bottom)\b/, -1],
];

const readIndex = (t) => {
    for (const [re, idx] of ORDINALS) if (re.test(t)) return idx;
    const m = t.match(/\b(?:row|record|number|line|result)\s+(\d+)\b/);
    if (m) return Math.max(0, parseInt(m[1], 10) - 1);
    return 0;
};

const rowNouns = /\b(order|item|product|row|record|result|line|entry)\b/;

export const parseCommand = (raw, current = PAGES[0].key) => {
    const t = (raw || "").toLowerCase().trim().replace(/[.?!,]+$/g, "");
    if (!t) return { type: "chat" };

    const target = detectTarget(t, current);

    if (READ_VERB.test(t) && rowNouns.test(t)) {
        return { type: "read", target, index: readIndex(t) };
    }

    if (/\bnext page\b|\bgo forward\b/.test(t)) return { type: "search", target: current, page: "next" };
    if (/\b(previous|prev) page\b|\bgo back\b/.test(t)) return { type: "search", target: current, page: "prev" };
    const pageNum = t.match(/\b(?:go to )?page (\d+)\b/);
    if (pageNum) return { type: "search", target: current, page: parseInt(pageNum[1], 10) };

    if (/\b(reset|clear)( all)?( the)?( filters?| search)?\b/.test(t)) {
        return { type: "search", target: current, reset: true };
    }

    const page = pageByKey(target);
    const filters = extractFilters(page, t);
    const hasFilters = Object.keys(filters).length > 0;
    const isSearch = SEARCH_VERB.test(t) || hasFilters;
    const isNav = NAV_VERB.test(t) || page.aliases.some((a) => t === a || t === `${a} search` || t === `${a} search page`);

    if (isSearch) return { type: "search", target, filters };
    if (isNav) return { type: "navigate", target };
    return { type: "chat" };
};

export const describeSearch = (intent, page) => {
    if (intent.reset) return `Cleared all filters on ${page.title}.`;
    if (intent.page === "next") return "Going to the next page.";
    if (intent.page === "prev") return "Going to the previous page.";
    if (typeof intent.page === "number") return `Going to page ${intent.page}.`;
    const f = intent.filters || {};
    const parts = [];
    page.controls.forEach((c) => {
        const v = f[c.id];
        if (v === undefined) return;
        if (c.type === "select" || c.type === "radio") parts.push(v);
        else if (c.type === "checkbox" && v) parts.push(c.shortLabel || c.label);
        else if (c.type === "text" && v) parts.push(`matching "${v}"`);
    });
    const desc = parts.length ? parts.join(", ") : "all";
    return `Showing ${desc} ${page.noun}.`;
};

export const readRow = (row, page) => (row && page?.speakRow ? page.speakRow(row) : "");
