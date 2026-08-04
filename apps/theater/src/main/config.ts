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
  };
  const file =
    process.env.TORANG_THEATER_CONFIG ??
    path.join(appRoot, "torang-theater.config.json");
  if (fs.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      return { ...defaults, ...parsed };
    } catch (err) {
      console.error(`[theater] config rusak (${file}):`, err);
    }
  }
  return defaults;
}
