# PRD — Nexus Console (Enterprise Search + Lisa Live Avatar)

## Original Problem Statement
Single Page Application with 2 pages: Order Search and Items Search, each with pagination and filters (1 dropdown, 1 date range, 1 text box, 1 checkbox, 1 radio group, Search button), backed by 1000 seeded records each. A small persistent popup always renders an Azure **live** voice avatar (Lisa) from Azure AI Foundry, with an on/off toggle. When on, the live avatar listens to voice commands and responds via avatar video + audio (connected to an Azure Foundry agent). Push to GitHub; user configures Azure details & tests.

## User Choices
- Azure credentials via placeholder env vars (user fills them in).
- Backend proxies Azure/Foundry; follow standard Azure real-time avatar sample.
- MongoDB storage.
- Clean corporate/enterprise look.
- Build + commit locally; user connects GitHub via platform button.

## Architecture
- **Frontend**: React SPA (react-router), Tailwind + shadcn/ui, framer-motion, @phosphor-icons, `microsoft-cognitiveservices-speech-sdk` (WebRTC avatar + continuous STT).
- **Backend**: FastAPI, motor/MongoDB. Routes under `/api`.
- **Azure**: Backend relays short-lived Speech token + avatar ICE relay token; proxies Foundry agent (threads→messages→runs, api-version=v1) with API key or service-principal AAD auth.

## Core Requirements (static)
1. Order Search + Items Search pages with 6 filter controls each + pagination.
2. 1000 seeded orders + 1000 seeded items in MongoDB.
3. Persistent floating Lisa avatar popup with on/off toggle, live video/audio, voice command loop.

## Implemented (2026-08-23)
- MongoDB seeding of 1000 orders & 1000 items on startup.
- `/api/orders/search` & `/api/items/search`: dropdown, radio, checkbox, keyword, date-range filters + pagination (page_size 10).
- `/api/config`, `/api/avatar/credentials` (Speech token + ICE relay), `/api/avatar/chat` (Foundry proxy with poll loop).
- Frontend: corporate dashboard (Chivo/IBM Plex Sans), reusable FilterBar/ResultsTable/PaginationBar, two pages, top nav.
- LisaAvatar floating popup: FAB → glass popup, power switch, live video/audio via Speech SDK WebRTC, continuous STT → intent router → avatar speech; command box; graceful "not configured" states.
- **Barge-in**: recognizer stays live while Lisa speaks; a new utterance calls stopSpeakingAsync() to cut her off, then processes the command.
- **Voice Search Actions**: parseCommand (lib/voiceCommands.js) classifies utterances into navigate / search / chat. Search commands set status/priority/category/condition/paid/in-stock/keyword/pagination/reset filters and drive the on-screen table via a pub/sub bus (lib/voiceBus.js). Navigation commands ("go to Items Search") route between pages and keep listening. Command box drives the UI even before Azure is configured.
- Backend & frontend tested (iteration_1 100%, iteration_2 voice UI 100%). Committed locally.

## Backlog / Remaining
- **P0 (user action)**: Fill Azure env vars in `/app/backend/.env` to enable the live avatar; verify WebRTC (allow UDP 3478 / TCP 443 to relay.communication.microsoft.com).
- **P1**: Barge-in / echo cancellation while avatar speaks; session reconnect before Azure 30-min limit.
- **P2**: Column sorting, CSV export, saved filter presets, reproducible seed (random.seed).

## Next Tasks
- Await user's Azure config + testing feedback; then wire real-time verification and any UX tweaks.

## Config-Driven Architecture (2026-08-23)
- Single registry `frontend/src/config/pages.jsx` (`PAGES`) defines every page: route, aliases, controls (text/select/radio/checkbox/daterange), table columns, `speakRow`, and hint chips.
- Generic rendering: `pages/SearchPage.jsx` + `components/DynamicFilterBar.jsx` + `lib/useSearch.js` render any page from config; `App.js` & `Navbar.jsx` generate routes/links from `PAGES`.
- Config-driven avatar: `lib/voiceCommands.js::parseCommand` analyzes `PAGES` to detect target page (alias weight 3, control-option words weight 2), extract filters per control, and build read-out/confirmation text. Adding a page (+ its backend endpoint) auto-extends navigation, search, read-out and hints with no parser/UI changes. See `/app/ADDING_A_PAGE.md`.
- Verified 100% (iteration_4): dynamic filters, pagination, cross-page voice auto-navigation ("electronics in stock" from /orders → /items), read-out, per-page hints.

## Azure Voice Live Migration (2026-08-26)
- Replaced the old approach (Speech-avatar SDK `AvatarSynthesizer` + classic Foundry threads/messages/runs REST) with the **Azure Voice Live API** connecting to a **Microsoft Foundry AGENT**.
- Backend: WebSocket broker `/api/voice/ws` mints an Entra token (scope `https://ai.azure.com/.default`) or uses `VOICELIVE_API_KEY`, opens the upstream `wss://<VOICELIVE_ENDPOINT>/voice-live/realtime` with query params `api-version` + `agent-project-name` + `agent-id`/`agent-name` + `agent-version`, injects the avatar `session.update` (character lisa, `output_protocol: webrtc`), and relays browser↔Azure (incl. `session.avatar.connect` SDP).
- Frontend: LisaAvatar uses a WebSocket + `RTCPeerConnection` (mic track + `video recvonly`), base64 SDP offer/answer per Voice Live signalling; no Speech SDK.
- New env vars: `VOICELIVE_ENDPOINT`, `VOICELIVE_API_VERSION`, `VOICELIVE_API_KEY`, `FOUNDRY_PROJECT_NAME`, `FOUNDRY_AGENT_ID`, `FOUNDRY_AGENT_NAME`, `FOUNDRY_AGENT_VERSION` (+ AAD triplet). Removed `/api/avatar/chat` & `/api/avatar/credentials`.
- Verified 100% (iteration_6): code migration confirmed, graceful WS error when unconfigured, search regression, config-driven command box/hints intact. Live WebRTC/agent path requires user's Azure keys (code-level verified only).
