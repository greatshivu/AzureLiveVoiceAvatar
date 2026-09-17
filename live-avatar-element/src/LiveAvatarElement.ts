import { AVATAR_STYLES } from "./styles/avatarStyles";
import { ICONS } from "./icons/svgIcons";
import { AvatarClient, CommandAction, PageConfig } from "./api/avatarClient";
import { createMicrophoneSession, MicSession } from "./audio/audioUtils";

const DEFAULT_POSTER =
  "https://images.unsplash.com/photo-1506863530036-1efeddceb993?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2Mzl8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjB3b21hbiUyMHBvcnRyYWl0JTIwc3R1ZGlvfGVufDB8fHx8MTc4NzUxMzIwMHww&ixlib=rb-4.1.0&q=85";

const STATUS_TEXT: Record<string, string> = {
  idle: "Avatar is off",
  connecting: "Connecting to Lisa…",
  negotiating: "Starting video…",
  live: "Live — speak or type",
  error: "Something went wrong",
};

export class LiveAvatarElement extends HTMLElement {
  public static get observedAttributes(): string[] {
    return [
      "api-url",
      "ws-url",
      "current-route",
      "current-page",
      "use-agent",
      "auto-turn",
      "avatar-title",
      "poster-url",
      "start-open",
      "theme",
      "position",
      "app",
      "app-code",
    ];
  }

  private client: AvatarClient;
  private root: ShadowRoot;

  // State
  private appCode: string = "";
  private expanded: boolean = false;
  private avatarOn: boolean = false;
  private status: "idle" | "connecting" | "negotiating" | "live" | "error" = "idle";
  private autoTurn: boolean = true;
  private useAgent: boolean = true;
  private currentRoute: string = "/orders";
  private currentPage: string = "orders";
  private avatarTitle: string = "Lisa AI Assistant";
  private posterUrl: string = DEFAULT_POSTER;
  private customWsUrl: string = "";
  private activeFilters: Record<string, any> = {};
  private messages: Array<{ role: "user" | "assistant"; text: string; id: number }> = [];

  // Media & Network
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private micSession: MicSession | null = null;
  private peerMicStream: MediaStream | null = null;
  private unloadListener: (() => void) | null = null;

  // DOM Elements
  private fabBtn!: HTMLButtonElement;
  private fabDot!: HTMLElement;
  private popupEl!: HTMLElement;
  private statusDot!: HTMLElement;
  private statusTextEl!: HTMLElement;
  private titleEl!: HTMLElement;
  private powerToggle!: HTMLInputElement;
  private autoTurnCheck!: HTMLInputElement;
  private agentModeCheck!: HTMLInputElement;
  private agentBadge!: HTMLElement;
  private videoEl!: HTMLVideoElement;
  private audioEl!: HTMLAudioElement;
  private posterImg!: HTMLImageElement;
  private posterWrapper!: HTMLElement;
  private overlayStatus!: HTMLElement;
  private overlayStatusText!: HTMLElement;
  private liveBadge!: HTMLElement;
  private transcriptBox!: HTMLElement;
  private hintsBox!: HTMLElement;
  private textInput!: HTMLInputElement;
  private sendBtn!: HTMLButtonElement;
  private micIconWrap!: HTMLElement;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.client = new AvatarClient("http://localhost:8000");
  }

  public connectedCallback() {
    this.render();
    this.bindEvents();
    this.initLifecycleGuards();
    this.loadBackendData();

    if (this.hasAttribute("start-open")) {
      this.open();
    }
  }

  public disconnectedCallback() {
    this.stop();
    if (this.unloadListener) {
      window.removeEventListener("beforeunload", this.unloadListener);
      window.removeEventListener("pagehide", this.unloadListener);
      this.unloadListener = null;
    }
  }

  public attributeChangedCallback(name: string, oldVal: string | null, newVal: string | null) {
    if (oldVal === newVal) return;

    switch (name) {
      case "api-url":
        if (newVal) {
          this.client.setApiUrl(newVal);
          this.loadBackendData();
        }
        break;
      case "ws-url":
        this.customWsUrl = newVal || "";
        break;
      case "current-route":
        if (newVal) this.setCurrentRoute(newVal);
        break;
      case "current-page":
        if (newVal) this.setCurrentPage(newVal);
        break;
      case "use-agent":
        this.useAgent = newVal !== "false";
        if (this.agentModeCheck) this.agentModeCheck.checked = this.useAgent;
        this.updateAgentBadge();
        break;
      case "auto-turn":
        this.autoTurn = newVal !== "false";
        if (this.autoTurnCheck) this.autoTurnCheck.checked = this.autoTurn;
        break;
      case "avatar-title":
        this.avatarTitle = newVal || "Lisa AI Assistant";
        if (this.titleEl) this.titleEl.textContent = this.avatarTitle;
        break;
      case "poster-url":
        this.posterUrl = newVal || DEFAULT_POSTER;
        if (this.posterImg) this.posterImg.src = this.posterUrl;
        break;
      case "start-open":
        if (newVal !== null) this.open();
        break;
      case "app":
      case "app-code":
        this.appCode = newVal || "";
        this.client.fetchPages(this.appCode).then((pages) => {
          if (pages.length > 0) {
            const matching = this.client.getPageByRoute(this.currentRoute);
            if (matching) this.currentPage = matching.key;
            this.updateHints();
          }
        });
        break;
    }
  }

  // =========================================================================
  // Public Methods for Host Applications (Angular, React, Vue, ASP.NET, MAUI)
  // =========================================================================

  /**
   * Supply the on-screen table or grid rows so Lisa can read them aloud.
   * Call this whenever your grid/table loads or updates rows.
   */
  public publishResults(pageKey: string, rows: any[]) {
    this.client.publishResults(pageKey, rows);
  }

  /**
   * Update the active route path from the host router (e.g. Angular Router).
   */
  public setCurrentRoute(route: string) {
    this.currentRoute = route;
    const p = this.client.getPageByRoute(route);
    if (p) {
      this.currentPage = p.key;
      this.updateHints();
    }
  }

  /**
   * Directly update the active page key (e.g. 'orders' or 'items').
   */
  public setCurrentPage(pageKey: string) {
    this.currentPage = pageKey;
    const p = this.client.getPageByKey(pageKey);
    if (p) {
      this.currentRoute = p.route;
      this.updateHints();
    }
  }

  /**
   * Programmatically send a command to the avatar (voice or text).
   */
  public sendCommand(text: string) {
    this.handleUserUtterance(text);
  }

  /**
   * Synchronize the on-screen active search/filter parameters with the avatar.
   * This ensures agent actions know current filter state and do not query unconstrained records.
   */
  public setActiveFilters(filters: Record<string, any>) {
    this.activeFilters = { ...(filters || {}) };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "filters.update",
          filters: this.activeFilters,
        })
      );
    }
  }

  public open() {
    this.expanded = true;
    this.popupEl.classList.remove("hidden");
    this.popupEl.classList.add("visible");
    this.fabBtn.style.display = "none";
  }

  public close() {
    this.expanded = false;
    this.popupEl.classList.remove("visible");
    this.popupEl.classList.add("hidden");
    this.fabBtn.style.display = "flex";
  }

  public toggle() {
    if (this.expanded) this.close();
    else this.open();
  }

  public start() {
    this.toggleAvatar(true);
  }

  public stop() {
    this.toggleAvatar(false);
  }

  public toggleAvatar(on: boolean) {
    this.avatarOn = on;
    if (this.powerToggle) this.powerToggle.checked = on;

    if (on) {
      this.startAvatar();
    } else {
      this.stopAvatar();
    }
  }

  // =========================================================================
  // Internal Rendering & DOM Setup
  // =========================================================================

  private render() {
    this.root.innerHTML = `
      <style>${AVATAR_STYLES}</style>

      <!-- Floating Action Button -->
      <button class="avatar-fab" data-testid="lisa-toggle-fab" aria-label="Open Lisa AI Assistant">
        ${ICONS.sparkle}
        <span class="fab-live-dot" style="display: none;"></span>
      </button>

      <!-- Popup Container -->
      <div class="avatar-popup hidden" data-testid="lisa-popup">
        <!-- Header -->
        <div class="popup-header">
          <div class="header-left">
            <span class="status-dot" data-testid="lisa-status-dot"></span>
            <div>
              <div class="header-title">${this.avatarTitle}</div>
              <div class="header-status">${STATUS_TEXT[this.status]}</div>
            </div>
          </div>
          <div class="header-actions">
            <label class="switch-label" title="Toggle Avatar Power">
              <input type="checkbox" class="power-toggle" data-testid="lisa-power-switch">
              <span class="switch-slider"></span>
            </label>
            <button class="close-btn" data-testid="lisa-close-btn" aria-label="Close Assistant">
              ${ICONS.close}
            </button>
          </div>
        </div>

        <!-- Options Toolbar -->
        <div class="popup-toolbar">
          <div class="toolbar-row">
            <input type="checkbox" id="autoturn-check" data-testid="lisa-autoturn-checkbox" ${this.autoTurn ? "checked" : ""}>
            <label for="autoturn-check">Auto turn-taking (barge-in)</label>
          </div>
          <div class="toolbar-row">
            <input type="checkbox" id="agentmode-check" data-testid="lisa-agent-mode-checkbox" ${this.useAgent ? "checked" : ""}>
            <label for="agentmode-check">
              <span>Use Agent for Actions</span>
              <span class="badge ${this.useAgent ? "badge-agent" : "badge-direct"}">
                ${this.useAgent ? "AI Agent" : "Direct API"}
              </span>
            </label>
          </div>
        </div>

        <!-- Video Frame -->
        <div class="video-container">
          <video class="avatar-video" data-testid="lisa-video" autoplay playsinline muted></video>
          <audio autoplay></audio>

          <!-- Poster / Offline state -->
          <div class="video-poster-wrapper">
            <img class="poster-img" src="${this.posterUrl}" alt="Avatar Poster">
            <div class="poster-overlay">
              <p class="poster-title">Toggle on to go live with Lisa</p>
              <p class="poster-sub">Azure Voice Live avatar</p>
            </div>
          </div>

          <!-- Connecting overlay -->
          <div class="overlay-status" style="display: none;">
            ${ICONS.waveform}
            <span class="overlay-status-text">Connecting to Lisa…</span>
          </div>

          <!-- Live badge -->
          <div class="live-badge" style="display: none;">
            <span class="live-badge-dot"></span>
            <span>LIVE</span>
          </div>
        </div>

        <!-- Transcript Messages Area -->
        <div class="transcript-box" data-testid="lisa-transcript">
          <p class="transcript-empty">Turn on the avatar and speak, or type a command below.</p>
        </div>

        <!-- Suggestion Hints -->
        <div class="hints-container" data-testid="lisa-hints">
          <span class="hints-label">Try saying…</span>
          <div class="hints-chips" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>
        </div>

        <!-- Input Bar -->
        <div class="input-bar">
          <span class="mic-status-icon">${ICONS.microphone}</span>
          <input type="text" class="text-input" data-testid="lisa-text-input" placeholder="e.g. show delivered orders">
          <button class="send-btn" data-testid="lisa-send-btn" aria-label="Send command">
            ${ICONS.send}
          </button>
        </div>
      </div>
    `;

    // Query elements
    this.fabBtn = this.root.querySelector(".avatar-fab")!;
    this.fabDot = this.root.querySelector(".fab-live-dot")!;
    this.popupEl = this.root.querySelector(".avatar-popup")!;
    this.statusDot = this.root.querySelector(".status-dot")!;
    this.statusTextEl = this.root.querySelector(".header-status")!;
    this.titleEl = this.root.querySelector(".header-title")!;
    this.powerToggle = this.root.querySelector(".power-toggle")!;
    this.autoTurnCheck = this.root.querySelector("#autoturn-check")!;
    this.agentModeCheck = this.root.querySelector("#agentmode-check")!;
    this.agentBadge = this.root.querySelector(".badge")!;
    this.videoEl = this.root.querySelector(".avatar-video")!;
    this.audioEl = this.root.querySelector("audio")!;
    this.posterImg = this.root.querySelector(".poster-img")!;
    this.posterWrapper = this.root.querySelector(".video-poster-wrapper")!;
    this.overlayStatus = this.root.querySelector(".overlay-status")!;
    this.overlayStatusText = this.root.querySelector(".overlay-status-text")!;
    this.liveBadge = this.root.querySelector(".live-badge")!;
    this.transcriptBox = this.root.querySelector(".transcript-box")!;
    this.hintsBox = this.root.querySelector(".hints-chips")!;
    this.textInput = this.root.querySelector(".text-input")!;
    this.sendBtn = this.root.querySelector(".send-btn")!;
    this.micIconWrap = this.root.querySelector(".mic-status-icon")!;
  }

  private bindEvents() {
    this.fabBtn.addEventListener("click", () => this.open());

    const closeBtn = this.root.querySelector(".close-btn")!;
    closeBtn.addEventListener("click", () => {
      this.toggleAvatar(false);
      this.close();
    });

    this.powerToggle.addEventListener("change", (e) => {
      this.toggleAvatar((e.target as HTMLInputElement).checked);
    });

    this.autoTurnCheck.addEventListener("change", (e) => {
      this.autoTurn = (e.target as HTMLInputElement).checked;
    });

    this.agentModeCheck.addEventListener("change", (e) => {
      this.useAgent = (e.target as HTMLInputElement).checked;
      this.updateAgentBadge();
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "set_agent_mode", use_agent: this.useAgent }));
      }
    });

    this.sendBtn.addEventListener("click", () => this.submitInput());
    this.textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.submitInput();
    });
  }

  private initLifecycleGuards() {
    this.unloadListener = () => {
      this.stop();
    };
    window.addEventListener("beforeunload", this.unloadListener);
    window.addEventListener("pagehide", this.unloadListener);
  }

  private async loadBackendData() {
    try {
      const cfg = await this.client.fetchConfig();
      if (cfg.avatar_name) {
        this.avatarTitle = cfg.avatar_name;
        if (this.titleEl) this.titleEl.textContent = this.avatarTitle;
      }
      const pages = await this.client.fetchPages(this.appCode);
      if (pages.length > 0) {
        const matching = this.client.getPageByRoute(this.currentRoute);
        if (matching) this.currentPage = matching.key;
        this.updateHints();
      }
    } catch (err) {
      console.warn("[LiveAvatarElement] Backend init failed:", err);
    }
  }

  private updateAgentBadge() {
    if (!this.agentBadge) return;
    if (this.useAgent) {
      this.agentBadge.className = "badge badge-agent";
      this.agentBadge.textContent = "AI Agent";
    } else {
      this.agentBadge.className = "badge badge-direct";
      this.agentBadge.textContent = "Direct API";
    }
  }

  private updateStatus(status: "idle" | "connecting" | "negotiating" | "live" | "error", errorMsg?: string) {
    this.status = status;
    const isLive = status === "live";
    const isConnecting = status === "connecting" || status === "negotiating";

    if (this.statusTextEl) {
      this.statusTextEl.textContent = errorMsg || STATUS_TEXT[status] || status;
    }

    if (this.statusDot) {
      this.statusDot.className = `status-dot ${status}`;
    }

    if (this.fabDot) {
      this.fabDot.style.display = isLive ? "block" : "none";
    }

    if (this.liveBadge) {
      this.liveBadge.style.display = isLive ? "flex" : "none";
    }

    if (this.overlayStatus) {
      this.overlayStatus.style.display = isConnecting ? "flex" : "none";
      if (this.overlayStatusText) {
        this.overlayStatusText.textContent = STATUS_TEXT[status];
      }
    }

    if (this.posterWrapper) {
      this.posterWrapper.style.display = isLive ? "none" : "flex";
    }

    if (this.videoEl) {
      if (isLive) {
        this.videoEl.classList.add("active");
      } else {
        this.videoEl.classList.remove("active");
      }
    }

    if (this.micIconWrap) {
      this.micIconWrap.innerHTML = this.avatarOn ? ICONS.microphoneFill : ICONS.microphone;
      if (this.avatarOn) {
        this.micIconWrap.classList.add("active");
      } else {
        this.micIconWrap.classList.remove("active");
      }
    }

    this.dispatchEvent(
      new CustomEvent("avatar-status", {
        detail: { status, isLive, error: errorMsg },
        bubbles: true,
        composed: true,
      })
    );
  }

  private updateHints() {
    if (!this.hintsBox) return;
    const cur = this.client.getPageByKey(this.currentPage);
    const pages = this.client.getPages();

    const hints: string[] = [
      ...(cur?.hints || []),
      ...pages.filter((p) => p.key !== cur?.key).map((p) => `Go to ${p.title}`),
    ];

    this.hintsBox.innerHTML = "";
    hints.forEach((hint) => {
      const btn = document.createElement("button");
      btn.className = "hint-chip";
      btn.textContent = hint;
      btn.addEventListener("click", () => this.handleUserUtterance(hint));
      this.hintsBox.appendChild(btn);
    });
  }

  private pushMessage(role: "user" | "assistant", text: string) {
    const id = Date.now() + Math.random();
    this.messages.push({ role, text, id });
    if (this.messages.length > 25) this.messages.shift();

    const empty = this.transcriptBox.querySelector(".transcript-empty");
    if (empty) empty.remove();

    const bubble = document.createElement("div");
    bubble.className = `msg-bubble ${role === "user" ? "msg-user" : "msg-assistant"}`;
    bubble.textContent = text;
    this.transcriptBox.appendChild(bubble);

    this.transcriptBox.scrollTop = this.transcriptBox.scrollHeight;

    this.dispatchEvent(
      new CustomEvent("avatar-message", {
        detail: { role, text, id },
        bubbles: true,
        composed: true,
      })
    );
  }

  private showError(msg: string) {
    const err = document.createElement("div");
    err.className = "error-banner";
    err.innerHTML = `${ICONS.warning}<span>${msg}</span>`;
    this.transcriptBox.appendChild(err);
    this.transcriptBox.scrollTop = this.transcriptBox.scrollHeight;
  }

  private submitInput() {
    const val = this.textInput.value.trim();
    if (!val) return;
    this.textInput.value = "";
    this.handleUserUtterance(val);
  }

  // =========================================================================
  // Voice Live WebSocket & WebRTC Streaming Engine
  // =========================================================================

  private async startAvatar() {
    this.updateStatus("connecting");

    const wsUrl = this.customWsUrl || this.client.getWsUrl(this.appCode);
    console.log("[LiveAvatarElement] Connecting to Voice Live WebSocket:", wsUrl);

    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "start",
            auto_turn: this.autoTurn,
            use_agent: this.useAgent,
            current_page: this.currentPage,
            active_filters: this.activeFilters,
            app: this.appCode,
          })
        );
      };

      ws.onmessage = (evt) => {
        this.handleServerEvent(evt.data);
      };

      ws.onerror = (err) => {
        console.error("[LiveAvatarElement] WebSocket error:", err);
        this.updateStatus("error", "Could not reach Voice Live service.");
        this.showError("Could not reach Voice Live service. Ensure backend is running.");
      };

      ws.onclose = () => {
        if (this.avatarOn) {
          this.updateStatus("idle");
        }
      };
    } catch (e: any) {
      this.updateStatus("error", e?.message || "Connection failed");
    }
  }

  private stopAvatar() {
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: "close" }));
        }
        this.ws.close(1000, "User stopped avatar");
      } catch (_) {}
      this.ws = null;
    }

    if (this.pc) {
      try {
        this.pc.close();
      } catch (_) {}
      this.pc = null;
    }

    if (this.micSession) {
      try {
        this.micSession.stop();
      } catch (_) {}
      this.micSession = null;
    }

    if (this.peerMicStream) {
      try {
        this.peerMicStream.getTracks().forEach((t) => t.stop());
      } catch (_) {}
      this.peerMicStream = null;
    }

    if (this.videoEl) this.videoEl.srcObject = null;
    if (this.audioEl) this.audioEl.srcObject = null;

    this.updateStatus("idle");
  }

  private async setupWebRTC(session: any) {
    try {
      this.updateStatus("negotiating");
      const iceServers = session?.avatar?.ice_servers || session?.ice_servers || [];
      const pc = new RTCPeerConnection({ iceServers });
      this.pc = pc;

      pc.onconnectionstatechange = async () => {
        console.log("[LiveAvatarElement] WebRTC connectionState:", pc.connectionState);
        if (pc.connectionState === "connected") {
          this.updateStatus("live");
          await this.startMicrophoneCapture();
        } else if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected" ||
          pc.connectionState === "closed"
        ) {
          if (this.avatarOn) {
            this.updateStatus("error", "WebRTC connection lost.");
          }
        }
      };

      pc.ontrack = (event) => {
        const stream = event.streams?.[0];
        if (!stream) return;

        if (event.track.kind === "video" && this.videoEl) {
          this.videoEl.srcObject = stream;
          this.videoEl.play().catch((err) => console.warn("Video autoplay blocked:", err));
        }
        if (event.track.kind === "audio" && this.audioEl) {
          this.audioEl.srcObject = stream;
          this.audioEl.play().catch((err) => console.warn("Audio autoplay blocked:", err));
        }
      };

      // Add microphone tracks to PeerConnection
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        });
        this.peerMicStream = micStream;
        for (const track of micStream.getAudioTracks()) {
          pc.addTrack(track, micStream);
        }
      } catch (err) {
        console.warn("[LiveAvatarElement] WebRTC mic track capture warning:", err);
      }

      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait for ICE gathering to complete
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") return resolve();
        const check = () => {
          if (pc.iceGatheringState === "complete") {
            pc.removeEventListener("icegatheringstatechange", check);
            resolve();
          }
        };
        pc.addEventListener("icegatheringstatechange", check);
        setTimeout(resolve, 2500);
      });

      const localSdp = pc.localDescription?.sdp;
      if (!localSdp) throw new Error("Could not generate WebRTC offer SDP");

      const packed = btoa(JSON.stringify({ type: "offer", sdp: localSdp }));
      this.ws?.send(JSON.stringify({ type: "session.avatar.connect", client_sdp: packed }));
    } catch (err: any) {
      console.error("[LiveAvatarElement] setupWebRTC error:", err);
      this.updateStatus("error", err?.message || "WebRTC setup failed");
    }
  }

  private async startMicrophoneCapture() {
    if (this.micSession) return;
    try {
      this.micSession = await createMicrophoneSession((base64PCM16) => {
        if (!this.avatarOn || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(
          JSON.stringify({
            type: "input_audio_buffer.append",
            audio: base64PCM16,
          })
        );
      });
    } catch (err) {
      console.warn("[LiveAvatarElement] Microphone PCM streaming could not start:", err);
    }
  }

  private async handleServerEvent(raw: string) {
    let event: any;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }

    switch (event.type) {
      case "session.updated":
        await this.setupWebRTC(event.session);
        break;

      case "session.avatar.connecting":
        if (event.server_sdp && this.pc) {
          try {
            const answer = JSON.parse(atob(event.server_sdp));
            await this.pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });
            this.updateStatus("live");
          } catch (err) {
            console.error("[LiveAvatarElement] Remote SDP failed:", err);
            this.updateStatus("error", "Avatar SDP negotiation failed.");
          }
        }
        break;

      case "ui.action":
        if (event.action) {
          this.executeResolvedAction(event.action);
        }
        break;

      case "conversation.item.input_audio_transcription.completed":
        if (event.transcript) {
          this.pushMessage("user", event.transcript);
          if (!this.useAgent) {
            // Direct API mode (unchecked)
            this.client
              .executeInternalCommand(event.transcript, this.currentPage, this.appCode)
              .then((action) => {
                if (action) this.executeResolvedAction(action);
              })
              .catch(() => this.runCommandFallback(event.transcript));
          }
        }
        break;

      case "response.audio_transcript.done":
        if (event.transcript && this.useAgent) {
          this.pushMessage("assistant", event.transcript);
        }
        break;

      case "error":
        this.updateStatus("error", event.error?.message || "Voice Live error");
        this.showError(event.error?.message || "Voice Live error");
        break;
    }
  }

  // =========================================================================
  // Command Execution & Event Dispatching to Host Application
  // =========================================================================

  private handleUserUtterance(text: string) {
    const t = text.trim();
    if (!t) return;
    this.pushMessage("user", t);

    if (this.useAgent) {
      if (this.avatarOn && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: { type: "message", role: "user", content: [{ type: "input_text", text: t }] },
          })
        );
        this.ws.send(JSON.stringify({ type: "response.create" }));
      } else {
        this.runCommandFallback(t);
      }
    } else {
      // Direct API mode
      this.client
        .executeInternalCommand(t, this.currentPage, this.appCode)
        .then((action) => {
          if (action) this.executeResolvedAction(action);
        })
        .catch(() => this.runCommandFallback(t));
    }
  }

  private async runCommandFallback(text: string) {
    try {
      const action = await this.client.executeInternalCommand(text, this.currentPage, this.appCode);
      if (action && action.type && action.type !== "chat") {
        this.executeResolvedAction(action);
        return;
      }
    } catch (_) {}

    const localAction = this.client.parseCommandLocal(text, this.currentPage);
    if (localAction.type !== "chat") {
      this.executeResolvedAction(localAction);
    } else if (!this.avatarOn) {
      this.pushMessage("assistant", "Turn on Lisa to speak with the agent, or try a search/navigation command.");
    }
  }

  private executeResolvedAction(action: CommandAction) {
    if (!action) return;
    const cur = this.currentPage;
    const target = action.target || cur;
    const page = this.client.getPageByKey(target);

    // 1. Generic action event
    this.dispatchEvent(
      new CustomEvent("avatar-action", {
        detail: action,
        bubbles: true,
        composed: true,
      })
    );

    if (action.type === "navigate") {
      const route = page?.route || `/${target}`;
      this.setCurrentPage(target);
      const msg = action.message || `Opening ${page?.title || target}.`;
      this.pushMessage("assistant", msg);

      // Specific navigate event for Angular Router / browser navigation
      this.dispatchEvent(
        new CustomEvent("avatar-navigate", {
          detail: { route, pageKey: target, message: msg },
          bubbles: true,
          composed: true,
        })
      );
    } else if (action.type === "search") {
      const route = page?.route || `/${target}`;
      if (target !== cur) {
        this.setCurrentPage(target);
        this.dispatchEvent(
          new CustomEvent("avatar-navigate", {
            detail: { route, pageKey: target, message: `Opening ${page?.title || target}.` },
            bubbles: true,
            composed: true,
          })
        );
      }
      const desc = this.client.describeSearch(action, page);
      this.pushMessage("assistant", action.message || desc);

      // Specific filter event for grid / table components
      this.dispatchEvent(
        new CustomEvent("avatar-filter", {
          detail: {
            pageKey: target,
            filters: action.filters || {},
            page: action.page,
            reset: action.reset || false,
            message: action.message || desc,
          },
          bubbles: true,
          composed: true,
        })
      );
    } else if (action.type === "read") {
      this.readTopRow(action, target);
    } else if (action.message) {
      this.pushMessage("assistant", action.message);
    }
  }

  private async readTopRow(action: CommandAction, targetKey: string) {
    let rows = this.client.getResults(targetKey);
    for (let i = 0; i < 15 && rows.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 200));
      rows = this.client.getResults(targetKey);
    }

    if (!rows.length) {
      this.pushMessage("assistant", "There are no results on screen to read. Try searching first.");
      return;
    }

    const idx = (action.index ?? 0) < 0 ? rows.length - 1 : Math.min(action.index ?? 0, rows.length - 1);
    const row = rows[idx];
    const page = this.client.getPageByKey(targetKey);
    const text = this.client.formatSpeakRow(row, page);

    this.pushMessage("assistant", text);

    this.dispatchEvent(
      new CustomEvent("avatar-read", {
        detail: { pageKey: targetKey, index: idx, row, text },
        bubbles: true,
        composed: true,
      })
    );
  }
}
