import { BrowserWindow, screen } from "electron";
import path from "node:path";
import { TV_TARGETS } from "@torang/shared";
import type { TheaterConfig } from "./config.js";

export interface TeacherWindows {
  panel: BrowserWindow;
  tvs: Map<string, BrowserWindow>; // "tv1".."tv4"
}

/**
 * Bikin SATU window TV. Dipisah dari createTeacherWindows supaya window yang
 * hilang (tertutup tidak sengaja atau renderer-nya mati) bisa dibuka ulang
 * tanpa menutup seluruh panggung — insiden uji 16 Sep 2026.
 */
export function buatWindowTv(
  cfg: TheaterConfig,
  distDir: string,
  tv: string,
  index: number
): BrowserWindow {
  const preload = path.join(distDir, "preload.cjs");
  const common = {
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false },
  };
  const displays = screen.getAllDisplays();
  const useKiosk = cfg.kiosk && !cfg.dev_layout && displays.length >= 5;

  let win: BrowserWindow;
  if (useKiosk) {
    // Display 0 = panel operator; TV1..TV4 → display 1..4.
    // Pemetaan display↔TV final dikalibrasi di ruangan asli (config menyusul).
    const d = displays[index + 1] ?? displays[displays.length - 1]!;
    win = new BrowserWindow({
      ...common,
      x: d.bounds.x,
      y: d.bounds.y,
      fullscreen: true,
      frame: false,
      title: `TV ${index + 1}`,
      backgroundColor: "#000000",
    });
  } else {
    // Layout dev: grid 2×2 di kanan-atas area kerja.
    const area = screen.getPrimaryDisplay().workArea;
    const w = 480;
    const h = 270;
    const gap = 8;
    const x0 = area.x + area.width - 2 * (w + gap);
    const y0 = area.y + 28;
    const col = index % 2;
    const row = Math.floor(index / 2);
    win = new BrowserWindow({
      ...common,
      x: x0 + col * (w + gap),
      y: y0 + row * (h + gap + 24),
      width: w,
      height: h,
      title: `TV ${index + 1} (${tv})`,
      backgroundColor: "#000000",
    });
  }
  win.setMenuBarVisibility(false);
  void win.loadFile(path.join(distDir, "renderer", "tv.html"), { query: { tv } });
  return win;
}

/**
 * Buka ulang window TV yang hilang. Mengembalikan daftar yang benar-benar
 * dibuka (yang masih hidup tidak diganggu — tidak ada tayangan yang terputus).
 */
export function bukaUlangTv(
  cfg: TheaterConfig,
  distDir: string,
  wins: TeacherWindows,
  mana: string[]
): string[] {
  const dibuka: string[] = [];
  for (const tv of mana) {
    const index = (TV_TARGETS as readonly string[]).indexOf(tv);
    if (index < 0) continue;
    const ada = wins.tvs.get(tv);
    if (ada && !ada.isDestroyed()) continue; // masih hidup — jangan disentuh
    const win = buatWindowTv(cfg, distDir, tv, index);
    win.on("closed", () => {
      if (wins.tvs.get(tv) === win) wins.tvs.delete(tv);
    });
    wins.tvs.set(tv, win);
    dibuka.push(tv);
  }
  return dibuka;
}

/** Daftar TV yang SEHARUSNYA ada menurut config (dev_tv_count / kiosk). */
export function tvYangDiharapkan(cfg: TheaterConfig): string[] {
  const displays = screen.getAllDisplays();
  const useKiosk = cfg.kiosk && !cfg.dev_layout && displays.length >= 5;
  const jumlah = useKiosk
    ? TV_TARGETS.length
    : Math.min(TV_TARGETS.length, Math.max(1, cfg.dev_tv_count || 4));
  return TV_TARGETS.slice(0, jumlah);
}

export function createTeacherWindows(
  cfg: TheaterConfig,
  distDir: string
): TeacherWindows {
  const preload = path.join(distDir, "preload.cjs");
  const common = {
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false },
  };

  // Panel di kiri-atas supaya tidak menutup grid TV dev di kanan.
  const area = screen.getPrimaryDisplay().workArea;
  const panel = new BrowserWindow({
    ...common,
    x: area.x + 8,
    y: area.y + 28,
    width: Math.max(520, Math.min(880, area.width - 2 * (480 + 8) - 24)),
    height: 640,
    title: "Panel Operator — Panggung Torang",
    backgroundColor: "#101528",
  });
  void panel.loadFile(path.join(distDir, "renderer", "panel.html"));

  const wins: TeacherWindows = { panel, tvs: new Map() };
  bukaUlangTv(cfg, distDir, wins, tvYangDiharapkan(cfg));

  // Panel operator ditutup = panggung dimatikan. Tanpa ini, 4 window TV
  // tertinggal hidup tanpa kendali dan harus ditutup satu-satu — merepotkan,
  // dan gampang tertukar dengan window app baru yang posisinya sama persis.
  panel.on("closed", () => {
    for (const [, w] of wins.tvs) {
      if (!w.isDestroyed()) w.close();
    }
    wins.tvs.clear();
  });

  return wins;
}
