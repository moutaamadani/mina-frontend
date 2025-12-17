import React, { useEffect, useState } from "react";
import { isAdmin } from "../lib/adminConfig";

export default function AdminLink() {
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const ok = await isAdmin();
        if (!alive) return;

        setIsAdmin(ok);
        setReady(true);
      } catch {
        if (!alive) return;
        setIsAdmin(false);
        setReady(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  if (!ready || !isAdmin) return null;

  // Your app uses pathname switching, so a normal <a href="/admin"> works.
  return (
    <a
      href="/admin"
      style={{
        display: "inline-block",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "-0.01em",
        color: "rgba(8,10,0,0.9)",
        textDecoration: "underline",
        textUnderlineOffset: 3,
      }}
    >
      Admin
    </a>
  );
}
