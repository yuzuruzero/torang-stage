import { BrowserWindow, screen } from "electron";
import path from "node:path";
import { TV_TARGETS } from "@torang/shared";
import type { TheaterConfig } from "./config.js";

export interface TeacherWindows {
  panel: BrowserWindow;
  tvs: Map<string, BrowserWindow>; // "tv1".."tv4"
}

export function createTeacherWindows(
  cfg: TheaterConfig,
  distDir: string
): TeacherWindows {
  const preload = path.join(distDir, "preload.cjs");
  const common = {
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
    },
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

  const tvs = new Map<string, BrowserWindow>();
  const displays = screen.getAllDisplays();
  const useKiosk = cfg.kiosk && !cfg.dev_layout && displays.length >= 5;

  // Dev di PC lemah: batasi jumlah window TV (kiosk selalu 4).
  const jumlahTv = useKiosk
    ? TV_TARGETS.length
    : Math.min(TV_TARGETS.length, Math.max(1, cfg.dev_tv_count || 4));

  TV_TARGETS.slice(0, jumlahTv).forEach((tv, i) => {
    let win: BrowserWindow;
    if (useKiosk) {
      // Display 0 = panel operator; TV1..TV4 → display 1..4.
      // Pemetaan display↔TV final dikalibrasi di ruangan asli (config menyusul).
      const d = displays[i + 1] ?? displays[displays.length - 1]!;
      win = new BrowserWindow({
        ...common,
        x: d.bounds.x,
        y: d.bounds.y,
        fullscreen: true,
        frame: false,
        title: `TV ${i + 1}`,
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
      const col = i % 2;
      const row = Math.floor(i / 2);
      win = new BrowserWindow({
        ...common,
        x: x0 + col * (w + gap),
        y: y0 + row * (h + gap + 24),
        width: w,
        height: h,
        title: `TV ${i + 1} (${tv})`,
        backgroundColor: "#000000",
      });
    }
    win.setMenuBarVisibility(false);
    void win.loadFile(path.join(distDir, "renderer", "tv.html"), {
      query: { tv },
    });
    tvs.set(tv, win);
  });

  return { panel, tvs };
}
