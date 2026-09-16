/**
 * Klien WS endpoint → cloud. Gangguan jaringan = kejadian NORMAL:
 * reconnect otomatis dengan backoff, status jelas ke panel, tidak crash.
 */
import WebSocket from "ws";
import {
  ServerMsgSchema,
  type Ack,
  type Hello,
  type ServerMsg,
} from "@torang/shared";

export interface WsClientOpts {
  url: string;
  hello: Omit<Hello, "kind">;
  onCue: (msg: Extract<ServerMsg, { kind: "cue" }>) => void;
  onStatus: (status: "online" | "offline", detail?: string) => void;
  onClockOffset?: (offsetMs: number) => void;
  /**
   * Cloud menendang koneksi ini karena app guru LAIN memakai endpoint_id yang
   * sama (kode close 4000). App yang lama sudah tidak berguna — window-nya
   * masih tampil tapi tidak lagi menerima cue. Dipakai untuk menutup diri.
   */
  onDigantikan?: (alasan: string) => void;
}

/** Kode close yang dipakai cloud saat endpoint_id diambil alih (registry.ts). */
export const KODE_DIGANTIKAN = 4000;

export class CloudClient {
  private ws: WebSocket | null = null;
  private retryMs = 1000;
  private closed = false;
  private pingTimer: NodeJS.Timeout | null = null;
  /** offset = jam server − jam lokal (ms); akurat cukup untuk ±300 ms fase 1. */
  offsetMs = 0;

  constructor(private opts: WsClientOpts) {}

  start(): void {
    this.connect();
  }

  stop(): void {
    this.closed = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
  }

  sendAck(ack: Omit<Ack, "kind">): void {
    this.send({ kind: "ack", ...ack });
  }

  private send(obj: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  private connect(): void {
    if (this.closed) return;
    const ws = new WebSocket(this.opts.url);
    this.ws = ws;

    ws.on("open", () => {
      ws.send(JSON.stringify({ kind: "hello", ...this.opts.hello }));
    });

    ws.on("message", (data) => {
      let parsed: ServerMsg;
      try {
        const raw = JSON.parse(data.toString());
        const res = ServerMsgSchema.safeParse(raw);
        if (!res.success) return; // pesan asing → abaikan (whitelist)
        parsed = res.data;
      } catch {
        return;
      }

      if (parsed.kind === "hello_ok") {
        this.retryMs = 1000;
        this.offsetMs = parsed.server_now - Date.now();
        this.opts.onStatus("online");
        this.opts.onClockOffset?.(this.offsetMs);
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => {
          this.send({ kind: "ping", t0: Date.now(), offset_ms: this.offsetMs });
        }, 10_000);
        return;
      }
      if (parsed.kind === "pong") {
        const rtt = Date.now() - parsed.t0;
        this.offsetMs = parsed.server_now + rtt / 2 - Date.now();
        this.opts.onClockOffset?.(this.offsetMs);
        return;
      }
      if (parsed.kind === "cue") {
        this.opts.onCue(parsed);
        return;
      }
      if (parsed.kind === "error") {
        this.opts.onStatus("offline", parsed.message);
        return;
      }
    });

    const retry = (code?: number, alasan?: Buffer | string) => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (this.closed) return;
      // Digantikan app guru lain: JANGAN sambung ulang — kalau dicoba, dua app
      // akan saling menendang bergantian dan gejalanya jadi kelihatan acak.
      if (code === KODE_DIGANTIKAN) {
        this.closed = true;
        const teks = typeof alasan === "string" ? alasan : alasan?.toString() ?? "digantikan koneksi baru";
        this.opts.onStatus("offline", teks);
        this.opts.onDigantikan?.(teks);
        return;
      }
      this.opts.onStatus("offline");
      setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 10_000);
    };
    ws.on("close", (code: number, alasan: Buffer) => retry(code, alasan));
    ws.on("error", () => {
      /* 'close' menyusul; jangan crash */
    });
  }
}
