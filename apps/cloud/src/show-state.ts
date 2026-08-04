/**
 * Show-state (master §7): cloud memegang "Torang sedang di layar mana",
 * arah terakhir, dan modul aktif. Dari sini arah klip exit/enter dipilih
 * OTOMATIS — guru tidak pernah memikirkan arah (disiplin arah = HUKUM §6).
 *
 * Geometri fase 1: layar dimodelkan sebagai RING searah jarum jam mengikuti
 * penomoran TV di ruangan asli (tv1 depan-kiri → tv2 depan-kanan → tv3
 * belakang-kanan → tv4 belakang-kiri). Bergerak searah jarum jam = keluar ke
 * KANAN, disambut masuk dari KIRI di layar tujuan. Arah dipilih dari jalur
 * ring TERPENDEK; seri → default searah jarum jam.
 * ASUMSI (dicatat di DECISIONS.md): kalibrasi ulang bersama tim video saat
 * uji di ruangan asli; peta ini nanti pindah ke registry per-ruangan.
 */
import type { Direction } from "@torang/shared";

export interface RoomGeometry {
  /** Urutan layar searah jarum jam. Posisi komp murid menyusul (fase 2). */
  ring: string[];
}

export const DEFAULT_GEOMETRY: RoomGeometry = {
  ring: ["tv1", "tv2", "tv3", "tv4"],
};

export interface ShowState {
  /** Layar tempat Torang berada sekarang; null = tidak di layar mana pun. */
  screen: string | null;
  lastDir: Direction | null;
  /** Modul aktif (sumber klip transisi & materi). */
  activeModule: string | null;
}

export function initialShowState(): ShowState {
  return { screen: null, lastDir: null, activeModule: null };
}

/**
 * Arah gerak dari `from` ke `to` pada ring.
 * "right" = searah jarum jam (exit_r → enter_l), "left" = sebaliknya.
 */
export function resolveDirection(
  geom: RoomGeometry,
  from: string,
  to: string
): Direction {
  const iFrom = geom.ring.indexOf(from);
  const iTo = geom.ring.indexOf(to);
  if (iFrom < 0 || iTo < 0) {
    throw new Error(`layar di luar geometri ring: ${from} → ${to}`);
  }
  if (iFrom === iTo) {
    throw new Error(`asal dan tujuan sama: ${from}`);
  }
  const n = geom.ring.length;
  const cw = (iTo - iFrom + n) % n; // langkah searah jarum jam
  const ccw = n - cw;
  // Seri (layar berseberangan) → default searah jarum jam.
  return cw <= ccw ? "right" : "left";
}
