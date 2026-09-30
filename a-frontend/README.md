# Angular Frontend Integration (a-frontend)

This is an Angular 18 application that demonstrates how to seamlessly integrate the framework-agnostic `<live-avatar-popup>` web component.

## Overview

The application binds to the custom events emitted by the `live-avatar-element` package and handles complex, multi-turn workflows like quotation creation and page navigation.

### Key Integration Points
*   **Web Component Registration**: The `<live-avatar-popup>` is registered as a custom element in Angular (requires `CUSTOM_ELEMENTS_SCHEMA`).
*   **Event Handling**: Listens to custom events like `avatar-create-request` to trigger application-specific logic (e.g., calling backend APIs to create a quote).
*   **Conversation Mode**: Demonstrates how to handle multi-turn conversations by implementing the `conversationHandler` callback.

## Screenshots

*(Placeholder for Angular UI screenshot - replace with actual image path)*
`![Angular Frontend](docs/screenshots/angular-ui.png)`

## Development Server

1.  Ensure you have built the `live-avatar-element` web component first, and copied its `dist/` contents to `node_modules/live-avatar-element/dist/` (or properly linked it).
2.  Run `npm install` to install dependencies.
3.  Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.
