/**
 * Tebakan kalimat terdekat. Dua sisi yang sama pentingnya: yang SEHARUSNYA
 * diusulkan, dan yang SEHARUSNYA TIDAK - karena usulan yang salah dan dibenarkan
 * guru yang sedang sibuk adalah video yang salah tayang di depan kelas.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error - modul JS polos
import { cariSaran, kalimatSah, jarakKalimat } from "./saran.mjs";

const vocab = {
  aliases: [{ alias: "tes", module_id: "m99" }, { alias: "instal hermes", module_id: "m03" }],
};

describe("daftar kalimat sah", () => {
  it("ikut bertambah kalau modul bertambah", () => {
    const a = kalimatSah({ aliases: [{ alias: "tes" }] }).length;
    const b = kalimatSah({ aliases: [{ alias: "tes" }, { alias: "modul baru" }] }).length;
    expect(b).toBeGreaterThan(a);
  });
  it("tanpa modul pun tetap punya perintah non-modul", () => {
    const d = kalimatSah({ aliases: [] });
    expect(d).toContain("stop");
    expect(d).toContain("sapa komp lima");
  });
});

describe("jarakKalimat mengukur KATA, bukan huruf", () => {
  it("satu kata salah selalu berharga sama, sepanjang apa pun katanya", () => {
    // Ini inti ukurannya: per huruf, "tayangkan" akan dihitung jauh lebih mahal
    // daripada "tiga"->"dua" - padahal yang kedua MENGUBAH TV MANA yang dituju.
    expect(jarakKalimat("tayangkan tes di tv tiga", "puter tes di tv tiga")).toBeCloseTo(1, 1);
    expect(jarakKalimat("puter tes di tv tiga", "puter tes di tv tiga")).toBe(0);
  });
  it("kata kelebihan berharga satu", () => {
    expect(jarakKalimat("puter video tes di tv tiga", "puter tes di tv tiga")).toBeCloseTo(1, 1);
  });
});

describe("yang HARUS diusulkan", () => {
  const kasus: Array<[string, string]> = [
    ["Torang, mainkan tes di layar tiga", "puter tes di layar tiga"],
    ["Torang, tayangkan tes di TV tiga", "puter tes di tv tiga"],
    ["Torang, tolong tayangkan tes di TV tiga", "puter tes di tv tiga"],
    ["Torang, putir tes di TV satu", "puter tes di tv satu"],
    ["Torang, sapu komp lima", "sapa komp lima"],
    ["Torang, sapa komputer lima", "sapa komp lima"],
    ["Torang, setop", "stop"],
    ["Torang, pindahkan ke layar dua", "pindah ke layar dua"],
    ["Torang, instal hermez di layar dua", "puter instal hermes di layar dua"],
  ];
  for (const [didengar, harap] of kasus) {
    it(didengar, () => {
      const r = cariSaran(didengar, vocab);
      expect(r, "tidak ada usulan").not.toBeNull();
      expect(r.kalimat).toBe(harap);
    });
  }

  it("intent dibuat PARSER, bukan oleh pencocokan kemiripan", () => {
    const r = cariSaran("Torang, tayangkan tes di TV tiga", vocab);
    expect(r.intent).toEqual({ intent: "PLAY_MODULE", alias: "tes", target: "tv3" });
  });
});

describe("yang HARUS DIAM - salah usul lebih buruk daripada tidak mengusulkan", () => {
  const diam = [
    "halo apa kabar semuanya",
    "ehm anu itu ya",
    "ok",
    "iya",
    "[Musik]",
    "Terima kasih telah menonton",     // halusinasi khas Whisper
    "Torang, hapus semua data murid",
    "anjing",
    "satu dua tiga",
    "Torang, puter tes di TV",          // sasaran tidak lengkap
    "Torang, puter tes di TV sembilan", // TV 9 tidak ada
    "Torang",
  ];
  for (const t of diam) {
    it(`diam untuk: ${t}`, () => expect(cariSaran(t, vocab)).toBeNull());
  }

  it("NAMA MODUL tidak pernah ditebak jauh", () => {
    // Salah menebak kata aksi cuma memilih perintah lain dari 8 yang ada, dan
    // guru melihatnya sebelum jalan. Salah menebak nama modul menentukan VIDEO
    // APA yang tayang - itu tidak boleh ditebak dari kata yang beda jauh.
    expect(cariSaran("Torang, puter pisang di TV tiga", vocab)).toBeNull();
    expect(cariSaran("Torang, tayangkan pisang goreng di TV tiga", vocab)).toBeNull();
  });

  it("dua kemungkinan yang sama dekat: lebih baik diam daripada melempar koin", () => {
    const v = { aliases: [{ alias: "tesa" }, { alias: "tesu" }] };
    expect(cariSaran("Torang, puter tesi di TV tiga", v)).toBeNull();
  });
});
