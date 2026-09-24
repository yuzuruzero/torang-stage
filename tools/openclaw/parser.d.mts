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
/** Satu bagian kalimat majemuk, untuk ditampilkan per baris di panel. */
export type BagianKalimat = {
  teks: string;
  intent: Record<string, unknown>;
  /** Penghubung di depan bagian ini: "serentak" (dan) / "urut" (lalu); null = bagian pertama. */
  jenis: "serentak" | "urut" | null;
};

export type HasilParse =
  | {
      ok: true;
      intent: Record<string, unknown>;
      mirip?: { didengar: string; dipakai: string };
      /** Hanya ada pada kalimat majemuk. */
      bagian?: BagianKalimat[];
    }
  | { ok: false; error: string };

export type VocabParser = {
  aliases?: { alias: string }[];
  /** Nama scene yang dikenal ("tampilkan office ..."). Bawaan: ["office"]. */
  scenes?: string[];
  /** Nama preset tata layar. Kosong/tidak ada = tidak diperiksa di sini. */
  tata?: string[];
};

export const MAKS_BAGIAN: number;

export function parseKalimat(kalimat: string, vocab?: VocabParser | null): HasilParse;
export function bacaAngka(tokens: string[]): [number, number] | null;
export function bacaTarget(tokens: string[]): [string, number] | null;
export function cocokkanAlias(
  didengar: string,
  aliases: string[]
): { alias: string; samar: boolean } | { ambigu: string[] } | null;
export function jarakKata(a: string, b: string): number;
export const KATA_PENGISI: ReadonlySet<string>;
