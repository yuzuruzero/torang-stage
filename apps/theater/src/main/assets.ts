/**
 * Peta aset lokal (cache konten): nama aset → file di assets_dir,
 * bersumber dari manifest (kontrak §6). Dipakai mode teacher & student.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ManifestSchema } from "@torang/shared";

const assetFiles = new Map<string, string>();
let assetsDir = "";

export function loadAssetMap(dir: string): void {
  assetsDir = dir;
  assetFiles.clear();
  const p = path.join(dir, "manifest.json");
  try {
    const manifest = ManifestSchema.parse(JSON.parse(fs.readFileSync(p, "utf8")));
    for (const mod of manifest.modules) {
      for (const a of mod.assets) {
        assetFiles.set(a.file.replace(/\.[^.]+$/, ""), a.file);
      }
      for (const a of mod.audio) {
        assetFiles.set(a.file.replace(/\.[^.]+$/, ""), a.file);
        assetFiles.set(a.file, a.file); // audio dirujuk pakai nama file penuh
      }
    }
    console.log(`[theater] manifest: ${manifest.release}, ${assetFiles.size} aset dikenal`);
  } catch (err) {
    console.error(`[theater] gagal baca manifest aset (${p}):`, (err as Error).message);
  }
}

export function resolveAssetUrl(assetOrFile: string): string | null {
  const file = assetFiles.get(assetOrFile);
  if (!file) return null;
  const abs = path.join(assetsDir, file);
  if (!fs.existsSync(abs)) return null;
  return pathToFileURL(abs).href;
}
