/**
 * Peta aset lokal (cache konten): nama aset → file di assets_dir,
 * bersumber dari manifest (kontrak §6). Dipakai mode teacher & student.
 *
 * Peta ini dimuat sekali saat app start, LALU dimuat ulang sendiri kalau
 * datang cue yang menyebut aset asing — supaya video yang baru didaftarkan
 * (`tools/cli/torang-modul.mjs`) bisa langsung diputar tanpa tutup-buka app.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ManifestSchema } from "@torang/shared";

let assetFiles = new Map<string, string>();
let assetsDir = "";
let muatTerakhir = 0;

/** Jeda minimum antar-muat-ulang otomatis. Cue datang berombongan (exit +
 *  enter), jadi tanpa jeda satu manifest rusak dibaca berkali-kali. */
const JEDA_MUAT_ULANG_MS = 3000;

/** Baca manifest → peta baru. Melempar kalau manifest tidak sah. */
function bacaPeta(dir: string): Map<string, string> {
  const p = path.join(dir, "manifest.json");
  const manifest = ManifestSchema.parse(JSON.parse(fs.readFileSync(p, "utf8")));
  const peta = new Map<string, string>();
  for (const mod of manifest.modules) {
    for (const a of mod.assets) {
      peta.set(a.file.replace(/\.[^.]+$/, ""), a.file);
    }
    for (const a of mod.audio) {
      peta.set(a.file.replace(/\.[^.]+$/, ""), a.file);
      peta.set(a.file, a.file); // audio dirujuk pakai nama file penuh
    }
  }
  console.log(`[theater] manifest: ${manifest.release}, ${peta.size} aset dikenal`);
  return peta;
}

export function loadAssetMap(dir: string): void {
  assetsDir = dir;
  muatTerakhir = Date.now();
  try {
    // Peta lama HANYA diganti kalau manifest baru sah. Manifest rusak dulu
    // mengosongkan peta — aset yang tadinya jalan ikut hilang.
    assetFiles = bacaPeta(dir);
  } catch (err) {
    console.error(
      `[theater] gagal baca manifest aset (${path.join(dir, "manifest.json")}):`,
      (err as Error).message
    );
    if (assetFiles.size > 0) {
      console.error(`[theater] peta aset lama dipertahankan (${assetFiles.size} aset)`);
    }
  }
}

export function resolveAssetUrl(assetOrFile: string): string | null {
  let file = assetFiles.get(assetOrFile);

  // Aset asing: mungkin manifest baru bertambah sejak app dinyalakan.
  // Coba muat ulang sekali (berjeda), baru menyerah.
  if (!file && assetsDir && Date.now() - muatTerakhir > JEDA_MUAT_ULANG_MS) {
    console.log(`[theater] aset "${assetOrFile}" belum dikenal — memuat ulang manifest`);
    loadAssetMap(assetsDir);
    file = assetFiles.get(assetOrFile);
  }

  if (!file) return null;
  const abs = path.join(assetsDir, file);
  if (!fs.existsSync(abs)) return null;
  return pathToFileURL(abs).href;
}
