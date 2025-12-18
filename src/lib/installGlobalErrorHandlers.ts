// src/lib/installGlobalErrorHandlers.ts
// -----------------------------------------------------------------------------
// Attaches global window listeners for runtime errors and rejected promises.
// -----------------------------------------------------------------------------
import { sendClientError } from "./errorReporting";

let handlersInstalled = false;

export function installGlobalErrorHandlers() {
  if (typeof window === "undefined" || handlersInstalled) return;

  handlersInstalled = true;

  window.addEventListener("error", (event) => {
    sendClientError({
      emoji: "🖥️",
      code: "FRONTEND_CRASH",
      message: event.message || "window.error",
      stack: event.error?.stack || null,
      extra: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent | any) => {
    const reason = event?.reason;
    sendClientError({
      emoji: "🖥️",
      code: "UNHANDLED_REJECTION",
      message: reason?.message || String(reason) || "unhandledrejection",
      stack: reason?.stack || null,
    });
  });
}
