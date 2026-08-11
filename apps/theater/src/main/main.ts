/**
 * Proses utama app theater (fase 1: mode teacher).
 *
 * PRINSIP KEAMANAN ENDPOINT (jangan dilanggar):
 * - Setiap cue dari cloud DIVALIDASI ULANG di sini (schema + whitelist type).
 *   Yang tidak dikenal DITOLAK dengan ACK `rejected` — tidak pernah dieksekusi.
 * - Cue hanya bisa memutar konten dari folder aset lokal (lookup lewat
 *   manifest). Tidak ada jalur menjalankan perintah OS dari cue.
 * - Kill switch: STOP (hotkey/panel/cloud) selalu mengembalikan semua ke idle.
 */
import { app, dialog, globalShortcut, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { CueSchema, expandTargets, type Cue } from "@torang/shared";
import { loadTheaterConfig, type TheaterConfig } from "./config.js";
import { createTeacherWindows, type TeacherWindows } from "./windows.js";
import { CloudClient } from "./ws-client.js";
import { loadAssetMap, resolveAssetUrl } from "./assets.js";
import { StudentController } from "./student.js";

const DIST_DIR = __dirname; // dist/
const APP_ROOT = path.resolve(DIST_DIR, "..");
const VERSION: string = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(APP_ROOT, "package.json"), "utf8")).version;
  } catch {
    return "0.0.0";
  }
})();

const cfg: TheaterConfig = (() => {
  try {
    return loadTheaterConfig(APP_ROOT);
  } catch (err) {
    const pesan = (err as Error).message;
    console.error(`[theater] ${pesan}`);
    dialog.showErrorBox("Torang — config bermasalah", pesan);
    app.exit(1);
    process.exit(1); // jangan pernah lanjut dengan mode tebakan
  }
})();

// Multi-instance di satu mesin dev (teacher + beberapa student):
// pisahkan userData per peran/kursi supaya cache Chromium tidak saling kunci.
app.setPath(
  "userData",
  path.join(
    app.getPath("userData"),
    cfg.mode === "student" ? `student-${cfg.seat ?? "tanpa-kursi"}` : "teacher"
  )
);

// ---------------------------------------------------------------------------
// Jendela + agregasi ACK
// ---------------------------------------------------------------------------
let wins: TeacherWindows | null = null;
let client: CloudClient | null = null;
let stateTimer: NodeJS.Timeout | null = null;

interface PendingCue {
  expect: Set<string>; // tv yang belum lapor 'played'
  failed: boolean;
}
const pending = new Map<string, PendingCue>();

/** Cache status terakhir — dikirim ulang saat renderer panel selesai boot
 *  (tanpa ini, status "online" yang datang sebelum listener terpasang hilang). */
const statusCache: Record<string, unknown> = {};

function panelStatus(partial: Record<string, unknown>): void {
  Object.assign(statusCache, partial);
  wins?.panel.webContents.send("panel:status", partial);
}

// ---------------------------------------------------------------------------
// Eksekusi cue (whitelist ketat)
// ---------------------------------------------------------------------------
const SUPPORTED: ReadonlySet<string> = new Set(["PLAY_VIDEO", "STOP"]);

function handleCueMessage(cue: Cue): void {
  if (!client || !wins) return;
  const ackBase = { cue_id: cue.cue_id, endpoint_id: cfg.endpoint_id };

  // Validasi ulang di sisi klien — jangan percaya pesan mentah.
  const parsed = CueSchema.safeParse(cue);
  if (!parsed.success) {
    client.sendAck({ ...ackBase, status: "rejected", detail: "cue gagal validasi schema" });
    return;
  }
  if (!SUPPORTED.has(cue.type)) {
    client.sendAck({
      ...ackBase,
      status: "rejected",
      detail: `type ${cue.type} belum didukung endpoint ini (whitelist)`,
    });
    return;
  }

  const myTvs = expandTargets(cue.targets).filter((t) => wins!.tvs.has(t));
  const playAtLocal = Date.parse(cue.start_at) - Math.round(client.offsetMs);

  if (cue.type === "STOP") {
    for (const [, w] of wins.tvs) w.webContents.send("tv:stop");
    wins.panel.webContents.send("panel:audio", { stop: true });
    pending.clear();
    client.sendAck({ ...ackBase, status: "played", detail: "semua idle" });
    panelStatus({ lastCue: `${cue.cue_id} STOP` });
    return;
  }

  // PLAY_VIDEO
  if (myTvs.length === 0 && !cue.targets.includes("teacher")) {
    client.sendAck({ ...ackBase, status: "rejected", detail: "bukan target endpoint ini" });
    return;
  }

  const fileUrl = cue.asset ? resolveAssetUrl(cue.asset) : null;
  if (cue.asset && !fileUrl) {
    client.sendAck({
      ...ackBase,
      status: "error",
      detail: `aset tidak ditemukan di cache lokal: ${cue.asset}`,
    });
    return;
  }

  const payload = cue.payload as Record<string, unknown>;
  const thenAsset = typeof payload.then_asset === "string" ? payload.then_asset : null;
  const thenUrl = thenAsset ? resolveAssetUrl(thenAsset) : null;

  pending.set(cue.cue_id, { expect: new Set(myTvs), failed: false });
  for (const tv of myTvs) {
    wins.tvs.get(tv)!.webContents.send("tv:cue", {
      cue_id: cue.cue_id,
      role: (payload.role as string) ?? "materi",
      asset: cue.asset,
      fileUrl,
      thenUrl,
      thenLoop: payload.then_loop === true,
      cut: payload.cut === true,
      playAtEpoch: playAtLocal,
    });
  }

  // Audio → PA (diputar dari mesin guru; video di TV muted).
  if (cue.audio) {
    const audioUrl = resolveAssetUrl(cue.audio.asset);
    if (audioUrl) {
      wins.panel.webContents.send("panel:audio", { fileUrl: audioUrl, playAtEpoch: playAtLocal });
    } else {
      panelStatus({ note: `audio tidak ketemu: ${cue.audio.asset}` });
    }
  }

  client.sendAck({ ...ackBase, status: "scheduled", will_play_at: playAtLocal });
  panelStatus({ lastCue: `${cue.cue_id} ${cue.type} → ${myTvs.join(",") || "-"}` });
}

// ---------------------------------------------------------------------------
// Intent via hotkey (jalur SAMA dengan panel & voice nanti: lewat cloud)
// ---------------------------------------------------------------------------
async function sendIntent(intent: Record<string, unknown>): Promise<void> {
  try {
    const res = await fetch(`${cfg.cloud_api}/api/intent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ room_key: cfg.room_key, intent }),
    });
    const j = (await res.json()) as { ok: boolean; note?: string; error?: string };
    panelStatus({ note: j.ok ? (j.note ?? `intent ${intent.intent} terkirim`) : `⚠ ${j.error}` });
  } catch (err) {
    panelStatus({ note: `⚠ cloud tidak terjangkau: ${(err as Error).message}` });
  }
}

// ---------------------------------------------------------------------------
// IPC dari renderer
// ---------------------------------------------------------------------------
ipcMain.handle("boot", (event) => {
  const isPanel = wins?.panel.webContents.id === event.sender.id;
  return {
    mode: cfg.mode,
    endpoint_id: cfg.endpoint_id,
    cloud_api: cfg.cloud_api,
    room_key: cfg.room_key,
    version: VERSION,
    isPanel,
    status: statusCache,
    hotkeys: cfg.hotkeys
      ? { go: "Ctrl+Alt+F9", stop: "Ctrl+Alt+F10", replay: "Ctrl+Alt+F11" }
      : null,
  };
});

ipcMain.on("tv:event", (_e, ev: { cue_id: string; tv: string; status: string; detail?: string }) => {
  const p = pending.get(ev.cue_id);
  if (!p || !client) return;
  if (ev.status === "error") {
    if (!p.failed) {
      p.failed = true;
      client.sendAck({
        cue_id: ev.cue_id,
        endpoint_id: cfg.endpoint_id,
        status: "error",
        detail: `${ev.tv}: ${ev.detail ?? "gagal memutar"}`,
      });
    }
    pending.delete(ev.cue_id);
    return;
  }
  if (ev.status === "played") {
    p.expect.delete(ev.tv);
    if (p.expect.size === 0 && !p.failed) {
      client.sendAck({ cue_id: ev.cue_id, endpoint_id: cfg.endpoint_id, status: "played" });
      pending.delete(ev.cue_id);
    }
  }
});

ipcMain.on("panel:intent", (_e, intent: Record<string, unknown>) => {
  void sendIntent(intent);
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
let studentCtl: StudentController | null = null;

app.whenReady().then(() => {
  if (cfg.mode === "student") {
    studentCtl = new StudentController(cfg, DIST_DIR, VERSION);
    studentCtl.start();
    console.log(
      `[theater] mode=student kursi=${cfg.seat ?? "(pilih di form)"} cloud=${cfg.cloud_api}`
    );
    return;
  }

  loadAssetMap(cfg.assets_dir);
  wins = createTeacherWindows(cfg, DIST_DIR);

  client = new CloudClient({
    url: cfg.cloud_ws,
    hello: {
      role: "teacher",
      endpoint_id: cfg.endpoint_id,
      branch: cfg.branch,
      room: cfg.room,
      room_key: cfg.room_key,
      version: VERSION,
      // Hanya klaim TV yang window-nya benar-benar dibuka (dev_tv_count) —
      // cue ke TV tanpa window akan jelas "tidak ada endpoint" di panel.
      targets: [...wins!.tvs.keys(), "teacher"],
    },
    onCue: (msg) => handleCueMessage(msg.cue),
    onStatus: (status, detail) => panelStatus({ cloud: status, ...(detail ? { note: detail } : {}) }),
    onClockOffset: (ms) => panelStatus({ clock_offset_ms: Math.round(ms) }),
  });
  client.start();

  // Hotkey global — backup senyap guru (dibangun SEBELUM voice, master #4/§14).
  // Pakai tombol F, BUKAN Ctrl+Alt+huruf: di Windows Ctrl+Alt+huruf = AltGr+
  // huruf → pendaftarannya mengganggu pengetikan di app lain (insiden 11 Agu).
  if (cfg.hotkeys) {
    globalShortcut.register("CommandOrControl+Alt+F9", () => void sendIntent({ intent: "GO" }));
    globalShortcut.register("CommandOrControl+Alt+F10", () => void sendIntent({ intent: "STOP" }));
    globalShortcut.register("CommandOrControl+Alt+F11", () => void sendIntent({ intent: "REPLAY" }));
  } else {
    console.log("[theater] hotkey global DIMATIKAN lewat config (hotkeys: false)");
  }

  // Umpan state live ke panel operator (murid online, binding, show-state).
  // Fetch di MAIN (bukan renderer) — renderer file:// kena CORS.
  stateTimer = setInterval(async () => {
    if (!wins || wins.panel.isDestroyed()) return;
    try {
      const res = await fetch(`${cfg.cloud_api}/api/state`);
      if (res.ok) wins.panel.webContents.send("panel:state", await res.json());
    } catch {
      /* offline sudah ditandai lewat status WS */
    }
  }, 1500);

  console.log(
    `[theater] mode=${cfg.mode} endpoint=${cfg.endpoint_id} cloud=${cfg.cloud_api} aset=${cfg.assets_dir}`
  );
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (stateTimer) clearInterval(stateTimer);
  client?.stop();
  studentCtl?.stop();
});

app.on("window-all-closed", () => {
  app.quit();
});
