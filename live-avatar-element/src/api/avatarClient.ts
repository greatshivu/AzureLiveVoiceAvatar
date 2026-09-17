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
  type: "navigate" | "search" | "read" | "chat";
  target?: string;
  filters?: Record<string, any>;
  page?: number | "next" | "prev";
  reset?: boolean;
  index?: number;
  message?: string;
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

    const page = this.getPageByKey(current) || this.pages[0];
    const targetKey = this.detectTarget(t, current);
    const targetPage = this.getPageByKey(targetKey) || page;

    const READ_VERB = /\b(read|tell me|what(?:'s| is)|describe|speak)\b/;
    const ROW_NOUNS = /\b(order|item|product|row|record|result|line|entry)\b/;
    if (READ_VERB.test(t) && ROW_NOUNS.test(t)) {
      return { type: "read", target: targetKey, index: this.readIndex(t) };
    }

    if (/\bnext page\b|\bgo forward\b/.test(t)) return { type: "search", target: current, page: "next" };
    if (/\b(previous|prev) page\b|\bgo back\b/.test(t)) return { type: "search", target: current, page: "prev" };
    const pageNum = t.match(/\b(?:go to )?page (\d+)\b/);
    if (pageNum) return { type: "search", target: current, page: parseInt(pageNum[1], 10) };

    if (/\b(reset|clear)( all)?( the)?( filters?| search)?\b/.test(t)) {
      return { type: "search", target: current, reset: true };
    }

    const filters = this.extractFilters(targetPage, t);
    const hasFilters = Object.keys(filters).length > 0;
    const SEARCH_VERB = /(search|find|show|filter|display|list|look up|lookup|pull up|get me)/;
    const NAV_VERB = /(navigate|go to|goto|open|switch to|take me to|bring up|jump to)/;

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
    if (typeof action.page === "number") return `Going to page ${action.page}.`;
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
