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
_CONFIG_CACHE: Dict[str, List[Dict[str, Any]]] = {}

def resolve_config_path(app_code: Optional[str] = None) -> Path:
    """Resolve config path based on app_code or environment variable."""
    base_dir = Path(__file__).parent
    if app_code:
        clean = app_code.strip().lower()
        candidate = base_dir / f"{clean}_pages_config.json"
        if candidate.exists():
            return candidate
    env_path = os.environ.get("PAGES_CONFIG_PATH")
    if env_path:
        return Path(env_path)
    return CONFIG_FILE

def load_pages_config(app_code: Optional[str] = None) -> List[Dict[str, Any]]:
    """Load pages and filter configuration from JSON file for the given app_code."""
    cache_key = (app_code or "").strip().lower() or "default"
    path = resolve_config_path(app_code)
    try:
        with open(path, "r", encoding="utf-8") as f:
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

# Dynamic initialization (default)
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
    cfg = get_pages_config(app_code)
    return next((p for p in cfg if p["key"] == key), None) or (PAGES_BY_KEY.get(key) if not app_code else None)


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

def detect_target_page(text: str, current_key: Optional[str] = None, app_code: Optional[str] = None) -> str:
    t = text.lower()
    pages = get_pages_config(app_code)
    default_key = pages[0]["key"] if pages else (current_key or "orders")
    best_key = current_key or default_key
    best_score = 0
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
                if c_id == "paid_only":
                    filters["paid_status"] = "paid"
            elif off_match and not on_match:
                filters[c_id] = False
                if c_id == "paid_only":
                    filters["paid_status"] = "unpaid"

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

def parse_command_internal(raw_text: str, current_page: Optional[str] = None, app_code: Optional[str] = None) -> Dict[str, Any]:
    """
    Internal function running in API application to parse user commands
    against the Pages and filter configuration for a specific app.
    """
    pages = get_pages_config(app_code)
    current_page = current_page or (pages[0]["key"] if pages else "orders")
    t = (raw_text or "").strip().rstrip(".?!,")
    if not t:
        return {"type": "chat", "message": "Please say or type a command."}

    target = detect_target_page(t, current_page, app_code)

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
        page_info = get_page_by_key(current_page, app_code) or {}
        return {"type": "search", "target": current_page, "reset": True, "message": f"Cleared all filters on {page_info.get('title', current_page)}."}

    page = get_page_by_key(target, app_code) or (pages[0] if pages else {})
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
async def execute_agent_tool(
    func_name: str,
    args: Dict[str, Any],
    db: Any,
    current_page: str = "orders",
    active_filters: Optional[Dict[str, Any]] = None,
    app_code: Optional[str] = None
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Executes a function call requested by the Foundry Agent.
    Uses the JSON configuration (PAGES_CONFIG) and input from the agent,
    merging with current on-screen active_filters if provided.
    Returns:
        (tool_output_for_agent, ui_action_for_browser)
    """
    func_name = (func_name or "").lower().strip()
    # 1. Identify which config file to read based on app_code or args
    app_key = args.get("app") or args.get("app_code") or app_code
    config_path = resolve_config_path(app_key)
    pages = get_pages_config(app_key)
    logger.info("execute_agent_tool: reading config '%s' for app='%s' (tool=%s)", config_path.name, app_key, func_name)
    default_page = pages[0]["key"] if pages else "orders"

    if func_name.startswith("search") or func_name.startswith("filter") or func_name in ("query", "apply_filters", "get_orders", "get_records", "find"):
        # Identify page from args or func_name
        target_hint = str(args.get("page") or args.get("target") or args.get("module") or "").lower().strip()
        matched_page = None
        if target_hint:
            matched_page = get_page_by_key(target_hint, app_key)
            if not matched_page:
                for p in pages:
                    if target_hint in p.get("aliases", []) or target_hint == p.get("noun"):
                        matched_page = p
                        break
        if not matched_page:
            for p in pages:
                if p["key"] in func_name or (p.get("noun") and p["noun"] in func_name) or any(a in func_name for a in p.get("aliases", [])):
                    matched_page = p
                    break
        page_key = (matched_page["key"] if matched_page else None) or current_page or default_page
        page_info = get_page_by_key(page_key, app_key) or pages[0]
        page_key = page_info["key"]

        # Merge active filters from UI with the new agent arguments
        combined_args = dict(active_filters or {})
        combined_args.update(args or {})

        query = {}
        filters_for_ui = {}

        # Dynamically map controls from identified config
        for ctrl in page_info.get("controls", []):
            c_type = ctrl.get("type")
            c_id = ctrl.get("id")
            c_param = ctrl.get("param", c_id)
            c_field = ctrl.get("field", c_param)

            if c_type in ("select", "radio"):
                val = combined_args.get(c_param) or combined_args.get(c_id)
                if val:
                    val_str = str(val).strip()
                    parts = [p.strip() for p in val_str.split(",") if p.strip()]
                    if len(parts) > 1:
                        canonical_parts = []
                        for part in parts:
                            matched_opt = None
                            for opt in ctrl.get("options", []):
                                if opt["value"].lower() == part.lower() or any(w.lower() == part.lower() for w in opt.get("synonyms", [])):
                                    matched_opt = opt["value"]
                                    break
                            canonical_parts.append(matched_opt or part.capitalize())
                        query[c_field] = {"$in": canonical_parts}
                        filters_for_ui[c_id] = ",".join(canonical_parts)
                    else:
                        matched_opt = None
                        for opt in ctrl.get("options", []):
                            if opt["value"].lower() == val_str.lower() or any(w.lower() == val_str.lower() for w in opt.get("synonyms", [])):
                                matched_opt = opt["value"]
                                break
                        canonical_val = matched_opt or val_str.capitalize()
                        if canonical_val.lower() != "all":
                            query[c_field] = canonical_val
                            filters_for_ui[c_id] = canonical_val

            elif c_type == "checkbox":
                val = combined_args.get(c_param) if c_param in combined_args else combined_args.get(c_id)
                if val is not None:
                    if str(val).lower() in ("true", "1", "yes", "paid"):
                        query[c_field] = True
                        filters_for_ui[c_id] = True
                    elif str(val).lower() in ("false", "0", "no", "unpaid"):
                        if c_field == "is_paid":
                            query[c_field] = False
                            filters_for_ui[c_id] = False

            elif c_type == "text":
                val = combined_args.get(c_param) or combined_args.get(c_id) or combined_args.get("keyword") or combined_args.get("search")
                if val:
                    q_str = str(val).strip()
                    if q_str:
                        id_regex = ctrl.get("idRegex")
                        id_prefix = ctrl.get("idPrefix", "")
                        if id_regex:
                            m = re.search(id_regex, q_str, re.IGNORECASE)
                            if m:
                                num = next((g for g in m.groups() if g is not None), None)
                                if num:
                                    q_str = f"{id_prefix}{num}"

                        search_fields = ctrl.get("searchFields", [c_field])
                        esc_q = re.escape(q_str)
                        if search_fields:
                            query["$or"] = [{f: {"$regex": esc_q, "$options": "i"}} for f in search_fields]
                        else:
                            query[c_field] = {"$regex": esc_q, "$options": "i"}
                        filters_for_ui[c_id] = q_str

            elif c_type == "daterange":
                d_from = combined_args.get(ctrl.get("paramFrom", "date_from"))
                d_to = combined_args.get(ctrl.get("paramTo", "date_to"))
                date_cond = {}
                if d_from:
                    date_cond["$gte"] = str(d_from)
                if d_to:
                    d_to_str = str(d_to)
                    date_cond["$lte"] = d_to_str + "T23:59:59.999999+00:00" if len(d_to_str) == 10 else d_to_str
                if date_cond:
                    query[c_field] = date_cond
                    filters_for_ui[c_id] = {"from": d_from, "to": d_to}

        # Explicit support for paid_status if passed in args or active_filters
        if "paid_status" in combined_args:
            ps = str(combined_args["paid_status"]).lower()
            if ps == "paid":
                query["is_paid"] = True
                filters_for_ui["paid_only"] = True
                filters_for_ui["paid_status"] = "paid"
            elif ps == "unpaid":
                query["is_paid"] = False
                filters_for_ui["paid_only"] = False
                filters_for_ui["paid_status"] = "unpaid"
            elif ps == "all":
                query.pop("is_paid", None)
                filters_for_ui["paid_status"] = "all"

        # Query collection if database is available
        total = 0
        samples = []
        sample_summary = []
        try:
            if db is not None:
                collection_name = page_info.get("collection", page_key)
                coll = db[collection_name]
                total = await coll.count_documents(query)
                sort_field = "order_date" if page_key == "orders" else "added_date"
                sample_cursor = coll.find(query, {"_id": 0}).sort(sort_field, -1).limit(3)
                samples = await sample_cursor.to_list(3)
                for s in samples:
                    if page_key == "orders":
                        sample_summary.append(f"{s.get('order_number')} ({s.get('customer_name')}, {s.get('status')}, {s.get('priority')} priority, ${s.get('amount')})")
                    else:
                        sample_summary.append(f"{s.get('name')} ({s.get('sku')}, {s.get('category')}, {s.get('condition')}, ${s.get('price')})")
        except Exception as e:
            logger.info("execute_agent_tool DB count skipped: %s", e)

        if total > 0:
            summary = f"Found {total} matching {page_info.get('noun', 'records')} on {page_info['title']}." + (f" Examples: {', '.join(sample_summary)}" if sample_summary else "")
        else:
            filter_summary = ", ".join(f"{k}: {v}" for k, v in filters_for_ui.items()) if filters_for_ui else "all"
            summary = f"Filtered {page_info['title']} by {filter_summary}." if filters_for_ui else f"Displaying {page_info['title']}."

        tool_output = {
            "status": "success",
            "page": page_key,
            "route": page_info.get("route"),
            "total_matching": total,
            "filters_applied": filters_for_ui,
            "samples": sample_summary,
            "summary": summary
        }

        ui_action = {
            "type": "search",
            "target": page_key,
            "route": page_info.get("route"),
            "filters": filters_for_ui,
            "total": total
        }
        return tool_output, ui_action

    elif func_name in ("navigate_to_page", "navigate", "go_to_page", "open_page", "open"):
        target_hint = str(args.get("page") or args.get("target") or args.get("module") or default_page).lower().strip()
        matched = None
        for p in pages:
            if p["key"] == target_hint or target_hint in p.get("aliases", []) or p.get("noun") == target_hint:
                matched = p
                break
        page_info = matched or get_page_by_key(target_hint, app_key) or pages[0]
        target = page_info["key"]
        title = page_info["title"]
        tool_output = {
            "status": "success",
            "navigated_to": target,
            "route": page_info.get("route"),
            "message": f"Successfully navigated to {title}."
        }
        ui_action = {
            "type": "navigate",
            "target": target,
            "route": page_info.get("route")
        }
        return tool_output, ui_action

    elif func_name in ("reset_filters", "clear_filters"):
        target_hint = str(args.get("page") or current_page).lower().strip()
        page_info = get_page_by_key(target_hint, app_key) or pages[0]
        target = page_info["key"]
        title = page_info["title"]
        tool_output = {
            "status": "success",
            "message": f"Cleared all filters on {title}."
        }
        ui_action = {
            "type": "search",
            "target": target,
            "route": page_info.get("route"),
            "reset": True
        }
        return tool_output, ui_action

    elif func_name == "read_row":
        target = str(args.get("page", current_page)).lower()
        idx = int(args.get("index", 0))
        page_info = get_page_by_key(target, app_key) or pages[0]
        target = page_info["key"]
        collection_name = page_info.get("collection", target)
        sort_field = "order_date" if target == "orders" else "followDate" if target == "quotes" else "added_date"
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
