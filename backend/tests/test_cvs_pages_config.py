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


def test_cvs_agent_tool_dynamic_config_resolution():
    """Verify tool dynamically identifies config and resolves schema at tool call time."""
    asyncio.run(_run_cvs_agent_tests())


