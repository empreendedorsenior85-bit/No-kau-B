import "server-only";
import { Socket } from "node:net";
import { open } from "node:fs/promises";

/**
 * Envio dos bytes ESC/POS para a impressora, a partir do servidor local do restaurante.
 *  - network: TCP "RAW" na porta 9100 (impressoras Wi-Fi/Ethernet — o padrão da indústria).
 *  - usb: escrita direta no dispositivo do sistema (Linux: /dev/usb/lp0, criado pelo kernel para impressoras USB).
 */
export type Connection = { kind: "network"; host: string; port: number } | { kind: "usb"; path: string };

export type PrinterStatus = {
  reachable: boolean;
  /** Resposta da impressora ao pedido de estado (DLE EOT). null = a impressora não respondeu (muitas não respondem). */
  paperOut: boolean | null;
  paperNearEnd: boolean | null;
  coverOpen: boolean | null;
  error: string | null;
};

const TIMEOUT_MS = 6000;

function describe(e: unknown): string {
  const err = e as { code?: string; message?: string };
  switch (err.code) {
    case "ECONNREFUSED": return "A impressora recusou a ligação (porta errada ou serviço RAW desligado).";
    case "EHOSTUNREACH": case "ENETUNREACH": return "Impressora inalcançável (desligada ou noutra rede).";
    case "ETIMEDOUT": case "TIMEOUT": return "A impressora não respondeu a tempo (desligada, sem rede ou IP errado).";
    case "ENOENT": return "Dispositivo USB não encontrado (cabo desligado ou caminho errado).";
    case "EACCES": case "EPERM": return "Sem permissão para escrever no dispositivo USB (adicione o utilizador ao grupo lp).";
    case "EBUSY": return "Dispositivo USB ocupado por outro programa.";
    default: return err.message ?? String(e);
  }
}

function connect(host: string, port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = new Socket();
    const timer = setTimeout(() => { s.destroy(); reject(Object.assign(new Error("timeout"), { code: "TIMEOUT" })); }, TIMEOUT_MS);
    s.once("error", (e) => { clearTimeout(timer); s.destroy(); reject(e); });
    s.connect(port, host, () => { clearTimeout(timer); s.removeAllListeners("error"); resolve(s); });
  });
}

/** Envia e só devolve quando a impressora recebeu tudo (ligação fechada sem erro). */
export async function sendBytes(c: Connection, data: Buffer): Promise<void> {
  try {
    if (c.kind === "usb") {
      const fh = await open(c.path, "w");
      try { await fh.write(data); } finally { await fh.close(); }
      return;
    }
    const s = await connect(c.host, c.port);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { s.destroy(); reject(Object.assign(new Error("timeout"), { code: "TIMEOUT" })); }, TIMEOUT_MS * 2);
      s.once("error", (e) => { clearTimeout(timer); reject(e); });
      s.end(data, () => { clearTimeout(timer); s.destroy(); resolve(); });
    });
  } catch (e) {
    throw new Error(describe(e));
  }
}

/** Uma pergunta de estado (DLE EOT n) e a resposta de 1 byte. */
function ask(s: Socket, n: 1 | 2 | 4): Promise<number | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { s.removeListener("data", onData); resolve(null); }, 1500);
    const onData = (d: Buffer) => { clearTimeout(timer); s.removeListener("data", onData); resolve(d[0]); };
    s.on("data", onData);
    s.write(Buffer.from([0x10, 0x04, n]));
  });
}

/** Estado da ligação e, se a impressora responder, papel e tampa (ESC/POS DLE EOT 2 e 4). */
export async function probe(c: Connection): Promise<PrinterStatus> {
  if (c.kind === "usb") {
    try {
      const fh = await open(c.path, "r+").catch(() => open(c.path, "w"));
      await fh.close();
      return { reachable: true, paperOut: null, paperNearEnd: null, coverOpen: null, error: null };
    } catch (e) {
      return { reachable: false, paperOut: null, paperNearEnd: null, coverOpen: null, error: describe(e) };
    }
  }
  let s: Socket | null = null;
  try {
    s = await connect(c.host, c.port);
    s.on("error", () => {});
    const offline = await ask(s, 2); // bit 2: tampa aberta; bit 5: sem papel (paragem)
    const paper = await ask(s, 4); // bits 2/3: papel a acabar; bits 5/6: sem papel
    return {
      reachable: true,
      coverOpen: offline === null ? null : (offline & 0x04) !== 0,
      paperOut: paper === null ? (offline === null ? null : (offline & 0x20) !== 0) : (paper & 0x60) !== 0,
      paperNearEnd: paper === null ? null : (paper & 0x0c) !== 0,
      error: null,
    };
  } catch (e) {
    return { reachable: false, paperOut: null, paperNearEnd: null, coverOpen: null, error: describe(e) };
  } finally {
    s?.destroy();
  }
}
