// src/main.tsx
// -----------------------------------------------------------------------------
// File map
// 1) Imports: React runtime, root renderer, App shell, base styles.
// 2) Bootstrap: create root element and mount the entire app under StrictMode.
// -----------------------------------------------------------------------------
// [PART 1] Imports
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// [PART 2] Application bootstrap
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
