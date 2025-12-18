// src/main.tsx
// -----------------------------------------------------------------------------
// File map
// 1) Imports: React runtime, root renderer, App shell, base styles.
// 2) Bootstrap: attach global error handlers and mount the app under StrictMode
//    + ErrorBoundary wrapper.
// -----------------------------------------------------------------------------
// [PART 1] Imports
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installGlobalErrorHandlers } from "./lib/installGlobalErrorHandlers";

// [PART 2] Application bootstrap
installGlobalErrorHandlers();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
