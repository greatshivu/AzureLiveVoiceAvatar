"""
Canonical Pages and Filters configuration and command handlers.
This module serves as the single source of truth on the API side for:
1. Loading pages, routes, endpoints, and search filter controls from pages_config.json.
2. Direct internal command parsing (Unchecked mode).
3. Agent function/tool execution (Checked mode).
"""
import os
import re
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

CONFIG_FILE = Path(__file__).parent / "pages_config.json"

def load_pages_config() -> List[Dict[str, Any]]:
    """Load pages and filter configuration from JSON file or custom path."""
    path = os.environ.get("PAGES_CONFIG_PATH") or str(CONFIG_FILE)
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
            if isinstance(data, dict) and "pages" in data:
                return data["pages"]
    except Exception as e:
        logger.warning("Could not read pages config from %s: %s", path, e)
    return []

# Dynamic initialization
PAGES_CONFIG = load_pages_config()
PAGES_BY_KEY = {p["key"]: p for p in PAGES_CONFIG}

def get_pages_config() -> List[Dict[str, Any]]:
    """Return the complete pages configuration, reloading from JSON."""
    global PAGES_CONFIG, PAGES_BY_KEY
    cfg = load_pages_config()
    if cfg:
        PAGES_CONFIG = cfg
        PAGES_BY_KEY = {p["key"]: p for p in PAGES_CONFIG}
    return PAGES_CONFIG

def get_page_by_key(key: str) -> Optional[Dict[str, Any]]:
    cfg = get_pages_config()
    return next((p for p in cfg if p["key"] == key), None) or PAGES_BY_KEY.get(key)


# ---------------------------------------------------------------------------
# Internal Command Parser (Unchecked Mode: API Internal Function)
# ---------------------------------------------------------------------------
NAV_VERB = re.compile(r"\b(navigate|go to|goto|open|switch to|take me to|bring up|jump to)\b", re.IGNORECASE)
SEARCH_VERB = re.compile(r"\b(search|find|show|filter|display|list|look up|lookup|pull up|get|get me|keyword|key word)\b", re.IGNORECASE)
READ_VERB = re.compile(r"\b(read|tell me|what(?:'s| is)|describe|speak)\b", re.IGNORECASE)
ROW_NOUNS = re.compile(r"\b(order|item|product|row|record|result|line|entry)\b", re.IGNORECASE)

ORDINALS = [
    (re.compile(r"\b(top|first|1st|number one)\b", re.IGNORECASE), 0),
    (re.compile(r"\b(second|2nd|number two)\b", re.IGNORECASE), 1),
    (re.compile(r"\b(third|3rd|number three)\b", re.IGNORECASE), 2),
    (re.compile(r"\b(fourth|4th)\b", re.IGNORECASE), 3),
    (re.compile(r"\b(fifth|5th)\b", re.IGNORECASE), 4),
    (re.compile(r"\b(bottom)\b", re.IGNORECASE), -1),
]

def _word_match(text: str, word: str) -> bool:
    esc_w = re.escape(word.lower())
    return bool(re.search(rf"\b{esc_w}\b", text.lower()))

def _option_words(opt: Dict[str, Any]) -> List[str]:
    return [opt["value"]] + opt.get("synonyms", [])

def detect_target_page(text: str, current_key: str = "orders") -> str:
    t = text.lower()
    best_key = current_key
    best_score = 0
    pages = get_pages_config()
    for page in pages:
        score = 0
        for alias in page.get("aliases", []):
            if alias in t:
                score += 3
        if page.get("noun") and _word_match(t, page["noun"]):
            score += 3
        for c in page.get("controls", []):
            if "options" in c:
                for opt in c["options"]:
                    if any(_word_match(t, w) for w in _option_words(opt)):
                        score += 2
            if c.get("type") == "checkbox":
                if any(_word_match(t, w) for w in c.get("onWords", [])):
                    score += 1
            if c.get("type") == "text":
                id_regex = c.get("idRegex")
                if id_regex and re.search(id_regex, t, re.IGNORECASE):
                    score += 4
                for pw in c.get("prefixWords", []):
                    if _word_match(t, pw):
                        score += 1
        if score > best_score:
            best_score = score
            best_key = page["key"]
    return best_key

def _extract_filters(page: Dict[str, Any], text: str) -> Dict[str, Any]:
    t = text.strip()
    filters = {}
    
    # 1. Radio and Select controls
    for c in page.get("controls", []):
        c_type = c.get("type")
        c_id = c.get("id")
        if c_type in ("select", "radio"):
            for opt in c.get("options", []):
                if any(_word_match(t, w) for w in _option_words(opt)):
                    filters[c_id] = opt["value"]
                    break
        elif c_type == "checkbox":
            on_match = any(_word_match(t, w) for w in c.get("onWords", []))
            off_match = any(_word_match(t, w) for w in c.get("offWords", []))
            if on_match and not off_match:
                filters[c_id] = True

    # 2. Text / Keyword controls
    for c in page.get("controls", []):
        if c.get("type") == "text":
            c_id = c.get("id", "q")
            id_prefix = c.get("idPrefix", "")
            id_regex = c.get("idRegex")
            
            # Check ID pattern first (e.g. ORD-100 or ord 100 or order 100)
            if id_regex:
                m = re.search(id_regex, t, re.IGNORECASE)
                if m:
                    num = next((g for g in m.groups() if g is not None), None)
                    if num:
                        filters[c_id] = f"{id_prefix}{num}"
                        continue
            
            # Check explicit keyword: "keyword laptop", "filter by keyword ORD-100", "search keyword: Smith"
            kw_m = re.search(r"\b(?:filter by keyword|search keyword|filter keyword|keyword|key word)[:\s]+['\"]?([a-zA-Z0-9\-_]+(?:\s+[a-zA-Z0-9\-_]+)?)['\"]?", t, re.IGNORECASE)
            if kw_m:
                val = kw_m.group(1).strip()
                val = re.sub(r"\b(in|on|for|orders?|items?|products?|please)\b", "", val, flags=re.I).strip()
                if val:
                    # If ID prefix matchable e.g. ORD-100 or 100
                    if id_regex and re.search(id_regex, val, re.IGNORECASE):
                        m_v = re.search(id_regex, val, re.IGNORECASE)
                        num = next((g for g in m_v.groups() if g is not None), None)
                        filters[c_id] = f"{id_prefix}{num}" if num else val
                    else:
                        filters[c_id] = val
                    continue
            
            # Check natural search for: "search for laptop", "find customer Alice", "search for ORD-100"
            search_m = re.search(r"\b(?:search for|find|look up|lookup|filter for|named|called|customer|about)\s+['\"]?([a-zA-Z0-9\-_]+(?:\s+[a-zA-Z0-9\-_]+)?)['\"]?", t, re.IGNORECASE)
            if search_m:
                val = search_m.group(1).strip()
                val = re.sub(r"^(?:customer|item|order|product)\s+", "", val, flags=re.I).strip()
                val = re.sub(r"\b(in|on|for|orders?|items?|products?|please)\b", "", val, flags=re.I).strip()
                # Exclude words that belong to other controls
                control_words = {"low", "medium", "high", "delivered", "pending", "shipped", "paid", "unpaid", "new", "used", "refurbished", "electronics", "apparel", "sports", "books"}
                if val and val.lower() not in control_words:
                    if id_regex and re.search(id_regex, val, re.IGNORECASE):
                        m_v = re.search(id_regex, val, re.IGNORECASE)
                        num = next((g for g in m_v.groups() if g is not None), None)
                        filters[c_id] = f"{id_prefix}{num}" if num else val
                    else:
                        filters[c_id] = val
                    continue

    return filters

def _read_index(text: str) -> int:
    for pattern, idx in ORDINALS:
        if pattern.search(text):
            return idx
    m = re.search(r"\b(?:row|record|number|line|result)\s+(\d+)\b", text, re.IGNORECASE)
    if m:
        return max(0, int(m.group(1)) - 1)
    return 0

def parse_command_internal(raw_text: str, current_page: str = "orders") -> Dict[str, Any]:
    """
    Internal function running in API application to parse user commands
    against the Pages and filter configuration.
    """
    t = (raw_text or "").strip().rstrip(".?!,")
    if not t:
        return {"type": "chat", "message": "Please say or type a command."}

    target = detect_target_page(t, current_page)

    if READ_VERB.search(t) and ROW_NOUNS.search(t):
        return {"type": "read", "target": target, "index": _read_index(t)}

    if re.search(r"\b(next page|go forward)\b", t, re.IGNORECASE):
        return {"type": "search", "target": current_page, "page": "next"}
    if re.search(r"\b(previous|prev page|go back)\b", t, re.IGNORECASE):
        return {"type": "search", "target": current_page, "page": "prev"}
    page_num_m = re.search(r"\b(?:go to )?page (\d+)\b", t, re.IGNORECASE)
    if page_num_m:
        return {"type": "search", "target": current_page, "page": int(page_num_m.group(1))}

    if re.search(r"\b(reset|clear)( all)?( the)?( filters?| search)?\b", t, re.IGNORECASE):
        page_info = get_page_by_key(current_page) or {}
        return {"type": "search", "target": current_page, "reset": True, "message": f"Cleared all filters on {page_info.get('title', current_page)}."}

    page = get_page_by_key(target) or get_pages_config()[0]
    filters = _extract_filters(page, t)
    has_filters = len(filters) > 0

    is_nav = bool(NAV_VERB.search(t)) or any(t.lower() == a or t.lower() == f"{a} search" or t.lower() == f"{a} search page" for a in page.get("aliases", []))
    is_search = bool(SEARCH_VERB.search(t)) or has_filters

    # Navigation takes precedence if explicit nav verb and no specific filters
    if is_nav and not has_filters:
        return {
            "type": "navigate",
            "target": target,
            "message": f"Navigating to {page.get('title', target)}."
        }

    if is_search:
        filter_parts = []
        for k, v in filters.items():
            filter_parts.append(f"{k}='{v}'")
        f_desc = ", ".join(filter_parts) if filter_parts else "all"
        return {
            "type": "search",
            "target": target,
            "filters": filters,
            "message": f"Showing {f_desc} {page.get('noun', 'records')}."
        }

    if is_nav:
        return {
            "type": "navigate",
            "target": target,
            "message": f"Navigating to {page.get('title', target)}."
        }

    return {"type": "chat", "message": "Command received."}


# ---------------------------------------------------------------------------
# Agent Tool Call Executor (Checked Mode: Voice -> API -> Agent -> Function)
# ---------------------------------------------------------------------------
async def execute_agent_tool(func_name: str, args: Dict[str, Any], db: Any, current_page: str = "orders") -> tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Executes a function call requested by the Foundry Agent.
    Uses the JSON configuration (PAGES_CONFIG) and input from the agent.
    Returns:
        (tool_output_for_agent, ui_action_for_browser)
    """
    func_name = (func_name or "").lower().strip()
    pages = get_pages_config()

    if func_name.startswith("search_") or func_name == "search":
        # Identify page
        page_key = "orders" if "order" in func_name else "items" if "item" in func_name else current_page
        page_info = get_page_by_key(page_key) or pages[0]
        page_key = page_info["key"]

        query = {}
        filters_for_ui = {}

        # Dynamically map controls from pages_config.json
        for ctrl in page_info.get("controls", []):
            c_type = ctrl.get("type")
            c_id = ctrl.get("id")
            c_param = ctrl.get("param", c_id)
            c_field = ctrl.get("field", c_param)

            if c_type in ("select", "radio"):
                val = args.get(c_param) or args.get(c_id)
                if val:
                    val_str = str(val).strip()
                    # Find canonical option
                    matched_opt = None
                    for opt in ctrl.get("options", []):
                        if opt["value"].lower() == val_str.lower() or any(w.lower() == val_str.lower() for w in opt.get("synonyms", [])):
                            matched_opt = opt["value"]
                            break
                    canonical_val = matched_opt or val_str.capitalize()
                    query[c_field] = canonical_val
                    filters_for_ui[c_id] = canonical_val

            elif c_type == "checkbox":
                val = args.get(c_param) if c_param in args else args.get(c_id)
                if val is not None:
                    if bool(val):
                        query[c_field] = True
                        filters_for_ui[c_id] = True

            elif c_type == "text":
                val = args.get(c_param) or args.get(c_id) or args.get("keyword")
                if val:
                    q_str = str(val).strip()
                    id_regex = ctrl.get("idRegex")
                    id_prefix = ctrl.get("idPrefix", "")
                    if id_regex:
                        m = re.search(id_regex, q_str, re.IGNORECASE)
                        if m:
                            num = next((g for g in m.groups() if g is not None), None)
                            if num:
                                q_str = f"{id_prefix}{num}"

                    search_fields = ctrl.get("searchFields", [c_field])
                    if search_fields:
                        query["$or"] = [{f: {"$regex": q_str, "$options": "i"}} for f in search_fields]
                    else:
                        query[c_field] = {"$regex": q_str, "$options": "i"}
                    filters_for_ui[c_id] = q_str

            elif c_type == "daterange":
                d_from = args.get(ctrl.get("paramFrom", "date_from"))
                d_to = args.get(ctrl.get("paramTo", "date_to"))
                date_cond = {}
                if d_from:
                    date_cond["$gte"] = str(d_from)
                if d_to:
                    d_to_str = str(d_to)
                    date_cond["$lte"] = d_to_str + "T23:59:59.999999+00:00" if len(d_to_str) == 10 else d_to_str
                if date_cond:
                    query[c_field] = date_cond
                    filters_for_ui[c_id] = {"from": d_from, "to": d_to}

        # Query collection
        collection_name = page_info.get("collection", page_key)
        coll = db[collection_name]
        total = await coll.count_documents(query)
        sort_field = "order_date" if page_key == "orders" else "added_date"
        sample_cursor = coll.find(query, {"_id": 0}).sort(sort_field, -1).limit(3)
        samples = await sample_cursor.to_list(3)

        sample_summary = []
        for s in samples:
            if page_key == "orders":
                sample_summary.append(f"{s.get('order_number')} ({s.get('customer_name')}, {s.get('status')}, {s.get('priority')} priority, ${s.get('amount')})")
            else:
                sample_summary.append(f"{s.get('name')} ({s.get('sku')}, {s.get('category')}, {s.get('condition')}, ${s.get('price')})")

        tool_output = {
            "status": "success",
            "page": page_key,
            "total_matching": total,
            "filters_applied": filters_for_ui,
            "samples": sample_summary,
            "summary": f"Found {total} matching {page_info.get('noun', 'records')}." + (f" Examples: {', '.join(sample_summary)}" if sample_summary else "")
        }

        ui_action = {
            "type": "search",
            "target": page_key,
            "filters": filters_for_ui,
            "total": total
        }
        return tool_output, ui_action

    elif func_name == "navigate_to_page":
        target = str(args.get("page", "orders")).lower()
        page_info = get_page_by_key(target) or pages[0]
        target = page_info["key"]
        title = page_info["title"]
        tool_output = {
            "status": "success",
            "navigated_to": target,
            "message": f"Successfully navigated to {title}."
        }
        ui_action = {
            "type": "navigate",
            "target": target
        }
        return tool_output, ui_action

    elif func_name == "reset_filters":
        target = str(args.get("page", current_page)).lower()
        page_info = get_page_by_key(target) or pages[0]
        target = page_info["key"]
        title = page_info["title"]
        tool_output = {
            "status": "success",
            "message": f"Cleared all filters on {title}."
        }
        ui_action = {
            "type": "search",
            "target": target,
            "reset": True
        }
        return tool_output, ui_action

    elif func_name == "read_row":
        target = str(args.get("page", current_page)).lower()
        idx = int(args.get("index", 0))
        page_info = get_page_by_key(target) or pages[0]
        target = page_info["key"]
        collection_name = page_info.get("collection", target)
        sort_field = "order_date" if target == "orders" else "added_date"
        cursor = db[collection_name].find({}, {"_id": 0}).sort(sort_field, -1).skip(max(0, idx)).limit(1)
        docs = await cursor.to_list(1)
        if docs:
            rec = docs[0]
            desc = f"{page_info['title']} record: " + ", ".join(f"{k}: {v}" for k, v in rec.items())
            tool_output = {"status": "success", "row_index": idx, "row_data": rec, "summary": desc}
        else:
            tool_output = {"status": "empty", "summary": f"No records found at index {idx}."}

        ui_action = {
            "type": "read",
            "target": target,
            "index": idx
        }
        return tool_output, ui_action

    return {"status": "error", "message": f"Unknown tool {func_name}"}, {"type": "chat", "message": f"Unknown action."}
