# React Frontend Integration (frontend)

This is a React application that demonstrates how to integrate the `<live-avatar-popup>` web component into a modern React ecosystem.

## Overview

The React app shows how to pass props, handle custom DOM events, and communicate with the underlying Web Component in a React-friendly way using `useRef` and `useEffect`.

### Key Integration Points
*   **Ref Binding**: Uses `useRef` to get a reference to the `<live-avatar-popup>` DOM node.
*   **Event Listeners**: Uses `useEffect` to attach and detach standard JavaScript event listeners to handle web component events within the React component lifecycle.
*   **API Mode**: Demonstrates how to connect the avatar to the FastAPI backend for natural language command parsing.

## Screenshots

*(Placeholder for React UI screenshot - replace with actual image path)*
`![React Frontend](docs/screenshots/react-ui.png)`

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.
