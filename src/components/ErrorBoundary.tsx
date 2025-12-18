// src/components/ErrorBoundary.tsx
// -----------------------------------------------------------------------------
// React error boundary that reports render errors to the backend.
// -----------------------------------------------------------------------------
import React from "react";
import { sendClientError } from "../lib/errorReporting";

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    sendClientError({
      emoji: "🖥️",
      code: "REACT_RENDER_ERROR",
      message: error?.message || "React render error",
      stack: error?.stack || null,
      extra: { componentStack: info.componentStack },
    });
  }

  render() {
    if (this.state.hasError) {
      return <div>Something went wrong. Please refresh.</div>;
    }

    return this.props.children;
  }
}
