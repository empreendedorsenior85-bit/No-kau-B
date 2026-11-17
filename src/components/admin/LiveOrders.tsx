"use client";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Order, Reservation, ServiceCall } from "@/lib/types";
import { formatOrderNumber } from "@/lib/types";

export type Conn = "connecting" | "live" | "reconnecting" | "offline";

type Ctx = {
  orders: Order[];
  /** Chamadas dos clientes (ativas + resolvidas nas últimas horas). */
  calls: ServiceCall[];
  upsertCall: (c: ServiceCall) => void;
  /** Chamadas ativas (à espera ou a caminho) que dizem respeito a quem está ligado. */
  openCalls: ServiceCall[];
  me: { id: string; role: string };
  /** Reservas (só Admin/Gerente): pendentes, futuras e decididas recentemente. */
  reservations: Reservation[];
  upsertReservation: (r: Reservation) => void;
  pendingReservations: number;
  /** Último pagamento confirmado/anulado recebido em tempo real (rev) — as páginas de pagamentos atualizam-se. */
  paymentsRev: number;
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

/** Vibrar só depois de a pessoa ter tocado na página (o navegador bloqueia e regista erro antes disso). */
function vibrate(pattern: number[]) {
  try {
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) return;
    navigator.vibrate?.(pattern);
  } catch {}
}

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

export function LiveOrdersProvider({ children, me }: { children: ReactNode; me: { id: string; role: string } }) {
  const [map, setMap] = useState<Map<string, Order>>(new Map());
  const [callMap, setCallMap] = useState<Map<string, ServiceCall>>(new Map());
  const knownCalls = useRef<Set<string>>(new Set());
  const [resMap, setResMap] = useState<Map<string, Reservation>>(new Map());
  const knownRes = useRef<Set<string>>(new Set());
  /** Garçom: só é alertado pelas chamadas das suas mesas (ou de mesas sem garçom); "chamar gerente" é para a gestão. */
  const concernsMe = useCallback((c: ServiceCall) =>
    me.role !== "garcom" || (c.kind !== "manager" && (!c.waiterId || c.waiterId === me.id)), [me.id, me.role]);
  const [loaded, setLoaded] = useState(false);
  const [paymentsRev, setPaymentsRev] = useState(0);
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
    vibrate([200, 100, 200]);
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

  const notifyCall = useCallback(() => {
    if (alertsRef.current && audio.current) { beep(audio.current); setTimeout(() => audio.current && beep(audio.current), 700); }
    vibrate([300, 100, 300, 100, 300]);
  }, []);

  /** Chamada recebida: ignora versões antigas; alerta só chamadas NOVAS e à espera. */
  const upsertCall = useCallback((c: ServiceCall) => {
    setCallMap((m) => {
      const cur = m.get(c.id);
      if (cur && cur.rev >= c.rev) return m;
      const n = new Map(m);
      n.set(c.id, c);
      return n;
    });
    if (!knownCalls.current.has(c.id)) {
      knownCalls.current.add(c.id);
      if (!firstLoad.current && c.status === "open" && concernsMe(c)) notifyCall();
    }
  }, [concernsMe, notifyCall]);

  /** Reserva recebida: nova e pendente → alerta (som + vibração), como um pedido novo. */
  const upsertReservation = useCallback((r: Reservation) => {
    setResMap((m) => {
      const cur = m.get(r.id);
      if (cur && cur.rev >= r.rev) return m;
      const n = new Map(m);
      n.set(r.id, r);
      return n;
    });
    if (!knownRes.current.has(r.id)) {
      knownRes.current.add(r.id);
      if (!firstLoad.current && r.status === "pending") notifyCall();
    }
  }, [notifyCall]);

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
      const data: { orders: Order[]; rev: number; calls?: ServiceCall[]; reservations?: Reservation[] } = await r.json();
      setCallMap((m) => {
        const n = new Map<string, ServiceCall>();
        for (const c of data.calls ?? []) n.set(c.id, c);
        for (const [id, c] of m) { const s = n.get(id); if (s && c.rev > s.rev) n.set(id, c); }
        return n;
      });
      setResMap((m) => {
        const n = new Map<string, Reservation>();
        for (const r of data.reservations ?? []) n.set(r.id, r);
        for (const [id, r] of m) { const s = n.get(id); if (s && r.rev > s.rev) n.set(id, r); }
        return n;
      });
      for (const r of data.reservations ?? []) {
        if (!knownRes.current.has(r.id)) {
          knownRes.current.add(r.id);
          if (!firstLoad.current && r.status === "pending") notifyCall();
        }
      }
      for (const c of data.calls ?? []) {
        if (!knownCalls.current.has(c.id)) {
          knownCalls.current.add(c.id);
          if (!firstLoad.current && c.status === "open" && concernsMe(c)) notifyCall();
        }
      }
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
      es.addEventListener("call", (e) => {
        try { upsertCall(JSON.parse((e as MessageEvent).data)); } catch {}
      });
      es.addEventListener("reservation", (e) => {
        try { upsertReservation(JSON.parse((e as MessageEvent).data)); } catch {}
      });
      es.addEventListener("payment", (e) => {
        try { const p = JSON.parse((e as MessageEvent).data) as { rev: number }; setPaymentsRev((v) => Math.max(v, p.rev)); } catch {}
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
  }, [upsert, upsertCall, upsertReservation, notifyNew, notifyCall, concernsMe, router]);

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

  const calls = useMemo(() => [...callMap.values()].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)), [callMap]);
  const openCalls = useMemo(() => calls.filter((c) => (c.status === "open" || c.status === "ack") && concernsMe(c)), [calls, concernsMe]);
  const waiting = openCalls.filter((c) => c.status === "open").length;

  // enquanto houver pedidos por ver ou clientes à espera: repete o som e pisca o título do separador
  useEffect(() => {
    if (unseen.size === 0 && waiting === 0) { document.title = "Pedidos · Nô Kau"; return; }
    let on = false;
    const msg = waiting ? `(${waiting}) CLIENTE A CHAMAR!` : `(${unseen.size}) NOVO PEDIDO!`;
    const t = setInterval(() => { on = !on; document.title = on ? msg : "Pedidos · Nô Kau"; }, 900);
    const r = setInterval(() => { if (alertsRef.current && audio.current) beep(audio.current); }, waiting ? 15_000 : 20_000);
    return () => { clearInterval(t); clearInterval(r); };
  }, [unseen, waiting]);

  const orders = useMemo(() => [...map.values()].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)), [map]);
  const reservations = useMemo(() => [...resMap.values()].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)), [resMap]);
  const pendingReservations = reservations.filter((r) => r.status === "pending").length;
  const value: Ctx = { orders, calls, upsertCall, openCalls, me, reservations, upsertReservation, pendingReservations, paymentsRev, loaded, conn, unseen, acknowledge, upsert, alertsOn, enableAlerts, refresh: () => bootRef.current() };
  return <LiveCtx.Provider value={value}>{children}</LiveCtx.Provider>;
}

export { formatOrderNumber };
