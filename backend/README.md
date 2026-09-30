# Azure Live Avatar - Backend

A FastAPI-based Python backend that orchestrates the Azure Voice Live Agent sessions and provides a highly configurable natural language command parser.

## Architecture

*   **FastAPI Framework**: Provides high-performance REST APIs for the frontend applications and the Web Component.
*   **Azure Agent Integration**: Manages the connection to Azure AI Foundry Agents via WebRTC.
*   **Config-Driven Parsing (`pages_config.py` & `cvs_pages_config.json`)**: A robust, application-agnostic engine that parses natural language ("show me urgent quotes from Shanghai") into structured UI actions based purely on JSON configuration. 

## Key Features

1.  **Direct API Mode**: Can parse commands without hitting an LLM using the deterministic `pages_config.py` engine.
2.  **App-Specific Overrides**: Uses `create_request_triggers` in the JSON config to allow different host applications to define their own custom voice triggers (e.g., "create a quote" vs "book a shipment").
3.  **Authentication & Sessions**: Manages secure token exchange for Azure WebRTC connections.

## Screenshots

*(Placeholder for Backend API / Swagger UI screenshot - replace with actual image path)*
`![Backend Swagger UI](docs/screenshots/backend-swagger.png)`

## Setup and Running

1.  Create a virtual environment: `python -m venv .venv`
2.  Activate the environment: `.\.venv\Scripts\activate` (Windows) or `source .venv/bin/activate` (Mac/Linux)
3.  Install dependencies: `pip install -r requirements.txt`
4.  Configure environment variables in `.env` (Azure endpoints, keys, etc.).
5.  Run the server: `uvicorn server:app --reload --port 8000`

## Running Tests

Run the test suite using `pytest`:
```bash
pytest tests/ -v
```
