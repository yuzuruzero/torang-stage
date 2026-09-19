/**
 * Tipe untuk saran.mjs, bersebelahan dengan modulnya (alasan yang sama seperti
 * parser.d.mts: deklarasi wildcard tidak berlaku untuk impor relatif).
 */
export function kalimatSah(vocab?: { aliases?: { alias: string }[] } | null): string[];
export function jarakKalimat(a: string, b: string): number;
export function cariSaran(
  didengar: string,
  vocab?: { aliases?: { alias: string }[] } | null
): { kalimat: string; jarak: number; intent: Record<string, unknown> } | null;
