// src/App.tsx
// -----------------------------------------------------------------------------
// File map
// 1) Imports: React + Auth wrapper + MinaApp shell.
// 2) App component: wraps MinaApp in AuthGate so every route is gated.
// -----------------------------------------------------------------------------
// [PART 1] Imports
import React from "react";
import { AuthGate } from "./components/AuthGate";
import MinaApp from "./MinaApp";

// [PART 2] App component (tiny wrapper that applies authentication context)
export default function App() {
  return (
    <AuthGate>
      <MinaApp />
    </AuthGate>
  );
}
