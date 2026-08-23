from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import asyncio
import logging
import random
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta

import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="Enterprise Search + Lisa Avatar")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ----------------------------------------------------------------------------
# Azure configuration (filled in by the user via .env)
# ----------------------------------------------------------------------------
SPEECH_RESOURCE = os.environ.get('AZURE_SPEECH_RESOURCE_NAME', '').strip()
SPEECH_REGION = os.environ.get('AZURE_SPEECH_REGION', '').strip()
SPEECH_KEY = os.environ.get('AZURE_SPEECH_KEY', '').strip()
AVATAR_CHARACTER = os.environ.get('AZURE_AVATAR_CHARACTER', 'lisa').strip() or 'lisa'
AVATAR_STYLE = os.environ.get('AZURE_AVATAR_STYLE', 'casual-sitting').strip() or 'casual-sitting'
TTS_VOICE = os.environ.get('AZURE_TTS_VOICE', 'en-US-JennyNeural').strip() or 'en-US-JennyNeural'

FOUNDRY_ENDPOINT = os.environ.get('FOUNDRY_PROJECT_ENDPOINT', '').strip().rstrip('/')
FOUNDRY_AGENT_ID = os.environ.get('FOUNDRY_AGENT_ID', '').strip()
FOUNDRY_API_KEY = os.environ.get('FOUNDRY_API_KEY', '').strip()

_aad_token_cache = {"token": None, "expires_at": 0}


def speech_configured() -> bool:
    return bool(SPEECH_RESOURCE and SPEECH_REGION and SPEECH_KEY)


def foundry_configured() -> bool:
    has_auth = bool(FOUNDRY_API_KEY) or bool(
        os.environ.get('AZURE_TENANT_ID') and os.environ.get('AZURE_CLIENT_ID') and os.environ.get('AZURE_CLIENT_SECRET')
    )
    return bool(FOUNDRY_ENDPOINT and FOUNDRY_AGENT_ID) and has_auth


# ----------------------------------------------------------------------------
# Seed data
# ----------------------------------------------------------------------------
ORDER_STATUSES = ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"]
ORDER_PRIORITIES = ["Low", "Medium", "High"]
REGIONS = ["North America", "Europe", "Asia Pacific", "Latin America", "Middle East"]
FIRST_NAMES = ["Ava", "Liam", "Noah", "Emma", "Olivia", "Sophia", "Mason", "Lucas", "Mia", "Ethan",
               "Isabella", "James", "Charlotte", "Benjamin", "Amelia", "Henry", "Harper", "Daniel", "Ella", "Jack"]
LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez",
              "Martinez", "Hernandez", "Lopez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson"]

ITEM_CATEGORIES = ["Electronics", "Apparel", "Home & Garden", "Sports", "Books"]
ITEM_CONDITIONS = ["New", "Used", "Refurbished"]
SUPPLIERS = ["Acme Corp", "Globex", "Initech", "Umbrella", "Stark Industries", "Wayne Enterprises", "Wonka"]
ITEM_ADJ = ["Premium", "Classic", "Compact", "Deluxe", "Eco", "Pro", "Ultra", "Smart", "Portable", "Wireless"]
ITEM_NOUN = {
    "Electronics": ["Headphones", "Speaker", "Monitor", "Keyboard", "Router", "Charger", "Webcam"],
    "Apparel": ["Jacket", "Sneakers", "T-Shirt", "Backpack", "Hoodie", "Cap", "Gloves"],
    "Home & Garden": ["Lamp", "Blender", "Chair", "Kettle", "Vase", "Planter", "Cushion"],
    "Sports": ["Yoga Mat", "Dumbbell", "Bottle", "Racket", "Helmet", "Gloves", "Tent"],
    "Books": ["Novel", "Cookbook", "Journal", "Atlas", "Guide", "Manual", "Anthology"],
}


def _rand_date_within_days(days: int) -> datetime:
    delta = random.randint(0, days)
    secs = random.randint(0, 86399)
    return datetime.now(timezone.utc) - timedelta(days=delta, seconds=secs)


async def seed_data():
    orders_count = await db.orders.count_documents({})
    if orders_count == 0:
        orders = []
        for i in range(1, 1001):
            d = _rand_date_within_days(365)
            orders.append({
                "id": f"ord_{i:05d}",
                "order_number": f"ORD-{100000 + i}",
                "customer_name": f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}",
                "status": random.choice(ORDER_STATUSES),
                "priority": random.choice(ORDER_PRIORITIES),
                "region": random.choice(REGIONS),
                "is_paid": random.random() > 0.4,
                "amount": round(random.uniform(20, 5000), 2),
                "items_count": random.randint(1, 12),
                "order_date": d.isoformat(),
            })
        await db.orders.insert_many(orders)
        logger.info("Seeded 1000 orders")

    items_count = await db.items.count_documents({})
    if items_count == 0:
        items = []
        for i in range(1, 1001):
            cat = random.choice(ITEM_CATEGORIES)
            name = f"{random.choice(ITEM_ADJ)} {random.choice(ITEM_NOUN[cat])}"
            stock = random.randint(0, 500)
            d = _rand_date_within_days(365)
            items.append({
                "id": f"itm_{i:05d}",
                "sku": f"SKU-{200000 + i}",
                "name": name,
                "category": cat,
                "condition": random.choice(ITEM_CONDITIONS),
                "in_stock": stock > 0,
                "stock": stock,
                "price": round(random.uniform(5, 1500), 2),
                "supplier": random.choice(SUPPLIERS),
                "added_date": d.isoformat(),
            })
        await db.items.insert_many(items)
        logger.info("Seeded 1000 items")


# ----------------------------------------------------------------------------
# Search endpoints
# ----------------------------------------------------------------------------
def _date_filter(field: str, date_from: Optional[str], date_to: Optional[str]):
    cond = {}
    if date_from:
        cond["$gte"] = date_from
    if date_to:
        # include the whole 'to' day
        cond["$lte"] = date_to + "T23:59:59.999999+00:00" if len(date_to) == 10 else date_to
    return {field: cond} if cond else {}


@api_router.get("/")
async def root():
    return {"message": "Enterprise Search API"}


@api_router.get("/config")
async def get_config():
    return {
        "speech_configured": speech_configured(),
        "foundry_configured": foundry_configured(),
        "avatar_character": AVATAR_CHARACTER,
        "avatar_style": AVATAR_STYLE,
    }


@api_router.get("/orders/search")
async def search_orders(
    q: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    paid_only: bool = False,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
):
    query = {}
    if q:
        query["$or"] = [
            {"order_number": {"$regex": q, "$options": "i"}},
            {"customer_name": {"$regex": q, "$options": "i"}},
        ]
    if status and status != "all":
        query["status"] = status
    if priority and priority != "all":
        query["priority"] = priority
    if paid_only:
        query["is_paid"] = True
    query.update(_date_filter("order_date", date_from, date_to))

    total = await db.orders.count_documents(query)
    cursor = db.orders.find(query, {"_id": 0}).sort("order_date", -1).skip((page - 1) * page_size).limit(page_size)
    results = await cursor.to_list(page_size)
    return {
        "results": results,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@api_router.get("/items/search")
async def search_items(
    q: Optional[str] = None,
    category: Optional[str] = None,
    condition: Optional[str] = None,
    in_stock_only: bool = False,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
):
    query = {}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"sku": {"$regex": q, "$options": "i"}},
        ]
    if category and category != "all":
        query["category"] = category
    if condition and condition != "all":
        query["condition"] = condition
    if in_stock_only:
        query["in_stock"] = True
    query.update(_date_filter("added_date", date_from, date_to))

    total = await db.items.count_documents(query)
    cursor = db.items.find(query, {"_id": 0}).sort("added_date", -1).skip((page - 1) * page_size).limit(page_size)
    results = await cursor.to_list(page_size)
    return {
        "results": results,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


# ----------------------------------------------------------------------------
# Azure avatar: token relay
# ----------------------------------------------------------------------------
@api_router.get("/avatar/credentials")
async def avatar_credentials():
    if not speech_configured():
        raise HTTPException(503, "Azure Speech is not configured. Set AZURE_SPEECH_* env vars.")
    base = f"https://{SPEECH_RESOURCE}.cognitiveservices.azure.com"
    token_url = f"{base}/sts/v1.0/issueToken"
    ice_url = f"{base}/tts/cognitiveservices/avatar/relay/token/v1"
    headers = {"Ocp-Apim-Subscription-Key": SPEECH_KEY}
    async with httpx.AsyncClient(timeout=15) as hc:
        token_resp, ice_resp = await asyncio.gather(
            hc.post(token_url, headers={**headers, "Content-Type": "application/x-www-form-urlencoded"}),
            hc.get(ice_url, headers=headers),
        )
    if token_resp.status_code != 200:
        raise HTTPException(502, f"Speech token request failed ({token_resp.status_code})")
    if ice_resp.status_code != 200:
        raise HTTPException(502, f"Avatar ICE request failed ({ice_resp.status_code})")
    return {
        "speech_token": token_resp.text,
        "speech_region": SPEECH_REGION,
        "ice": ice_resp.json(),
        "avatar_character": AVATAR_CHARACTER,
        "avatar_style": AVATAR_STYLE,
        "tts_voice": TTS_VOICE,
        "expires_in_seconds": 540,
    }


# ----------------------------------------------------------------------------
# Azure AI Foundry agent proxy
# ----------------------------------------------------------------------------
async def _foundry_headers() -> dict:
    if FOUNDRY_API_KEY:
        return {"api-key": FOUNDRY_API_KEY, "Content-Type": "application/json"}
    now = datetime.now(timezone.utc).timestamp()
    if _aad_token_cache["token"] and _aad_token_cache["expires_at"] - 60 > now:
        token = _aad_token_cache["token"]
    else:
        from azure.identity import ClientSecretCredential, DefaultAzureCredential
        tenant = os.environ.get('AZURE_TENANT_ID')
        cid = os.environ.get('AZURE_CLIENT_ID')
        secret = os.environ.get('AZURE_CLIENT_SECRET')
        if tenant and cid and secret:
            cred = ClientSecretCredential(tenant, cid, secret)
        else:
            cred = DefaultAzureCredential()
        access = cred.get_token("https://ai.azure.com/.default")
        token = access.token
        _aad_token_cache["token"] = token
        _aad_token_cache["expires_at"] = access.expires_on
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


async def _foundry(hc: httpx.AsyncClient, method: str, path: str, body: Optional[dict] = None) -> dict:
    url = f"{FOUNDRY_ENDPOINT}/{path.lstrip('/')}"
    headers = await _foundry_headers()
    resp = await hc.request(method, url, headers=headers, json=body)
    if resp.status_code >= 400:
        raise HTTPException(502, f"Foundry error {resp.status_code}: {resp.text[:400]}")
    return resp.json()


def _extract_assistant_text(payload: dict) -> str:
    for msg in payload.get("data", []):
        if msg.get("role") != "assistant":
            continue
        for item in msg.get("content", []):
            text = item.get("text")
            if isinstance(text, dict) and text.get("value"):
                return text["value"]
            if isinstance(text, str) and text:
                return text
    return ""


class ChatRequest(BaseModel):
    text: str
    thread_id: Optional[str] = None


@api_router.post("/avatar/chat")
async def avatar_chat(req: ChatRequest):
    if not foundry_configured():
        raise HTTPException(503, "Azure AI Foundry agent is not configured. Set FOUNDRY_* env vars.")
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(400, "text is required")
    if len(text) > 4000:
        raise HTTPException(400, "text too long")

    async with httpx.AsyncClient(timeout=60) as hc:
        thread_id = req.thread_id
        if not thread_id:
            thread = await _foundry(hc, "POST", "threads?api-version=v1", {})
            thread_id = thread["id"]

        await _foundry(hc, "POST", f"threads/{thread_id}/messages?api-version=v1",
                       {"role": "user", "content": text})
        run = await _foundry(hc, "POST", f"threads/{thread_id}/runs?api-version=v1",
                             {"assistant_id": FOUNDRY_AGENT_ID})

        for _ in range(60):
            status = await _foundry(hc, "GET", f"threads/{thread_id}/runs/{run['id']}?api-version=v1")
            state = status.get("status")
            if state == "completed":
                break
            if state in {"failed", "cancelled", "expired", "requires_action"}:
                raise HTTPException(502, f"Agent run {state}")
            await asyncio.sleep(1)
        else:
            raise HTTPException(504, "Agent run timed out")

        messages = await _foundry(hc, "GET", f"threads/{thread_id}/messages?api-version=v1&order=desc&limit=5")
        answer = _extract_assistant_text(messages)

    if not answer:
        answer = "I'm sorry, I couldn't generate a response."
    await db.conversations.insert_one({
        "thread_id": thread_id,
        "user_text": text,
        "assistant_text": answer,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"thread_id": thread_id, "text": answer}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await seed_data()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
