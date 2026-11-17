"use client";
import { useEffect, useState } from "react";
import { useClientValue } from "@/lib/use-client-value";

export type OfflineState = {
  /** O navegador diz que há rede. */
  online: boolean;
  /** Service Worker ativo e esta página (HTML, scripts e fotos) guardada no telemóvel. */
  saved: boolean;
  /** O telemóvel/navegador não permite funcionar sem internet (ex.: http na rede local, navegador antigo). */
  unsupported: boolean;
};

/**
 * Regista o Service Worker e guarda já a página aberta (a primeira visita acontece antes de o SW a controlar).
 * `extraUrls`: fotos da página que ainda não foram carregadas (imagens "lazy").
 */
export function useOffline(extraUrls: string[] = []): OfflineState {
  const [online, setOnline] = useState(true);
  const [saved, setSaved] = useState(false);
  const noSw = useClientValue(() => (!("serviceWorker" in navigator) || !window.isSecureContext ? 1 : 0)) === 1;
  const [failed, setFailed] = useState(false);
  const urlsKey = extraUrls.join("|");

  useEffect(() => {
    const up = () => setOnline(navigator.onLine);
    up();
    window.addEventListener("online", up);
    window.addEventListener("offline", up);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", up); };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    let stop = false;
    const onMsg = (e: MessageEvent) => { if (e.data?.type === "precached" && !stop) setSaved(true); };
    navigator.serviceWorker.addEventListener("message", onMsg);
    (async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        const reg = await navigator.serviceWorker.ready;
        const page = location.href.split("#")[0];
        const assets = performance.getEntriesByType("resource").map((e) => e.name)
          .filter((u) => u.startsWith(location.origin + "/_next/static/"));
        const tags = [...document.querySelectorAll<HTMLScriptElement>("script[src]")].map((s) => s.src)
          .concat([...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"],link[rel="icon"]')].map((l) => l.href));
        const imgs = [...document.images].map((i) => i.currentSrc || i.src);
        const urls = [...new Set([page, ...assets, ...tags, ...imgs, ...urlsKey.split("|").filter(Boolean), "/offline.html", "/icons/icon-192.png"])];
        reg.active?.postMessage({ type: "precache", urls });
      } catch {
        if (!stop) setFailed(true);
      }
    })();
    return () => { stop = true; navigator.serviceWorker.removeEventListener("message", onMsg); };
  }, [urlsKey]);

  return { online, saved, unsupported: noSw || failed };
}
