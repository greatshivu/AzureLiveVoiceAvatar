"""Tests for CVS multi-app pages configuration (cvs_pages_config.json)."""
import asyncio
import pytest
from fastapi.testclient import TestClient
from server import app
from pages_config import get_pages_config, parse_command_internal, execute_agent_tool

client = TestClient(app)

def test_get_cvs_pages_config():
    """Verify GET /api/pages?app=cvs loads all 10 CVS pages with rich metadata."""
    response = client.get("/api/pages?app=cvs")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 10

    pages_by_key = {p["key"]: p for p in data}
    expected_keys = [
        "orders",
        "quotes",
        "shipments",
        "incidents",
        "customers",
        "activities",
        "products",
        "yard",
        "dashboard",
        "users",
    ]
    for key in expected_keys:
        assert key in pages_by_key, f"Expected page '{key}' in cvs_pages_config.json"

    # 1. Forwarding Orders validation
    orders = pages_by_key["orders"]
    assert orders["title"] == "Forwarding Orders"
    assert orders["route"] == "/forwarding/orders"
    order_ctrl_ids = {c["id"]: c for c in orders["controls"]}
    assert "q" in order_ctrl_ids
    assert "transport_mode" in order_ctrl_ids
    assert "order_status" in order_ctrl_ids
    assert "priority" in order_ctrl_ids
    assert "commercial_invoices_only" in order_ctrl_ids
    assert "range" in order_ctrl_ids

    # 2. Quotations & Pricing validation
    quotes = pages_by_key["quotes"]
    assert quotes["title"] == "Quotations & Pricing"
    assert quotes["route"] == "/quotation/quote"
    quote_ctrl_ids = {c["id"]: c for c in quotes["controls"]}
    assert "q" in quote_ctrl_ids
    assert "workflow_status" in quote_ctrl_ids
    assert "transport_mode" in quote_ctrl_ids
    assert "assigned_to" in quote_ctrl_ids
    assert "is_warehouse_quote" in quote_ctrl_ids
    assert "range" in quote_ctrl_ids


def test_cvs_orders_command_parsing():
    """Test voice command parsing for CVS Forwarding Orders."""
    # Status filter
    res = client.post("/api/command/execute", json={
        "text": "Show in-transit orders",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res.status_code == 200
    action = res.json()
    assert action["type"] == "search"
    assert action["target"] == "orders"
    assert action["filters"].get("order_status") == "In Transit"

    # Transport mode filter
    res_sea = client.post("/api/command/execute", json={
        "text": "Ocean freight orders",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res_sea.status_code == 200
    action_sea = res_sea.json()
    assert action_sea["filters"].get("transport_mode") == "Sea"

    # High priority filter
    res_prio = client.post("/api/command/execute", json={
        "text": "filter by high priority orders",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res_prio.status_code == 200
    action_prio = res_prio.json()
    assert action_prio["filters"].get("priority") == "High"

    # Keyword ID regex filter
    res_kw = client.post("/api/command/execute", json={
        "text": "keyword ORD-5542",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res_kw.status_code == 200
    action_kw = res_kw.json()
    assert action_kw["filters"].get("q") == "ORD-5542"

    # Commercial invoice checkbox filter
    res_inv = client.post("/api/command/execute", json={
        "text": "orders with commercial invoices",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res_inv.status_code == 200
    action_inv = res_inv.json()
    assert action_inv["filters"].get("commercial_invoices_only") is True


def test_cvs_quotes_command_parsing():
    """Test voice command parsing for CVS Quotations & Pricing."""
    # Navigation to quotes
    res_nav = client.post("/api/command/execute", json={
        "text": "navigate to quotations",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res_nav.status_code == 200
    action_nav = res_nav.json()
    assert action_nav["type"] == "navigate"
    assert action_nav["target"] == "quotes"

    # Won quotes
    res_won = client.post("/api/command/execute", json={
        "text": "show won quotes",
        "current_page": "quotes",
        "app": "cvs"
    })
    assert res_won.status_code == 200
    action_won = res_won.json()
    assert action_won["type"] == "search"
    assert action_won["target"] == "quotes"
    assert action_won["filters"].get("workflow_status") == "WON"

    # Offered quotes
    res_off = client.post("/api/command/execute", json={
        "text": "show offered quotes",
        "current_page": "quotes",
        "app": "cvs"
    })
    assert res_off.status_code == 200
    action_off = res_off.json()
    assert action_off["filters"].get("workflow_status") == "OFFERED"

    # Quotes due today
    res_due = client.post("/api/command/execute", json={
        "text": "quotes due today",
        "current_page": "quotes",
        "app": "cvs"
    })
    assert res_due.status_code == 200
    action_due = res_due.json()
    assert action_due["filters"].get("workflow_status") == "DUETODAY"

    # Air freight quotes
    res_air = client.post("/api/command/execute", json={
        "text": "show air freight quotes",
        "current_page": "quotes",
        "app": "cvs"
    })
    assert res_air.status_code == 200
    action_air = res_air.json()
    assert action_air["filters"].get("transport_mode") == "Air"

    # Warehouse quote checkbox
    res_wh = client.post("/api/command/execute", json={
        "text": "warehouse quotes only",
        "current_page": "quotes",
        "app": "cvs"
    })
    assert res_wh.status_code == 200
    action_wh = res_wh.json()
    assert action_wh["filters"].get("is_warehouse_quote") is True


def test_cvs_other_modules_command_parsing():
    """Test command parsing across other CVS pages like incidents, shipments, customers."""
    # Incidents
    res_inc = client.post("/api/command/execute", json={
        "text": "show open incidents",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res_inc.status_code == 200
    action_inc = res_inc.json()
    assert action_inc["target"] == "incidents"
    assert action_inc["filters"].get("status") == "Open"

    # Shipments
    res_shp = client.post("/api/command/execute", json={
        "text": "find container MSKU1234567",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res_shp.status_code == 200
    action_shp = res_shp.json()
    assert action_shp["target"] == "shipments"


def test_default_app_backwards_compatibility():
    """Verify that requests without 'app' parameter continue to return standard default config."""
    res = client.get("/api/pages")
    assert res.status_code == 200
    data = res.json()
    keys = {p["key"] for p in data}
    assert "orders" in keys
    assert "items" in keys
    assert len(data) == 2


def test_config_endpoint():
    """Verify /api/config returns clean configuration."""
    res_cfg = client.get("/api/config")
    assert res_cfg.status_code == 200
    cfg = res_cfg.json()
    assert "voicelive_configured" in cfg
    assert "avatar_character" in cfg
    assert "avatar_style" in cfg


async def _run_cvs_agent_tests():
    # 1. Tool call on Forwarding Orders with CVS app_code
    tool_out, action = await execute_agent_tool(
        func_name="search_orders",
        args={"order_status": "In Transit", "transport_mode": "Sea"},
        db=None,
        current_page="orders",
        app_code="cvs"
    )
    assert tool_out["status"] == "success"
    assert tool_out["page"] == "orders"
    assert tool_out["route"] == "/forwarding/orders"
    assert action["type"] == "search"
    assert action["target"] == "orders"
    assert action["route"] == "/forwarding/orders"
    assert action["filters"]["order_status"] == "In Transit"
    assert action["filters"]["transport_mode"] == "Sea"

    # 2. Tool call on Quotations & Pricing with CVS app_code
    tool_out_q, action_q = await execute_agent_tool(
        func_name="search_quotes",
        args={"workflow_status": "Won", "is_warehouse_quote": True},
        db=None,
        current_page="quotes",
        app_code="cvs"
    )
    assert tool_out_q["status"] == "success"
    assert tool_out_q["page"] == "quotes"
    assert tool_out_q["route"] == "/quotation/quote"
    assert action_q["target"] == "quotes"
    assert action_q["filters"]["workflow_status"] == "WON"
    assert action_q["filters"]["is_warehouse_quote"] is True

    # 3. Tool call navigation with CVS app_code
    tool_out_nav, action_nav = await execute_agent_tool(
        func_name="navigate_to_page",
        args={"page": "quotations"},
        db=None,
        app_code="cvs"
    )
    assert tool_out_nav["status"] == "success"
    assert tool_out_nav["navigated_to"] == "quotes"
    assert action_nav["route"] == "/quotation/quote"

    # 4. Tool call without app_code (default enterprise app)
    tool_out_def, action_def = await execute_agent_tool(
        func_name="search_orders",
        args={"priority": "High"},
        db=None,
        current_page="orders"
    )
    assert tool_out_def["status"] == "success"
    assert tool_out_def["page"] == "orders"
    assert tool_out_def["route"] == "/orders"
    assert action_def["filters"]["priority"] == "High"

    # 5. Generic function tool 'perform_action' with natural language user_input for CVS
    tool_out_gen, action_gen = await execute_agent_tool(
        func_name="perform_action",
        args={"user_input": "Show in-transit ocean freight orders"},
        db=None,
        current_page="orders",
        app_code="cvs"
    )
    assert tool_out_gen["status"] == "success"
    assert tool_out_gen["page"] == "orders"
    assert tool_out_gen["route"] == "/forwarding/orders"
    assert action_gen["filters"]["order_status"] == "In Transit"
    assert action_gen["filters"]["transport_mode"] == "Sea"

    # 6. Generic function tool 'perform_action' with navigation user_input
    tool_out_gen_nav, action_gen_nav = await execute_agent_tool(
        func_name="perform_action",
        args={"user_input": "navigate to quotations"},
        db=None,
        app_code="cvs"
    )
    assert tool_out_gen_nav["status"] == "success"
    assert tool_out_gen_nav["navigated_to"] == "quotes"
    assert action_gen_nav["type"] == "navigate"
    assert action_gen_nav["route"] == "/quotation/quote"


def test_cvs_agent_tool_dynamic_config_resolution():
    """Verify tool dynamically identifies config and resolves schema at tool call time."""
    asyncio.run(_run_cvs_agent_tests())


def test_cvs_pagination_commands():
    """Test voice commands and parsing for CVS pagination."""
    # Next page
    res_next = client.post("/api/command/execute", json={
        "text": "next page",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res_next.status_code == 200
    act_next = res_next.json()
    assert act_next["type"] == "search"
    assert act_next["target"] == "orders"
    assert act_next["page"] == "next"

    # Previous page
    res_prev = client.post("/api/command/execute", json={
        "text": "previous page",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res_prev.status_code == 200
    assert res_prev.json()["page"] == "prev"

    # Specific page number
    res_p3 = client.post("/api/command/execute", json={
        "text": "go to page 3",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res_p3.status_code == 200
    assert res_p3.json()["page"] == 3

    # First page
    res_first = client.post("/api/command/execute", json={
        "text": "first page",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res_first.status_code == 200
    assert res_first.json()["page"] == 1

    # Last page
    res_last = client.post("/api/command/execute", json={
        "text": "last page",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res_last.status_code == 200
    assert res_last.json()["page"] == "last"


def test_cvs_sorting_commands():
    """Test voice commands and parsing for CVS table column sorting."""
    # Sort by column ascending
    res_sort = client.post("/api/command/execute", json={
        "text": "sort by load port",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res_sort.status_code == 200
    act_sort = res_sort.json()
    assert act_sort["type"] == "search"
    assert act_sort.get("sort") is not None
    assert act_sort["sort"]["field"] == "loadPort"
    assert act_sort["sort"]["direction"] == "asc"

    # Sort by column descending
    res_eta = client.post("/api/command/execute", json={
        "text": "sort by ETA descending",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res_eta.status_code == 200
    act_eta = res_eta.json()
    assert act_eta["sort"]["field"] == "eta"
    assert act_eta["sort"]["direction"] == "desc"

    # Sort by supplier asc
    res_supp = client.post("/api/command/execute", json={
        "text": "order by supplier asc",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res_supp.status_code == 200
    act_supp = res_supp.json()
    assert act_supp["sort"]["field"] == "supplier"
    assert act_supp["sort"]["direction"] == "asc"


def test_cvs_column_filter_textbox_fallback():
    """
    Test CVS grid column filtering via common search text box 'q':
    When a column filter is requested that is not a standard control,
    it must be mapped to filters['q'] = value (strictly CVS only).
    """
    # 1. Natural language: "orders from Shanghai" -> supplier / loadPort in 'q'
    res_sh = client.post("/api/command/execute", json={
        "text": "orders from Shanghai",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res_sh.status_code == 200
    act_sh = res_sh.json()
    assert act_sh["filters"].get("q") == "Shanghai"

    # 2. Natural language: "filter by supplier DHL" -> 'q' = 'DHL'
    res_dhl = client.post("/api/command/execute", json={
        "text": "filter by supplier DHL",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res_dhl.status_code == 200
    act_dhl = res_dhl.json()
    assert act_dhl["filters"].get("q") == "DHL"

    # 3. Natural language: "load port Singapore" -> 'q' = 'Singapore'
    res_lp = client.post("/api/command/execute", json={
        "text": "load port Singapore",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res_lp.status_code == 200
    assert res_lp.json()["filters"].get("q") == "Singapore"

    # 4. Standard controls are preserved and NOT routed into 'q'
    res_std = client.post("/api/command/execute", json={
        "text": "in-transit ocean freight orders",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res_std.status_code == 200
    act_std = res_std.json()
    assert act_std["filters"].get("order_status") == "In Transit"
    assert act_std["filters"].get("transport_mode") == "Sea"
    assert "q" not in act_std["filters"]


async def _run_cvs_agent_pagination_and_sort():
    # 1. Tool execution: explicit pagination action
    tool_out_p, action_p = await execute_agent_tool(
        func_name="perform_action",
        args={"user_input": "next page", "action": "paginate", "pagination": "next"},
        db=None,
        current_page="orders",
        app_code="cvs"
    )
    assert tool_out_p["status"] == "success"
    assert tool_out_p["pagination"] == "next"
    assert action_p["page"] == "next"

    # 2. Tool execution: page number
    tool_out_p4, action_p4 = await execute_agent_tool(
        func_name="paginate",
        args={"page_num": 4},
        db=None,
        current_page="orders",
        app_code="cvs"
    )
    assert tool_out_p4["status"] == "success"
    assert tool_out_p4["pagination"] == 4
    assert action_p4["page"] == 4

    # 3. Tool execution: sort tool
    tool_out_s, action_s = await execute_agent_tool(
        func_name="perform_action",
        args={"user_input": "sort by ETA descending", "action": "sort", "sort_by": "eta", "sort_order": "desc"},
        db=None,
        current_page="orders",
        app_code="cvs"
    )
    assert tool_out_s["status"] == "success"
    assert tool_out_s["sort"]["field"] == "eta"
    assert tool_out_s["sort"]["direction"] == "desc"
    assert action_s["sort"]["field"] == "eta"
    assert action_s["sort_order"] == "desc"

    # 4. Tool execution: CVS column filter fallback to 'q'
    tool_out_c, action_c = await execute_agent_tool(
        func_name="perform_action",
        args={"user_input": "filter by supplier Maersk", "supplier": "Maersk"},
        db=None,
        current_page="orders",
        app_code="cvs"
    )
    assert tool_out_c["status"] == "success"
    assert action_c["filters"].get("q") == "Maersk"


def test_cvs_agent_tool_pagination_and_sort():
    """Verify agent tools handle pagination, sorting, and textbox column fallback for CVS."""
    asyncio.run(_run_cvs_agent_pagination_and_sort())


def test_user_reported_issues():
    """Verify universal text box filter, clean navigation, clean sort, punctuation stripping, and pagination."""
    # 1. Clean Navigation - Do NOT filter while navigating!
    res_nav1 = client.post("/api/command/execute", json={
        "text": "navigate to Incident Management.",
        "app": "cvs"
    })
    assert res_nav1.status_code == 200
    act_nav1 = res_nav1.json()
    assert act_nav1["type"] == "navigate"
    assert act_nav1["target"] == "incidents"
    assert "filters" not in act_nav1 or act_nav1["filters"] == {}

    res_nav2 = client.post("/api/command/execute", json={
        "text": "Incident Management.",
        "app": "cvs"
    })
    assert res_nav2.status_code == 200
    act_nav2 = res_nav2.json()
    assert act_nav2["type"] == "navigate"
    assert act_nav2["target"] == "incidents"
    assert "filters" not in act_nav2 or act_nav2["filters"] == {}

    res_nav3 = client.post("/api/command/execute", json={
        "text": "Shipment Tracking.",
        "app": "cvs"
    })
    assert res_nav3.status_code == 200
    act_nav3 = res_nav3.json()
    assert act_nav3["type"] == "navigate"
    assert act_nav3["target"] == "shipments"
    assert "filters" not in act_nav3 or act_nav3["filters"] == {}

    # 2. Clean Sort - Do NOT filter while sorting!
    res_sort1 = client.post("/api/command/execute", json={
        "text": "sort by order status.",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res_sort1.status_code == 200
    act_sort1 = res_sort1.json()
    assert act_sort1["sort_by"] == "orderStatus" or act_sort1["sort"]["field"] == "orderStatus"
    assert act_sort1["filters"] == {}

    res_sort2 = client.post("/api/command/execute", json={
        "text": "sort.",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res_sort2.status_code == 200
    act_sort2 = res_sort2.json()
    assert "sort" in act_sort2 or "sort_by" in act_sort2
    assert act_sort2["filters"] == {}

    # 3. Clean Word Filtering (No Trailing Period '.')
    res_filt1 = client.post("/api/command/execute", json={
        "text": "filter by Shanghai.",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res_filt1.status_code == 200
    act_filt1 = res_filt1.json()
    assert act_filt1["filters"].get("q") == "Shanghai"

    # 4. Universal text box filter (applicable to ALL apps, not just CVS)
    res_univ = client.post("/api/command/execute", json={
        "text": "filter by customer Acme.",
        "current_page": "orders"
    })
    assert res_univ.status_code == 200
    act_univ = res_univ.json()
    assert act_univ["filters"].get("q") == "Acme"

    res_kw_dot = client.post("/api/command/execute", json={
        "text": "search laptop.",
        "current_page": "items"
    })
    assert res_kw_dot.status_code == 200
    act_kw_dot = res_kw_dot.json()
    assert act_kw_dot["filters"].get("q") == "laptop"

    # 5. Pagination detection
    for phrase, expected in [
        ("next page.", "next"),
        ("next.", "next"),
        ("previous page.", "prev"),
        ("page 2.", 2),
        ("page two.", 2),
        ("go to page 3.", 3),
    ]:
        res_pag = client.post("/api/command/execute", json={
            "text": phrase,
            "current_page": "orders",
            "app": "cvs"
        })
        assert res_pag.status_code == 200
        act_pag = res_pag.json()
        assert act_pag["page"] == expected, f"Failed for phrase: {phrase}"
        assert act_pag["pagination"] == expected




