# Live Avatar Web Component (`<live-avatar-popup>`)

A framework-agnostic, standalone **Web Component** (Custom Elements v1) for integrating interactive AI Avatars powered by **Azure Voice Live**, **Azure AI Foundry Agents**, and **WebRTC**.

Compatible out-of-the-box with **Angular (14–19+)**, **React**, **Vue**, **ASP.NET Core**, **.NET MAUI / Blazor**, and **vanilla HTML/JavaScript**.

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Required Backend API Service](#required-backend-api-service)
   - [Running the Backend Service](#running-the-backend-service)
   - [API Endpoints Specification](#api-endpoints-specification)
   - [Environment Variables & Secrets (`.env`)](#environment-variables--secrets-env)
3. [Configuration & Prompting (`pages_config.json`)](#configuration--prompting-pages_configjson)
   - [Multi-App Architecture (`app-code`)](#multi-app-architecture-app-code)
   - [Prompt Configuration & Context Enrichment](#prompt-configuration--context-enrichment)
   - [Configuration Schema Example](#configuration-schema-example)
4. [Component Attributes & Properties](#component-attributes--properties)
5. [Custom Events Emitted](#custom-events-emitted)
6. [Public JavaScript Methods](#public-javascript-methods)
7. [Frontend Framework Integration](#frontend-framework-integration)
   - [Angular (14–19+)](#angular-1419)
   - [React / Next.js](#react--nextjs)
   - [Plain HTML / ASP.NET / MAUI](#plain-html--aspnet--maui)
8. [Publishing to NPM](#publishing-to-npm)

---

## Architecture Overview

The Live Avatar Web Component operates as a client UI that communicates with a **Python/FastAPI Backend Service**. The backend bridges browser interactions to **Azure Voice Live** and **Azure AI Foundry Agents**:

```
┌────────────────────────────────────────────────────────┐
│                   Browser Application                  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ <live-avatar-popup app-code="cvs"                │  │
│  │                    api-url="http://localhost:8000">│  │
│  └────────────────────────┬─────────────────────────┘  │
└───────────────────────────┼────────────────────────────┘
                            │ REST (/api/pages, /api/config, /api/prompt)
                            │ WebSocket (/api/voice/ws)
                            ▼
┌────────────────────────────────────────────────────────┐
│             Backend API Service (FastAPI)              │
│  - Multi-app config loader ({app}_pages_config.json)   │
│  - System prompt provider (app + page level)           │
│  - Rule-based command parser (/api/command/execute)    │
│  - Realtime WebSocket audio & WebRTC signaling bridge  │
└───────────────────────────┬────────────────────────────┘
                            │ Azure Voice Live Realtime API
                            │ (WebSockets + WebRTC)
                            ▼
┌────────────────────────────────────────────────────────┐
│              Azure AI Foundry & Speech Cloud           │
│  - Azure Voice Live Realtime Avatar Engine (WebRTC)    │
│  - Foundry Agent (Function calling & reasoning)        │
│  - Azure Speech TTS (AvaNeural, JennyNeural, etc.)     │
└────────────────────────────────────────────────────────┘
```

The component supports two execution modes:
- **Checked Mode (`use-agent="true"`)**: Full cloud-orchestrated reasoning. User speech is processed by Azure Voice Live and your Azure Foundry Agent, executing server-side tools and streaming avatar speech/video over WebRTC.
- **Unchecked Mode (`use-agent="false"`)**: Local rule-based command parsing via `/api/command/execute`, extracting filters and routes directly from `pages_config.json`.

---

## Required Backend API Service

The `<live-avatar-popup>` element **requires a companion backend API service** running alongside it. The backend handles credentials, Azure authentication tokens, configuration resolution, and WebSockets/WebRTC signaling.

### Running the Backend Service

```powershell
# 1. Navigate to the backend directory
cd backend

# 2. Create and activate Python virtual environment
python -m venv venv
.\venv\Scripts\activate   # Windows (use `source venv/bin/activate` on Linux/macOS)

# 3. Install required Python packages
pip install -r requirements.txt

# 4. Start the FastAPI server
uvicorn server:app --reload --port 8000
```

### API Endpoints Specification

Your backend service exposes the following REST and WebSocket routes under `/api`:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/config` | Returns avatar status (`voicelive_configured`), character name, and visual style. |
| `GET` | `/api/pages?app={app_code}` | Returns list of accessible pages, routes, aliases, and search filter controls schema from `{app}_pages_config.json`. |
| `POST` | `/api/command/execute` | Processes text commands locally; accepts `{ text: string, current_page: string, app?: string }` and returns `{ type: 'navigate'|'search'|'read'|'chat', target: string, filters: object }`. |
| `WS` | `/api/voice/ws?app={app_code}` | Realtime bidirectional WebSocket bridge to Azure Voice Live. Handles session initialization (`start`), turn detection, microphone audio buffers, avatar WebRTC signaling, and tool execution. |

### Environment Variables & Secrets (`.env`)

The backend reads configuration from a `.env` file located in the `backend/` directory:

```env
# ============================================================================
# Azure Voice Live & Azure AI Foundry
# ============================================================================
VOICELIVE_ENDPOINT=https://<your-resource-name>.services.ai.azure.com
VOICELIVE_API_VERSION=2026-04-10
VOICELIVE_API_KEY=<your-azure-voicelive-api-key>

# Azure Entra ID (Service Principal Authentication)
AZURE_TENANT_ID=<your-tenant-id>
AZURE_CLIENT_ID=<your-client-id>
AZURE_CLIENT_SECRET=<your-client-secret>

# Azure Foundry Project & Agent Configuration
FOUNDRY_PROJECT_NAME=<your-project-name>
FOUNDRY_AGENT_NAME=<your-agent-name>
FOUNDRY_AGENT_VERSION=<optional-agent-version>

# ============================================================================
# Avatar & TTS Appearance Settings
# ============================================================================
AZURE_AVATAR_CHARACTER=lisa
AZURE_AVATAR_STYLE=casual-sitting
AZURE_TTS_VOICE=en-US-AvaNeural

# ============================================================================
# Database / Search Backend (Optional)
# ============================================================================
MONGO_URL=mongodb://localhost:27017
DB_NAME=enterprise_db

# Optional override for the canonical pages configuration file
# PAGES_CONFIG_PATH=./cvs_pages_config.json
```

---

## Configuration & Tool Resolution (`pages_config.json`)

### Multi-App Architecture & Tool-Time Config Resolution

The backend uses a single unified codebase to serve any frontend application embedding `<live-avatar-popup>`:

1. **Foundry Agent Instructions**:
   - The AI Agent instructions are defined and maintained directly within Azure AI Foundry Portal on your agent.
   - The Voice Live session does not send or override instructions at runtime, keeping the Foundry agent's behavior clean and predictable.
2. **Dynamic Tool Identification**:
   - When the agent invokes a function tool (e.g. `search_orders`, `filter_records`, `navigate_to_page`), the tool automatically identifies which application configuration to read based on `app_code` (e.g., `cvs_pages_config.json` for `app-code="cvs"` vs. default `pages_config.json`).
   - The tool inspects the active page controls, options, synonyms, and filter schema at runtime, queries the database, and returns the response back to the agent while emitting a `ui.action` event to the frontend.

### Configuration Schema Example

Each configuration file (`pages_config.json`, `cvs_pages_config.json`) is a clean array of page metadata objects:

```json
[
  {
    "key": "orders",
    "prefix": "order",
    "title": "Forwarding Orders",
    "route": "/forwarding/orders",
    "noun": "orders",
    "aliases": [
      "order",
      "orders",
      "purchase orders",
      "forwarding orders",
      "po"
    ],
    "hints": [
      "Show in-transit orders",
      "Ocean freight orders",
      "High priority orders"
    ],
    "controls": [
      {
        "id": "q",
        "type": "text",
        "param": "q",
        "label": "Keyword",
        "idPrefix": "ORD-",
        "idRegex": "(?:ord|po)[-\\s]?(\\d{3,})"
      },
      {
        "id": "transport_mode",
        "type": "select",
        "param": "transportMode",
        "label": "Transport Mode",
        "options": [
          { "value": "Sea", "synonyms": ["ocean", "ship", "vessel"] },
          { "value": "Air", "synonyms": ["flight", "plane", "airplane"] },
          { "value": "Road", "synonyms": ["truck", "highway"] },
          { "value": "Rail", "synonyms": ["train"] }
        ]
      },
      {
        "id": "order_status",
        "type": "select",
        "param": "orderStatus",
        "label": "Order Status",
        "options": [
          { "value": "Booked" },
          { "value": "Confirmed" },
          { "value": "In Transit", "synonyms": ["in-transit", "intransit", "transit", "on the way"] },
          { "value": "Delivered", "synonyms": ["completed", "arrived"] },
          { "value": "Cancelled", "synonyms": ["canceled", "void"] }
        ]
      },
      {
        "id": "priority",
        "type": "radio",
        "param": "priority",
        "label": "Priority",
        "options": [
          { "value": "Low" },
          { "value": "Medium" },
          { "value": "High", "synonyms": ["urgent", "critical"] }
        ]
      },
      {
        "id": "commercial_invoices_only",
        "type": "checkbox",
        "param": "commercialInvoicesOnly",
        "label": "Commercial Invoices",
        "onWords": ["with commercial invoices", "commercial invoice", "invoices"],
        "offWords": ["without commercial invoices"]
      }
    ],
    "columns": [
      { "key": "orderNo", "label": "Order #" },
      { "key": "customerName", "label": "Customer" },
      { "key": "status", "label": "Status" }
    ],
    "speak_template": "Order {orderNo}, customer {customerName}, status {status}."
  }
]
```

---

## Component Attributes & Properties

Configure `<live-avatar-popup>` directly via HTML attributes or DOM properties:

| Attribute | Type | Default | Description |
|---|---|---|---|
| `app-code` / `app` | `string` | `""` | Application identifier (e.g. `"cvs"`). Determines which `{app}_pages_config.json` and system prompt the backend loads. |
| `api-url` | `string` | `"http://localhost:8000"` | Base HTTP URL where the FastAPI backend service is running. |
| `ws-url` | `string` | Auto-derived | Custom override for WebSocket URL (defaults to `{api-url}/api/voice/ws?app={app-code}`). |
| `current-route` | `string` | `"/orders"` | The current client-side route path (e.g. `"/forwarding/orders"`). Synchronizes the avatar's context. |
| `current-page` | `string` | `"orders"` | Active page key directly. |
| `use-agent` | `boolean` | `true` | `true`: Uses Azure AI Foundry Agent (Checked Mode); `false`: Uses local rule parser (Unchecked Mode). |
| `auto-turn` | `boolean` | `true` | Enables server-side Voice Activity Detection (VAD) and auto-response generation. |
| `avatar-title` | `string` | `"Lisa AI Assistant"` | Header text displayed in the avatar popup card. |
| `poster-url` | `string` | Default portrait | Image displayed in the video box before WebRTC stream connects. |
| `start-open` | `boolean` | `false` | When `true`, automatically opens the popup upon initialization. |

---

## Custom Events Emitted

Listen to custom events dispatched by `<live-avatar-popup>` to update your host application:

```typescript
const avatar = document.querySelector('live-avatar-popup');

// 1. Navigation commanded by user voice or AI agent
avatar.addEventListener('avatar-navigate', (event: CustomEvent) => {
  const { route, pageKey, message } = event.detail;
  router.navigateByUrl(route);
});

// 2. Filter criteria commanded by user voice or AI agent
avatar.addEventListener('avatar-filter', (event: CustomEvent) => {
  const { pageKey, filters, reset, message } = event.detail;
  applyTableFilters(filters);
});

// 3. Assistant reading a row aloud
avatar.addEventListener('avatar-read', (event: CustomEvent) => {
  const { pageKey, index, row, text } = event.detail;
  highlightRowInGrid(index);
});

// 4. Connection status changes
avatar.addEventListener('avatar-status', (event: CustomEvent) => {
  const { status, isLive, error } = event.detail;
  console.log(`Avatar status: ${status} (live: ${isLive})`);
});

// 5. Chat message appended to transcript
avatar.addEventListener('avatar-message', (event: CustomEvent) => {
  const { role, text, id } = event.detail;
});
```

---

## Public JavaScript Methods

Call methods programmatically on the DOM element reference:

```typescript
const avatar = document.querySelector('live-avatar-popup');

// Feed on-screen table rows to Lisa so she can read them aloud
avatar.publishResults('orders', tableRows);

// Change active route or active page context
avatar.setCurrentRoute('/quotation/quote');
avatar.setCurrentPage('quotes');

// Send programmatic text command
avatar.sendCommand('Show high priority quotes');

// UI Controls
avatar.open();         // Open popup card
avatar.close();        // Minimize to floating action button
avatar.toggle();       // Toggle open/closed state
avatar.start();        // Initiate WebRTC and WebSocket session
avatar.stop();         // Disconnect session and release microphone
avatar.toggleAvatar(true); // Toggle video visibility
```

---

## Frontend Framework Integration

### Angular (14–19+)

#### 1. Install the Package
```bash
npm install live-avatar-element
```

#### 2. Import in Entry File (`main.ts`)
```typescript
// src/main.ts
import 'live-avatar-element'; // Registers <live-avatar-popup> custom element
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';

platformBrowserDynamic().bootstrapModule(AppModule);
```

#### 3. Enable `CUSTOM_ELEMENTS_SCHEMA`
In your `app.module.ts` (or in `@Component({ schemas: [CUSTOM_ELEMENTS_SCHEMA] })` if standalone):

```typescript
// src/app/app.module.ts
import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

@NgModule({
  declarations: [AppComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA], // <-- Allows custom HTML tags like <live-avatar-popup>
  imports: [ ... ],
  bootstrap: [AppComponent]
})
export class AppModule {}
```

#### 4. Conditional Visibility on Authentication Screens
To ensure the popup is **hidden on login, create account, and forgot-password screens** and **visible only after logging in**:

```typescript
// src/app/app.component.ts
import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { LoggedUserService } from '@centvis/features/services'; // Or your app's auth service

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
})
export class AppComponent {
  private router = inject(Router);
  protected authService = inject(LoggedUserService);
  private currentUrl = signal<string>(this.router.url || '');

  // Evaluates whether the avatar should be visible
  public readonly isAvatarVisible = computed(() => {
    const user = this.authService.state();
    const isLoggedIn = !!user && !user.isAnonymous;
    const url = (this.currentUrl() || '').toLowerCase();
    const isAuthRoute =
      url.includes('/auth') ||
      url.includes('/login') ||
      url.includes('/forgot-password') ||
      url.includes('/register');

    return isLoggedIn && !isAuthRoute;
  });

  constructor() {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.currentUrl.set(event.urlAfterRedirects || event.url);
      }
    });
  }
}
```

```html
<!-- src/app/app.component.html -->
<router-outlet></router-outlet>

@if (isAvatarVisible()) {
  <live-avatar-popup 
    app-code="cvs"
    api-url="http://localhost:8000">
  </live-avatar-popup>
}
```

---

### React / Next.js

```tsx
import React, { useEffect, useRef } from 'react';
import 'live-avatar-element';

export function App() {
  const avatarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = avatarRef.current;
    if (!el) return;

    const handleNavigate = (e: any) => {
      console.log('Navigate to:', e.detail.route);
    };

    el.addEventListener('avatar-navigate', handleNavigate);
    return () => el.removeEventListener('avatar-navigate', handleNavigate);
  }, []);

  return (
    <div>
      <live-avatar-popup
        ref={avatarRef}
        app-code="cvs"
        api-url="http://localhost:8000"
        current-route="/orders"
      />
    </div>
  );
}
```

---

### Plain HTML / ASP.NET / MAUI

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>App with Live Avatar</title>
  <!-- Load self-contained UMD bundle -->
  <script src="node_modules/live-avatar-element/dist/live-avatar-popup.umd.js"></script>
</head>
<body>
  <live-avatar-popup 
    app-code="cvs" 
    api-url="http://localhost:8000">
  </live-avatar-popup>

  <script>
    const avatar = document.querySelector('live-avatar-popup');
    avatar.addEventListener('avatar-navigate', (e) => {
      window.location.pathname = e.detail.route;
    });
  </script>
</body>
</html>
```

---

## Publishing to NPM

To publish updates of `live-avatar-element` to an npm registry or GitHub Packages:

```bash
# 1. Build distribution bundles and TypeScript definitions
npm run build

# 2. Publish package
npm publish --access public
```
