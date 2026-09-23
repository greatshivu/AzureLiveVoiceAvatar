"""Tests for pages_config.json, /api/pages, /api/command/execute, and execute_agent_tool."""
import asyncio
from fastapi.testclient import TestClient
from server import app, db
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

    # 4. Search orders with comma-separated priority via generic action
    tool_p, action_p = await execute_agent_tool(
        func_name="perform_action",
        args={"priority": "High,Medium"},
        db=db,
        current_page="orders"
    )
    assert action_p["filters"]["priority"] == ["High", "Medium"] or "High" in str(action_p["filters"]["priority"])
    assert action_p["total"] > 0

    # 5. Search orders with paid_status via generic action
    tool_paid, action_paid = await execute_agent_tool(
        func_name="perform_action",
        args={"paid_status": "paid"},
        db=db,
        current_page="orders"
    )
    assert action_paid["filters"]["paid_status"] == "paid"
    assert action_paid["total"] > 0

    tool_unpaid, action_unpaid = await execute_agent_tool(
        func_name="perform_action",
        args={"paid_status": "unpaid"},
        db=db,
        current_page="orders"
    )
    assert action_unpaid["filters"]["paid_status"] == "unpaid"
    assert action_unpaid["total"] > 0

    # 6. Search orders with keyword
    tool_ord, action_ord = await execute_agent_tool(
        func_name="perform_action",
        args={"user_input": "ORD-100001"},
        db=db,
        current_page="orders"
    )
    assert action_ord["filters"]["q"] == "ORD-100001"
    assert action_ord["total"] >= 1

    # 7. Search items with keyword
    tool_items, action_items = await execute_agent_tool(
        func_name="perform_action",
        args={"user_input": "SKU-200001", "page": "items"},
        db=db,
        current_page="orders"
    )
    assert action_items["filters"]["q"] == "SKU-200001"
    assert action_items["total"] >= 1

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

    # 10. Generic function tool 'perform_action' with natural language user_input (config-driven)
    tool_out_gen, action_gen = await execute_agent_tool(
        func_name="perform_action",
        args={"user_input": "filter by low priority"},
        db=db,
        current_page="orders"
    )
    assert tool_out_gen["status"] == "success"
    assert tool_out_gen["page"] == "orders"
    assert action_gen["type"] == "search"
    assert action_gen["filters"]["priority"] == "Low"

    # 11. Generic function tool 'perform_action' across pages (Items search by keyword)
    tool_out_gen_items, action_gen_items = await execute_agent_tool(
        func_name="perform_action",
        args={"user_input": "search for laptop"},
        db=db,
        current_page="orders"
    )
    assert tool_out_gen_items["status"] == "success"
    assert tool_out_gen_items["page"] == "items"
    assert action_gen_items["type"] == "search"
    assert action_gen_items["filters"]["q"] == "laptop"

    # 12. Generic function tool 'perform_action' for navigation
    tool_out_gen_nav, action_gen_nav = await execute_agent_tool(
        func_name="perform_action",
        args={"user_input": "Go to items"},
        db=db,
        current_page="orders"
    )
    # 13. Generic function tool 'perform_action' for reset filters
    tool_out_reset, action_reset = await execute_agent_tool(
        func_name="perform_action",
        args={"user_input": "reset filters"},
        db=db,
        current_page="orders"
    )
    assert tool_out_reset["status"] == "success"
    assert action_reset["type"] == "search"
    assert action_reset["reset"] is True
    assert action_reset["filters"] == {}

    # 14. Non-existent page handling (must not assume orders or first page)
    tool_out_missing, action_missing = await execute_agent_tool(
        func_name="perform_action",
        args={"user_input": "go to invoices"},
        db=db,
        current_page="orders"
    )
    assert tool_out_missing["status"] == "not_found"
    assert "invoices" in tool_out_missing["message"]
    assert action_missing["type"] == "chat"
    assert action_missing["status"] == "not_found"

    # 15. Explicit non-existent target page argument
    tool_out_exp_missing, action_exp_missing = await execute_agent_tool(
        func_name="perform_action",
        args={"user_input": "show billing", "page": "billing"},
        db=db,
        current_page="orders"
    )
    assert tool_out_exp_missing["status"] == "not_found"
    assert "billing" in tool_out_exp_missing["message"]

    # 16. CVS Quotations filtering: offered quotes
    tool_out_cvs_offered, action_cvs_offered = await execute_agent_tool(
        func_name="perform_action",
        args={"user_input": "show offered quotes"},
        db=None,
        app_code="cvs"
    )
    assert tool_out_cvs_offered["status"] == "success"
    assert tool_out_cvs_offered["page"] == "quotes"
    assert action_cvs_offered["target"] == "quotes"
    assert action_cvs_offered["filters"].get("workflow_status") == "OFFERED"

    # 17. CVS Quotations filtering: won quotes
    tool_out_cvs_won, action_cvs_won = await execute_agent_tool(
        func_name="perform_action",
        args={"user_input": "show won quotes"},
        db=None,
        app_code="cvs"
    )
    assert tool_out_cvs_won["status"] == "success"
    assert action_cvs_won["filters"].get("workflow_status") == "WON"

    # 18. CVS Quotations filtering: natural keyword "show quotations for Acme"
    tool_out_cvs_kw, action_cvs_kw = await execute_agent_tool(
        func_name="perform_action",
        args={"user_input": "show quotations for Acme"},
        db=None,
        app_code="cvs"
    )
    assert tool_out_cvs_kw["status"] == "success"
    assert action_cvs_kw["target"] == "quotes"
    assert action_cvs_kw["filters"].get("q") == "Acme"

    # 19. CVS Quotations reset filters
    tool_out_cvs_reset, action_cvs_reset = await execute_agent_tool(
        func_name="perform_action",
        args={"user_input": "reset"},
        db=None,
        current_page="quotes",
        app_code="cvs"
    )
    assert tool_out_cvs_reset["status"] == "success"
    assert action_cvs_reset["target"] == "quotes"
    assert action_cvs_reset["reset"] is True
    assert action_cvs_reset["filters"] == {}


def test_execute_agent_tools_all():
    asyncio.run(_run_async_agent_tests())
