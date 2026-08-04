/**
 * Registry endpoint: siapa yang tersambung, melayani target apa, kapan
 * terakhir terlihat, dan taksiran offset jam (untuk tanda merah >250 ms).
 */
import type { WebSocket } from "ws";
import type { Hello } from "@torang/shared";

export interface EndpointConn {
  id: string;
  role: Hello["role"];
  targets: Set<string>;
  version: string;
  ws: WebSocket;
  lastSeen: number;
  clockOffsetMs: number | null;
}

export class Registry {
  private byId = new Map<string, EndpointConn>();

  upsert(hello: Hello, ws: WebSocket): EndpointConn {
    // Koneksi baru dengan endpoint_id sama menggantikan yang lama
    // (restart app = kejadian normal, jangan jadi error).
    const existing = this.byId.get(hello.endpoint_id);
    if (existing && existing.ws !== ws) {
      try {
        existing.ws.close(4000, "digantikan koneksi baru");
      } catch {
        /* abaikan */
      }
    }
    const conn: EndpointConn = {
      id: hello.endpoint_id,
      role: hello.role,
      targets: new Set(hello.targets),
      version: hello.version,
      ws,
      lastSeen: Date.now(),
      clockOffsetMs: null,
    };
    this.byId.set(conn.id, conn);
    return conn;
  }

  touch(id: string): void {
    const c = this.byId.get(id);
    if (c) c.lastSeen = Date.now();
  }

  setClockOffset(id: string, offsetMs: number): void {
    const c = this.byId.get(id);
    if (c) c.clockOffsetMs = offsetMs;
  }

  removeBySocket(ws: WebSocket): EndpointConn | undefined {
    for (const [id, c] of this.byId) {
      if (c.ws === ws) {
        this.byId.delete(id);
        return c;
      }
    }
    return undefined;
  }

  get(id: string): EndpointConn | undefined {
    return this.byId.get(id);
  }

  /** Endpoint pemain (teacher/student) yang melayani ≥1 target konkret ini. */
  forTargets(concreteTargets: readonly string[]): EndpointConn[] {
    const out: EndpointConn[] = [];
    for (const c of this.byId.values()) {
      if (c.role === "panel") continue;
      if (concreteTargets.some((t) => c.targets.has(t))) out.push(c);
    }
    return out;
  }

  all(): EndpointConn[] {
    return [...this.byId.values()];
  }

  info() {
    return this.all().map((c) => ({
      endpoint_id: c.id,
      role: c.role,
      targets: [...c.targets],
      online: true,
      last_seen: c.lastSeen,
      clock_offset_ms: c.clockOffsetMs,
      version: c.version,
    }));
  }
}
