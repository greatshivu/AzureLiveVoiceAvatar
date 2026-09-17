import { LiveAvatarElement } from "./LiveAvatarElement";

// Automatically register the custom element if in browser environment
if (typeof window !== "undefined" && window.customElements) {
  if (!customElements.get("live-avatar-popup")) {
    customElements.define("live-avatar-popup", LiveAvatarElement);
  }
  // Alias for alternate tag name
  if (!customElements.get("azure-live-avatar")) {
    customElements.define("azure-live-avatar", class extends LiveAvatarElement {});
  }
}

export { LiveAvatarElement };
export * from "./api/avatarClient";
export * from "./audio/audioUtils";

declare global {
  interface HTMLElementTagNameMap {
    "live-avatar-popup": LiveAvatarElement;
    "azure-live-avatar": LiveAvatarElement;
  }
}
