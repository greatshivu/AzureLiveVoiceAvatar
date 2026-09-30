# Azure Live Avatar

An enterprise-ready AI Avatar integration platform that brings interactive, voice-driven AI avatars to your web applications using **Azure Voice Live**, **Azure AI Foundry Agents**, and **WebRTC**.

## Architecture Overview

The project is structured as a monorepo containing several interconnected components:

*   **[`live-avatar-element/`](./live-avatar-element/README.md)**: A framework-agnostic Web Component (`<live-avatar-popup>`) that renders the 3D avatar, handles WebRTC streaming with Azure, manages microphone input, and exposes a clean event-driven API.
*   **[`backend/`](./backend/README.md)**: A FastAPI Python backend that acts as the orchestration layer. It manages Azure agent sessions, parses natural language into UI commands using a config-driven engine (`pages_config.py` and `cvs_pages_config.json`), and provides REST endpoints.
*   **[`a-frontend/`](./a-frontend/README.md)**: An Angular 18 application demonstrating how to integrate and use the `<live-avatar-popup>` web component within an Angular ecosystem.
*   **[`frontend/`](./frontend/README.md)**: A React application demonstrating how to integrate and use the `<live-avatar-popup>` web component within a React ecosystem.

## Screenshots

### Live Avatar Element UI
`![Live Avatar UI](docs/screenshots/live-avatar-ui.png)`

### Live Avatar Element UI enabled with microphone access
`![Live Avatar UI](docs/screenshots/live-avatar-ui-enabled.png)`

### Live Avatar Element UI enabled with microphone access Maximized
`![Live Avatar UI](docs/screenshots/live-avatar-ui-enabled-max.png)`

### Application Integration
`![App Integration](docs/screenshots/app-integration.png)`

## Quick Start

1.  **Backend**: Navigate to `backend/`, install requirements via `pip install -r requirements.txt`, configure `.env`, and start the FastAPI server with `uvicorn server:app --reload`.
2.  **Avatar Element**: Navigate to `live-avatar-element/`, run `npm install`, and `npm run build` to compile the web component.
3.  **Frontend (Angular or React)**: 
    *   For Angular: Navigate to `a-frontend/`, run `npm install`, and start with `ng serve`.
    *   For React: Navigate to `frontend/`, run `npm install`, and start with `npm start`.

See the respective `README.md` files in each directory for detailed instructions and configuration options.
