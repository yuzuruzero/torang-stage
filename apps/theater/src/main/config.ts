import fs from "node:fs";
import path from "node:path";

export interface TheaterConfig {
  /** teacher | student (student menyusul — fase 1 langkah 3). */
  mode: "teacher" | "student";
  endpoint_id: string;
  cloud_ws: string;
  cloud_api: string;
  room_key: string;
  branch: string;
  room: string;
  /** Folder aset lokal (cache konten; dev: assets-dev placeholder). */
  assets_dir: string;
  /** true = 4 window kecil di 1 monitor (dev); false + kiosk = fullscreen per display. */
  dev_layout: boolean;
  kiosk: boolean;
  /** Dev: jumlah window TV yang dibuka (1–4). Kecilkan di PC lemah. */
  dev_tv_count: number;
  /** Hotkey global GO/STOP/ULANG. false = matikan total (dev di PC kerja).
   *  PENTING: jangan pakai Ctrl+Alt+HURUF — di Windows itu = AltGr+huruf dan
   *  mengganggu pengetikan di app lain (insiden Claude desktop, 11 Agu). */
  hotkeys: boolean;
  /** Mode student: kursi preset dari config mesin (murid tinggal pilih nama). */
  seat: string | null;
  /** Mode student: login otomatis tanpa klik (dev/smoke test) — nama ketik
   *  ATAU student_id dari cohort. */
  auto_login: { nama?: string; student_id?: string } | null;
}

export function loadTheaterConfig(appRoot: string): TheaterConfig {
  const defaults: TheaterConfig = {
    mode: "teacher",
    endpoint_id: "teacher-1",
    cloud_ws: "ws://127.0.0.1:8787/ws",
    cloud_api: "http://127.0.0.1:8787",
    room_key: "dev-room-key",
    branch: "dev",
    room: "r1",
    assets_dir: path.join(appRoot, "assets-dev"),
    dev_layout: true,
    kiosk: false,
    dev_tv_count: 4,
    hotkeys: true,
    seat: null,
    auto_login: null,
  };
  // --config=path CLI (aman untuk PowerShell/cmd, tanpa env var)
  const cliCfg = process.argv
    .find((a) => a.startsWith("--config="))
    ?.slice("--config=".length);
  const file =
    (cliCfg && path.resolve(appRoot, cliCfg)) ??
    process.env.TORANG_THEATER_CONFIG ??
    path.join(appRoot, "torang-theater.config.json");
  if (fs.existsSync(file)) {
    let parsed: Partial<TheaterConfig>;
    try {
      // PowerShell 5.1 menulis UTF-8 BER-BOM — buang dulu, JSON.parse tersedak BOM.
      const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
      parsed = JSON.parse(raw) as Partial<TheaterConfig>;
    } catch (err) {
      // JANGAN diam-diam jatuh ke default (insiden PC murid berubah jadi
      // panggung, 11 Agu) — gagal harus JELAS.
      throw new Error(
        `Config tidak bisa dibaca: ${file}\n${(err as Error).message}\n` +
          `Perbaiki isi file itu (JSON valid, tanpa BOM) atau hapus, lalu jalankan lagi.`
      );
    }
    const cfg = { ...defaults, ...parsed };
    if (cfg.mode !== "teacher" && cfg.mode !== "student") {
      throw new Error(
        `Config ${file}: mode tidak dikenal "${String(cfg.mode)}" (harus "teacher" atau "student").`
      );
    }
    return cfg;
  }
  return defaults;
}
