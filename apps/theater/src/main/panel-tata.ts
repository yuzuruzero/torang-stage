/**
 * Preset tata layar dari panel operator: simpan & hapus lewat cloud.
 *
 * Kenapa lewat main, bukan fetch langsung dari renderer: renderer panel berjalan
 * dari file:// (kena CORS), dan kunci ruangan cukup dipegang proses main -
 * pola yang sama dengan unbind & reset murid.
 *
 * Berkas terpisah dari main.ts dengan sengaja (24 Sep 2026): main.ts sedang
 * punya perubahan yang belum di-commit di PC guru baru (decoder video), jadi
 * sentuhan ke sana dibuat sekecil mungkin - cukup satu baris pemanggil.
 */
import { ipcMain } from "electron";

type Hasil = { ok: boolean; error?: string; presets?: unknown[] };

async function kirim(api: string, jalur: string, body: Record<string, unknown>): Promise<Hasil> {
  try {
    const res = await fetch(`${api}${jalur}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as Hasil;
  } catch (err) {
    return { ok: false, error: `cloud tidak terjangkau: ${(err as Error).message}` };
  }
}

export function pasangIpcTata(cfg: { cloud_api: string; room_key: string }): void {
  ipcMain.handle("tata:simpan", (_e, preset: unknown) =>
    kirim(cfg.cloud_api, "/api/tata", { room_key: cfg.room_key, preset })
  );
  ipcMain.handle("tata:hapus", (_e, nama: unknown) =>
    kirim(cfg.cloud_api, "/api/tata/hapus", { room_key: cfg.room_key, nama })
  );
  // Kolom rundown panel guru: "ulang rundown dari awal".
  ipcMain.handle("rundown:reset", () =>
    kirim(cfg.cloud_api, "/api/rundown/reset", { room_key: cfg.room_key })
  );
}
