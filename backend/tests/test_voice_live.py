import asyncio
import os
import urllib.parse

from dotenv import load_dotenv
from azure.identity.aio import ClientSecretCredential
import websockets

load_dotenv()

ENDPOINT = os.environ["VOICELIVE_ENDPOINT"].rstrip("/")
API_VERSION = os.getenv("VOICELIVE_API_VERSION", "2026-04-10")

PROJECT_NAME = os.environ["FOUNDRY_PROJECT_NAME"]
AGENT_NAME = os.environ["FOUNDRY_AGENT_NAME"]
AGENT_VERSION = os.environ["FOUNDRY_AGENT_VERSION"]

TENANT_ID = os.environ["AZURE_TENANT_ID"]
CLIENT_ID = os.environ["AZURE_CLIENT_ID"]
CLIENT_SECRET = os.environ["AZURE_CLIENT_SECRET"]


async def main():

    credential = ClientSecretCredential(
        tenant_id=TENANT_ID,
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
    )

    try:
        print("Getting Entra token...")

        token = await credential.get_token(
            "https://ai.azure.com/.default"
        )

        print("Token acquired successfully")

        ws_endpoint = ENDPOINT.replace(
            "https://",
            "wss://",
            1,
        )

        params = {
            "api-version": API_VERSION,
            "agent-name": AGENT_NAME,
            "agent-project-name": PROJECT_NAME,
            "agent-version": AGENT_VERSION,
            "Authorization": f"Bearer {token.token}",
        }

        query = urllib.parse.urlencode(params)

        ws_url = (
            f"{ws_endpoint}/voice-live/realtime?{query}"
        )

        # Don't print the URL because it contains the access token.
        print("Connecting to Voice Live...")

        async with websockets.connect(
            ws_url,
        ) as ws:

            print()
            print("======================================")
            print("SUCCESS")
            print("Voice Live WebSocket connected")
            print("======================================")

            message = await asyncio.wait_for(
                ws.recv(),
                timeout=15,
            )

            print("First server event:")
            print(message)

    except Exception as e:
        print()
        print("======================================")
        print("FAILED")
        print("======================================")
        print(type(e).__name__)
        print(str(e))

    finally:
        await credential.close()


if __name__ == "__main__":
    asyncio.run(main())