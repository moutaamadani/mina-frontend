import React, { useEffect, useState } from "react";
import { isAdmin as checkIsAdmin } from "../lib/adminConfig";

export default function AdminLink() {
  const [ready, setReady] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const ok = await checkIsAdmin();
        if (!alive) return;

        setIsAdminUser(ok);
        setReady(true);
      } catch {
        if (!alive) return;
        setIsAdminUser(false);
        setReady(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  if (!ready || !isAdminUser) return null;

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
