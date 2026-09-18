import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Penjaga agar bug 18 Sep 2026 tidak terulang.
 *
 * Windows PowerShell 5.1 (yang dipanggil oleh `powershell` di berkas .bat, dan
 * masih bawaan Windows) membaca berkas .ps1 TANPA BOM memakai codepage ANSI
 * mesin, bukan UTF-8. Di mesin cp1252, tanda pisah em (U+2014) yang tersimpan
 * sebagai UTF-8 (E2 80 94) terbaca sebagai `a^"` -- dan byte 0x94 itu adalah
 * tanda kutip ganda melengkung, yang DITERIMA parser PowerShell sebagai
 * pembatas string. Satu tanda pisah di dalam komentar sudah cukup untuk
 * membuat seluruh skrip gagal di-parse dengan galat yang menyesatkan, menunjuk
 * ke baris yang sama sekali tidak bersalah.
 *
 * Aturan repo ini: skrip untuk Windows ditulis MURNI ASCII. Bukan BOM, sebab
 * ASCII benar di codepage mana pun dan tidak menuntut apa-apa dari editor
 * siapa pun. `pasang-guru.ps1` sudah mengikuti aturan ini sejak awal.
 */
const DIR_TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function kumpulkan(dir: string, hasil: string[] = []): string[] {
  for (const isi of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, isi.name);
    if (isi.isDirectory()) {
      if (["node_modules", "bin", "model", "rekaman"].includes(isi.name)) continue;
      kumpulkan(p, hasil);
    } else if (/\.(ps1|bat|cmd)$/i.test(isi.name)) {
      hasil.push(p);
    }
  }
  return hasil;
}

describe("skrip Windows di tools/", () => {
  const berkas = kumpulkan(DIR_TOOLS);

  it("ada yang ditemukan (kalau nol, tesnya yang rusak, bukan repo yang bersih)", () => {
    expect(berkas.length).toBeGreaterThan(0);
  });

  for (const f of berkas) {
    const nama = path.relative(DIR_TOOLS, f);
    it(`${nama} murni ASCII`, () => {
      const bytes = fs.readFileSync(f);
      const nakal: string[] = [];
      let baris = 1;
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] === 0x0a) baris++;
        else if (bytes[i] > 127 && nakal.length < 5) {
          nakal.push(`baris ${baris} (byte 0x${bytes[i].toString(16)})`);
        }
      }
      expect(
        nakal,
        `${nama} punya byte non-ASCII di ${nakal.join(", ")}. ` +
          "Windows PowerShell 5.1 membacanya sebagai cp1252, dan tanda pisah em " +
          "atau tanda kutip melengkung akan merusak parsing seluruh berkas. " +
          "Ganti dengan padanan ASCII: -- untuk tanda pisah, | untuk pemisah, " +
          '" dan \' lurus untuk kutip.'
      ).toEqual([]);
    });
  }
});
