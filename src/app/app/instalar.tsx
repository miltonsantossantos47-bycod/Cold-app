"use client";

import { useEffect, useState } from "react";

type EventoInstalar = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Botão "Instalar no telemóvel": usa o pedido nativo no Android/Chrome e mostra o passo a passo nos outros casos.
export default function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [instalada, setInstalada] = useState(false);
  const [ajuda, setAjuda] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalada(!!standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const antes = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalar);
    };
    const depois = () => {
      setInstalada(true);
      setEvento(null);
    };
    window.addEventListener("beforeinstallprompt", antes);
    window.addEventListener("appinstalled", depois);
    return () => {
      window.removeEventListener("beforeinstallprompt", antes);
      window.removeEventListener("appinstalled", depois);
    };
  }, []);

  if (instalada) return null;

  async function instalar() {
    if (evento) {
      await evento.prompt();
      await evento.userChoice.catch(() => null);
      setEvento(null);
      return;
    }
    setAjuda((v) => !v);
  }

  return (
    <div className="instalar">
      <button className="btn btn-ghost" onClick={instalar}>
        Instalar no telemóvel
      </button>
      {ajuda && (
        <p className="ajuda">
          {ios
            ? "No iPhone: abre o Cold no Safari, toca em Partilhar e depois em Adicionar ao ecrã principal."
            : "No Android: abre o Cold no Chrome, toca no menu (⋮) e depois em Instalar app ou Adicionar ao ecrã inicial."}{" "}
          Se abriste o link dentro do WhatsApp ou de outra app, abre-o primeiro no Chrome ou no Safari.
        </p>
      )}
    </div>
  );
}
