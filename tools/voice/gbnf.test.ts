/**
 * Memeriksa torang.gbnf tanpa menjalankan whisper.
 *
 * Kenapa perlu: kalau GBNF-nya salah sintaks, whisper.cpp menghasilkan daftar
 * aturan kosong dan **melewati grammar tanpa bilang apa-apa**. Hasilnya
 * terlihat seperti jalan normal, cuma tanpa manfaat grammar sama sekali -
 * kegagalan diam persis seperti yang sudah beberapa kali menipu kami hari ini.
 *
 * Yang diperiksa: aturan 'root' ada, tiap aturan yang dirujuk terdefinisi,
 * tidak ada aturan yatim, dan kalimat baku memang bisa dibangun dari grammar.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const teks = fs.readFileSync(path.join(DIR, "torang.gbnf"), "utf8");

/** Buang komentar, gabungkan baris lanjutan, pecah jadi {nama: badan}. */
function bacaAturan(src: string): Map<string, string> {
  const bersih = src
    .split("\n")
    .map((b) => b.replace(/#.*$/, ""))
    .join("\n");
  const aturan = new Map<string, string>();
  // pisahkan di tiap "nama ::=" yang ada di awal baris
  const bagian = bersih.split(/\n(?=[A-Za-z][A-Za-z0-9-]*\s*::=)/);
  for (const b of bagian) {
    const m = b.match(/^\s*([A-Za-z][A-Za-z0-9-]*)\s*::=([\s\S]*)$/);
    if (m) aturan.set(m[1], m[2].trim());
  }
  return aturan;
}

const aturan = bacaAturan(teks);

describe("torang.gbnf", () => {
  it("punya aturan root (tanpa ini whisper melewati grammar diam-diam)", () => {
    expect(aturan.has("root")).toBe(true);
  });

  it("setiap aturan yang dirujuk memang terdefinisi", () => {
    const hilang: string[] = [];
    for (const [nama, badan] of aturan) {
      // rujukan = kata di luar tanda kutip
      const luarKutip = badan.replace(/"[^"]*"/g, " ");
      for (const kata of luarKutip.match(/[A-Za-z][A-Za-z0-9-]*/g) ?? []) {
        if (!aturan.has(kata)) hilang.push(`${nama} -> ${kata}`);
      }
    }
    expect(hilang, `rujukan ke aturan yang tidak ada: ${hilang.join(", ")}`).toEqual([]);
  });

  it("tidak ada aturan yatim (ditulis tapi tak pernah dipakai)", () => {
    const dipakai = new Set<string>(["root"]);
    for (const badan of aturan.values()) {
      const luarKutip = badan.replace(/"[^"]*"/g, " ");
      for (const kata of luarKutip.match(/[A-Za-z][A-Za-z0-9-]*/g) ?? []) dipakai.add(kata);
    }
    const yatim = [...aturan.keys()].filter((n) => !dipakai.has(n));
    expect(yatim, `aturan tidak terpakai: ${yatim.join(", ")}`).toEqual([]);
  });

  it("tanda kutip berpasangan di setiap aturan", () => {
    for (const [nama, badan] of aturan) {
      const jumlah = (badan.match(/"/g) ?? []).length;
      expect(jumlah % 2, `aturan "${nama}" punya tanda kutip ganjil`).toBe(0);
    }
  });

  it("kosakata grammar cocok dengan kosakata parser", () => {
    const semua = [...aturan.values()].join(" ");
    for (const aksi of ["puter", "pindah", "buka", "tutup", "sapa", "glow", "lanjut", "ulang", "stop"]) {
      expect(semua, `aksi "${aksi}" tidak ada di grammar`).toContain(`"${aksi}`);
    }
    // sasaran harus menerima kedua bentuk yang diterima parser
    expect(aturan.get("layar")).toContain('"TV ');
    expect(aturan.get("layar")).toContain('"layar ');
    expect(aturan.get("komp")).toContain('"komp ');
    expect(aturan.get("komp")).toContain('"komputer ');
  });

  it("angka layar berhenti di empat, angka komp sampai dua puluh", () => {
    expect(aturan.get("angka4")).not.toContain("lima");
    expect(aturan.get("angka20")).toContain("dua puluh");
  });
});
