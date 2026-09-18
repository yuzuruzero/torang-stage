/** Tipe untuk normalisasi-stt.mjs — bersebelahan dengan modulnya (lihat parser.d.mts). */
export interface HasilRapi {
  ok: boolean;
  teks: string;
  perubahan: { dari: string; jadi: string }[];
  alasanTolak?: string;
}
export function rapikanTranskrip(mentah: string, petaTambahan?: Map<string, string>): HasilRapi;
export const PETA_KATA: Map<string, string>;
export const BUKAN_PEMANGGIL: Set<string>;
export const FRASA_HALUSINASI: RegExp[];
