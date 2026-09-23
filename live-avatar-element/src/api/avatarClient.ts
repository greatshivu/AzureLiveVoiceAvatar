/**
 * API and command parsing client for the Live Avatar Web Component.
 * Fetches page metadata from backend and provides local/server command routing.
 */

export interface PageControlOption {
  value: string;
  label?: string;
  synonyms?: string[];
}

export interface PageControl {
  id: string;
  type: "text" | "select" | "radio" | "checkbox";
  label: string;
  shortLabel?: string;
  options?: PageControlOption[];
  onWords?: string[];
  offWords?: string[];
  idRegex?: string;
  idPrefix?: string;
}

export interface PageConfig {
  key: string;
  title: string;
  route: string;
  noun: string;
  aliases: string[];
  hints: string[];
  controls: PageControl[];
  speak_template?: string;
}

export interface CommandAction {
  type: "navigate" | "search" | "read" | "chat" | "paginate" | "sort" | "click" | "create_request";
  target?: string;
  filters?: Record<string, any>;
  page?: number | "next" | "prev" | "first" | "last";
  sort?: { field: string; direction: "asc" | "desc"; column?: string; order?: "asc" | "desc"; label?: string };
  sort_by?: string;
  sort_order?: "asc" | "desc";
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  reset?: boolean;
  index?: number;
  message?: string;
  element?: string;
  action_type?: string;
  row_number?: number;
  row_index?: number;
  row_identifier?: string;
  request_text?: string;
  text?: string;
  raw_text?: string;
  rawText?: string;
  analyzed_text?: string | null;
  analyzedText?: string | null;
}

export class AvatarClient {
  private apiUrl: string;
  private pages: PageConfig[] = [];
  private resultsCache: Record<string, any[]> = {};

  constructor(apiUrl: string = "http://localhost:8000") {
    this.apiUrl = apiUrl.replace(/\/+$/, "");
  }

  setApiUrl(url: string) {
    this.apiUrl = url.replace(/\/+$/, "");
  }

  getApiUrl(): string {
    return this.apiUrl;
  }

  getWsUrl(app?: string): string {
    const wsProto = this.apiUrl.startsWith("https") ? "wss" : "ws";
    const host = this.apiUrl.replace(/^https?:\/\//, "");
    const q = app ? `?app=${encodeURIComponent(app)}` : "";
    return `${wsProto}://${host}/api/voice/ws${q}`;
  }

  async fetchConfig(app?: string): Promise<{
    voicelive_configured: boolean;
    avatar_character?: string;
    avatar_style?: string;
    avatar_name?: string;
  }> {
    try {
      const q = app ? `?app=${encodeURIComponent(app)}` : "";
      const res = await fetch(`${this.apiUrl}/api/config${q}`);
      if (res.ok) return await res.json();
    } catch (err) {
      console.warn("[AvatarClient] fetchConfig failed:", err);
    }
    return { voicelive_configured: false };
  }

  async fetchPages(app?: string): Promise<PageConfig[]> {
    try {
      const url = app ? `${this.apiUrl}/api/pages?app=${encodeURIComponent(app)}` : `${this.apiUrl}/api/pages`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          this.pages = data;
          return this.pages;
        } else if (data && Array.isArray(data.pages) && data.pages.length > 0) {
          this.pages = data.pages;
          return this.pages;
        }
      }
    } catch (err) {
      console.warn("[AvatarClient] fetchPages failed:", err);
    }
    return this.pages;
  }

  getPages(): PageConfig[] {
    return this.pages;
  }

  getPageByKey(key: string): PageConfig | undefined {
    return this.pages.find((p) => p.key === key) || this.pages[0];
  }

  getPageByRoute(route: string): PageConfig | undefined {
    return (
      this.pages.find((p) => route.startsWith(p.route)) ||
      this.pages[0]
    );
  }

  publishResults(pageKey: string, rows: any[]) {
    this.resultsCache[pageKey] = Array.isArray(rows) ? rows : [];
  }

  getResults(pageKey: string): any[] {
    return this.resultsCache[pageKey] || [];
  }

  async executeInternalCommand(
    text: string,
    currentPage: string = "orders",
    app?: string
  ): Promise<CommandAction | null> {
    try {
      const res = await fetch(`${this.apiUrl}/api/command/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, current_page: currentPage, app }),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn("[AvatarClient] executeInternalCommand server error, falling back locally:", err);
    }
    return this.parseCommandLocal(text, currentPage);
  }

  parseCommandLocal(raw: string, current: string = "orders"): CommandAction {
    const t = (raw || "").toLowerCase().trim().replace(/[.?!,]+$/g, "");
    if (!t) return { type: "chat" };

    // Back navigation to previous URL:
    // Only if command ends with 'back' (like 'go back', 'take me back', 'navigate back'),
    // or explicit 'previous url' / 'previous page'.
    // If there is anything after 'back' (e.g. 'go back to quotations', 'navigate back to orders'),
    // it must NOT go to previous URL, but navigate to that target instead.
    const NAV_BACK_VERB = /(?:\b(?:navigate\s+back|go\s+back|take\s+me\s+back|bring\s+me\s+back|jump\s+back)\b(?:\s+(?:please|now|again))?[\s.!?]*$|^\s*(?:please\s+)?back(?:\s+please)?[\s.!?]*$|\b(?:navigate|go|take\s+me|bring\s+me|jump|switch)?\s*(?:back\s+)?to\s+(?:the\s+)?previous\s+(?:url|page|screen|window)\b|\bback\s+to\s+(?:the\s+)?previous\s+(?:url|page|screen|window)\b|\bprevious\s+url\b)/i;
    if (NAV_BACK_VERB.test(t)) {
      return {
        type: "navigate",
        target: "back",
        message: "Navigating back to previous page.",
      } as any;
    }

    const page = this.getPageByKey(current) || this.pages[0];
    const targetKey = this.detectTarget(t, current);
    const targetPage = this.getPageByKey(targetKey) || page;

    // Create Request
    const CREATE_VERB = /\b(?:(?:create|submit|send|raise|post|make)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?request|new\s+(?:create\s+)?request|(?:create|submit|request|make|raise|post)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:order|quote|quotation|shipment|incident|purchase\s+order|ticket|booking)|new\s+(?:order|quote|quotation|shipment|incident|purchase\s+order)\s+request)\b/i;
    if (CREATE_VERB.test(t)) {
      const match = t.match(/\b(?:(?:create|submit|send|raise|post|make)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?request|new\s+(?:create\s+)?request)\s*[:\-]?\s*(.*)/i);
      let reqText = match && match[1] ? match[1].trim() : "";
      if (!reqText) {
        const entMatch = t.match(/\b((?:create|submit|request|make|raise|post)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:order|quote|quotation|shipment|incident|purchase\s+order|ticket|booking)\b.*)/i);
        reqText = entMatch && entMatch[1] ? entMatch[1].trim() : t;
      }
      return {
        type: "create_request",
        target: targetKey,
        action_type: "create_request",
        request_text: reqText,
        text: reqText,
        raw_text: raw,
        rawText: raw,
        analyzed_text: null,
        analyzedText: null,
        message: `Sending create request: '${reqText}' to CVS.`
      };
    }

    // Grid Click Operation
    const CLICK_VERB = /\b(?:click|press|tap|hit|select|trigger|edit|delete)\b|^\s*open\s+(?:order|quote|item|shipment|incident|link|row|\d+|[a-z]+[-_]\d+)/i;
    if (CLICK_VERB.test(t)) {
      let element = "button";
      let actionType = "click";
      if (/\b(?:delete|remove)\b/i.test(t)) {
        element = "delete";
        actionType = "delete";
      } else if (/\b(?:edit|modify|update)\b/i.test(t)) {
        element = "edit";
        actionType = "edit";
      } else if (/\b(?:order\s*(?:number|no|#)?\s*link|order\s+number)\b/i.test(t)) {
        element = "order_number";
        actionType = "link";
      } else if (/\b(?:quote\s*(?:number|no|#)?\s*link|quote\s+number)\b/i.test(t)) {
        element = "quote_number";
        actionType = "link";
      } else if (/\b(?:view|details)\b/i.test(t)) {
        element = "view";
        actionType = "icon";
      } else if (/\b(?:link)\b/i.test(t) || /^\s*open\b/i.test(t)) {
        element = "link";
        actionType = "link";
      }

      let rowIdentifier: string | undefined;
      let rowNumber: number | undefined;
      let rowIndex: number | undefined;

      const mId = t.match(/\b([A-Za-z]{2,4}[-\s]?\d{3,})\b/);
      if (mId) {
        rowIdentifier = mId[1].toUpperCase().replace(" ", "-");
      }

      const mRow = t.match(/\brow\s+(?:number\s+|no\s+|#\s*)?(\d+)\b/i);
      if (mRow) {
        rowNumber = parseInt(mRow[1], 10);
        rowIndex = rowNumber - 1;
      } else {
        const ords: [RegExp, number][] = [
          [/\b(first|1st|top)\b/i, 0],
          [/\b(second|2nd)\b/i, 1],
          [/\b(third|3rd)\b/i, 2],
          [/\b(fourth|4th)\b/i, 3],
          [/\b(fifth|5th)\b/i, 4],
          [/\b(last|bottom)\b/i, -1],
        ];
        for (const [pat, idx] of ords) {
          if (pat.test(t)) {
            rowIndex = idx;
            rowNumber = idx >= 0 ? idx + 1 : -1;
            break;
          }
        }
      }

      const rowDesc = rowIdentifier ? `identifier ${rowIdentifier}` : (rowNumber === -1 ? "last row" : (rowNumber ? `row ${rowNumber}` : "selected row"));
      return {
        type: "click",
        target: targetKey,
        action_type: actionType,
        element,
        row_number: rowNumber,
        row_index: rowIndex,
        row_identifier: rowIdentifier,
        message: `Clicked ${element} on ${rowDesc}.`
      };
    }

    const READ_VERB = /\b(read|tell me|what(?:'s| is)|describe|speak)\b/;
    const ROW_NOUNS = /\b(order|item|product|row|record|result|line|entry)\b/;
    if (READ_VERB.test(t) && ROW_NOUNS.test(t)) {
      return { type: "read", target: targetKey, index: this.readIndex(t) };
    }

    if (/\bnext page\b|\bpage forward\b|\bgo forward\b/.test(t) || t === "next") return { type: "search", target: current, page: "next" };
    if (/\b(previous|prev) page\b|\bpage back\b/.test(t) || t === "prev" || t === "previous") return { type: "search", target: current, page: "prev" };
    if (/\b(first|1st) page\b/.test(t) || t === "first" || t === "1st") return { type: "search", target: current, page: 1 };
    if (/\blast page\b/.test(t) || t === "last") return { type: "search", target: current, page: "last" };
    const pageNum = t.match(/\b(?:go to |jump to )?page (\d+)\b/);
    if (pageNum) return { type: "search", target: current, page: parseInt(pageNum[1], 10) };

    const sortMatch = t.match(/\b(?:sort by|order by|sort)\s+([a-z0-9_\-\s#]+?)(?:\s+(ascending|descending|asc|desc))?$/i);
    if (sortMatch) {
      const field = sortMatch[1].trim();
      const dir = sortMatch[2]?.toLowerCase() === "desc" || sortMatch[2]?.toLowerCase() === "descending" ? "desc" : "asc";
      return {
        type: "search",
        target: targetKey,
        sort: { field, direction: dir },
        sort_by: field,
        sort_order: dir,
        message: `Sorted by ${field} (${dir === "asc" ? "ascending" : "descending"}).`
      };
    }

    if (/\b(reset|clear)( all)?( the)?( filters?| search)?\b/.test(t)) {
      return { type: "search", target: current, reset: true };
    }

    const filters = this.extractFilters(targetPage, t);
    const hasFilters = Object.keys(filters).length > 0;
    const SEARCH_VERB = /(search|find|show|filter|display|list|look up|lookup|pull up|get me)/;
    const NAV_VERB = /(?:navigate(?:\s+back)?(?:\s+to)?|go\s+(?:back\s+)?to|goto|open|switch\s+to|take\s+me\s+(?:back\s+)?to|back\s+to|bring\s+up|jump\s+to)/i;

    const isSearch = SEARCH_VERB.test(t) || hasFilters;
    const isNav = NAV_VERB.test(t) || (targetPage?.aliases || []).some((a) => t === a || t === `${a} search`);

    if (isSearch) return { type: "search", target: targetKey, filters };
    if (isNav) return { type: "navigate", target: targetKey };
    return { type: "chat" };
  }

  private detectTarget(t: string, current: string): string {
    let bestKey = current;
    let best = 0;
    for (const p of this.pages) {
      let score = 0;
      for (const a of p.aliases || []) if (t.includes(a)) score += 3;
      for (const c of p.controls || []) {
        if (c.options) {
          for (const o of c.options) {
            const words = [o.value, ...(o.synonyms || [])];
            if (words.some((w) => new RegExp(`\\b${w.toLowerCase()}\\b`).test(t))) score += 2;
          }
        }
      }
      if (score > best) {
        best = score;
        bestKey = p.key;
      }
    }
    return bestKey;
  }

  private extractFilters(page: PageConfig | undefined, t: string): Record<string, any> {
    if (!page || !page.controls) return {};
    const filters: Record<string, any> = {};

    for (const c of page.controls) {
      if (c.type === "select" || c.type === "radio") {
        for (const o of c.options || []) {
          const words = [o.value, ...(o.synonyms || [])];
          if (words.some((w) => new RegExp(`\\b${w.toLowerCase()}\\b`).test(t))) {
            filters[c.id] = o.value;
          }
        }
      } else if (c.type === "checkbox") {
        const on = (c.onWords || []).some((w) => new RegExp(`\\b${w.toLowerCase()}\\b`).test(t));
        const off = (c.offWords || []).some((w) => new RegExp(`\\b${w.toLowerCase()}\\b`).test(t));
        if (on && !off) filters[c.id] = true;
      } else if (c.type === "text") {
        if (c.idRegex) {
          const m = t.match(new RegExp(c.idRegex, "i"));
          if (m) {
            const num = m[1] || m[2] || m[0];
            filters[c.id] = `${c.idPrefix || ""}${num.replace(/^[^\d]+/, "")}`;
            continue;
          }
        }
        const kwMatch = t.match(/\b(?:filter by keyword|search keyword|filter keyword|keyword|key word)[:\s]+['"]?([a-zA-Z0-9\-_]+(?:\s+[a-zA-Z0-9\-_]+)?)['"]?/i);
        if (kwMatch) {
          const val = kwMatch[1].trim();
          if (val) {
            filters[c.id] = val;
            continue;
          }
        }
        const searchMatch = t.match(/\b(?:search for|find|look up|lookup|named|called|containing|contains|matching|about)\s+['"]?([a-zA-Z0-9\-_]+(?:\s+[a-zA-Z0-9\-_]+)?)['"]?/i);
        if (searchMatch) {
          const val = searchMatch[1].trim();
          const controlWords = ["low", "medium", "high", "delivered", "pending", "shipped", "paid", "unpaid", "new", "used", "refurbished"];
          if (val && !controlWords.includes(val.toLowerCase())) {
            filters[c.id] = val;
            continue;
          }
        }
      }
    }
    return filters;
  }

  private readIndex(t: string): number {
    const ORDINALS: [RegExp, number][] = [
      [/\b(top|first|1st|number one)\b/, 0],
      [/\b(second|2nd|number two)\b/, 1],
      [/\b(third|3rd|number three)\b/, 2],
      [/\b(fourth|4th)\b/, 3],
      [/\b(fifth|5th)\b/, 4],
      [/\b(bottom|last)\b/, -1],
    ];
    for (const [re, idx] of ORDINALS) {
      if (re.test(t)) return idx;
    }
    const m = t.match(/\b(?:row|record|number|line|result)\s+(\d+)\b/);
    if (m) return Math.max(0, parseInt(m[1], 10) - 1);
    return 0;
  }

  describeSearch(action: CommandAction, page?: PageConfig): string {
    if (action.reset) return `Cleared all filters on ${page?.title || "page"}.`;
    if (action.page === "next") return "Going to the next page.";
    if (action.page === "prev") return "Going to the previous page.";
    if (action.page === "first" || action.page === 1) return "Going to page 1.";
    if (action.page === "last") return "Going to the last page.";
    if (typeof action.page === "number") return `Going to page ${action.page}.`;
    if (action.sort) {
      const dir = action.sort.direction === "asc" ? "ascending" : "descending";
      return `Sorted by ${action.sort.label || action.sort.field} (${dir}).`;
    }
    const f = action.filters || {};
    const parts: string[] = [];
    if (page?.controls) {
      page.controls.forEach((c) => {
        const val = f[c.id];
        if (val === undefined) return;
        if (c.type === "select" || c.type === "radio") parts.push(String(val));
        else if (c.type === "checkbox" && val) parts.push(c.shortLabel || c.label);
        else if (c.type === "text" && val) parts.push(`matching "${val}"`);
      });
    }
    const desc = parts.length ? parts.join(", ") : "all";
    return `Showing ${desc} ${page?.noun || "records"}.`;
  }

  formatSpeakRow(row: any, page?: PageConfig): string {
    if (!row) return "No record data available.";
    if (page?.speak_template) {
      let s = page.speak_template;
      for (const [k, v] of Object.entries(row)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v ?? ""));
      }
      return s;
    }
    return `${page?.title || "Record"}: ${JSON.stringify(row)}`;
  }
}
