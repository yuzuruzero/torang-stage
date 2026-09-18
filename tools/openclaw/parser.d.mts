/**
 * Tipe untuk parser.mjs, ditaruh BERSEBELAHAN dengan modulnya.
 *
 * Bukan lewat deklarasi wildcard (`declare module` dengan pola bintang):
 * wildcard tidak berlaku untuk impor relatif - TypeScript menyelesaikannya
 * sebagai berkas, lalu mengeluh modulnya "implicitly any". Berkas .d.mts di
 * samping .mjs adalah mekanisme yang memang dipakai TypeScript untuk ini.
 *
 * Parsernya sendiri tetap JS polos, supaya CLI, tes, dan app memakai SATU
 * perilaku yang sama - bukan dua salinan yang menyimpang diam-diam.
 */
export type HasilParse =
  | { ok: true; intent: Record<string, unknown>; mirip?: { didengar: string; dipakai: string } }
  | { ok: false; error: string };

export function parseKalimat(
  kalimat: string,
  vocab?: { aliases?: { alias: string }[] } | null
): HasilParse;
export function bacaAngka(tokens: string[]): [number, number] | null;
export function bacaTarget(tokens: string[]): [string, number] | null;
export function cocokkanAlias(
  didengar: string,
  aliases: string[]
): { alias: string; samar: boolean } | { ambigu: string[] } | null;
export function jarakKata(a: string, b: string): number;
