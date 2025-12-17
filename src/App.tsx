// src/App.tsx
import React from "react";
import { AuthGate } from "./components/AuthGate";
import MinaApp from "./MinaApp";

export default function App() {
  return (
    <AuthGate>
      <MinaApp />
    </AuthGate>
  );
}
