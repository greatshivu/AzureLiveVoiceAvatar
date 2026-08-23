"""Backend API tests for Enterprise Search + Lisa Avatar."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lisa-search-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# ---- /api/config ----
def test_config(s):
    r = s.get(f"{API}/config", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["speech_configured"] is False
    assert d["foundry_configured"] is False
    assert "avatar_character" in d


# ---- /api/orders/search ----
def test_orders_default(s):
    r = s.get(f"{API}/orders/search", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["total"] == 1000
    assert d["page"] == 1
    assert d["page_size"] == 10
    assert d["total_pages"] == 100
    assert len(d["results"]) == 10
    assert "_id" not in d["results"][0]


def test_orders_page_change(s):
    r1 = s.get(f"{API}/orders/search", params={"page": 1}).json()
    r2 = s.get(f"{API}/orders/search", params={"page": 2}).json()
    ids1 = {o["id"] for o in r1["results"]}
    ids2 = {o["id"] for o in r2["results"]}
    assert ids1.isdisjoint(ids2)


def test_orders_filter_status_delivered(s):
    r = s.get(f"{API}/orders/search", params={"status": "Delivered", "page_size": 5}).json()
    assert r["total"] > 0 and r["total"] < 1000
    assert all(o["status"] == "Delivered" for o in r["results"])


def test_orders_filter_priority_high(s):
    r = s.get(f"{API}/orders/search", params={"priority": "High", "page_size": 5}).json()
    assert r["total"] > 0
    assert all(o["priority"] == "High" for o in r["results"])


def test_orders_filter_paid_only(s):
    r = s.get(f"{API}/orders/search", params={"paid_only": "true", "page_size": 5}).json()
    assert r["total"] > 0 and r["total"] < 1000
    assert all(o["is_paid"] is True for o in r["results"])


def test_orders_filter_q(s):
    r = s.get(f"{API}/orders/search", params={"q": "ORD-100"}).json()
    assert r["total"] >= 1
    for o in r["results"]:
        assert "ORD-100" in o["order_number"] or "ord-100" in o.get("customer_name", "").lower()


def test_orders_date_range(s):
    # narrow window
    r = s.get(f"{API}/orders/search", params={"date_from": "2099-01-01", "date_to": "2099-12-31"}).json()
    assert r["total"] == 0


# ---- /api/items/search ----
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


# ---- Avatar endpoints (should degrade gracefully) ----
def test_avatar_credentials_503(s):
    r = s.get(f"{API}/avatar/credentials")
    assert r.status_code == 503


def test_avatar_chat_503(s):
    r = s.post(f"{API}/avatar/chat", json={"text": "hi"})
    assert r.status_code == 503
