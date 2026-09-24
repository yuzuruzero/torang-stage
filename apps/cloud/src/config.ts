import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { LEAD_MS, MOVE_OVERLAP_MS } from "@torang/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Akar repo (apps/cloud/src → ../../..) */
export const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
export const APP_ROOT = path.resolve(__dirname, "..");

export interface CloudConfig {
  host: string;
  port: number;
  roomKey: string;
  branch: string;
  room: string;
  leadMs: number;
  overlapMs: number;
  manifestPath: string;
  rundownPath: string;
  cohortPath: string;
  logDir: string;
  ackTimeoutMs: number;
  /** Berkas preset tata layar (disunting dari panel guru). */
  tataPath: string;
  /** Nama scene yang dikenal (kosakata "tampilkan"/"buka"). URL-nya tetap
   *  dipetakan di mesin guru (D18) - cloud cuma tahu NAMANYA. */
  scenes: string[];
}

export function loadConfig(env = process.env): CloudConfig {
  const cfg: CloudConfig = {
    // Default 127.0.0.1 (least exposure). Set HOST=0.0.0.0 hanya saat perlu
    // diakses dari mesin lain di LAN/dev.
    host: env.TORANG_HOST ?? "127.0.0.1",
    port: Number(env.TORANG_PORT ?? 8787),
    roomKey: env.TORANG_ROOM_KEY ?? "dev-room-key",
    branch: env.TORANG_BRANCH ?? "dev",
    room: env.TORANG_ROOM ?? "r1",
    leadMs: Number(env.TORANG_LEAD_MS ?? LEAD_MS),
    overlapMs: Number(env.TORANG_OVERLAP_MS ?? MOVE_OVERLAP_MS),
    manifestPath:
      env.TORANG_MANIFEST ??
      path.join(REPO_ROOT, "apps", "theater", "assets-dev", "manifest.json"),
    rundownPath:
      env.TORANG_RUNDOWN ?? path.join(APP_ROOT, "config", "rundown-dummy.json"),
    cohortPath:
      env.TORANG_COHORT ?? path.join(APP_ROOT, "config", "cohort-dev.json"),
    logDir: env.TORANG_LOG_DIR ?? path.join(APP_ROOT, "logs"),
    ackTimeoutMs: Number(env.TORANG_ACK_TIMEOUT_MS ?? 3000),
    tataPath: env.TORANG_TATA ?? path.join(APP_ROOT, "config", "tata-layar.json"),
    scenes: (env.TORANG_SCENES ?? "office")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter((x) => /^[a-z0-9][a-z0-9_-]{0,31}$/.test(x)),
  };
  fs.mkdirSync(cfg.logDir, { recursive: true });
  return cfg;
}
