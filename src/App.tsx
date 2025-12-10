// src/App.tsx
import React from "react";
import { AuthGate } from "./components/AuthGate";
import MinaApp from "./MinaApp";

function App() {
  return (
    <AuthGate>
      <MinaApp />
    </AuthGate>
  );
}

export default App;
