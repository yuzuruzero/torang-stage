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

// ---------------------------------------------------------------------------
// Grammar dan parser harus SEPAKAT (24 Sep 2026).
//
// Pencocok GBNF mini untuk subset yang kita pakai: literal "...", rujukan
// aturan, urutan, pilihan |, kelompok ( ), dan opsional ?. Kalau grammar
// mengizinkan kalimat yang ditolak parser, guru mendapat transkrip rapi yang
// tetap ditolak - dan kalau parser menerima kalimat yang tidak bisa dihasilkan
// grammar, fitur itu mustahil diucapkan. Dua-duanya kegagalan diam.
// ---------------------------------------------------------------------------
import { parseKalimat } from "../openclaw/parser.mjs";

type Simpul =
  | { k: "lit"; v: string }
  | { k: "ref"; v: string }
  | { k: "seq"; v: Simpul[] }
  | { k: "alt"; v: Simpul[] }
  | { k: "opt"; v: Simpul };

function uraiBadan(src: string): Simpul {
  const tok = src.match(/"[^"]*"|[A-Za-z][A-Za-z0-9-]*|[()|?]/g) ?? [];
  let i = 0;
  const alt = (): Simpul => {
    const pilihan = [seq()];
    while (tok[i] === "|") { i++; pilihan.push(seq()); }
    return pilihan.length === 1 ? pilihan[0]! : { k: "alt", v: pilihan };
  };
  const seq = (): Simpul => {
    const isi: Simpul[] = [];
    while (i < tok.length && tok[i] !== "|" && tok[i] !== ")") {
      const t = tok[i++]!;
      let s: Simpul;
      if (t === "(") { s = alt(); i++; }
      else if (t.startsWith('"')) s = { k: "lit", v: t.slice(1, -1) };
      else s = { k: "ref", v: t };
      if (tok[i] === "?") { i++; s = { k: "opt", v: s }; }
      isi.push(s);
    }
    return { k: "seq", v: isi };
  };
  return alt();
}

const pohon = new Map([...aturan].map(([n, b]) => [n, uraiBadan(b)]));

/** Semua posisi akhir yang mungkin setelah mencocokkan simpul mulai dari `pos`. */
function cocok(s: Simpul, teks: string, pos: number): number[] {
  switch (s.k) {
    case "lit": return teks.startsWith(s.v, pos) ? [pos + s.v.length] : [];
    case "ref": return cocok(pohon.get(s.v)!, teks, pos);
    case "opt": return [pos, ...cocok(s.v, teks, pos)];
    case "alt": return [...new Set(s.v.flatMap((x) => cocok(x, teks, pos)))];
    case "seq": {
      let posisi = [pos];
      for (const x of s.v) posisi = [...new Set(posisi.flatMap((p) => cocok(x, teks, p)))];
      return posisi;
    }
  }
}
const bolehGrammar = (kalimat: string) => cocok(pohon.get("root")!, kalimat, 0).includes(kalimat.length);

const vocabUji = { aliases: [{ alias: "tes" }], scenes: ["office"], tata: ["pembukaan", "bersih"] };

describe("grammar & parser sepakat", () => {
  const SAH = [
    " Torang, puter tes di layar satu.",
    " Torang, puter tes.",
    " Torang, tampilkan modul tes di layar satu.",
    " Torang, tampilkan office di layar dua.",
    " Torang, tampilkan modul tes di layar satu dan tampilkan office di layar dua.",
    " Torang, pindah ke layar dua habis itu ke layar tiga.",
    " Torang, pindah ke layar dua lalu pindah ke layar tiga.",
    " Torang, puter tes di TV satu dan buka office di layar dua lalu pindah ke layar tiga.",
    " Torang, tata pembukaan.",
    " Torang, buka window TV empat.",
    " Torang, stop.",
  ];
  for (const k of SAH) {
    it(`grammar menghasilkan DAN parser menerima: ${k.trim()}`, () => {
      expect(bolehGrammar(k), "grammar menolak").toBe(true);
      const h = parseKalimat(k, vocabUji);
      expect(h.ok, h.ok ? "" : h.error).toBe(true);
    });
  }

  const TERLARANG = [
    " Torang, stop dan pindah ke layar dua.",          // stop harus sendiri
    " Torang, tata pembukaan lalu pindah ke layar dua.", // tata harus sendiri
    " Torang, tutup layar satu dan tutup layar dua dan tutup layar tiga dan tutup layar empat.", // > 3
    " Torang, sapa komp satu lalu komp dua.",           // kata kerja dipinjam hanya untuk pindah
    " Torang, tampilkan office.",                       // scene wajib bersasaran
  ];
  for (const k of TERLARANG) {
    it(`grammar TIDAK menghasilkan: ${k.trim()}`, () => {
      expect(bolehGrammar(k)).toBe(false);
    });
  }
});
