"use client";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Order } from "@/lib/types";
import { formatOrderNumber } from "@/lib/types";

export type Conn = "connecting" | "live" | "reconnecting" | "offline";

type Ctx = {
  orders: Order[];
  loaded: boolean;
  conn: Conn;
  unseen: Set<string>; // pedidos novos ainda não vistos
  acknowledge: (id: string) => void;
  upsert: (o: Order) => void;
  alertsOn: boolean;
  enableAlerts: () => void;
  refresh: () => void;
};
const LiveCtx = createContext<Ctx | null>(null);
export const useLive = () => {
  const c = useContext(LiveCtx);
  if (!c) throw new Error("useLive fora do painel");
  return c;
};

/** Dois toques curtos e agudos — difícil de ignorar numa cozinha. */
function beep(ctx: AudioContext) {
  const play = (t: number, f: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
    g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.3);
    o.connect(g).connect(ctx.destination);
    o.start(ctx.currentTime + t);
    o.stop(ctx.currentTime + t + 0.32);
  };
  play(0, 880);
  play(0.35, 1175);
}

export function LiveOrdersProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<Map<string, Order>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [conn, setConn] = useState<Conn>("connecting");
  const [unseen, setUnseen] = useState<Set<string>>(new Set());
  const [alertsOn, setAlertsOn] = useState(false);
  const known = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);
  const audio = useRef<AudioContext | null>(null);
  const alertsRef = useRef(false);
  const bootRef = useRef<() => void>(() => {});
  const snapRef = useRef<(() => Promise<number>) | null>(null);
  const router = useRouter();

  const notifyNew = useCallback((o: Order) => {
    setUnseen((s) => new Set(s).add(o.id));
    if (alertsRef.current && audio.current) beep(audio.current);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
  }, []);

  /** Aplica um pedido recebido: ignora versões mais antigas (eventos repetidos/fora de ordem). */
  const upsert = useCallback((o: Order) => {
    setMap((m) => {
      const cur = m.get(o.id);
      if (cur && cur.rev >= o.rev) return m;
      const n = new Map(m);
      n.set(o.id, o);
      return n;
    });
    if (!known.current.has(o.id)) {
      known.current.add(o.id);
      if (!firstLoad.current && o.status === "pending") notifyNew(o);
    }
  }, [notifyNew]);

  const acknowledge = useCallback((id: string) => setUnseen((s) => { if (!s.has(id)) return s; const n = new Set(s); n.delete(id); return n; }), []);

  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dead = false;
    let resync = false;

    const snapshot = async () => {
      const r = await fetch("/api/admin/orders", { cache: "no-store" });
      if (r.status === 401) { router.replace("/admin/login"); throw new Error("auth"); }
      if (!r.ok) throw new Error(`http ${r.status}`);
      const data: { orders: Order[]; rev: number } = await r.json();
      // recuperação: o servidor é a fonte da verdade — junta (sem perder versões mais novas)
      setMap((m) => {
        const n = new Map<string, Order>();
        for (const o of data.orders) n.set(o.id, o);
        for (const [id, o] of m) { const s = n.get(id); if (!s && o.status !== "done") n.set(id, o); else if (s && o.rev > s.rev) n.set(id, o); }
        return n;
      });
      for (const o of data.orders) {
        if (!known.current.has(o.id)) {
          known.current.add(o.id);
          if (!firstLoad.current && o.status === "pending") notifyNew(o);
        }
      }
      firstLoad.current = false;
      setLoaded(true);
      return data.rev;
    };

    const boot = async () => {
      if (dead) return;
      es?.close();
      clearTimeout(timer);
      setConn((c) => (c === "live" ? c : "connecting"));
      let rev = 0;
      try {
        rev = await snapshot();
      } catch (e) {
        if ((e as Error).message === "auth") return;
        setConn(navigator.onLine ? "reconnecting" : "offline");
        timer = setTimeout(boot, 3000);
        return;
      }
      if (dead) return;
      es = new EventSource(`/api/admin/stream?after=${rev}`);
      es.onopen = () => {
        setConn("live");
        if (resync) { resync = false; snapshot().catch(() => {}); } // reabriu após falha: confirma tudo
      };
      es.addEventListener("order", (e) => {
        try { upsert(JSON.parse((e as MessageEvent).data)); } catch {}
      });
      es.onerror = () => {
        setConn(navigator.onLine ? "reconnecting" : "offline");
        resync = true;
        if (es?.readyState === EventSource.CLOSED) { es.close(); timer = setTimeout(boot, 3000); }
      };
    };
    bootRef.current = boot;
    snapRef.current = snapshot;
    boot();

    const goOffline = () => setConn("offline");
    const goOnline = () => { setConn("reconnecting"); resync = true; boot(); };
    const onVisible = () => { if (!document.hidden) { resync = true; snapshot().catch(() => {}); } };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      dead = true;
      es?.close();
      clearTimeout(timer);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [upsert, notifyNew, router]);

  // Plano B: enquanto o canal em tempo real não está ligado (rede móvel instável, proxies que retêm
  // a ligação), consulta o servidor de 5 em 5 segundos — os pedidos nunca ficam retidos.
  useEffect(() => {
    if (conn === "live" || !loaded) return;
    const t = setInterval(() => { snapRef.current?.().catch(() => {}); }, 5000);
    return () => clearInterval(t);
  }, [conn, loaded]);

  const enableAlerts = useCallback(() => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audio.current = audio.current ?? new AC();
      void audio.current.resume();
      beep(audio.current); // confirma que o som funciona
      alertsRef.current = true;
      setAlertsOn(true);
    } catch {}
  }, []);

  // enquanto houver pedidos por ver: repete o som e pisca o título do separador
  useEffect(() => {
    if (unseen.size === 0) { document.title = "Pedidos · Nô Kau"; return; }
    let on = false;
    const t = setInterval(() => { on = !on; document.title = on ? `(${unseen.size}) NOVO PEDIDO!` : "Pedidos · Nô Kau"; }, 900);
    const r = setInterval(() => { if (alertsRef.current && audio.current) beep(audio.current); }, 20_000);
    return () => { clearInterval(t); clearInterval(r); };
  }, [unseen]);

  const orders = useMemo(() => [...map.values()].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)), [map]);
  const value: Ctx = { orders, loaded, conn, unseen, acknowledge, upsert, alertsOn, enableAlerts, refresh: () => bootRef.current() };
  return <LiveCtx.Provider value={value}>{children}</LiveCtx.Provider>;
}

export { formatOrderNumber };
