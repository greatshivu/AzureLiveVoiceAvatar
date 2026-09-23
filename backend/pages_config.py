"""
Canonical Config-Driven Pages & Action Engine.
This module serves as the single generic, application-agnostic source of truth on the API side:
1. Loads page definitions, routes, endpoints, and filter controls dynamically from {app}_pages_config.json.
2. Direct internal command parsing (/api/command/execute, Unchecked mode).
3. Agent function/tool execution (Checked mode: perform_action / execute_action / any tool).
Zero hardcoded application names, fields, or control values in Python. Everything is config-driven.
"""
import os
import re
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Union, Tuple
from collections import defaultdict

logger = logging.getLogger(__name__)

CONFIG_FILE = Path(__file__).parent / "pages_config.json"
_CONFIG_CACHE: Dict[str, List[Dict[str, Any]]] = {}

# Standard generic action verbs
NAV_BACK_VERB = re.compile(
    r"(?:"
    r"\b(?:navigate\s+back|go\s+back|take\s+me\s+back|bring\s+me\s+back|jump\s+back)\b(?:\s+(?:please|now|again))?[\s.!?]*$"
    r"|^\s*(?:please\s+)?back(?:\s+please)?[\s.!?]*$"
    r"|\b(?:navigate|go|take\s+me|bring\s+me|jump|switch)?\s*(?:back\s+)?to\s+(?:the\s+)?previous\s+(?:url|page|screen|window)\b"
    r"|\bback\s+to\s+(?:the\s+)?previous\s+(?:url|page|screen|window)\b"
    r"|\bprevious\s+url\b"
    r")",
    re.IGNORECASE
)
NAV_VERB = re.compile(
    r"\b(navigate(?:\s+back)?(?:\s+to)?|go\s+(?:back\s+)?to|goto|switch\s+to|take\s+me\s+(?:back\s+)?to|back\s+to|bring\s+up|jump\s+to)\b|^\s*open\b",
    re.IGNORECASE
)
SEARCH_VERB = re.compile(r"\b(search|find|show|filter|display|list|look up|lookup|pull up|get|get me|keyword|key word)\b", re.IGNORECASE)
READ_VERB = re.compile(r"\b(read|tell me|what(?:'s| is)|describe|speak)\b", re.IGNORECASE)
RESET_VERB = re.compile(r"\b(reset|clear|remove|wipe)\b(?:\s+(?:all|the))?(?:\s+(?:filters?|search))?|\b(show all|show everything)\b", re.IGNORECASE)
PAGINATION_VERB = re.compile(
    r"\b(next\s+page|next|previous\s+page|previous|prev\s+page|prev|first\s+page|first|1st\s+page|last\s+page|last|page\s+forward|page\s+back|go\s+forward|page\s+\d+|go\s+to\s+page\s+\d+|jump\s+to\s+page\s+\d+)\b",
    re.IGNORECASE
)
SORT_VERB = re.compile(r"\b(?:sort\s+by|sort|order\s+by|ordered\s+by)\b", re.IGNORECASE)
CLICK_VERB = re.compile(
    r"\b(?:click|press|tap|hit|select|trigger|edit|delete)\b|^\s*open\s+(?:order|quote|item|shipment|incident|link|row|\d+|[A-Za-z]+[-_]\d+)",
    re.IGNORECASE
)
CREATE_VERB = re.compile(
    r"\b(?:"
    r"(?:create|submit|send|raise|post|make)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?request"
    r"|new\s+(?:create\s+)?request"
    r"|(?:create|submit|request|make|raise|post)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:order|quote|quotation|shipment|incident|purchase\s+order|ticket|booking)"
    r"|new\s+(?:order|quote|quotation|shipment|incident|purchase\s+order)\s+request"
    r")\b",
    re.IGNORECASE
)

ORDINALS = [
    (re.compile(r"\b(top|first|1st|number one)\b", re.IGNORECASE), 0),
    (re.compile(r"\b(second|2nd|number two)\b", re.IGNORECASE), 1),
    (re.compile(r"\b(third|3rd|number three)\b", re.IGNORECASE), 2),
    (re.compile(r"\b(fourth|4th)\b", re.IGNORECASE), 3),
    (re.compile(r"\b(fifth|5th)\b", re.IGNORECASE), 4),
    (re.compile(r"\b(bottom|last)\b", re.IGNORECASE), -1),
]

WORD_TO_NUM = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
    "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18,
    "nineteen": 19, "twenty": 20
}


def _detect_pagination(text: str, direct_args: Dict[str, Any]) -> Optional[Union[str, int]]:
    """Detect pagination request from direct arguments or natural language text."""
    # 1. Direct arguments
    for key in ("page_number", "page_num", "pageNum", "pageNumber", "pagination"):
        if key in direct_args and direct_args[key] is not None:
            val = str(direct_args[key]).strip().lower()
            val = re.sub(r"^[^\w]+|[^\w]+$", "", val)
            if val.isdigit():
                return int(val)
            if val in ("next", "prev", "previous", "first", "last"):
                return "prev" if val == "previous" else (1 if val == "first" else val)
            m_dig = re.search(r"\b(\d+)\b", val)
            if m_dig:
                return int(m_dig.group(1))

    # Check if 'page' argument was passed as pagination rather than target page
    if "page" in direct_args and direct_args["page"] is not None:
        raw_p = str(direct_args["page"]).strip().lower()
        raw_p = re.sub(r"^[^\w]+|[^\w]+$", "", raw_p)
        if raw_p.isdigit():
            return int(raw_p)
        if raw_p in ("next", "prev", "previous", "first", "last"):
            return "prev" if raw_p == "previous" else (1 if raw_p == "first" else raw_p)
        m_dig = re.search(r"\b(\d+)\b", raw_p)
        if m_dig:
            return int(m_dig.group(1))

    # 2. Natural language
    if not text:
        return None
    t = text.lower().strip()
    t = re.sub(r"^[^\w\s]+|[^\w\s]+$", "", t)

    # Next
    if re.search(r"\b(?:next\s+page|page\s+forward|go\s+forward)\b", t) or t == "next":
        return "next"
    # Previous
    if re.search(r"\b(?:previous|prev)\s+page\b|\bpage\s+back\b", t) or t in ("prev", "previous"):
        return "prev"
    # First
    if re.search(r"\b(?:first|1st)\s+page\b", t) or t in ("first", "1st"):
        return 1
    # Last
    if re.search(r"\b(?:last)\s+page\b", t) or t == "last":
        return "last"
    # Digits: "page 2", "go to page 3", "jump to page 4"
    m = re.search(r"\b(?:go\s+to\s+|jump\s+to\s+)?page\s+(\d+)\b", t)
    if m:
        return int(m.group(1))
    # Word numbers: "page two", "go to page three"
    m_w = re.search(r"\b(?:go\s+to\s+|jump\s+to\s+)?page\s+([a-z]+)\b", t)
    if m_w and m_w.group(1) in WORD_TO_NUM:
        return WORD_TO_NUM[m_w.group(1)]

    return None


def _detect_sort(
    page: Dict[str, Any],
    text: str,
    direct_args: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """Detect sort column and direction from direct arguments or natural language text."""
    columns = page.get("columns", [])
    if not columns:
        return None

    def resolve_col(term: Any) -> Optional[Dict[str, Any]]:
        if not term:
            return None
        clean = re.sub(r"[_\-\s#]+", "", str(term).lower())
        for c in columns:
            k_clean = re.sub(r"[_\-\s#]+", "", c.get("key", "").lower())
            l_clean = re.sub(r"[_\-\s#]+", "", c.get("label", "").lower())
            if clean == k_clean or clean == l_clean:
                return c
            l_words = [re.sub(r"[_\-\s#]+", "", w.lower()) for w in c.get("label", "").split() if w]
            if clean in l_words and len(clean) >= 3:
                return c
        return None

    def resolve_direction(t_str: Any, default: str = "asc") -> str:
        if not t_str:
            return default
        s = str(t_str).lower()
        if any(w in s for w in ("desc", "descending", "down", "highest", "newest", "latest", "z to a")):
            return "desc"
        if any(w in s for w in ("asc", "ascending", "up", "lowest", "oldest", "earliest", "a to z")):
            return "asc"
        return default

    # 1. Direct arguments
    sort_obj = direct_args.get("sort")
    if isinstance(sort_obj, dict):
        f = sort_obj.get("field") or sort_obj.get("column") or sort_obj.get("by")
        d = sort_obj.get("direction") or sort_obj.get("order") or sort_obj.get("dir")
        matched_c = resolve_col(f)
        if matched_c:
            col_key = matched_c["key"]
            dir_str = resolve_direction(d, "asc")
            return {
                "field": col_key,
                "column": col_key,
                "direction": dir_str,
                "order": dir_str,
                "label": matched_c.get("label", col_key)
            }

    raw_sort_by = (
        direct_args.get("sort_by")
        or direct_args.get("sortBy")
        or direct_args.get("sort_field")
        or direct_args.get("order_by")
        or direct_args.get("orderBy")
    )
    raw_sort_dir = (
        direct_args.get("sort_order")
        or direct_args.get("sortOrder")
        or direct_args.get("sort_dir")
        or direct_args.get("direction")
        or direct_args.get("order")
    )
    if raw_sort_by:
        matched_c = resolve_col(raw_sort_by)
        if matched_c:
            col_key = matched_c["key"]
            dir_str = resolve_direction(raw_sort_dir, "asc")
            return {
                "field": col_key,
                "column": col_key,
                "direction": dir_str,
                "order": dir_str,
                "label": matched_c.get("label", col_key)
            }

    # 2. Natural language
    if not text:
        return None
    t = text.strip()
    if not SORT_VERB.search(t):
        return None

    sort_m = re.search(
        r"\b(?:sort\s+by|sort|order\s+by)\s+([a-zA-Z0-9_\-\s#]+?)(?:\s+(ascending|descending|asc|desc))?(?:\s*$|\s+(?:please|and))",
        t,
        re.IGNORECASE
    )
    if sort_m:
        cand_col = sort_m.group(1).strip()
        cand_dir = sort_m.group(2)
        dir_str = resolve_direction(cand_dir or cand_col, "asc")
        cand_col_clean = re.sub(r"\b(ascending|descending|asc|desc|in|order|by|please)\b", "", cand_col, flags=re.I).strip()
        cand_col_clean = re.sub(r"^[^\w]+|[^\w]+$", "", cand_col_clean).strip()
        if cand_col_clean:
            matched_c = resolve_col(cand_col_clean)
            if matched_c:
                col_key = matched_c["key"]
                return {
                    "field": col_key,
                    "column": col_key,
                    "direction": dir_str,
                    "order": dir_str,
                    "label": matched_c.get("label", col_key)
                }

    for c in columns:
        c_label = c.get("label", "")
        c_key = c.get("key", "")
        if (c_label and _word_match(t, c_label)) or (c_key and _word_match(t, c_key)):
            dir_str = resolve_direction(t, "asc")
            return {
                "field": c_key,
                "column": c_key,
                "direction": dir_str,
                "order": dir_str,
                "label": c_label or c_key
            }

    # Fallback: if user commanded sort without specifying a column ("sort.", "sort"),
    # use page defaultSort or first sortable column
    default_sort = page.get("defaultSort")
    if isinstance(default_sort, list) and default_sort:
        first_s = default_sort[0]
        f_name = first_s.get("field") or first_s.get("column", "")
        d_name = first_s.get("direction", "asc")
        matched_c = resolve_col(f_name)
        return {
            "field": f_name,
            "column": f_name,
            "direction": resolve_direction(d_name, "asc"),
            "order": resolve_direction(d_name, "asc"),
            "label": matched_c.get("label", f_name) if matched_c else f_name
        }

    sortable_cols = [c for c in columns if c.get("sortable", True)]
    target_c = sortable_cols[0] if sortable_cols else (columns[0] if columns else None)
    if target_c:
        c_key = target_c.get("key", "")
        return {
            "field": c_key,
            "column": c_key,
            "direction": "asc",
            "order": "asc",
            "label": target_c.get("label", c_key)
        }

    return None


def _detect_grid_click(
    text: str,
    direct_args: Dict[str, Any],
    page_info: Optional[Dict[str, Any]] = None
) -> Optional[Dict[str, Any]]:
    """
    Detect grid click operations (button, icon, or specific link by row number or row identifier).
    Returns a dict with element, action_type, row_number, row_index, row_identifier, or None.
    """
    t = (text or "").strip()
    explicit_act = str(direct_args.get("action") or "").lower().strip()

    # Check if this is a click operation
    has_click_act = explicit_act in ("click", "grid_click", "click_operation", "click_row")
    has_click_verb = bool(CLICK_VERB.search(t))
    has_explicit_target = bool(
        direct_args.get("element")
        or direct_args.get("row_identifier")
        or direct_args.get("row_number")
        or (has_click_act and "index" in direct_args)
    )

    if not (has_click_act or has_click_verb or has_explicit_target):
        return None

    # Guard against pure page navigation commands like "open orders" or "open quotations"
    if page_info and not has_click_act:
        aliases = [a.lower() for a in page_info.get("aliases", [])]
        title = page_info.get("title", "").lower()
        clean_t = re.sub(r"^[^\w\s]+|[^\w\s]+$", "", t).lower().strip()
        nav_only = re.sub(r"^\s*(?:open|go to|navigate to)\s+", "", clean_t)
        if nav_only in aliases or nav_only == title:
            return None

    # 1. Determine element and action type
    element = direct_args.get("element") or direct_args.get("action_type") or direct_args.get("target_element")
    action_type = direct_args.get("action_type") or "click"

    if not element:
        if re.search(r"\b(?:delete|remove)\b", t, re.IGNORECASE):
            element = "delete"
            action_type = "delete"
        elif re.search(r"\b(?:edit|modify|update)\b", t, re.IGNORECASE):
            element = "edit"
            action_type = "edit"
        elif re.search(r"\b(?:order\s+(?:number|no|#)?\s*(?:link)?|po\s*(?:number|no|#)?\s*(?:link)?)\b", t, re.IGNORECASE):
            element = "order_number"
            action_type = "link"
        elif re.search(r"\b(?:quote\s+(?:number|no|#)?\s*(?:link)?|quotation\s*(?:number|no|#)?\s*(?:link)?)\b", t, re.IGNORECASE):
            element = "quote_number"
            action_type = "link"
        elif re.search(r"\b(?:view|details|inspect)\b", t, re.IGNORECASE):
            element = "view"
            action_type = "icon"
        elif re.search(r"\b(?:link)\b", t, re.IGNORECASE):
            element = "link"
            action_type = "link"
        elif re.search(r"\b(?:button)\b", t, re.IGNORECASE):
            element = "button"
            action_type = "button"
        elif re.search(r"\b(?:icon)\b", t, re.IGNORECASE):
            element = "icon"
            action_type = "icon"
        elif re.search(r"^\s*open\b", t, re.IGNORECASE):
            element = "link"
            action_type = "link"
        else:
            element = "button"
            action_type = "button"

    # 2. Determine Row Identifier if present
    row_identifier = direct_args.get("row_identifier") or direct_args.get("identifier") or direct_args.get("row_id") or direct_args.get("id")
    if not row_identifier and t:
        # Match standard identifiers: ORD-100200, PO-1002, QT-1002, Q-1002, SHP-..., INC-..., etc.
        m_id = re.search(r"\b([A-Z]{2,4}[-\s]?\d{3,})\b", t, re.IGNORECASE)
        if m_id:
            row_identifier = m_id.group(1).strip().upper().replace(" ", "-")
        else:
            # Match explicit pattern: order/quote #1234 or ORD 1234
            m_entity = re.search(r"\b(?:order|quote|po|quotation|shipment|incident|sku)(?:\s+(?:number|no|#))?[\s#:]+([A-Za-z0-9_\-]+)\b", t, re.IGNORECASE)
            if m_entity:
                cand = m_entity.group(1).strip()
                if cand.isdigit() and page_info:
                    p_key = page_info.get("key", "")
                    prefix = "ORD-" if p_key == "orders" else ("QT-" if p_key == "quotes" else "")
                    row_identifier = f"{prefix}{cand}" if prefix else cand
                else:
                    row_identifier = cand.upper()

    # 3. Determine Row Number / Index
    row_number = None
    row_index = None

    if direct_args.get("row_number") is not None:
        try:
            row_number = int(direct_args["row_number"])
            row_index = row_number - 1 if row_number > 0 else -1
        except (ValueError, TypeError):
            pass
    elif direct_args.get("row_index") is not None:
        try:
            row_index = int(direct_args["row_index"])
            row_number = row_index + 1 if row_index >= 0 else -1
        except (ValueError, TypeError):
            pass
    elif direct_args.get("index") is not None and has_click_act:
        try:
            row_index = int(direct_args["index"])
            row_number = row_index + 1 if row_index >= 0 else -1
        except (ValueError, TypeError):
            pass

    if row_number is None and t:
        # Check digit row patterns: "row 3", "row number 3", "row #3"
        m_row = re.search(r"\brow\s+(?:number\s+|no\s+|#\s*)?(\d+)\b", t, re.IGNORECASE)
        if m_row:
            row_number = int(m_row.group(1))
            row_index = row_number - 1
        else:
            # Check word numbers: "row three", "row two"
            m_row_w = re.search(r"\brow\s+(?:number\s+|no\s+|#\s*)?([a-z]+)\b", t, re.IGNORECASE)
            if m_row_w and m_row_w.group(1).lower() in WORD_TO_NUM:
                row_number = WORD_TO_NUM[m_row_w.group(1).lower()]
                row_index = row_number - 1
            else:
                # Check ordinals: "first row", "second row", "3rd row", "top row", "last row"
                for pat, idx_val in ORDINALS:
                    if pat.search(t):
                        row_index = idx_val
                        row_number = idx_val + 1 if idx_val >= 0 else -1
                        break

    # If neither row_identifier nor row_number was detected, but user explicitly said "row"
    if row_number is None and row_identifier is None:
        if re.search(r"\brow\b", t, re.IGNORECASE):
            row_number = 1
            row_index = 0

    return {
        "element": element,
        "action_type": action_type,
        "row_number": row_number,
        "row_index": row_index,
        "row_identifier": row_identifier,
    }


def _detect_create_request(
    text: str,
    direct_args: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """
    Detect create request from natural language text or direct arguments.
    Returns dict with request_text, or None.
    """
    t = (text or "").strip()
    explicit_act = str(direct_args.get("action") or "").lower().strip()

    if explicit_act in ("create_request", "create", "new_request", "submit_request"):
        req_text = direct_args.get("request_text") or direct_args.get("text") or direct_args.get("user_input") or t
        return {"request_text": str(req_text).strip()}

    if not t or not CREATE_VERB.search(t):
        return None

    # Extract text after prefix
    m_pref = re.search(
        r"\b(?:(?:create|submit|send|raise|post|make)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?request|new\s+(?:create\s+)?request)\s*[:\-]?\s*(.*)",
        t,
        re.IGNORECASE
    )
    if m_pref and m_pref.group(1).strip():
        req_text = m_pref.group(1).strip()
    else:
        m_entity = re.search(
            r"\b((?:create|submit|request|make|raise|post)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:order|quote|quotation|shipment|incident|purchase\s+order|ticket|booking)\b.*)",
            t,
            re.IGNORECASE
        )
        if m_entity and m_entity.group(1).strip():
            req_text = m_entity.group(1).strip()
        else:
            req_text = t

    req_text = re.sub(r"^[\"']|[\"']$", "", req_text).strip()
    return {"request_text": req_text}


def _extract_text_box_filters(
    page: Dict[str, Any],
    text: str,
    direct_args: Dict[str, Any],
    standard_ctrl_keys: set,
    control_keywords: set
) -> Optional[str]:
    """
    Universal text box filter (applicable to all applications and pages):
    There is a text box above the grid ('q', 'keyword', or 'search') common across pages
    to filter grid columns and search. We use this when a standard filter is not defined for that column.
    """
    # 1. Direct arguments
    if "column" in direct_args and "value" in direct_args:
        col_c = str(direct_args["column"]).strip().lower()
        if col_c not in standard_ctrl_keys:
            raw_v = str(direct_args["value"]).strip()
            clean_v = re.sub(r'^[^\w]+|[^\w]+$', '', raw_v).strip()
            if clean_v:
                return clean_v

    ignored_keys = {
        "action", "page", "target", "module", "user_input", "input", "text", "command",
        "query", "app", "app_code", "sort", "sort_by", "sortBy", "sort_field",
        "sort_order", "sortOrder", "sort_dir", "direction", "order", "pagination",
        "page_number", "page_num", "pageNum", "pageNumber", "index", "reset", "q", "search", "keyword",
        "paid_status", "paid_only", "use_agent", "is_agent"
    }
    for k, v in direct_args.items():
        clean_k = k.lower()
        if clean_k not in standard_ctrl_keys and clean_k not in ignored_keys and v is not None:
            val_s = str(v).strip()
            clean_v = re.sub(r'^[^\w]+|[^\w]+$', '', val_s).strip()
            if clean_v:
                return clean_v

    # 2. Natural language text
    if not text:
        return None
    t = text.strip()

    # Do not extract text box filters if user intent is navigation, sorting, or pagination
    if NAV_VERB.search(t) or SORT_VERB.search(t) or PAGINATION_VERB.search(t):
        if not any(kw in t.lower() for kw in ("filter", "where", "with status")):
            return None

    # Exclude page title, noun, and alias words so page names are never treated as column candidates
    page_words = set()
    for item in [page.get("title", ""), page.get("noun", ""), page.get("key", "")] + page.get("aliases", []):
        for w in re.split(r"[\s\-_]+", item):
            w_clean = re.sub(r"[^\w]", "", w).lower()
            if len(w_clean) >= 2:
                page_words.add(w_clean)

    # Check if text is just a page title/noun/alias
    t_bare = re.sub(r"[^\w\s]", "", t).strip().lower()
    if t_bare in page_words or any(t_bare == f"go to {w}" or t_bare == f"navigate to {w}" for w in page_words):
        return None

    columns = page.get("columns", [])
    q_ctrl = next((c for c in page.get("controls", []) if c.get("id") in ("q", "keyword", "search")), None)
    search_fields = (q_ctrl.get("searchFields", []) if q_ctrl else [])
    prefix_words = (q_ctrl.get("prefixWords", []) if q_ctrl else [])

    candidates = []
    for c in columns:
        k = c.get("key", "")
        lbl = c.get("label", "")
        if k.lower() not in standard_ctrl_keys and k.lower() not in page_words:
            if lbl and lbl.lower() not in page_words:
                candidates.append(lbl)
            if k:
                candidates.append(k)
    for sf in search_fields:
        if sf.lower() not in standard_ctrl_keys and sf.lower() not in page_words:
            candidates.append(sf)
    for pw in prefix_words:
        if pw.lower() not in standard_ctrl_keys and pw.lower() not in ("keyword", "number") and pw.lower() not in page_words:
            candidates.append(pw)

    candidates = sorted(list(set(candidates)), key=lambda x: len(x), reverse=True)

    for cand in candidates:
        if not cand:
            continue
        esc_cand = re.escape(cand)
        pat = rf"\b(?:filter\s+by\s+|filter\s+|search\s+for\s+|search\s+|find\s+)?(?:{esc_cand})[:\s=]+['\"]?([a-zA-Z0-9_\-\s#]+?)['\"]?(?:\s+(?:please|and|with|having)|\.|\?|\!|\s*$)"
        m = re.search(pat, t, re.IGNORECASE)
        if m:
            val = m.group(1).strip()
            val = re.sub(r"^[^\w]+|[^\w]+$", "", val).strip()
            val = re.sub(r"\b(orders?|quotes?|quotations?|shipments?|incidents?|customers?|products?|yard|users?|please)\b", "", val, flags=re.I).strip()
            val = re.sub(r"^[^\w]+|[^\w]+$", "", val).strip()
            if val and val.lower() not in control_keywords and val.lower() not in page_words:
                return val

    # Queries like "orders from Shanghai", "shipments for Acme"
    from_m = re.search(r"\b(?:orders?|shipments?|quotes?|records?|incidents?)\s+(?:from|for|to|at|in)\s+['\"]?([a-zA-Z0-9_\-\s#]+?)['\"]?(?:\s+(?:please|and)|\.|\?|\!|\s*$)", t, re.IGNORECASE)
    if from_m:
        val = from_m.group(1).strip()
        val = re.sub(r"^(?:client|supplier|shipper|consignee|carrier|port|brand|country|vendor)\s+", "", val, flags=re.I).strip()
        val = re.sub(r"\b(orders?|quotes?|quotations?|shipments?|incidents?|customers?|products?|yard|users?|please)\b", "", val, flags=re.I).strip()
        val = re.sub(r"^[^\w]+|[^\w]+$", "", val).strip()
        if val and val.lower() not in control_keywords and val.lower() not in ("sea", "air", "road", "rail") and val.lower() not in page_words:
            return val

    # Queries like "filter by Shanghai.", "filter Shanghai.", "search Shanghai."
    filter_m = re.search(r"\b(?:filter\s+by|filter\s+for|filter|search\s+for|search)\s+['\"]?([a-zA-Z0-9_\-\s#]+?)['\"]?(?:\s+(?:please|and)|\.|\?|\!|\s*$)", t, re.IGNORECASE)
    if filter_m:
        val = filter_m.group(1).strip()
        val = re.sub(r"^(?:client|supplier|shipper|consignee|carrier|port|brand|country|vendor)\s+", "", val, flags=re.I).strip()
        val = re.sub(r"\b(orders?|quotes?|quotations?|shipments?|incidents?|customers?|products?|yard|users?|please)\b", "", val, flags=re.I).strip()
        val = re.sub(r"^[^\w]+|[^\w]+$", "", val).strip()
        if val and val.lower() not in control_keywords and val.lower() not in page_words:
            return val

    return None


# Backwards compatibility alias
_extract_cvs_column_filters = _extract_text_box_filters



def resolve_config_path(app_code: Optional[str] = None) -> Path:
    """Resolve config path dynamically based on app_code or environment variable."""
    base_dir = Path(__file__).parent
    if app_code:
        clean = app_code.strip().lower()
        candidate = base_dir / f"{clean}_pages_config.json"
        if candidate.exists():
            return candidate
    env_path = os.environ.get("PAGES_CONFIG_PATH")
    if env_path:
        p = Path(env_path)
        if p.exists():
            return p
    return CONFIG_FILE


def load_pages_config(app_code: Optional[str] = None) -> List[Dict[str, Any]]:
    """Load pages and filter configuration from JSON file for the given app_code."""
    cache_key = (app_code or "").strip().lower() or "default"
    path = resolve_config_path(app_code)
    try:
        with open(path, "r", encoding="utf-8-sig") as f:
            data = json.load(f)
            if isinstance(data, list):
                _CONFIG_CACHE[cache_key] = data
                return data
            if isinstance(data, dict) and "pages" in data:
                _CONFIG_CACHE[cache_key] = data["pages"]
                return data["pages"]
    except Exception as e:
        logger.warning("Could not read pages config from %s: %s", path, e)
    return _CONFIG_CACHE.get(cache_key, [])


# Dynamic initialization
PAGES_CONFIG = load_pages_config()
PAGES_BY_KEY = {p["key"]: p for p in PAGES_CONFIG}


def get_pages_config(app_code: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return the complete pages configuration for an app, reloading from JSON."""
    global PAGES_CONFIG, PAGES_BY_KEY
    cfg = load_pages_config(app_code)
    if not app_code and cfg:
        PAGES_CONFIG = cfg
        PAGES_BY_KEY = {p["key"]: p for p in PAGES_CONFIG}
    return cfg


def get_page_by_key(key: str, app_code: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Look up a page configuration by key for the given application."""
    cfg = get_pages_config(app_code)
    clean_key = (key or "").strip().lower()
    return next((p for p in cfg if p["key"].lower() == clean_key), None) or (PAGES_BY_KEY.get(key) if not app_code else None)


def _word_match(text: str, word: str) -> bool:
    """Case-insensitive exact word/phrase boundary matching."""
    if not text or not word:
        return False
    esc_w = re.escape(word.lower())
    return bool(re.search(rf"\b{esc_w}\b", text.lower()))


def _option_words(opt: Dict[str, Any]) -> List[str]:
    """Collect all matching values and synonyms for a select/radio option."""
    return [opt["value"]] + opt.get("synonyms", [])


# ---------------------------------------------------------------------------
# Config-Driven Generic Parser & Action Engine
# ---------------------------------------------------------------------------
def _detect_target_page(
    pages: List[Dict[str, Any]],
    text: str,
    current_page: Optional[str] = None,
    explicit_target: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Dynamically determine the target page using configuration metadata. Does NOT assume if target is invalid."""
    if not pages:
        return None

    t = (text or "").lower()

    # 1. Explicit target hint
    if explicit_target:
        hint = str(explicit_target).strip().lower()
        if hint not in ("next", "prev", "previous", "first", "last") and not hint.isdigit():
            for p in pages:
                if p["key"].lower() == hint or hint in [a.lower() for a in p.get("aliases", [])]:
                    return p
                if p.get("noun") and p["noun"].lower() == hint:
                    return p
                if p.get("title") and p["title"].lower() == hint:
                    return p
            # Explicit target was provided but does not exist in configuration: do NOT assume or guess!
            return None

    # 2. Check explicit navigation command in text (e.g. "navigate to quotes", "go to invoices")
    # Disregard pagination phrases like "go to page 3", "jump to page 2", "next page"
    nav_m = None
    if not PAGINATION_VERB.search(t):
        cand_m = re.search(
            r"\b(?:navigate\s+(?:back\s+)?to|go\s+(?:back\s+)?to|goto|open|switch\s+to|take\s+me\s+(?:back\s+)?to|back\s+to|bring\s+up|jump\s+to)\s+(?:the\s+)?([a-zA-Z0-9_\-]+(?:\s+[a-zA-Z0-9_\-]+)?)",
            t,
            re.IGNORECASE
        )
        if cand_m:
            req_page = cand_m.group(1).strip().lower()
            if req_page not in ("page", "next", "prev", "previous", "first", "last") and not req_page.isdigit():
                nav_m = cand_m
                for p in pages:
                    if p["key"].lower() == req_page or req_page in [a.lower() for a in p.get("aliases", [])]:
                        return p
                    if p.get("noun") and p["noun"].lower() == req_page:
                        return p
                    if p.get("title") and p["title"].lower() == req_page:
                        return p
                # If multiple words captured (e.g. 'quotations page'), check first word as well
                first_word = req_page.split()[0]
                if first_word not in ("page", "module", "screen", "section", "next", "prev", "previous", "first", "last"):
                    for p in pages:
                        if p["key"].lower() == first_word or first_word in [a.lower() for a in p.get("aliases", [])]:
                            return p
                        if p.get("noun") and p["noun"].lower() == first_word:
                            return p
                        if p.get("title") and p["title"].lower() == first_word:
                            return p

    # 3. Score each page against the text based on its configured metadata
    best_page = None
    best_score = 0

    for page in pages:
        score = 0
        # Check aliases
        for alias in page.get("aliases", []):
            if _word_match(t, alias):
                score += 4
            elif alias.lower() in t:
                score += 2

        # Check noun
        if page.get("noun") and _word_match(t, page["noun"]):
            score += 3

        # Check title
        if page.get("title") and _word_match(t, page["title"]):
            score += 3

        # Check controls
        for ctrl in page.get("controls", []):
            c_type = ctrl.get("type")
            if c_type == "text":
                id_regex = ctrl.get("idRegex")
                if id_regex and re.search(id_regex, t, re.IGNORECASE):
                    score += 5
                for pw in ctrl.get("prefixWords", []):
                    if _word_match(t, pw):
                        score += 1
            elif c_type in ("select", "radio"):
                for opt in ctrl.get("options", []):
                    if any(_word_match(t, w) for w in _option_words(opt)):
                        score += 2
            elif c_type == "checkbox":
                if any(_word_match(t, w) for w in ctrl.get("onWords", [])):
                    score += 2
                if any(_word_match(t, w) for w in ctrl.get("offWords", [])):
                    score += 2

        if score > best_score:
            best_score = score
            best_page = page

    if best_page and best_score > 0:
        return best_page

    # If the user explicitly used a navigation verb but no configured page matched, do NOT assume!
    if nav_m:
        return None

    # Fall back to current_page if valid, else first page in config
    if current_page:
        cp = next((p for p in pages if p["key"].lower() == current_page.lower()), None)
        if cp:
            return cp

    return pages[0]


def _extract_page_filters(
    page: Dict[str, Any],
    text: str,
    direct_args: Dict[str, Any],
    app_code: Optional[str] = None
) -> Dict[str, Any]:
    """Extract filter values dynamically driven purely by page['controls']."""
    t = (text or "").strip()
    t_clean = re.sub(r'^[^\w\s]+|[^\w\s]+$', '', t).strip()

    # Check if this is a navigation command
    has_search_verb = bool(SEARCH_VERB.search(t))
    is_nav = (bool(NAV_VERB.search(t)) or direct_args.get("action") in ("navigate", "open", "goto")) and not has_search_verb
    if not is_nav and t_clean and not has_search_verb:
        p_title = page.get("title", "").lower()
        p_noun = page.get("noun", "").lower()
        p_aliases = [a.lower() for a in page.get("aliases", [])]
        if t_clean.lower() in (p_title, p_noun) or t_clean.lower() in p_aliases:
            is_nav = True

    # If pure navigation without explicit filter phrases, do NOT extract filters!
    if is_nav and not any(kw in t.lower() for kw in ("filter", "search", "where", "with status", "with", "having")):
        return {}

    # Check if this is a sort command
    is_sort = bool(SORT_VERB.search(t)) or direct_args.get("action") == "sort"
    # If pure sort without explicit filter phrases, do NOT extract filters!
    if is_sort and not any(kw in t.lower() for kw in ("filter", "search", "where", "with status")):
        return {}

    # Check if this is a pagination command
    is_pag = bool(PAGINATION_VERB.search(t)) or direct_args.get("action") in ("paginate", "pagination")
    if is_pag and not any(kw in t.lower() for kw in ("filter", "search", "where")):
        return {}

    filters: Dict[str, Any] = {}

    # Build dynamic keywords set from other controls to avoid false keyword extractions
    control_keywords = set()
    standard_ctrl_keys = set()
    for ctrl in page.get("controls", []):
        if ctrl.get("id") != "q":
            standard_ctrl_keys.add(ctrl.get("id", "").lower())
            if ctrl.get("param"):
                standard_ctrl_keys.add(ctrl.get("param", "").lower())
            if ctrl.get("field"):
                standard_ctrl_keys.add(ctrl.get("field", "").lower())
        for opt in ctrl.get("options", []):
            control_keywords.add(opt["value"].lower())
        for w in ctrl.get("onWords", []) + ctrl.get("offWords", []):
            control_keywords.add(w.lower())
    if "paid_only" in standard_ctrl_keys or "is_paid" in standard_ctrl_keys:
        standard_ctrl_keys.add("paid_status")
        standard_ctrl_keys.add("paid_only")

    for ctrl in page.get("controls", []):
        c_id = ctrl.get("id")
        c_type = ctrl.get("type")
        c_param = ctrl.get("param", c_id)
        c_field = ctrl.get("field", c_param)

        # 1. Select & Radio controls
        if c_type in ("select", "radio"):
            # Check direct arguments first
            arg_val = direct_args.get(c_param) or direct_args.get(c_id) or direct_args.get(c_field)
            if arg_val is not None:
                val_str = str(arg_val).strip()
                parts = [p.strip() for p in val_str.split(",") if p.strip()]
                canonical_parts = []
                for part in parts:
                    matched = next((opt["value"] for opt in ctrl.get("options", []) if opt["value"].lower() == part.lower() or any(w.lower() == part.lower() for w in opt.get("synonyms", []))), None)
                    canonical_parts.append(matched or part.capitalize())
                if canonical_parts:
                    filters[c_id] = ",".join(canonical_parts) if len(canonical_parts) > 1 else canonical_parts[0]
            elif t:
                # Scan text for matching options
                matched_opts = []
                for opt in ctrl.get("options", []):
                    if any(_word_match(t, w) for w in _option_words(opt)):
                        matched_opts.append(opt["value"])
                if matched_opts:
                    filters[c_id] = ",".join(matched_opts) if len(matched_opts) > 1 else matched_opts[0]

        # 2. Checkbox controls
        elif c_type == "checkbox":
            arg_val = direct_args.get(c_param) if c_param in direct_args else (direct_args.get(c_id) if c_id in direct_args else direct_args.get(c_field))
            if arg_val is not None:
                if str(arg_val).lower() in ("true", "1", "yes", "paid"):
                    filters[c_id] = True
                elif str(arg_val).lower() in ("false", "0", "no", "unpaid"):
                    filters[c_id] = False
            elif t:
                on_match = any(_word_match(t, w) for w in ctrl.get("onWords", []))
                off_match = any(_word_match(t, w) for w in ctrl.get("offWords", []))
                if on_match and not off_match:
                    filters[c_id] = True
                elif off_match and not on_match:
                    filters[c_id] = False

            # Ensure dual compatibility for paid_status / paid_only
            if c_id == "paid_only" and c_id in filters:
                filters["paid_status"] = "paid" if filters[c_id] is True else "unpaid"

        # 3. Text / Keyword controls
        elif c_type == "text":
            id_regex = ctrl.get("idRegex")
            id_prefix = ctrl.get("idPrefix", "")
            is_primary_kw = (c_id in ("q", "search", "keyword") or c_param in ("q", "search", "keyword") or bool(id_regex))

            if is_primary_kw:
                arg_val = direct_args.get(c_param) or direct_args.get(c_id) or direct_args.get("keyword") or direct_args.get("search") or direct_args.get("q")
            else:
                arg_val = direct_args.get(c_param) or direct_args.get(c_id) or direct_args.get(c_field)

            if arg_val:
                val_str = str(arg_val).strip()
                if id_regex:
                    m = re.search(id_regex, val_str, re.IGNORECASE)
                    if m:
                        num = next((g for g in m.groups() if g is not None), None)
                        if num:
                            val_str = f"{id_prefix}{num}"
                filters[c_id] = val_str
            elif t:
                if not is_primary_kw:
                    # Specific text control (e.g. assigned_to): match prefix words like "assigned to John"
                    prefix_words = ctrl.get("prefixWords", [])
                    if prefix_words:
                        pw_pattern = rf"\b(?:{'|'.join(re.escape(pw) for pw in prefix_words)})[:\s]+['\"]?([a-zA-Z0-9_\-\s]+?)['\"]?(?:\s+(?:please|and|on|for)|\s*$)"
                        m_pw = re.search(pw_pattern, t, re.IGNORECASE)
                        if m_pw:
                            val = m_pw.group(1).strip()
                            if val and val.lower() not in control_keywords:
                                filters[c_id] = val
                else:
                    # Primary keyword control:
                    # 3a. Check ID Regex pattern (e.g. ORD-100, QUO-100 or 100)
                    matched_id = None
                    if id_regex:
                        m = re.search(id_regex, t, re.IGNORECASE)
                        if m:
                            num = next((g for g in m.groups() if g is not None), None)
                            if num:
                                matched_id = f"{id_prefix}{num}"
                                filters[c_id] = matched_id

                    # 3b. Check explicit keyword: "keyword laptop", "filter by keyword ORD-100"
                    if not matched_id:
                        kw_m = re.search(r"\b(?:filter by keyword|search keyword|filter keyword|keyword|key word)[:\s]+['\"]?([a-zA-Z0-9\-_]+(?:\s+[a-zA-Z0-9\-_]+)?)['\"]?", t, re.IGNORECASE)
                        if kw_m:
                            val = kw_m.group(1).strip()
                            val = re.sub(r"\b(in|on|for|orders?|items?|products?|quotes?|quotations?|please)\b", "", val, flags=re.I).strip()
                            if val:
                                if id_regex and re.search(id_regex, val, re.IGNORECASE):
                                    m_v = re.search(id_regex, val, re.IGNORECASE)
                                    num = next((g for g in m_v.groups() if g is not None), None)
                                    filters[c_id] = f"{id_prefix}{num}" if num else val
                                else:
                                    filters[c_id] = val
                                matched_id = filters[c_id]

                    # 3c. Check natural queries: "quotations for Acme", "quotes for Acme", "orders for Acme"
                    if not matched_id:
                        noun_aliases = [page.get("noun", ""), page.get("prefix", ""), "quotes", "quote", "quotations", "quotation", "orders", "order", "items", "item", "products", "product"]
                        noun_str = "|".join(re.escape(w) for w in noun_aliases if w)
                        noun_m = re.search(rf"\b(?:{noun_str})\s+(?:for|by|from|about)\s+['\"]?([a-zA-Z0-9\-_]+(?:\s+[a-zA-Z0-9\-_]+)?)['\"]?", t, re.IGNORECASE)
                        if noun_m:
                            val = noun_m.group(1).strip()
                            val = re.sub(r"\b(in|on|for|please)\b", "", val, flags=re.I).strip()
                            if val and val.lower() not in control_keywords:
                                filters[c_id] = val
                                matched_id = filters[c_id]

                    # 3d. Check search verbs: "search for laptop", "find customer Alice", "look up Acme"
                    if not matched_id:
                        search_m = re.search(r"\b(?:search for|find|look up|lookup|filter for|named|called|customer|about)\s+['\"]?([a-zA-Z0-9\-_]+(?:\s+[a-zA-Z0-9\-_]+)?)['\"]?", t, re.IGNORECASE)
                        if search_m:
                            val = search_m.group(1).strip()
                            val = re.sub(r"^(?:customer|item|order|product|quote|quotation)\s+", "", val, flags=re.I).strip()
                            val = re.sub(r"\b(in|on|for|orders?|items?|products?|quotes?|quotations?|please)\b", "", val, flags=re.I).strip()
                            if val and val.lower() not in control_keywords:
                                if id_regex and re.search(id_regex, val, re.IGNORECASE):
                                    m_v = re.search(id_regex, val, re.IGNORECASE)
                                    num = next((g for g in m_v.groups() if g is not None), None)
                                    filters[c_id] = f"{id_prefix}{num}" if num else val
                                else:
                                    filters[c_id] = val

        # 4. Date Range controls
        elif c_type == "daterange":
            p_from = ctrl.get("paramFrom", "date_from")
            p_to = ctrl.get("paramTo", "date_to")
            d_from = direct_args.get(p_from) or direct_args.get("date_from")
            d_to = direct_args.get(p_to) or direct_args.get("date_to")
            if d_from or d_to:
                filters[c_id] = {"from": d_from, "to": d_to}

    # Direct support for paid_status if explicitly passed in direct_args
    if "paid_status" in direct_args and "paid_status" not in filters:
        ps = str(direct_args["paid_status"]).lower()
        if ps in ("paid", "unpaid", "all"):
            filters["paid_status"] = ps
            if ps == "paid":
                filters["paid_only"] = True
            elif ps == "unpaid":
                filters["paid_only"] = False

    # Universal text box filter (applicable to all applications and pages):
    # Common search text box above the grid to filter grid columns and search keywords.
    text_q = _extract_text_box_filters(page, t, direct_args, standard_ctrl_keys, control_keywords)
    if text_q and not filters.get("q"):
        clean_q = re.sub(r'^[^\w]+|[^\w]+$', '', text_q).strip()
        if clean_q:
            kw_id = next((c.get("id") for c in page.get("controls", []) if c.get("id") in ("q", "keyword", "search")), "q")
            filters[kw_id] = clean_q

    # Clean all string filter values to ensure no trailing/leading punctuation
    for k, v in list(filters.items()):
        if isinstance(v, str):
            cleaned = re.sub(r'^[^\w]+|[^\w]+$', '', v).strip()
            if cleaned:
                filters[k] = cleaned
            else:
                del filters[k]

    return filters


def _format_record_summary(page: Dict[str, Any], doc: Dict[str, Any]) -> str:
    """Format a database record using the page's speak_template or columns without hardcoding."""
    template = page.get("speak_template")
    if template:
        data = dict(doc)
        for k, v in doc.items():
            if isinstance(v, bool):
                data[f"{k}_label"] = "paid" if v else "unpaid" if "paid" in k else "in stock" if v else "out of stock"
        try:
            return template.format_map(defaultdict(str, data))
        except Exception:
            pass

    # Fall back to columns
    cols = page.get("columns", [])
    if cols:
        parts = [f"{c.get('label', c['key'])}: {doc.get(c['key'], '')}" for c in cols[:4] if c.get("key") in doc]
        if parts:
            return ", ".join(parts)

    return ", ".join(f"{k}: {v}" for k, v in list(doc.items())[:3])


# ---------------------------------------------------------------------------
# Generic Action Tool & Universal Action Executor
# ---------------------------------------------------------------------------
GENERIC_ACTION_TOOL = {
    "type": "function",
    "name": "perform_action",
    "description": (
        "Config-driven enterprise action executor. Analyzes user intent, reads the application configuration, "
        "and executes search/filter, page navigation, record reading, or filter reset actions."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "user_input": {
                "type": "string",
                "description": "The user's spoken command, request, or query (e.g. 'Show in-transit orders', 'Navigate to Quotations', 'Reset filters')."
            },
            "page": {
                "type": "string",
                "description": "Optional target page/module key."
            },
            "filters": {
                "type": "object",
                "description": "Optional explicit filter dictionary."
            },
            "action": {
                "type": "string",
                "enum": ["search", "navigate", "read", "reset", "paginate", "sort", "click", "create_request"],
                "description": "Optional explicit action type."
            },
            "element": {
                "type": "string",
                "description": "Optional button, icon, or link name to click in grid (e.g. 'edit', 'delete', 'order_number', 'quote_number', 'view')."
            },
            "row_number": {
                "type": "integer",
                "description": "Optional 1-based row number for grid click (e.g. 1 for first row, 2 for second row)."
            },
            "row_identifier": {
                "type": "string",
                "description": "Optional row identifier for grid click (e.g. 'ORD-100200', 'QT-1002')."
            },
            "request_text": {
                "type": "string",
                "description": "Optional text description for create_request action."
            },
            "pagination": {
                "type": "string",
                "description": "Optional pagination target, e.g. 'next', 'prev', or page number string."
            },
            "sort_by": {
                "type": "string",
                "description": "Optional column key or label to sort by."
            },
            "sort_order": {
                "type": "string",
                "enum": ["asc", "desc"],
                "description": "Optional sort direction ('asc' or 'desc')."
            }
        },
        "required": ["user_input"]
    }
}


async def execute_action(
    user_input: Union[str, Dict[str, Any]],
    current_page: Optional[str] = None,
    active_filters: Optional[Dict[str, Any]] = None,
    app_code: Optional[str] = None,
    db: Any = None
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Unified generic action executor driven entirely by configuration.
    Processes user input (natural text and/or structured parameters), resolves the target page,
    extracts filters, performs database count/samples if db is available, and returns:
        (tool_output_for_agent, ui_action_for_frontend)
    """
    # 1. Normalize input arguments
    if isinstance(user_input, dict):
        direct_args = dict(user_input)
        raw_text = str(
            direct_args.get("user_input")
            or direct_args.get("input")
            or direct_args.get("text")
            or direct_args.get("command")
            or direct_args.get("query")
            or ""
        )
    else:
        raw_text = str(user_input or "")
        direct_args = {}

    # Extract nested filters if passed under "filters" key
    if isinstance(direct_args.get("filters"), dict):
        direct_args.update(direct_args.pop("filters"))

    app_key = direct_args.get("app") or direct_args.get("app_code") or app_code
    pages = get_pages_config(app_key)
    if not pages:
        logger.warning("execute_action: No pages configured for app=%s", app_key)
        return (
            {"status": "error", "message": "No pages configured for application."},
            {"type": "chat", "message": "No pages configured."}
        )

    # 2. Determine target page
    explicit_target = direct_args.get("page") or direct_args.get("target") or direct_args.get("module")
    explicit_action = str(direct_args.get("action") or "").lower()

    # Back navigation: previous URL
    is_explicit_back = str(explicit_target).strip().lower() in ("back", "previous_url", "prev_url")
    is_action_back = explicit_action in ("back", "navigate_back", "go_back")
    if (
        is_explicit_back
        or (is_action_back and (not explicit_target or is_explicit_back))
        or (not explicit_target and NAV_BACK_VERB.search(raw_text))
    ):
        tool_output = {
            "status": "success",
            "navigated_to": "back",
            "route": "back",
            "action": "back",
            "message": "Navigating back to previous page."
        }
        ui_action = {
            "type": "navigate",
            "target": "back",
            "route": "back",
            "action": "back",
            "message": "Navigating back to previous page."
        }
        return tool_output, ui_action

    create_info = _detect_create_request(raw_text, direct_args)
    if create_info is not None:
        page_info = _detect_target_page(pages, raw_text, current_page, explicit_target) or (pages[0] if pages else None)
        page_key = page_info["key"] if page_info else (current_page or "orders")
        page_route = page_info.get("route", f"/{page_key}") if page_info else f"/{page_key}"
        req_text = create_info["request_text"]
        is_agent_mode = direct_args.get("use_agent", direct_args.get("is_agent", True))
        analyzed_text = req_text if is_agent_mode else None
        msg = f"Sending create request: '{req_text}' to CVS."
        tool_output = {
            "status": "success",
            "page": page_key,
            "route": page_route,
            "action": "create_request",
            "request_text": req_text,
            "raw_text": raw_text or req_text,
            "analyzed_text": analyzed_text,
            "message": msg
        }
        ui_action = {
            "type": "create_request",
            "target": page_key,
            "route": page_route,
            "action": "create_request",
            "request_text": req_text,
            "raw_text": raw_text or req_text,
            "analyzed_text": analyzed_text,
            "text": req_text,
            "message": msg
        }
        return tool_output, ui_action

    if explicit_target and (str(explicit_target).strip().lower() in ("next", "prev", "previous", "first", "last") or str(explicit_target).strip().isdigit()):
        explicit_target = None
    page_info = _detect_target_page(pages, raw_text, current_page, explicit_target)
    if not page_info:
        nav_m = re.search(r"\b(?:navigate\s+(?:back\s+)?to|go\s+(?:back\s+)?to|goto|open|switch\s+to|take\s+me\s+(?:back\s+)?to|back\s+to|bring\s+up|jump\s+to)\s+(?:the\s+)?([a-zA-Z0-9_\-]+)", raw_text, re.IGNORECASE)
        available = [p.get("title", p["key"]) for p in pages]
        req_target = explicit_target or (nav_m.group(1).strip() if nav_m else "requested module")
        msg = f"The page or module '{req_target}' does not exist in this application. Available pages: {', '.join(available)}."
        tool_output = {
            "status": "not_found",
            "requested": req_target,
            "available_pages": available,
            "message": msg
        }
        ui_action = {
            "type": "chat",
            "status": "not_found",
            "message": msg
        }
        return tool_output, ui_action

    page_key = page_info["key"]
    page_title = page_info.get("title", page_key)
    page_route = page_info.get("route", f"/{page_key}")
    page_noun = page_info.get("noun", "records")

    # 3. Detect action type
    explicit_action = str(direct_args.get("action") or "").lower()
    is_reset = bool(RESET_VERB.search(raw_text)) or direct_args.get("reset") is True or explicit_action in ("reset", "clear")

    create_info = _detect_create_request(raw_text, direct_args)
    click_info = _detect_grid_click(raw_text, direct_args, page_info)

    read_idx = None
    if READ_VERB.search(raw_text) or explicit_action == "read" or "index" in direct_args:
        read_idx = int(direct_args.get("index", 0))
        for pat, idx_val in ORDINALS:
            if pat.search(raw_text):
                read_idx = idx_val
                break

    raw_clean = re.sub(r"^[^\w\s]+|[^\w\s]+$", "", raw_text).strip().lower()
    p_title = page_info.get("title", "").lower()
    p_noun = page_info.get("noun", "").lower()
    p_aliases = [a.lower() for a in page_info.get("aliases", [])]
    is_nav = (
        bool(NAV_VERB.search(raw_text))
        or explicit_action in ("navigate", "open", "goto")
        or (raw_clean in (p_title, p_noun) or raw_clean in p_aliases)
    )
    pagination_target = _detect_pagination(raw_text, direct_args)
    if explicit_action in ("paginate", "pagination") and pagination_target is None:
        pagination_target = "next"
    sort_info = _detect_sort(page_info, raw_text, direct_args)

    # 4. Extract filters dynamically driven by page controls
    new_filters = _extract_page_filters(page_info, raw_text, direct_args, app_code=app_key)

    # Merge active_filters from UI if staying on the same page and not resetting
    combined_filters: Dict[str, Any] = {}
    if not is_reset and read_idx is None and click_info is None and create_info is None:
        if active_filters and (current_page or "").lower() == page_key.lower():
            combined_filters.update(active_filters)
        combined_filters.update(new_filters)
    elif not is_reset and read_idx is not None:
        combined_filters = dict(active_filters or {})

    # 5. Execute Action
    # Case A: Reset filters
    if is_reset:
        tool_output = {
            "status": "success",
            "page": page_key,
            "route": page_route,
            "message": f"Cleared all filters on {page_title}."
        }
        ui_action = {
            "type": "search",
            "target": page_key,
            "route": page_route,
            "filters": {},
            "reset": True,
            "message": f"Cleared all filters on {page_title}."
        }
        return tool_output, ui_action



    # Case C: Grid Click Operation
    if click_info is not None:
        target_el = click_info["element"]
        target_row_id = click_info.get("row_identifier")
        target_row_num = click_info.get("row_number")
        if target_row_id:
            row_desc = f"identifier {target_row_id}"
        elif target_row_num == -1:
            row_desc = "last row"
        elif target_row_num:
            row_desc = f"row {target_row_num}"
        else:
            row_desc = "selected row"

        msg = f"Clicked {target_el} on {row_desc} of {page_title}."
        tool_output = {
            "status": "success",
            "page": page_key,
            "route": page_route,
            "action": "click",
            "element": target_el,
            "action_type": click_info["action_type"],
            "row_number": target_row_num,
            "row_index": click_info.get("row_index"),
            "row_identifier": target_row_id,
            "message": msg
        }
        ui_action = {
            "type": "click",
            "target": page_key,
            "route": page_route,
            "action": "click",
            "element": target_el,
            "action_type": click_info["action_type"],
            "row_number": target_row_num,
            "row_index": click_info.get("row_index"),
            "row_identifier": target_row_id,
            "message": msg
        }
        return tool_output, ui_action

    # Case B: Read specific record/row
    if read_idx is not None:
        row_data = {}
        summary_desc = f"Record at index {read_idx} on {page_title}."
        if db is not None:
            try:
                coll_name = page_info.get("collection", page_key)
                coll = db[coll_name]
                # Determine sort field from date controls or columns
                sort_field = "_id"
                for c in page_info.get("controls", []):
                    if c.get("type") == "daterange" and c.get("field"):
                        sort_field = c["field"]
                        break
                cursor = coll.find({}, {"_id": 0}).sort(sort_field, -1).skip(max(0, read_idx)).limit(1)
                docs = await cursor.to_list(1)
                if docs:
                    row_data = docs[0]
                    summary_desc = f"{page_title} record: " + _format_record_summary(page_info, row_data)
                else:
                    summary_desc = f"No records found at index {read_idx} on {page_title}."
            except Exception as ex:
                logger.info("execute_action read_row DB query skipped: %s", ex)

        tool_output = {
            "status": "success" if row_data else "empty",
            "page": page_key,
            "route": page_route,
            "row_index": read_idx,
            "row_data": row_data,
            "summary": summary_desc
        }
        ui_action = {
            "type": "read",
            "target": page_key,
            "route": page_route,
            "index": read_idx,
            "message": summary_desc
        }
        return tool_output, ui_action

    # Case C: Pagination
    if pagination_target is not None:
        p_desc = f"page {pagination_target}" if isinstance(pagination_target, int) else f"{pagination_target} page"
        msg = f"Navigating to {p_desc} on {page_title}."
        tool_output = {
            "status": "success",
            "page": page_key,
            "route": page_route,
            "pagination": pagination_target,
            "filters": combined_filters,
            "message": msg
        }
        ui_action = {
            "type": "search",
            "action": "paginate",
            "target": page_key,
            "route": page_route,
            "page": pagination_target,
            "pagination": pagination_target,
            "page_number": pagination_target,
            "filters": combined_filters,
            "message": msg
        }
        return tool_output, ui_action

    # Case D: Page Navigation (only if navigation intent and NO filter/sort criteria were supplied)
    if is_nav and not new_filters and not sort_info:
        tool_output = {
            "status": "success",
            "navigated_to": page_key,
            "route": page_route,
            "message": f"Navigating to {page_title}."
        }
        ui_action = {
            "type": "navigate",
            "target": page_key,
            "route": page_route
        }
        return tool_output, ui_action

    # Case E: Standalone Sorting
    if sort_info is not None and not new_filters:
        col_lbl = sort_info.get("label", sort_info["field"])
        dir_lbl = "ascending" if sort_info["direction"] == "asc" else "descending"
        msg = f"Sorted {page_title} by {col_lbl} ({dir_lbl})."
        tool_output = {
            "status": "success",
            "page": page_key,
            "route": page_route,
            "sort": sort_info,
            "filters": combined_filters,
            "message": msg
        }
        ui_action = {
            "type": "search",
            "target": page_key,
            "route": page_route,
            "sort": sort_info,
            "sort_by": sort_info["field"],
            "sort_order": sort_info["direction"],
            "filters": combined_filters,
            "message": msg
        }
        return tool_output, ui_action

    # Case F: Search / Apply Filters
    query: Dict[str, Any] = {}
    filters_for_ui = dict(combined_filters)

    for ctrl in page_info.get("controls", []):
        c_id = ctrl.get("id")
        c_type = ctrl.get("type")
        c_field = ctrl.get("field", ctrl.get("param", c_id))

        if c_id not in combined_filters:
            continue

        val = combined_filters[c_id]
        if c_type in ("select", "radio"):
            if isinstance(val, str) and "," in val:
                parts = [p.strip() for p in val.split(",") if p.strip()]
                query[c_field] = {"$in": parts}
            else:
                query[c_field] = val
        elif c_type == "checkbox":
            query[c_field] = bool(val)
        elif c_type == "text":
            esc_q = re.escape(str(val))
            search_fields = ctrl.get("searchFields", [c_field])
            if len(search_fields) > 1:
                query["$or"] = [{sf: {"$regex": esc_q, "$options": "i"}} for sf in search_fields]
            else:
                query[c_field] = {"$regex": esc_q, "$options": "i"}
        elif c_type == "daterange":
            if isinstance(val, dict):
                d_cond = {}
                if val.get("from"):
                    d_cond["$gte"] = str(val["from"])
                if val.get("to"):
                    d_to_str = str(val["to"])
                    d_cond["$lte"] = d_to_str + "T23:59:59.999999+00:00" if len(d_to_str) == 10 else d_to_str
                if d_cond:
                    query[c_field] = d_cond

    # Handle paid_status in query if present
    if "paid_status" in combined_filters:
        ps = str(combined_filters["paid_status"]).lower()
        if ps == "paid":
            query["is_paid"] = True
        elif ps == "unpaid":
            query["is_paid"] = False
        elif ps == "all":
            query.pop("is_paid", None)

    total = 0
    samples: List[Dict[str, Any]] = []
    sample_summaries: List[str] = []

    if db is not None:
        try:
            coll_name = page_info.get("collection", page_key)
            coll = db[coll_name]
            total = await coll.count_documents(query)
            sort_field = "_id"
            sort_dir = -1
            if sort_info:
                sort_field = sort_info["field"]
                sort_dir = -1 if sort_info["direction"] == "desc" else 1
            else:
                for c in page_info.get("controls", []):
                    if c.get("type") == "daterange" and c.get("field"):
                        sort_field = c["field"]
                        break
            sample_cursor = coll.find(query, {"_id": 0}).sort(sort_field, sort_dir).limit(3)
            samples = await sample_cursor.to_list(3)
            sample_summaries = [_format_record_summary(page_info, s) for s in samples]
        except Exception as ex:
            logger.info("execute_action DB query skipped: %s", ex)

    if total > 0:
        summary_text = f"Found {total} matching {page_noun} on {page_title}." + (f" Examples: {', '.join(sample_summaries)}" if sample_summaries else "")
    else:
        f_desc = ", ".join(f"{k}: {v}" for k, v in filters_for_ui.items()) if filters_for_ui else "all"
        summary_text = f"Filtered {page_title} by {f_desc}." if filters_for_ui else f"Displaying {page_title}."

    if sort_info:
        col_lbl = sort_info.get("label", sort_info["field"])
        dir_lbl = "ascending" if sort_info["direction"] == "asc" else "descending"
        summary_text += f" Sorted by {col_lbl} ({dir_lbl})."

    tool_output = {
        "status": "success",
        "page": page_key,
        "route": page_route,
        "total_matching": total,
        "filters_applied": filters_for_ui,
        "samples": sample_summaries,
        "summary": summary_text
    }
    if sort_info:
        tool_output["sort"] = sort_info

    ui_type = "navigate" if (is_nav and not filters_for_ui and not sort_info) else "search"
    ui_action = {
        "type": ui_type,
        "target": page_key,
        "route": page_route,
        "filters": filters_for_ui,
        "total": total,
        "message": summary_text
    }
    if sort_info:
        ui_action["sort"] = sort_info
        ui_action["sort_by"] = sort_info["field"]
        ui_action["sort_order"] = sort_info["direction"]

    tool_output["action"] = ui_action
    return tool_output, ui_action


# ---------------------------------------------------------------------------
# Public Adapters: Common for both API and Agent
# ---------------------------------------------------------------------------
def parse_command_internal(
    text: str,
    current_page: str = "orders",
    app_code: Optional[str] = None,
    active_filters: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Direct Unchecked mode adapter (used by POST /api/command/execute and browser WebSocket).
    Uses the exact same config-driven action engine.
    """
    if NAV_BACK_VERB.search(text):
        return {
            "type": "navigate",
            "target": "back",
            "route": "back",
            "action": "back",
            "message": "Navigating back to previous page."
        }

    # Check create request FIRST so create requests are never misclassified as grid filters
    create_info = _detect_create_request(text, {})
    if create_info is not None:
        pages = get_pages_config(app_code)
        page_info = _detect_target_page(pages, text, current_page) or (pages[0] if pages else None)
        page_key = page_info["key"] if page_info else (current_page or "orders")
        page_route = page_info.get("route", f"/{page_key}") if page_info else f"/{page_key}"
        req_text = create_info["request_text"]
        return {
            "type": "create_request",
            "target": page_key,
            "route": page_route,
            "action": "create_request",
            "request_text": req_text,
            "raw_text": text,
            "analyzed_text": None,
            "text": req_text,
            "message": f"Sending create request: '{req_text}' to CVS."
        }

    pages = get_pages_config(app_code)
    page_info = _detect_target_page(pages, text, current_page)
    if not page_info:
        available = [p.get("title", p["key"]) for p in pages]
        return {
            "type": "chat",
            "status": "not_found",
            "message": f"Module not found. Available modules: {', '.join(available)}."
        }
    page_key = page_info["key"]
    page_route = page_info.get("route", f"/{page_key}")

    # Check reset
    if RESET_VERB.search(text):
        return {
            "type": "search",
            "target": page_key,
            "route": page_route,
            "filters": {},
            "reset": True,
            "message": f"Cleared all filters on {page_info.get('title', page_key)}."
        }

    # Check grid click
    click_info = _detect_grid_click(text, {}, page_info)
    if click_info is not None:
        target_el = click_info["element"]
        target_row_id = click_info.get("row_identifier")
        target_row_num = click_info.get("row_number")
        if target_row_id:
            row_desc = f"identifier {target_row_id}"
        elif target_row_num == -1:
            row_desc = "last row"
        elif target_row_num:
            row_desc = f"row {target_row_num}"
        else:
            row_desc = "selected row"
        return {
            "type": "click",
            "target": page_key,
            "route": page_route,
            "action": "click",
            "element": target_el,
            "action_type": click_info["action_type"],
            "row_number": target_row_num,
            "row_index": click_info.get("row_index"),
            "row_identifier": target_row_id,
            "message": f"Clicked {target_el} on {row_desc} of {page_info.get('title', page_key)}."
        }

    # Check read
    if READ_VERB.search(text):
        read_idx = 0
        for pat, idx_val in ORDINALS:
            if pat.search(text):
                read_idx = idx_val
                break
        return {
            "type": "read",
            "target": page_key,
            "route": page_route,
            "index": read_idx,
            "message": f"Reading row {read_idx} on {page_info.get('title', page_key)}."
        }

    # Check pagination
    pagination_target = _detect_pagination(text, {})
    if pagination_target is not None:
        p_desc = f"page {pagination_target}" if isinstance(pagination_target, int) else f"{pagination_target} page"
        return {
            "type": "search",
            "action": "paginate",
            "target": page_key,
            "route": page_route,
            "page": pagination_target,
            "pagination": pagination_target,
            "page_number": pagination_target,
            "filters": active_filters or {},
            "message": f"Navigating to {p_desc} on {page_info.get('title', page_key)}."
        }

    # Check filters - pass app_code to enable universal text box fallback!
    filters = _extract_page_filters(page_info, text, {}, app_code=app_code)

    # Check sorting
    sort_info = _detect_sort(page_info, text, {})

    # Check navigation (only when NO filters, sort, or pagination are extracted)
    t_clean = re.sub(r"^[^\w\s]+|[^\w\s]+$", "", text).strip().lower()
    p_title = page_info.get("title", "").lower()
    p_noun = page_info.get("noun", "").lower()
    p_aliases = [a.lower() for a in page_info.get("aliases", [])]
    has_search = bool(SEARCH_VERB.search(text))
    is_nav_cmd = (bool(NAV_VERB.search(text)) or (t_clean in (p_title, p_noun) or t_clean in p_aliases)) and not has_search

    if is_nav_cmd and not filters and not sort_info:
        return {
            "type": "navigate",
            "target": page_key,
            "route": page_route,
            "message": f"Navigating to {page_info.get('title', page_key)}."
        }

    # Standalone sort (no filters specified)
    if sort_info is not None and not filters:
        col_lbl = sort_info.get("label", sort_info["field"])
        dir_lbl = "ascending" if sort_info["direction"] == "asc" else "descending"
        return {
            "type": "search",
            "target": page_key,
            "route": page_route,
            "sort": sort_info,
            "sort_by": sort_info["field"],
            "sort_order": sort_info["direction"],
            "filters": active_filters or {},
            "message": f"Sorted {page_info.get('title', page_key)} by {col_lbl} ({dir_lbl})."
        }

    f_desc = ", ".join(f"{k}='{v}'" for k, v in filters.items()) if filters else "all"
    msg = f"Showing {f_desc} {page_info.get('noun', 'records')}."
    if sort_info:
        col_lbl = sort_info.get("label", sort_info["field"])
        dir_lbl = "ascending" if sort_info["direction"] == "asc" else "descending"
        msg += f" Sorted by {col_lbl} ({dir_lbl})."

    res = {
        "type": "search",
        "target": page_key,
        "route": page_route,
        "filters": filters,
        "message": msg
    }
    if sort_info:
        res["sort"] = sort_info
        res["sort_by"] = sort_info["field"]
        res["sort_order"] = sort_info["direction"]
    return res


async def execute_agent_tool(
    func_name: str,
    args: Dict[str, Any],
    db: Any,
    current_page: str = "orders",
    active_filters: Optional[Dict[str, Any]] = None,
    app_code: Optional[str] = None
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Agent tool executor (Checked mode).
    Maps any tool call (generic 'perform_action' or legacy/intent names) directly into execute_action.
    """
    args_copy = dict(args or {})
    func_clean = (func_name or "").lower().strip()

    # Route legacy or intent tool names into generic action arguments
    if func_clean in ("navigate", "navigate_to_page", "go_to_page", "open_page", "open") and "action" not in args_copy:
        args_copy["action"] = "navigate"
    elif func_clean in ("reset_filters", "clear_filters") and "action" not in args_copy:
        args_copy["action"] = "reset"
    elif func_clean in ("read_row", "read") and "action" not in args_copy:
        args_copy["action"] = "read"
    elif func_clean in ("paginate", "pagination", "next_page", "prev_page", "page") and "action" not in args_copy:
        args_copy["action"] = "paginate"
    elif func_clean in ("sort", "sort_by", "order_by") and "action" not in args_copy:
        args_copy["action"] = "sort"
    elif func_clean in ("click", "grid_click", "click_row", "click_element") and "action" not in args_copy:
        args_copy["action"] = "click"
    elif func_clean in ("create_request", "create", "new_request", "submit_request") and "action" not in args_copy:
        args_copy["action"] = "create_request"

    args_copy.setdefault("use_agent", True)
    return await execute_action(
        user_input=args_copy,
        current_page=current_page,
        active_filters=active_filters,
        app_code=app_code,
        db=db
    )
