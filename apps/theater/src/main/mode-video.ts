/**
 * Mode video per PC: "normal" (decoder software, D21) atau "cadangan" (decoder
 * kartu grafis). Diganti lewat TOMBOL di layar - panel guru dan jendela login
 * murid - bukan dengan menyunting config (permintaan Hadi 24 Sep 2026: "kamu
 * pikir yang pake pc murid ngerti begitu").
 *
 * Disimpan di folder data app PC itu sendiri (userData), bukan di config repo:
 * pilihan ini soal perangkat keras mesin tersebut, jadi ia harus bertahan saat
 * repo di-update atau panel dipasang ulang, dan tidak boleh ikut ter-commit.
 *
 * Switch Chromium hanya berlaku kalau dipasang SEBELUM app siap, jadi mengganti
 * mode = simpan pilihan lalu app membuka ulang dirinya sendiri.
 */
import { app, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";

export type ModeVideo = { kartu_grafis: boolean };

const berkas = () => path.join(app.getPath("userData"), "mode-video.json");

export function bacaModeVideo(): ModeVideo {
  try {
    const j = JSON.parse(fs.readFileSync(berkas(), "utf8").replace(/^﻿/, "")) as Partial<ModeVideo>;
    return { kartu_grafis: j.kartu_grafis === true };
  } catch {
    return { kartu_grafis: false }; // bawaan: decoder software (D21)
  }
}

/** Pasang switch decoder. WAJIB dipanggil sebelum app 'ready' dan SETELAH
 *  userData ditetapkan (pilihan disimpan per peran/kursi). */
export function terapkanModeVideo(): ModeVideo {
  const mode = bacaModeVideo();
  if (!mode.kartu_grafis) app.commandLine.appendSwitch("disable-accelerated-video-decode");
  return mode;
}

export function pasangIpcModeVideo(): void {
  ipcMain.handle("video:mode", () => bacaModeVideo());
  ipcMain.handle("video:mode-ganti", (_e, kartuGrafis: unknown) => {
    const mode: ModeVideo = { kartu_grafis: kartuGrafis === true };
    try {
      fs.mkdirSync(path.dirname(berkas()), { recursive: true });
      fs.writeFileSync(berkas(), JSON.stringify(mode, null, 2) + "\n", "utf8");
    } catch (err) {
      return { ok: false, error: `tidak bisa menyimpan pilihan: ${(err as Error).message}` };
    }
    console.log(`[theater] mode video -> ${mode.kartu_grafis ? "cadangan (kartu grafis)" : "normal (prosesor)"}; membuka ulang app`);
    // Beri renderer sesaat untuk menampilkan "membuka ulang...". Argumen asli
    // (mis. --config=... mode murid) ikut dibawa.
    setTimeout(() => {
      app.relaunch({ args: process.argv.slice(1) });
      app.exit(0);
    }, 400);
    return { ok: true };
  });
}
