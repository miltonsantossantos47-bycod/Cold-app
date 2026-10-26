"use client";

import { useEffect } from "react";

// Regista o service worker mínimo (só em produção) para a app poder ser instalada no telemóvel.
export default function RegistarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
