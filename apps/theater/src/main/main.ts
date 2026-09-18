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
import { createTeacherWindows, type TeacherWindows, bukaUlangTv, tvYangDiharapkan } from "./windows.js";
import { CloudClient } from "./ws-client.js";
import { loadAssetMap, resolveAssetUrl } from "./assets.js";
import { StudentController } from "./student.js";
import { Voice, type StatusVoice } from "./voice.js";

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
let voice: Voice | null = null;

interface PendingCue {
  expect: Set<string>; // tv yang belum lapor 'played'
  failed: boolean;
}
const pending = new Map<string, PendingCue>();

/** Cache status terakhir — dikirim ulang saat renderer panel selesai boot
 *  (tanpa ini, status "online" yang datang sebelum listener terpasang hilang). */
const statusCache: Record<string, unknown> = {};
/** Alasan yang sama untuk voice: `mulai()` melapor "diam" SEBELUM renderer
 *  panel selesai memuat, jadi pesan pertamanya selalu hilang. */
let statusVoice: StatusVoice | null = null;

function panelStatus(partial: Record<string, unknown>): void {
  Object.assign(statusCache, partial);
  wins?.panel.webContents.send("panel:status", partial);
}

// ---------------------------------------------------------------------------
// Eksekusi cue (whitelist ketat)
// ---------------------------------------------------------------------------
const SUPPORTED: ReadonlySet<string> = new Set([
  "PLAY_VIDEO",
  "STOP",
  "SWITCH_SCENE",
  "REOPEN_WINDOW",
]);

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

  // PENTING: ditangani SEBELUM penyaringan myTvs. Window yang hilang sudah
  // dihapus dari peta, jadi kalau lewat filter itu justru selalu "bukan target
  // endpoint ini" — persis TV yang perlu dibuka malah ditolak.
  if (cue.type === "REOPEN_WINDOW") {
    const diminta = expandTargets(cue.targets).filter((t) => t.startsWith("tv"));
    const hilang = diminta.filter((tv) => {
      const w = wins!.tvs.get(tv);
      return !w || w.isDestroyed();
    });
    if (hilang.length === 0) {
      client.sendAck({ ...ackBase, status: "played", detail: "semua window TV masih ada" });
      panelStatus({ note: "buka ulang window: tidak ada yang hilang" });
      return;
    }
    const dibuka = bukaUlangTv(cfg, DIST_DIR, wins, hilang);
    client.sendAck({ ...ackBase, status: "played", detail: `dibuka ulang: ${dibuka.join(", ")}` });
    panelStatus({ note: `window TV dibuka ulang: ${dibuka.join(", ")}` });
    console.log(`[theater] window TV dibuka ulang lewat cue: ${dibuka.join(", ")}`);
    return;
  }

  if (cue.type === "STOP") {
    for (const [, w] of wins.tvs) w.webContents.send("tv:stop");
    wins.panel.webContents.send("panel:audio", { stop: true });
    pending.clear();
    client.sendAck({ ...ackBase, status: "played", detail: "semua idle" });
    panelStatus({ lastCue: `${cue.cue_id} STOP` });
    return;
  }

  if (cue.type === "SWITCH_SCENE") {
    if (myTvs.length === 0) {
      client.sendAck({ ...ackBase, status: "rejected", detail: "bukan target endpoint ini" });
      return;
    }
    const nama = (cue.payload as Record<string, unknown>).scene;
    // payload.scene === null artinya TUTUP scene (kembali idle).
    if (nama === null || nama === undefined) {
      for (const tv of myTvs) wins.tvs.get(tv)!.webContents.send("tv:stop");
      client.sendAck({ ...ackBase, status: "played", detail: "scene ditutup" });
      panelStatus({ lastCue: `${cue.cue_id} SCENE tutup` });
      return;
    }
    // Nama → URL dipetakan di SINI, dari config mesin ini. Cue tidak pernah
    // membawa alamat, jadi jaringan tidak bisa menyuruh TV membuka apa pun.
    const url = typeof nama === "string" ? cfg.scenes?.[nama] : undefined;
    if (!url) {
      client.sendAck({
        ...ackBase,
        status: "error",
        detail: `scene "${String(nama)}" tidak ada di config mesin ini (scenes: ${Object.keys(cfg.scenes ?? {}).join(", ") || "kosong"})`,
      });
      return;
    }
    for (const tv of myTvs) {
      wins.tvs.get(tv)!.webContents.send("tv:scene", { cue_id: cue.cue_id, scene: nama, url });
    }
    client.sendAck({ ...ackBase, status: "played", detail: `scene ${nama}` });
    panelStatus({ lastCue: `${cue.cue_id} SCENE ${nama}` });
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
    voice: statusVoice,
    voice_tombol: cfg.voice.enabled ? cfg.voice.tombol : null,
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

async function postRoster(pathname: string, body: Record<string, unknown>): Promise<void> {
  try {
    const res = await fetch(`${cfg.cloud_api}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ room_key: cfg.room_key, ...body }),
    });
    const j = (await res.json()) as { ok: boolean; error?: string; removed?: number | boolean };
    panelStatus({
      note: j.ok
        ? pathname.includes("reset")
          ? `reset murid: ${j.removed ?? 0} kursi dilepas`
          : "kursi dilepas"
        : `⚠ ${j.error}`,
    });
  } catch (err) {
    panelStatus({ note: `⚠ cloud tidak terjangkau: ${(err as Error).message}` });
  }
}

/**
 * Buka ulang window TV yang hilang — tanpa menutup panggung.
 * Insiden uji 16 Sep 2026: satu window TV lenyap saat kelas berjalan dan
 * satu-satunya jalan pulih adalah menutup semuanya lalu menyalakan ulang.
 */
ipcMain.on("panel:buka-tv", (_e, mana: string) => {
  if (!wins) return;
  const daftar = mana && mana !== "semua" ? [mana] : tvYangDiharapkan(cfg);
  const hilang = daftar.filter((tv) => {
    const w = wins!.tvs.get(tv);
    return !w || w.isDestroyed();
  });
  if (hilang.length === 0) {
    panelStatus({ note: "semua window TV masih ada — tidak ada yang perlu dibuka" });
    return;
  }
  const dibuka = bukaUlangTv(cfg, DIST_DIR, wins, hilang);
  panelStatus({ note: `window TV dibuka ulang: ${dibuka.join(", ")}` });
  console.log(`[theater] window TV dibuka ulang: ${dibuka.join(", ")}`);
});

ipcMain.on("panel:unbind", (_e, seat: string) => {
  if (typeof seat === "string" && /^komp([1-9]|1[0-9]|20)$/.test(seat)) {
    void postRoster("/api/unbind", { seat_id: seat });
  }
});

ipcMain.on("panel:reset-murid", () => {
  void postRoster("/api/roster/reset", {});
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
    onDigantikan: (alasan) => {
      // App guru LAIN mengambil alih endpoint_id ini. App yang ini sudah tidak
      // menerima cue apa pun — window-nya cuma jadi jebakan visual: tampil di
      // koordinat yang sama dengan app baru, tapi mati. Insiden uji 16 Sep 2026
      // menghabiskan waktu lama persis karena itu. Jadi: tutup diri.
      console.error(`[theater] ${alasan} — app guru lain mengambil alih, menutup diri.`);
      dialog.showErrorBox(
        "Panggung ini digantikan",
        "Ada app Panggung Torang LAIN yang baru dijalankan dan mengambil alih.\n\n" +
          "App yang ini sudah tidak menerima cue, jadi ditutup supaya window-nya\n" +
          "tidak tertukar dengan yang baru.\n\nPakai jendela panggung yang baru."
      );
      app.quit();
    },
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

  // --- Voice command (PTT) -------------------------------------------------
  // Intent dari suara lewat parser grammar tertutup yang SAMA dengan jalur
  // teks, lalu masuk sendIntent seperti tombol panel. Tidak ada jalan pintas
  // dari suara langsung ke cue.
  if (cfg.voice.enabled) {
    voice = new Voice(cfg.voice, APP_ROOT, sendIntent, (s: StatusVoice) => {
      // Hasil (didengar/intent/alasan) TIDAK ditimpa oleh laporan keadaan
      // berikutnya: tiap ucapan berakhir dengan "diam", dan kalau hasilnya
      // ikut terhapus, kalimat yang ditolak lenyap sebelum sempat dibaca.
      statusVoice = s.didengar || s.alasan || s.intent
        ? s
        : { ...(statusVoice ?? {}), keadaan: s.keadaan };
      wins?.panel.webContents.send("panel:voice", s);
      if (s.intent) console.log(`[voice] "${s.didengar}" -> ${JSON.stringify(s.intent)} (${s.ms ?? "?"} ms)`);
      else if (s.alasan) console.log(`[voice] "${s.didengar ?? ""}" DITOLAK: ${s.alasan}`);
    });
    const hasil = voice.mulai(cfg.cloud_api);
    console.log(`[theater] ${hasil.ok ? "voice AKTIF" : "voice TIDAK aktif"}: ${hasil.pesan}`);
    panelStatus({ note: hasil.ok ? `🎤 ${hasil.pesan}` : `⚠ voice: ${hasil.pesan}` });
    if (!hasil.ok) {
      voice = null;
      statusVoice = { keadaan: "mati", alasan: hasil.pesan };
      wins?.panel.webContents.send("panel:voice", statusVoice);
    }
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
  voice?.berhenti();
  globalShortcut.unregisterAll();
  if (stateTimer) clearInterval(stateTimer);
  client?.stop();
  studentCtl?.stop();
});

app.on("window-all-closed", () => {
  app.quit();
});
