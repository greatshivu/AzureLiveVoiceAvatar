from fastapi import FastAPI, APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from azure.ai.voicelive.aio import connect, AgentSessionConfig
from azure.identity.aio import ClientSecretCredential
import os
import re
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
FOUNDRY_AGENT_NAME = os.environ.get('FOUNDRY_AGENT_NAME', '').strip()
FOUNDRY_AGENT_VERSION = os.environ.get('FOUNDRY_AGENT_VERSION', '').strip()

credential = ClientSecretCredential(
    tenant_id=os.environ["AZURE_TENANT_ID"],
    client_id=os.environ["AZURE_CLIENT_ID"],
    client_secret=os.environ["AZURE_CLIENT_SECRET"],
)

agent_config: AgentSessionConfig = {
    "agent_name": FOUNDRY_AGENT_NAME,
    "project_name": FOUNDRY_PROJECT_NAME,
}
if FOUNDRY_AGENT_VERSION:
    agent_config["agent_version"] = FOUNDRY_AGENT_VERSION

AVATAR_CHARACTER = os.environ.get('AZURE_AVATAR_CHARACTER', 'lisa').strip() or 'lisa'
AVATAR_STYLE = os.environ.get('AZURE_AVATAR_STYLE', 'casual-sitting').strip() or 'casual-sitting'
TTS_VOICE = os.environ.get('AZURE_TTS_VOICE', 'en-US-AvaNeural').strip() or 'en-US-AvaNeural'


def voicelive_configured() -> bool:
    has_auth = bool(VOICELIVE_API_KEY) or bool(
        os.environ.get('AZURE_TENANT_ID') and os.environ.get('AZURE_CLIENT_ID') and os.environ.get('AZURE_CLIENT_SECRET')
    )
    has_agent = bool(FOUNDRY_PROJECT_NAME and (FOUNDRY_AGENT_NAME))
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
    if FOUNDRY_AGENT_NAME:
        params["agent-name"] = FOUNDRY_AGENT_NAME
    if FOUNDRY_AGENT_VERSION:
        params["agent-version"] = FOUNDRY_AGENT_VERSION
    return f"{base}/voice-live/realtime?{urlencode(params)}"


def _session_update(auto_turn: bool = True, use_agent: bool = True) -> dict:
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
            "video": {"codec": "h264", "bitrate": 2000000, "resolution": {"width": 1920, "height": 1080} 
                #,"crop": { "topLeft": { "x": 420, "y": 0 }, "bottomRight": { "x": 1500, "y": 1080 } }
                ,"crop": {"top_left": (600, 0),"bottom_right": (1320, 550)}
            },
        },
        "turn_detection": (
            {
                "type": "server_vad",
                "threshold": 0.5,
                "prefix_padding_ms": 300,
                "silence_duration_ms": 500,
                "create_response": use_agent,
            }
            if auto_turn else None
        ),
    }
    if not use_agent:
        session["tools"] = []
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


@api_router.get("/pages")
async def get_pages(app: Optional[str] = None, app_code: Optional[str] = None):
    return get_pages_config(app or app_code)


class CommandRequest(BaseModel):
    text: Optional[str] = None
    command: Optional[str] = None
    current_page: Optional[str] = "orders"
    app: Optional[str] = None
    app_code: Optional[str] = None


@api_router.post("/command/execute")
async def execute_command(req: CommandRequest):
    raw_text = req.text or req.command or ""
    app_code = req.app or req.app_code
    return parse_command_internal(raw_text, req.current_page or "orders", app_code)


@api_router.get("/orders/search")
async def search_orders(
    q: Optional[str] = None,
    search: Optional[str] = None,
    keyword: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    paid_status: Optional[str] = None,
    paid_only: bool = False,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
):
    query = {}
    term = (q or search or keyword or "").strip()
    if term:
        esc_term = re.escape(term)
        query["$or"] = [
            {"order_number": {"$regex": esc_term, "$options": "i"}},
            {"customer_name": {"$regex": esc_term, "$options": "i"}},
        ]
    if status and status != "all":
        query["status"] = status
    if priority and priority != "all":
        priorities = [p.strip() for p in priority.split(",") if p.strip()]
        if len(priorities) == 1:
            query["priority"] = priorities[0]
        elif len(priorities) > 1:
            query["priority"] = {"$in": priorities}
    if paid_status == "paid" or paid_only:
        query["is_paid"] = True
    elif paid_status == "unpaid":
        query["is_paid"] = False
    query.update(_date_filter("order_date", date_from, date_to))
    page_num = page if isinstance(page, int) else getattr(page, "default", 1)
    page_limit = page_size if isinstance(page_size, int) else getattr(page_size, "default", 10)
    total = await db.orders.count_documents(query)
    results = await db.orders.find(query, {"_id": 0}).sort("order_date", -1).skip((page_num - 1) * page_limit).limit(page_limit).to_list(page_limit)
    return {"results": results, "total": total, "page": page_num, "page_size": page_limit, "total_pages": max(1, (total + page_limit - 1) // page_limit)}


@api_router.get("/orders")
async def get_orders(
    q: Optional[str] = None,
    search: Optional[str] = None,
    keyword: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    paid_status: Optional[str] = None,
    paid_only: bool = False,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
):
    return await search_orders(q, search, keyword, status, priority, paid_status, paid_only, date_from, date_to, page, page_size)


@api_router.get("/items/search")
async def search_items(
    q: Optional[str] = None,
    search: Optional[str] = None,
    keyword: Optional[str] = None,
    category: Optional[str] = None,
    condition: Optional[str] = None,
    in_stock_only: bool = False,
    in_stock: Optional[bool] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
):
    query = {}
    term = (q or search or keyword or "").strip()
    if term:
        esc_term = re.escape(term)
        query["$or"] = [
            {"name": {"$regex": esc_term, "$options": "i"}},
            {"sku": {"$regex": esc_term, "$options": "i"}},
        ]
    if category and category != "all":
        categories = [c.strip() for c in category.split(",") if c.strip()]
        if len(categories) == 1:
            query["category"] = categories[0]
        elif len(categories) > 1:
            query["category"] = {"$in": categories}
    if condition and condition != "all":
        query["condition"] = condition
    if in_stock_only or in_stock is True:
        query["in_stock"] = True
    elif in_stock is False:
        query["in_stock"] = False
    query.update(_date_filter("added_date", date_from, date_to))
    page_num = page if isinstance(page, int) else getattr(page, "default", 1)
    page_limit = page_size if isinstance(page_size, int) else getattr(page_size, "default", 10)
    total = await db.items.count_documents(query)
    results = await db.items.find(query, {"_id": 0}).sort("added_date", -1).skip((page_num - 1) * page_limit).limit(page_limit).to_list(page_limit)
    return {"results": results, "total": total, "page": page_num, "page_size": page_limit, "total_pages": max(1, (total + page_limit - 1) // page_limit)}


@api_router.get("/items")
async def get_items(
    q: Optional[str] = None,
    search: Optional[str] = None,
    keyword: Optional[str] = None,
    category: Optional[str] = None,
    condition: Optional[str] = None,
    in_stock_only: bool = False,
    in_stock: Optional[bool] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
):
    return await search_items(q, search, keyword, category, condition, in_stock_only, in_stock, date_from, date_to, page, page_size)


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
                       "FOUNDRY_AGENT_NAME (and FOUNDRY_AGENT_VERSION), plus Azure "
                       "service-principal credentials, in backend/.env."}}))
        await ws.close()
        return

    try:
        htoken = await _entra_token()
        headers = {
            "Authorization": f"Bearer {htoken}"
        }

        #async with websockets.connect(
        #    _voicelive_url(), additional_headers=headers, subprotocols=["realtime"],
        #    max_size=None, ping_interval=20, ping_timeout=20,
        #) as azure:
        async with connect(
            endpoint=VOICELIVE_ENDPOINT,
            credential=credential,
            agent_config=agent_config,
        ) as azure:

            #async def browser_to_azure():
            #    while True:
            #        raw = await ws.receive_text()
            #        try:
            #            data = json.loads(raw)
            #        except Exception:
            #            continue
            #        if data.get("type") == "start":
            #            data = _session_update(bool(data.get("auto_turn", True)))
            #        await azure.send(json.dumps(data))
            async def browser_to_azure():
                while True:
                    raw = await ws.receive_text()

                    try:
                        data = json.loads(raw)
                    except json.JSONDecodeError:
                        logger.warning("Invalid JSON from browser: %s", raw[:500])
                        continue

                    if data.get("type") == "start":
                        data = _session_update(
                            bool(data.get("auto_turn", True))
                        )

                    logger.info(
                        "Browser -> Voice Live: type=%s",
                        data.get("type")
                    )

                    await azure.send(data)

            #async def azure_to_browser():
            #    async for raw in azure:
            #        await ws.send_text(raw if isinstance(raw, str) else raw.decode("utf-8", "ignore"))
            async def azure_to_browser():
                async for event in azure:
                    logger.info(
                        "Voice Live event: type=%s class=%s",
                        getattr(event, "type", None),
                        type(event).__name__,
                    )
                    if type(event).__name__ == "ServerEventError":
                        logger.error("========== VOICE LIVE ERROR ==========")
                        logger.error("event repr: %r", event)
                        logger.error("event str: %s", event)
                        logger.error("event dict: %s", getattr(event, "__dict__", None))
                        logger.error("event type: %s", getattr(event, "type", None))
                        logger.error("error: %s", getattr(event, "error", None))
                        logger.error("code: %s", getattr(event, "code", None))
                        logger.error("message: %s", getattr(event, "message", None))
                        logger.error("param: %s", getattr(event, "param", None))
                        logger.error("======================================")

                    try:
                        if isinstance(event, str):
                            payload = event

                        elif isinstance(event, bytes):
                            payload = event.decode("utf-8", "ignore")

                        elif hasattr(event, "model_dump"):
                            payload = json.dumps(
                                event.model_dump(mode="json"),
                                default=str
                            )

                        elif hasattr(event, "as_dict"):
                            payload = json.dumps(
                                event.as_dict(),
                                default=str
                            )

                        elif hasattr(event, "to_dict"):
                            payload = json.dumps(
                                event.to_dict(),
                                default=str
                            )

                        else:
                            payload = json.dumps(
                                {
                                    "type": getattr(
                                        event,
                                        "type",
                                        type(event).__name__
                                    ),
                                    "event": str(event),
                                }
                            )

                        await ws.send_text(payload)

                    except Exception:
                        logger.exception(
                            "Failed to forward Voice Live event: %r",
                            event,
                        )

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
"""
@api_router.websocket("/voice/ws")
async def voice_ws(ws: WebSocket):
    await ws.accept()

    logger.info("==========================================")
    logger.info("Browser WebSocket connected")
    logger.info("==========================================")

    if not voicelive_configured():
        await ws.send_json({
            "type": "error",
            "error": {
                "message": (
                    "Voice Live is not configured. "
                    "Check VOICELIVE_ENDPOINT, "
                    "FOUNDRY_PROJECT_NAME, "
                    "FOUNDRY_AGENT_NAME, "
                    "FOUNDRY_AGENT_VERSION and Azure credentials."
                )
            }
        })
        await ws.close()
        return

    azure = None
    app_query = ws.query_params.get("app") or ws.query_params.get("app_code")
    session_state = {
        "use_agent": True,
        "current_page": "orders",
        "active_filters": {},
        "processed_calls": set(),
        "app_code": app_query
    }

    async def browser_to_azure():
        try:
            while True:
                message = await ws.receive()

                if message["type"] == "websocket.disconnect":
                    logger.info("Browser disconnected")
                    return

                # Browser messages are JSON control/signaling events.
                if message.get("text") is not None:
                    raw = message["text"]

                    try:
                        data = json.loads(raw)
                    except json.JSONDecodeError:
                        logger.warning("Invalid JSON received from browser: %s", raw[:500])
                        continue

                    event_type = data.get("type")
                    if event_type != "input_audio_buffer.append":
                        logger.info("BROWSER -> SERVER: %s", raw[:300])
                        logger.info("BROWSER -> VOICE LIVE: %s", event_type)

                    if event_type in ("close", "stop"):
                        logger.info("Browser requested close/stop")
                        return

                    # Initial session configuration.
                    if event_type == "start":
                        auto_turn = bool(data.get("auto_turn", True))
                        session_state["use_agent"] = bool(data.get("use_agent", True))
                        if data.get("app") or data.get("app_code"):
                            session_state["app_code"] = str(data.get("app") or data.get("app_code"))
                        if data.get("current_page"):
                            session_state["current_page"] = str(data.get("current_page"))
                        if data.get("active_filters"):
                            session_state["active_filters"] = dict(data.get("active_filters"))
                        session_update = _session_update(
                            auto_turn=auto_turn,
                            use_agent=session_state["use_agent"]
                        )
                        logger.info("Sending session.update to Voice Live (app=%s, use_agent=%s, page=%s, active_filters=%s)", session_state["app_code"], session_state["use_agent"], session_state["current_page"], session_state["active_filters"])
                        await azure.send(session_update)
                        continue

                    if event_type == "set_agent_mode":
                        new_mode = bool(data.get("use_agent", True))
                        session_state["use_agent"] = new_mode
                        logger.info("Updated use_agent mode to: %s", session_state["use_agent"])
                        if azure is not None:
                            try:
                                if new_mode:
                                    logger.info("Enabling Azure agent response generation")
                                    await azure.send({
                                        "type": "session.update",
                                        "session": {
                                            "turn_detection": {
                                                "type": "server_vad",
                                                "threshold": 0.5,
                                                "prefix_padding_ms": 300,
                                                "silence_duration_ms": 500,
                                                "create_response": True,
                                            }
                                        }
                                    })
                                else:
                                    logger.info("Disabling Azure agent response generation and clearing tools")
                                    await azure.send({
                                        "type": "session.update",
                                        "session": {
                                            "turn_detection": {
                                                "type": "server_vad",
                                                "threshold": 0.5,
                                                "prefix_padding_ms": 300,
                                                "silence_duration_ms": 500,
                                                "create_response": False,
                                            },
                                            "tools": []
                                        }
                                    })
                            except Exception as e:
                                logger.warning("Failed to update Azure session for agent mode: %s", e)
                        continue

                    if event_type == "filters.update":
                        session_state["active_filters"] = dict(data.get("filters", {}))
                        logger.info("Updated active_filters: %s", session_state["active_filters"])
                        continue

                    if event_type == "page.change":
                        session_state["current_page"] = str(data.get("page", "orders"))
                        session_state["active_filters"] = {}
                        logger.info("Updated current_page to: %s (cleared active_filters)", session_state["current_page"])
                        continue

                    if event_type == "command.execute":
                        cmd_text = data.get("text", "")
                        cur_p = data.get("current_page", session_state["current_page"])
                        cmd_app = data.get("app") or data.get("app_code") or session_state.get("app_code")
                        action = parse_command_internal(cmd_text, cur_p, cmd_app)
                        await ws.send_text(json.dumps({
                            "type": "ui.action",
                            "action": action
                        }))
                        continue

                    # Forward signaling and conversation events.
                    await azure.send(data)

                # We should NOT receive microphone RTP here.
                elif message.get("bytes") is not None:
                    audio_bytes = message["bytes"]
                    logger.warning(
                        "Received binary data from browser: %d bytes. "
                        "Browser audio should be WebRTC, not WebSocket.",
                        len(audio_bytes)
                    )

        except WebSocketDisconnect:
            logger.info("browser_to_azure: browser disconnected")
        except Exception:
            logger.exception("browser_to_azure failed")

    async def azure_to_browser():
        try:
            async for event in azure:
                event_type = getattr(event, "type", None) or (event.get("type") if isinstance(event, dict) else None)
                if event_type != "input_audio_buffer.append":
                    logger.info("VOICE LIVE -> SERVER: %s", event_type)

                # Useful diagnostics.
                if event_type in {
                    "input_audio_buffer.speech_started",
                    "input_audio_buffer.speech_stopped",
                    "input_audio_buffer.committed",
                    "conversation.item.input_audio_transcription.delta",
                    "conversation.item.input_audio_transcription.completed",
                    "conversation.item.input_audio_transcription.failed",
                    "response.created",
                    "response.audio_transcript.delta",
                    "response.audio_transcript.done",
                    "response.done",
                    "session.avatar.connecting",
                    "session.updated",
                    "response.output_item.done",
                    "response.function_call_arguments.done",
                }:
                    logger.info("VOICE EVENT: %s", event)

                # Intercept agent function calls (only on response.output_item.done when arguments are complete)
                item = getattr(event, "item", None) or (event.get("item") if isinstance(event, dict) else None) or {}
                item_type = getattr(item, "type", None) or (item.get("type") if isinstance(item, dict) else "")

                if event_type == "response.output_item.done" and item_type == "function_call":
                    call_id = getattr(item, "call_id", None) or (item.get("call_id") if isinstance(item, dict) else None)
                    func_name = getattr(item, "name", None) or (item.get("name") if isinstance(item, dict) else None)
                    raw_args = getattr(item, "arguments", None) or (item.get("arguments") if isinstance(item, dict) else "{}")

                    logger.info("AGENT FUNCTION CALL FINALIZED: name=%s call_id=%s args=%s (use_agent=%s)", func_name, call_id, raw_args, session_state["use_agent"])

                    if call_id and func_name and call_id not in session_state["processed_calls"]:
                        session_state["processed_calls"].add(call_id)

                        # If agent mode is unchecked / disabled:
                        if not session_state["use_agent"]:
                            logger.info("use_agent is False; suppressing agent tool execution and speech response")
                            try:
                                await azure.send({
                                    "type": "conversation.item.create",
                                    "item": {
                                        "type": "function_call_output",
                                        "call_id": call_id,
                                        "output": json.dumps({"status": "disabled", "message": "Agent actions disabled by user."})
                                    }
                                })
                                # DO NOT call response.create!
                            except Exception as ex:
                                logger.exception("Failed to close function_call_output when use_agent=False: %s", ex)
                            continue

                        # When use_agent is True:
                        try:
                            args_dict = json.loads(raw_args) if isinstance(raw_args, str) else (raw_args or {})
                        except Exception:
                            args_dict = {}

                        active_filters = session_state.get("active_filters", {})
                        tool_output, ui_action = await execute_agent_tool(
                            func_name,
                            args_dict,
                            db,
                            session_state["current_page"],
                            active_filters=active_filters,
                            app_code=session_state.get("app_code"),
                        )
                        logger.info("EXECUTED AGENT TOOL: output=%s action=%s", tool_output, ui_action)

                        # Send function call output back to Voice Live
                        try:
                            await azure.send({
                                "type": "conversation.item.create",
                                "item": {
                                    "type": "function_call_output",
                                    "call_id": call_id,
                                    "output": json.dumps(tool_output)
                                }
                            })
                            await azure.send({"type": "response.create"})
                        except Exception as ex:
                            logger.exception("Failed to send function_call_output to Azure: %s", ex)

                        # Send UI action to browser
                        try:
                            await ws.send_text(json.dumps({
                                "type": "ui.action",
                                "action": ui_action
                            }))
                        except (WebSocketDisconnect, ConnectionResetError, RuntimeError):
                            logger.info("azure_to_browser: browser disconnected during ui.action send")
                            return
                        except Exception as ex:
                            logger.exception("Failed to send ui.action to browser: %s", ex)

                # Convert SDK event -> JSON and forward to browser.
                try:
                    if isinstance(event, str):
                        payload = event
                    elif isinstance(event, bytes):
                        payload = event.decode("utf-8", errors="ignore")
                    elif hasattr(event, "model_dump"):
                        payload = json.dumps(event.model_dump(mode="json"), default=str)
                    elif hasattr(event, "as_dict"):
                        payload = json.dumps(event.as_dict(), default=str)
                    elif hasattr(event, "to_dict"):
                        payload = json.dumps(event.to_dict(), default=str)
                    else:
                        payload = json.dumps(
                            {"type": event_type or type(event).__name__, "event": str(event)},
                            default=str
                        )
                    await ws.send_text(payload)
                except (WebSocketDisconnect, ConnectionResetError, RuntimeError):
                    logger.info("azure_to_browser: browser disconnected, stopping relay")
                    return
                except Exception:
                    logger.exception("Could not forward Voice Live event")

        except Exception:
            logger.exception("azure_to_browser failed")

    try:

        # IMPORTANT:
        # New Foundry Agent mode.
        #
        # Do NOT use VOICELIVE_API_KEY.
        # ClientSecretCredential is used here.

        azure = await connect(
            endpoint=VOICELIVE_ENDPOINT,
            credential=credential,
            agent_config=agent_config,
        ).__aenter__()

        logger.info(
            "=========================================="
        )
        logger.info(
            "Connected to Azure Voice Live"
        )
        logger.info(
            "Agent: %s",
            FOUNDRY_AGENT_NAME
        )
        logger.info(
            "Project: %s",
            FOUNDRY_PROJECT_NAME
        )
        logger.info(
            "Version: %s",
            FOUNDRY_AGENT_VERSION
        )
        logger.info(
            "=========================================="
        )

        browser_task = asyncio.create_task(
            browser_to_azure()
        )

        azure_task = asyncio.create_task(
            azure_to_browser()
        )

        done, pending = await asyncio.wait(
            [browser_task, azure_task],
            return_when=asyncio.FIRST_COMPLETED
        )

        for task in pending:
            task.cancel()

        await asyncio.gather(
            *pending,
            return_exceptions=True
        )

    except WebSocketDisconnect:

        logger.info(
            "Voice WebSocket disconnected"
        )

    except Exception as e:

        logger.exception(
            "VOICE WS ERROR"
        )

        try:
            await ws.send_json({
                "type": "error",
                "error": {
                    "message": str(e)
                }
            })
        except Exception:
            pass
    finally:
        try:
            await ws.close()
        except Exception:
            pass


app.include_router(api_router)

raw_cors = os.environ.get('CORS_ORIGINS', '').strip()
if raw_cors and raw_cors != '*':
    cors_origins = [o.strip() for o in raw_cors.split(',') if o.strip()]
else:
    cors_origins = []

for default_origin in [
    "http://localhost:4200",
    "http://127.0.0.1:4200",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]:
    if default_origin not in cors_origins:
        cors_origins.append(default_origin)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await seed_data()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
