/**
 * Scoped Shadow DOM CSS Styles for the Live Avatar Web Component.
 * Self-contained, responsive, clean, and isolated from any host app styles.
 */

export const AVATAR_STYLES = `
:host {
  --primary-color: #2563eb;
  --primary-hover: #1d4ed8;
  --primary-glow: rgba(37, 99, 235, 0.35);
  --success-color: #10b981;
  --danger-color: #ef4444;
  --bg-card: rgba(255, 255, 255, 0.96);
  --border-color: #e2e8f0;
  --text-main: #0f172a;
  --text-muted: #64748b;
  --text-light: #94a3b8;
  --radius-lg: 18px;
  --radius-md: 10px;
  --radius-sm: 6px;
  --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  
  display: block;
  font-family: var(--font-family);
  box-sizing: border-box;
  -webkit-font-smoothing: antialiased;
}

*, *::before, *::after {
  box-sizing: inherit;
  margin: 0;
  padding: 0;
}

/* Floating Action Button (FAB) */
.avatar-fab {
  position: fixed;
  bottom: var(--avatar-bottom, 24px);
  right: var(--avatar-right, 24px);
  left: var(--avatar-left, auto);
  z-index: 99999;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--primary-color);
  color: #ffffff;
  border: none;
  cursor: pointer;
  box-shadow: 0 8px 24px var(--primary-glow), 0 2px 6px rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease, opacity 0.2s ease;
  user-select: none;
}

:host([position="bottom-left"]) .avatar-fab,
:host([position="left"]) .avatar-fab {
  left: var(--avatar-left, 24px);
  right: auto;
}

.avatar-fab:hover {
  transform: translateY(-3px) scale(1.04);
  box-shadow: 0 12px 28px var(--primary-glow), 0 4px 8px rgba(0, 0, 0, 0.12);
}

.avatar-fab:active {
  transform: translateY(0) scale(0.96);
}

.fab-live-dot {
  position: absolute;
  top: 0px;
  right: 0px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--success-color);
  border: 2px solid #ffffff;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
  animation: pulse-dot 2s infinite;
}

@keyframes pulse-dot {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
  70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
}

/* Popup Container */
.avatar-popup {
  position: fixed;
  bottom: var(--avatar-bottom, 24px);
  right: var(--avatar-right, 24px);
  left: var(--avatar-left, auto);
  z-index: 99999;
  width: 380px;
  max-width: calc(100vw - 32px);
  background: var(--bg-card);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.18), 0 4px 12px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), width 0.25s ease, height 0.25s ease, max-height 0.25s ease;
  transform-origin: bottom right;
}

:host([position="bottom-left"]) .avatar-popup,
:host([position="left"]) .avatar-popup {
  left: var(--avatar-left, 24px);
  right: auto;
  transform-origin: bottom left;
}

.avatar-popup.hidden {
  opacity: 0;
  pointer-events: none;
  transform: translateY(30px) scale(0.92);
  visibility: hidden;
}

.avatar-popup.visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) scale(1);
  visibility: visible;
}

.avatar-popup.minimized {
  width: 320px;
  max-width: calc(100vw - 32px);
  height: auto;
  cursor: pointer;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.15);
}

.avatar-popup.minimized .popup-header {
  border-bottom: none;
  padding: 8px 12px;
}

.avatar-popup.minimized .popup-toolbar,
.avatar-popup.minimized .video-container,
.avatar-popup.minimized .transcript-box,
.avatar-popup.minimized .hints-container,
.avatar-popup.minimized .input-bar {
  display: none !important;
}

.avatar-popup.maximized {
  width: min(720px, calc(100vw - 32px));
  max-width: calc(100vw - 32px);
  height: min(880px, calc(100dvh - 32px));
  max-height: calc(100dvh - 32px);
  bottom: 16px;
  right: 16px;
  border-radius: 16px;
}

:host([position="bottom-left"]) .avatar-popup.maximized,
:host([position="left"]) .avatar-popup.maximized {
  left: 16px;
  right: auto;
}

.avatar-popup.maximized .video-container {
  height: 360px;
}

.avatar-popup.maximized .transcript-box {
  max-height: none;
  flex: 1;
}

/* Header */
.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background: #ffffff;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-light);
  transition: background-color 0.2s ease;
}

.status-dot.live {
  background: var(--success-color);
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
}

.status-dot.connecting {
  background: #f59e0b;
  animation: pulse-dot 1.5s infinite;
}

.status-dot.error {
  background: var(--danger-color);
}

.header-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
  line-height: 1.2;
}

.header-status {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.2;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Power Switch */
.switch-label {
  position: relative;
  display: inline-block;
  width: 38px;
  height: 22px;
  cursor: pointer;
}

.switch-label input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-slider {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: #cbd5e1;
  border-radius: 34px;
  transition: background-color 0.25s ease;
}

.switch-slider::before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0,0,0,0.25);
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.switch-label input:checked + .switch-slider {
  background-color: var(--primary-color);
}

.switch-label input:checked + .switch-slider::before {
  transform: translateX(16px);
}

.minimize-btn,
.maximize-btn,
.close-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.minimize-btn:hover,
.maximize-btn:hover,
.close-btn:hover {
  color: var(--text-main);
  background: #f1f5f9;
}

/* Options / Settings Bar */
.popup-toolbar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 16px;
  background: #f8fafc;
  border-bottom: 1px solid var(--border-color);
  font-size: 11px;
  color: var(--text-muted);
}

.toolbar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: none;
}

.toolbar-row input[type="checkbox"] {
  accent-color: var(--primary-color);
  cursor: pointer;
  width: 14px;
  height: 14px;
}

.toolbar-row label {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  color: #334155;
}

.badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.02em;
}

.badge-agent {
  background: #dbeafe;
  color: #1d4ed8;
}

.badge-direct {
  background: #e2e8f0;
  color: #475569;
}

/* Video Frame */
.video-container {
  position: relative;
  width: 100%;
  height: 210px;
  background: #090d16;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.video-container.live-glow {
  box-shadow: inset 0 0 30px rgba(37, 99, 235, 0.25);
}

.avatar-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: none;
}

.avatar-video.active {
  display: block;
}

.video-poster-wrapper {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.poster-img {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  object-fit: cover;
  opacity: 0.7;
}

.poster-overlay {
  position: relative;
  z-index: 2;
  padding: 16px;
  background: rgba(15, 23, 42, 0.45);
  border-radius: 12px;
  backdrop-filter: blur(4px);
  color: #ffffff;
}

.poster-title {
  font-size: 13px;
  font-weight: 600;
}

.poster-sub {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  margin-top: 2px;
}

.overlay-status {
  position: absolute;
  top: 0; left: 0; width: 100%; height: 100%;
  z-index: 3;
  background: rgba(15, 23, 42, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 13px;
  gap: 8px;
}

.live-badge {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 4;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 20px;
  padding: 3px 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.live-badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--danger-color);
  animation: pulse-dot 1.2s infinite;
}

.waveform-anim {
  animation: bounce-wave 1.2s infinite ease-in-out;
}

@keyframes bounce-wave {
  0%, 100% { transform: scaleY(0.8); opacity: 0.7; }
  50% { transform: scaleY(1.2); opacity: 1; }
}

/* Transcript messages */
.transcript-box {
  height: 130px;
  overflow-y: auto;
  padding: 12px;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--border-color);
}

.transcript-empty {
  margin: auto;
  font-size: 12px;
  color: var(--text-light);
  text-align: center;
}

.error-banner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: var(--radius-sm);
  color: #92400e;
  font-size: 11px;
  line-height: 1.4;
}

.msg-bubble {
  max-width: 86%;
  padding: 6px 12px;
  font-size: 12px;
  line-height: 1.4;
  border-radius: 12px;
  word-break: break-word;
}

.msg-user {
  align-self: flex-end;
  background: var(--primary-color);
  color: #ffffff;
  border-bottom-right-radius: 2px;
}

.msg-assistant {
  align-self: flex-start;
  background: #f1f5f9;
  color: #1e293b;
  border-bottom-left-radius: 2px;
}

/* Hints / Suggestions */
.hints-container {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px;
  background: #ffffff;
  border-top: 1px solid #f1f5f9;
  max-height: 20dvh;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
}

.hints-container::-webkit-scrollbar {
  width: 4px;
}

.hints-container::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 4px;
}

.hints-label {
  position: sticky;
  top: 0;
  background: #ffffff;
  z-index: 1;
  width: 100%;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-light);
  margin-bottom: 2px;
}

.hints-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.hint-chip {
  background: #ffffff;
  border: 1px solid var(--border-color);
  border-radius: 20px;
  padding: 3px 10px;
  font-size: 11px;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.hint-chip:hover {
  border-color: #93c5fd;
  color: var(--primary-color);
  background: #eff6ff;
  transform: translateY(-1px);
}

.hint-chip:active {
  transform: translateY(0);
}

/* Input Bar */
.input-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #ffffff;
  border-top: 1px solid var(--border-color);
}

.mic-status-icon {
  color: var(--text-light);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s ease;
}

.mic-status-icon.active {
  color: var(--primary-color);
}

.text-input {
  flex: 1;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-main);
  background: #ffffff;
  outline: none;
  transition: border-color 0.15s ease;
}

.text-input:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
}

.send-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: var(--primary-color);
  color: #ffffff;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.15s ease, transform 0.1s ease;
}

.send-btn:hover {
  background: var(--primary-hover);
}

.send-btn:active {
  transform: scale(0.95);
}

/* Scrollbar styling */
.transcript-box::-webkit-scrollbar {
  width: 4px;
}
.transcript-box::-webkit-scrollbar-track {
  background: transparent;
}
.transcript-box::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}
.transcript-box::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
`;
