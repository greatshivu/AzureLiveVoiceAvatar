"""Tests for pages_config.json, /api/pages, /api/command/execute, and execute_agent_tool."""
import asyncio
from fastapi.testclient import TestClient
from server import app, db, search_orders, search_items
from pages_config import get_pages_config, parse_command_internal, execute_agent_tool

client = TestClient(app)

def test_get_pages_config_from_json():
    response = client.get("/api/pages")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    keys = {p["key"]: p for p in data}
    assert "orders" in keys
    assert "items" in keys
    
    orders = keys["orders"]
    assert orders["title"] == "Order Search"
    assert orders["route"] == "/orders"
    assert orders["endpoint"] == "/orders/search"
    
    # Check priority radio control exists
    priority_ctrl = next((c for c in orders["controls"] if c["id"] == "priority"), None)
    assert priority_ctrl is not None
    assert priority_ctrl["type"] == "radio"
    assert any(opt["value"] == "Low" for opt in priority_ctrl["options"])
    assert any(opt["value"] == "Medium" for opt in priority_ctrl["options"])

def test_execute_internal_command_low_priority():
    # User requirement: "filter by low priority"
    response = client.post("/api/command/execute", json={
        "text": "filter by low priority",
        "current_page": "orders"
    })
    assert response.status_code == 200
    action = response.json()
    assert action.get("type") == "search"
    assert action.get("target") == "orders"
    assert action.get("filters", {}).get("priority") == "Low"

def test_execute_internal_command_medium_priority_radio():
    response = client.post("/api/command/execute", json={
        "text": "Get medium priority order",
        "current_page": "orders"
    })
    assert response.status_code == 200
    action = response.json()
    assert action.get("type") == "search"
    assert action.get("target") == "orders"
    assert action.get("filters", {}).get("priority") == "Medium"

def test_execute_internal_command_keywords():
    # User requirement: "2) KEYWORD Filter not working with voice command"
    kw_tests = [
        ("filter by keyword ORD-100", "orders", "ORD-100"),
        ("keyword ORD-100", "orders", "ORD-100"),
        ("keyword ORD 100", "orders", "ORD-100"),
        ("order 100", "orders", "ORD-100"),
        ("keyword laptop", "items", "laptop"),
        ("filter keyword laptop", "items", "laptop"),
        ("search keyword laptop", "items", "laptop"),
        ("keyword: laptop", "items", "laptop"),
        ("search for laptop", "items", "laptop"),
        ("search for customer Alice", "orders", "Alice"),
        ("keyword Alice", "orders", "Alice"),
        ("keyword SKU 2001", "items", "SKU-2001"),
        ("keyword Smith", "orders", "Smith"),
    ]
    for text, page, expected_q in kw_tests:
        res = client.post("/api/command/execute", json={"text": text, "current_page": page})
        assert res.status_code == 200, f"Failed on {text}"
        action = res.json()
        assert action.get("type") == "search", f"Failed on {text}: {action}"
        actual_q = action.get("filters", {}).get("q")
        assert actual_q == expected_q, f"Failed on '{text}': expected q='{expected_q}', got '{actual_q}'"

def test_execute_internal_command_navigation():
    response = client.post("/api/command/execute", json={
        "text": "Go to items",
        "current_page": "orders"
    })
    assert response.status_code == 200
    action = response.json()
    assert action.get("type") == "navigate"
    assert action.get("target") == "items"

def test_execute_internal_command_reset():
    response = client.post("/api/command/execute", json={
        "text": "reset all filters",
        "current_page": "orders"
    })
    assert response.status_code == 200
    action = response.json()
    assert action.get("type") == "search"
    assert action.get("reset") is True

async def _run_async_agent_tests():
    # 1. Search low priority orders
    tool_output, ui_action = await execute_agent_tool(
        func_name="search_orders",
        args={"priority": "Low"},
        db=db,
        current_page="orders"
    )
    assert "Low" in str(tool_output) or "orders" in tool_output.get("summary", "").lower()
    assert ui_action["type"] == "search"
    assert ui_action["target"] == "orders"
    assert ui_action["filters"] == {"priority": "Low"}
    assert ui_action["total"] > 0

    # 2. Search items by keyword
    tool_output2, ui_action2 = await execute_agent_tool(
        func_name="search_items",
        args={"q": "laptop"},
        db=db,
        current_page="items"
    )
    assert "laptop" in str(tool_output2).lower() or "items" in tool_output2.get("summary", "").lower()
    assert ui_action2["type"] == "search"
    assert ui_action2["target"] == "items"
    assert ui_action2["filters"] == {"q": "laptop"}

    # 3. Navigation
    tool_output3, ui_action3 = await execute_agent_tool(
        func_name="navigate_to_page",
        args={"page": "items"},
        db=db,
        current_page="orders"
    )
    assert "items" in str(tool_output3).lower()
    assert ui_action3["type"] == "navigate"
    assert ui_action3["target"] == "items"

    # 4. Search orders with comma-separated priority
    res_p = await search_orders(priority="High,Medium", page_size=20)
    assert len(res_p["results"]) > 0
    assert all(r["priority"] in ("High", "Medium") for r in res_p["results"])

    # 5. Search orders with paid_status
    res_paid = await search_orders(paid_status="paid", page_size=20)
    assert len(res_paid["results"]) > 0
    assert all(r["is_paid"] is True for r in res_paid["results"])

    res_unpaid = await search_orders(paid_status="unpaid", page_size=20)
    assert len(res_unpaid["results"]) > 0
    assert all(r["is_paid"] is False for r in res_unpaid["results"])

    # 6. Search orders with keyword and search aliases
    res_search = await search_orders(search="ORD-100001")
    assert res_search["total"] >= 1
    assert res_search["results"][0]["order_number"] == "ORD-100001"

    res_kw = await search_orders(keyword="ORD-100001")
    assert res_kw["total"] >= 1

    # 7. Search items with keyword and in_stock
    res_items = await search_items(keyword="SKU-200001")
    assert res_items["total"] >= 1

    # 8. Test execute_agent_tool with active_filters merging
    tool_out, action = await execute_agent_tool(
        func_name="search_orders",
        args={"priority": "High"},
        db=db,
        current_page="orders",
        active_filters={"status": "Shipped", "paid_status": "paid"}
    )
    assert action["type"] == "search"
    assert action["filters"]["status"] == "Shipped"
    assert action["filters"]["priority"] == "High"
    assert action["filters"]["paid_status"] == "paid"
    # Total matching should be constrained by all active filters
    assert "Shipped" in str(tool_out) or tool_out["total_matching"] <= 1000

    # 9. Test execute_agent_tool with multi-priority comma split
    tool_out_prio, action_prio = await execute_agent_tool(
        func_name="search_orders",
        args={"priority": "High,Medium"},
        db=db,
        current_page="orders"
    )
    assert action_prio["filters"]["priority"] == "High,Medium"
    assert tool_out_prio["total_matching"] > 0


def test_execute_agent_tools_all():
    asyncio.run(_run_async_agent_tests())
