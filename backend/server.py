from fastapi import FastAPI, APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import asyncio
import logging
import random
from pathlib import Path
from typing import Optional
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode

import websockets

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="Enterprise Search + Lisa (Azure Voice Live)")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ----------------------------------------------------------------------------
# Azure Voice Live + Foundry Agent configuration (user fills these in)
# ----------------------------------------------------------------------------
VOICELIVE_ENDPOINT = os.environ.get('VOICELIVE_ENDPOINT', '').strip().rstrip('/')  # https://<res>.services.ai.azure.com
VOICELIVE_API_VERSION = os.environ.get('VOICELIVE_API_VERSION', '2026-04-10').strip() or '2026-04-10'
VOICELIVE_API_KEY = os.environ.get('VOICELIVE_API_KEY', '').strip()

FOUNDRY_PROJECT_NAME = os.environ.get('FOUNDRY_PROJECT_NAME', '').strip()
FOUNDRY_AGENT_ID = os.environ.get('FOUNDRY_AGENT_ID', '').strip()
FOUNDRY_AGENT_NAME = os.environ.get('FOUNDRY_AGENT_NAME', '').strip()
FOUNDRY_AGENT_VERSION = os.environ.get('FOUNDRY_AGENT_VERSION', '').strip()

AVATAR_CHARACTER = os.environ.get('AZURE_AVATAR_CHARACTER', 'lisa').strip() or 'lisa'
AVATAR_STYLE = os.environ.get('AZURE_AVATAR_STYLE', 'casual-sitting').strip() or 'casual-sitting'
TTS_VOICE = os.environ.get('AZURE_TTS_VOICE', 'en-US-AvaNeural').strip() or 'en-US-AvaNeural'


def voicelive_configured() -> bool:
    has_auth = bool(VOICELIVE_API_KEY) or bool(
        os.environ.get('AZURE_TENANT_ID') and os.environ.get('AZURE_CLIENT_ID') and os.environ.get('AZURE_CLIENT_SECRET')
    )
    has_agent = bool(FOUNDRY_PROJECT_NAME and (FOUNDRY_AGENT_ID or FOUNDRY_AGENT_NAME))
    return bool(VOICELIVE_ENDPOINT and has_agent and has_auth)


async def _entra_token() -> str:
    def _get():
        from azure.identity import ClientSecretCredential, DefaultAzureCredential
        t, c, s = os.environ.get('AZURE_TENANT_ID'), os.environ.get('AZURE_CLIENT_ID'), os.environ.get('AZURE_CLIENT_SECRET')
        cred = ClientSecretCredential(t, c, s) if (t and c and s) else DefaultAzureCredential()
        return cred.get_token("https://ai.azure.com/.default").token
    return await asyncio.to_thread(_get)


def _voicelive_url() -> str:
    base = VOICELIVE_ENDPOINT.replace('https://', 'wss://').replace('http://', 'ws://')
    params = {"api-version": VOICELIVE_API_VERSION}
    if FOUNDRY_PROJECT_NAME:
        params["agent-project-name"] = FOUNDRY_PROJECT_NAME
    if FOUNDRY_AGENT_ID:
        params["agent-id"] = FOUNDRY_AGENT_ID
    if FOUNDRY_AGENT_NAME:
        params["agent-name"] = FOUNDRY_AGENT_NAME
    if FOUNDRY_AGENT_VERSION:
        params["agent-version"] = FOUNDRY_AGENT_VERSION
    return f"{base}/voice-live/realtime?{urlencode(params)}"


def _session_update(auto_turn: bool = True) -> dict:
    session = {
        "modalities": ["text", "audio"],
        "voice": {"type": "azure-standard", "name": TTS_VOICE},
        "input_audio_format": "pcm16",
        "output_audio_format": "pcm16",
        "input_audio_transcription": {"model": "azure-speech", "language": "en-US"},
        "avatar": {
            "character": AVATAR_CHARACTER,
            "style": AVATAR_STYLE,
            "customized": False,
            "output_protocol": "webrtc",
            "video": {"codec": "h264", "bitrate": 2000000, "resolution": {"width": 1080, "height": 1920}},
        },
        "turn_detection": (
            {"type": "server_vad", "threshold": 0.5, "prefix_padding_ms": 300, "silence_duration_ms": 500}
            if auto_turn else None
        ),
    }
    return {"type": "session.update", "session": session}


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
    return datetime.now(timezone.utc) - timedelta(days=random.randint(0, days), seconds=random.randint(0, 86399))


async def seed_data():
    if await db.orders.count_documents({}) == 0:
        orders = []
        for i in range(1, 1001):
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
                "order_date": _rand_date_within_days(365).isoformat(),
            })
        await db.orders.insert_many(orders)
        logger.info("Seeded 1000 orders")

    if await db.items.count_documents({}) == 0:
        items = []
        for i in range(1, 1001):
            cat = random.choice(ITEM_CATEGORIES)
            stock = random.randint(0, 500)
            items.append({
                "id": f"itm_{i:05d}",
                "sku": f"SKU-{200000 + i}",
                "name": f"{random.choice(ITEM_ADJ)} {random.choice(ITEM_NOUN[cat])}",
                "category": cat,
                "condition": random.choice(ITEM_CONDITIONS),
                "in_stock": stock > 0,
                "stock": stock,
                "price": round(random.uniform(5, 1500), 2),
                "supplier": random.choice(SUPPLIERS),
                "added_date": _rand_date_within_days(365).isoformat(),
            })
        await db.items.insert_many(items)
        logger.info("Seeded 1000 items")


def _date_filter(field: str, date_from: Optional[str], date_to: Optional[str]):
    cond = {}
    if date_from:
        cond["$gte"] = date_from
    if date_to:
        cond["$lte"] = date_to + "T23:59:59.999999+00:00" if len(date_to) == 10 else date_to
    return {field: cond} if cond else {}


# ----------------------------------------------------------------------------
# REST endpoints
# ----------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"message": "Enterprise Search API"}


@api_router.get("/config")
async def get_config():
    return {
        "voicelive_configured": voicelive_configured(),
        "avatar_character": AVATAR_CHARACTER,
        "avatar_style": AVATAR_STYLE,
    }


@api_router.get("/orders/search")
async def search_orders(
    q: Optional[str] = None, status: Optional[str] = None, priority: Optional[str] = None,
    paid_only: bool = False, date_from: Optional[str] = None, date_to: Optional[str] = None,
    page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100),
):
    query = {}
    if q:
        query["$or"] = [{"order_number": {"$regex": q, "$options": "i"}}, {"customer_name": {"$regex": q, "$options": "i"}}]
    if status and status != "all":
        query["status"] = status
    if priority and priority != "all":
        query["priority"] = priority
    if paid_only:
        query["is_paid"] = True
    query.update(_date_filter("order_date", date_from, date_to))
    total = await db.orders.count_documents(query)
    results = await db.orders.find(query, {"_id": 0}).sort("order_date", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    return {"results": results, "total": total, "page": page, "page_size": page_size, "total_pages": max(1, (total + page_size - 1) // page_size)}


@api_router.get("/items/search")
async def search_items(
    q: Optional[str] = None, category: Optional[str] = None, condition: Optional[str] = None,
    in_stock_only: bool = False, date_from: Optional[str] = None, date_to: Optional[str] = None,
    page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100),
):
    query = {}
    if q:
        query["$or"] = [{"name": {"$regex": q, "$options": "i"}}, {"sku": {"$regex": q, "$options": "i"}}]
    if category and category != "all":
        query["category"] = category
    if condition and condition != "all":
        query["condition"] = condition
    if in_stock_only:
        query["in_stock"] = True
    query.update(_date_filter("added_date", date_from, date_to))
    total = await db.items.count_documents(query)
    results = await db.items.find(query, {"_id": 0}).sort("added_date", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    return {"results": results, "total": total, "page": page, "page_size": page_size, "total_pages": max(1, (total + page_size - 1) // page_size)}


# ----------------------------------------------------------------------------
# Azure Voice Live broker: relays the browser <-> Voice Live realtime socket.
# Browser sends {"type":"start", "auto_turn": bool}; the server injects the
# avatar session.update and forwards everything else (incl. session.avatar.connect
# SDP signaling) transparently.
# ----------------------------------------------------------------------------
@api_router.websocket("/voice/ws")
async def voice_ws(ws: WebSocket):
    await ws.accept()
    if not voicelive_configured():
        await ws.send_text(json.dumps({"type": "error", "error": {
            "message": "Voice Live is not configured. Set VOICELIVE_ENDPOINT, FOUNDRY_PROJECT_NAME, "
                       "FOUNDRY_AGENT_ID or FOUNDRY_AGENT_NAME (and FOUNDRY_AGENT_VERSION), plus Azure "
                       "service-principal credentials, in backend/.env."}}))
        await ws.close()
        return

    try:
        headers = {}
        if VOICELIVE_API_KEY:
            headers["api-key"] = VOICELIVE_API_KEY
        else:
            headers["Authorization"] = f"Bearer {await _entra_token()}"

        async with websockets.connect(
            _voicelive_url(), additional_headers=headers, subprotocols=["realtime"],
            max_size=None, ping_interval=20, ping_timeout=20,
        ) as azure:

            async def browser_to_azure():
                while True:
                    raw = await ws.receive_text()
                    try:
                        data = json.loads(raw)
                    except Exception:
                        continue
                    if data.get("type") == "start":
                        data = _session_update(bool(data.get("auto_turn", True)))
                    await azure.send(json.dumps(data))

            async def azure_to_browser():
                async for raw in azure:
                    await ws.send_text(raw if isinstance(raw, str) else raw.decode("utf-8", "ignore"))

            await asyncio.gather(browser_to_azure(), azure_to_browser())

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error("voice_ws error: %s", e)
        try:
            await ws.send_text(json.dumps({"type": "error", "error": {"message": str(e)[:300]}}))
        except Exception:
            pass
    finally:
        try:
            await ws.close()
        except Exception:
            pass


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
