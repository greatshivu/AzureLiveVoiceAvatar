"""Tests for voice click operations and create request commands in CVS."""
import asyncio
import pytest
from fastapi.testclient import TestClient
from server import app
from pages_config import parse_command_internal, execute_agent_tool, execute_action

client = TestClient(app)

def test_cvs_click_by_row_number():
    """Test voice click operations targeting grid rows by row number or ordinal."""
    # 1. "click edit on row 3"
    res1 = client.post("/api/command/execute", json={
        "text": "click edit on row 3",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res1.status_code == 200
    act1 = res1.json()
    assert act1["type"] == "click"
    assert act1["element"] == "edit"
    assert act1["action_type"] == "edit"
    assert act1["row_number"] == 3
    assert act1["row_index"] == 2
    assert act1["target"] == "orders"

    # 2. "click delete on row 1"
    res2 = client.post("/api/command/execute", json={
        "text": "click delete on row 1",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res2.status_code == 200
    act2 = res2.json()
    assert act2["type"] == "click"
    assert act2["element"] == "delete"
    assert act2["action_type"] == "delete"
    assert act2["row_number"] == 1
    assert act2["row_index"] == 0

    # 3. "click order number on row 2"
    res3 = client.post("/api/command/execute", json={
        "text": "click order number on row 2",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res3.status_code == 200
    act3 = res3.json()
    assert act3["type"] == "click"
    assert act3["element"] == "order_number"
    assert act3["action_type"] == "link"
    assert act3["row_number"] == 2
    assert act3["row_index"] == 1

    # 4. Ordinal: "edit the first row"
    res4 = client.post("/api/command/execute", json={
        "text": "edit the first row",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res4.status_code == 200
    act4 = res4.json()
    assert act4["type"] == "click"
    assert act4["element"] == "edit"
    assert act4["row_number"] == 1
    assert act4["row_index"] == 0

    # 5. Ordinal: "click delete on last row"
    res5 = client.post("/api/command/execute", json={
        "text": "click delete on last row",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res5.status_code == 200
    act5 = res5.json()
    assert act5["type"] == "click"
    assert act5["element"] == "delete"
    assert act5["row_index"] == -1


def test_cvs_click_by_row_identifier():
    """Test voice click operations targeting grid rows by identifier (order/quote number)."""
    # 1. "click edit for order ORD-100200"
    res1 = client.post("/api/command/execute", json={
        "text": "click edit for order ORD-100200",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res1.status_code == 200
    act1 = res1.json()
    assert act1["type"] == "click"
    assert act1["element"] == "edit"
    assert act1["row_identifier"] == "ORD-100200"

    # 2. "click delete on quote QT-1002"
    res2 = client.post("/api/command/execute", json={
        "text": "click delete on quote QT-1002",
        "current_page": "quotes",
        "app": "cvs"
    })
    assert res2.status_code == 200
    act2 = res2.json()
    assert act2["type"] == "click"
    assert act2["element"] == "delete"
    assert act2["row_identifier"] == "QT-1002"

    # 3. "click quote number link QT-1004"
    res3 = client.post("/api/command/execute", json={
        "text": "click quote number link QT-1004",
        "current_page": "quotes",
        "app": "cvs"
    })
    assert res3.status_code == 200
    act3 = res3.json()
    assert act3["type"] == "click"
    assert act3["element"] == "quote_number"
    assert act3["action_type"] == "link"
    assert act3["row_identifier"] == "QT-1004"

    # 4. "click order number ORD-5542"
    res4 = client.post("/api/command/execute", json={
        "text": "click order number ORD-5542",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res4.status_code == 200
    act4 = res4.json()
    assert act4["type"] == "click"
    assert act4["element"] == "order_number"
    assert act4["row_identifier"] == "ORD-5542"

    # 5. "delete quote QT-5510"
    res5 = client.post("/api/command/execute", json={
        "text": "delete quote QT-5510",
        "current_page": "quotes",
        "app": "cvs"
    })
    assert res5.status_code == 200
    act5 = res5.json()
    assert act5["type"] == "click"
    assert act5["element"] == "delete"
    assert act5["row_identifier"] == "QT-5510"


def test_cvs_create_request_commands():
    """Test voice commands parsing create requests."""
    # 1. "create request: New purchase order for Acme Corp 500 units"
    res1 = client.post("/api/command/execute", json={
        "text": "create request: New purchase order for Acme Corp 500 units",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res1.status_code == 200
    act1 = res1.json()
    assert act1["type"] == "create_request"
    assert "New purchase order for Acme Corp 500 units" in act1["request_text"]
    assert "New purchase order for Acme Corp 500 units" in act1["text"]

    # 2. "submit request: Expedited freight shipment to Chicago"
    res2 = client.post("/api/command/execute", json={
        "text": "submit request: Expedited freight shipment to Chicago",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res2.status_code == 200
    act2 = res2.json()
    assert act2["type"] == "create_request"
    assert "Expedited freight shipment to Chicago" in act2["request_text"]

    # 3. "new request: Update shipping address for client"
    res3 = client.post("/api/command/execute", json={
        "text": "new request: Update shipping address for client",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res3.status_code == 200
    act3 = res3.json()
    assert act3["type"] == "create_request"
    assert "Update shipping address for client" in act3["request_text"]


async def _run_agent_click_and_create_tests():
    # 1. Generic perform_action for click by row number
    tool_out1, act1 = await execute_agent_tool(
        func_name="perform_action",
        args={"user_input": "click edit on row 2", "app": "cvs"},
        db=None,
        current_page="orders",
        app_code="cvs"
    )
    assert tool_out1["status"] == "success"
    assert tool_out1["action"] == "click"
    assert tool_out1["element"] == "edit"
    assert tool_out1["row_number"] == 2
    assert act1["type"] == "click"
    assert act1["row_number"] == 2
    assert act1["row_index"] == 1

    # 2. Generic perform_action with structured args for click
    tool_out2, act2 = await execute_agent_tool(
        func_name="perform_action",
        args={
            "action": "click",
            "element": "delete",
            "row_identifier": "ORD-100200",
            "user_input": "delete ORD-100200"
        },
        db=None,
        current_page="orders",
        app_code="cvs"
    )
    assert tool_out2["status"] == "success"
    assert tool_out2["element"] == "delete"
    assert tool_out2["row_identifier"] == "ORD-100200"
    assert act2["type"] == "click"
    assert act2["row_identifier"] == "ORD-100200"

    # 3. Generic perform_action for create_request
    tool_out3, act3 = await execute_agent_tool(
        func_name="perform_action",
        args={"user_input": "create request: Urgent air quote for Shanghai", "app": "cvs"},
        db=None,
        current_page="quotes",
        app_code="cvs"
    )
    assert tool_out3["status"] == "success"
    assert tool_out3["action"] == "create_request"
    assert "Urgent air quote for Shanghai" in tool_out3["request_text"]
    assert act3["type"] == "create_request"
    assert "Urgent air quote for Shanghai" in act3["request_text"]

    # 4. Direct tool call "click"
    tool_out4, act4 = await execute_agent_tool(
        func_name="click",
        args={"element": "quote_number", "row_identifier": "QT-1002"},
        db=None,
        current_page="quotes",
        app_code="cvs"
    )
    assert tool_out4["status"] == "success"
    assert tool_out4["action"] == "click"
    assert act4["type"] == "click"
    assert act4["row_identifier"] == "QT-1002"

    # 5. Direct tool call "create_request"
    tool_out5, act5 = await execute_agent_tool(
        func_name="create_request",
        args={"request_text": "Schedule pickup for next Monday"},
        db=None,
        current_page="orders",
        app_code="cvs"
    )
    assert tool_out5["status"] == "success"
    assert tool_out5["action"] == "create_request"
    assert tool_out5["request_text"] == "Schedule pickup for next Monday"
    assert act5["type"] == "create_request"


def test_agent_click_and_create():
    """Verify agent tool execution for click and create request."""
    asyncio.run(_run_agent_click_and_create_tests())


def test_cvs_navigate_back():
    """Verify back navigation commands return type navigate with target back."""
    back_phrases = [
        "navigate back",
        "go back",
        "take me back",
        "previous url",
        "back to previous page",
        "back"
    ]
    for phrase in back_phrases:
        res = client.post("/api/command/execute", json={
            "text": phrase,
            "current_page": "orders",
            "app": "cvs"
        })
        assert res.status_code == 200, f"Failed for '{phrase}'"
        act = res.json()
        assert act["type"] == "navigate", f"Expected navigate for '{phrase}', got {act}"
        assert act["target"] == "back", f"Expected target back for '{phrase}', got {act}"
        assert act.get("route") == "back"


def test_cvs_go_back_to_target_page():
    """Verify that when words follow 'back' specifying a target, it navigates to that target and NOT to previous url."""
    cases = [
        ("go back to quotations", "quotes", "/quotation/quote"),
        ("go back to questions", "quotes", "/quotation/quote"),
        ("go back to qutestions", "quotes", "/quotation/quote"),
        ("go back to orders", "orders", "/forwarding/orders"),
        ("navigate back to shipments", "shipments", "/forwarding/shipments"),
        ("take me back to dashboard", "dashboard", "/dashboard/overview"),
        ("back to quotations", "quotes", "/quotation/quote"),
    ]
    for text, expected_target, expected_route in cases:
        # 1. Non-agent (direct /api/command/execute)
        res = client.post("/api/command/execute", json={
            "text": text,
            "current_page": "orders",
            "app": "cvs"
        })
        assert res.status_code == 200, f"Failed POST for '{text}'"
        act = res.json()
        assert act["type"] == "navigate", f"Expected navigate for '{text}', got {act}"
        assert act["target"] == expected_target, f"Expected target '{expected_target}' for '{text}', got '{act['target']}'"
        assert act.get("route") == expected_route, f"Expected route '{expected_route}' for '{text}', got '{act.get('route')}'"

    # 2. Agent perform_action
    async def _test_agent_back_target():
        tool_out, act = await execute_agent_tool(
            func_name="perform_action",
            args={"user_input": "go back to quotations", "app": "cvs"},
            db=None,
            current_page="orders",
            app_code="cvs"
        )
        assert act["target"] == "quotes", f"Expected quotes, got {act}"
        assert act.get("route") == "/quotation/quote"

        # Agent with explicit 'back' should still go to back
        tool_out_back, act_back = await execute_agent_tool(
            func_name="perform_action",
            args={"user_input": "go back", "app": "cvs"},
            db=None,
            current_page="orders",
            app_code="cvs"
        )
        assert act_back["target"] == "back"

    asyncio.run(_test_agent_back_target())


def test_create_request_raw_and_analyzed_text():
    """Verify create request has raw_text and analyzed_text (null in non-agent, populated in agent)."""
    # 1. Non-agent mode via /api/command/execute (direct mode)
    res = client.post("/api/command/execute", json={
        "text": "create request need customs clearance for invoice 987",
        "current_page": "orders",
        "app": "cvs"
    })
    assert res.status_code == 200
    act = res.json()
    assert act["type"] == "create_request"
    assert act["raw_text"] == "create request need customs clearance for invoice 987"
    assert act["analyzed_text"] is None
    assert "need customs clearance for invoice 987" in act["request_text"]

    # 1b. Create quote variations in non-agent mode must never apply filters!
    quote_cases = [
        "Create quote",
        "create quote for Acme",
        "Create a quote",
        "create new quote",
        "create quotation for 20 containers",
        "submit quote for urgent delivery",
        "request a quote for sea shipment",
        "create request quote for Shanghai",
    ]
    for qc in quote_cases:
        r = client.post("/api/command/execute", json={
            "text": qc,
            "current_page": "quotes",
            "app": "cvs"
        })
        assert r.status_code == 200, f"Failed for '{qc}'"
        d = r.json()
        assert d["type"] == "create_request", f"Expected create_request for '{qc}', got '{d.get('type')}' with filters {d.get('filters')}"
        assert d["raw_text"] == qc
        assert d["analyzed_text"] is None
        assert "filters" not in d or d["filters"] is None

    # 2. Agent mode via execute_agent_tool
    async def _test_agent():
        tool_out, act_agent = await execute_agent_tool(
            func_name="perform_action",
            args={
                "user_input": "create request need customs clearance for invoice 987",
                "app": "cvs"
            },
            db=None,
            current_page="orders",
            app_code="cvs"
        )
        assert act_agent["type"] == "create_request"
        assert act_agent["raw_text"] == "create request need customs clearance for invoice 987"
        assert act_agent["analyzed_text"] == "need customs clearance for invoice 987"

    asyncio.run(_test_agent())

