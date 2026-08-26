"""Backend API tests for Enterprise Search + Lisa (Azure Voice Live)."""
import json
import os
import pytest
import requests
from urllib.parse import urlparse
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# ---- /api/config (voicelive-shaped) ----
def test_config_voicelive_unconfigured(s):
    r = s.get(f"{API}/config", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["voicelive_configured"] is False
    assert d["avatar_character"] == "lisa"
    assert d["avatar_style"] == "casual-sitting"
    # Legacy keys must be gone
    assert "speech_configured" not in d
    assert "foundry_configured" not in d


# ---- Old avatar endpoints must be gone ----
def test_legacy_avatar_endpoints_removed(s):
    r1 = s.get(f"{API}/avatar/credentials")
    r2 = s.post(f"{API}/avatar/chat", json={"text": "hi"})
    assert r1.status_code == 404
    assert r2.status_code == 404


# ---- /api/voice/ws graceful-error when unconfigured ----
def test_voice_ws_graceful_error():
    try:
        from websockets.sync.client import connect
    except Exception:
        pytest.skip("websockets sync client unavailable")
    host = urlparse(BASE_URL).netloc
    scheme = "wss" if BASE_URL.startswith("https") else "ws"
    url = f"{scheme}://{host}/api/voice/ws"
    with connect(url, open_timeout=10, close_timeout=5) as ws:
        msg = ws.recv(timeout=10)
    data = json.loads(msg)
    assert data.get("type") == "error"
    assert "not configured" in data["error"]["message"].lower()


# ---- /api/orders/search regression ----
def test_orders_default(s):
    r = s.get(f"{API}/orders/search", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["total"] == 1000
    assert d["page"] == 1 and d["page_size"] == 10 and d["total_pages"] == 100
    assert len(d["results"]) == 10
    assert "_id" not in d["results"][0]


def test_orders_page_change(s):
    r1 = s.get(f"{API}/orders/search", params={"page": 1}).json()
    r2 = s.get(f"{API}/orders/search", params={"page": 2}).json()
    assert {o["id"] for o in r1["results"]}.isdisjoint({o["id"] for o in r2["results"]})


def test_orders_filter_status_delivered(s):
    r = s.get(f"{API}/orders/search", params={"status": "Delivered", "page_size": 5}).json()
    assert 0 < r["total"] < 1000
    assert all(o["status"] == "Delivered" for o in r["results"])


def test_orders_filter_priority_high(s):
    r = s.get(f"{API}/orders/search", params={"priority": "High", "page_size": 5}).json()
    assert r["total"] > 0
    assert all(o["priority"] == "High" for o in r["results"])


def test_orders_filter_paid_only(s):
    r = s.get(f"{API}/orders/search", params={"paid_only": "true", "page_size": 5}).json()
    assert 0 < r["total"] < 1000
    assert all(o["is_paid"] is True for o in r["results"])


def test_orders_filter_q(s):
    r = s.get(f"{API}/orders/search", params={"q": "ORD-100"}).json()
    assert r["total"] >= 1


def test_orders_date_range_empty(s):
    r = s.get(f"{API}/orders/search", params={"date_from": "2099-01-01", "date_to": "2099-12-31"}).json()
    assert r["total"] == 0


# ---- /api/items/search regression ----
def test_items_default(s):
    r = s.get(f"{API}/items/search", timeout=15).json()
    assert r["total"] == 1000
    assert len(r["results"]) == 10
    assert r["total_pages"] == 100


def test_items_filter_electronics(s):
    r = s.get(f"{API}/items/search", params={"category": "Electronics", "page_size": 5}).json()
    assert r["total"] > 0
    assert all(i["category"] == "Electronics" for i in r["results"])


def test_items_filter_condition_new(s):
    r = s.get(f"{API}/items/search", params={"condition": "New", "page_size": 5}).json()
    assert r["total"] > 0
    assert all(i["condition"] == "New" for i in r["results"])


def test_items_in_stock_only(s):
    r = s.get(f"{API}/items/search", params={"in_stock_only": "true", "page_size": 5}).json()
    assert all(i["in_stock"] is True for i in r["results"])


def test_items_q_sku(s):
    r = s.get(f"{API}/items/search", params={"q": "SKU-2001"}).json()
    assert r["total"] >= 1
