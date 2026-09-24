/**
 * Kalimat majemuk, "tampilkan", sasaran kosong, dan "tata" (24 Sep 2026).
 *
 * Pagar yang dijaga di sini: kalimat majemuk TIDAK membuka kata baru. Tiap
 * bagian harus sah sebagai kalimat tunggal; satu bagian gagal = seluruhnya
 * ditolak; dan ekor kalimat tidak pernah diam-diam dibuang.
 */
import { describe, expect, it } from "vitest";
import { parseKalimat, MAKS_BAGIAN } from "./parser.mjs";

const vocab = {
  aliases: [
    { alias: "tes" },
    { alias: "instal hermes" },
  ],
  scenes: ["office"],
  tata: ["pembukaan", "bersih"],
};

const ok = (kalimat: string) => {
  const h = parseKalimat(kalimat, vocab);
  if (!h.ok) throw new Error(`ditolak: ${h.error}`);
  return h;
};

describe("sasaran boleh tidak disebut", () => {
  it('"puter tes" → PLAY_MODULE tanpa target (cloud memilih layar Torang)', () => {
    expect(ok("Torang, puter tes").intent).toEqual({ intent: "PLAY_MODULE", alias: "tes" });
  });
  it('"puter video instal hermes" → alias dua kata tanpa target', () => {
    expect(ok("puter video instal hermes").intent).toEqual({ intent: "PLAY_MODULE", alias: "instal hermes" });
  });
  it("target yang disebut tapi rusak tetap DITOLAK, tidak jatuh ke tanpa-target", () => {
    const h = parseKalimat("puter tes di layar sembilan", vocab);
    expect(h.ok).toBe(false);
  });
  it("ekor setelah target tidak dibuang diam-diam", () => {
    expect(parseKalimat("puter tes di layar satu komp dua", vocab).ok).toBe(false);
  });
});

describe('"tampilkan" - satu kata kerja untuk modul dan scene', () => {
  it('"tampilkan modul tes di layar 1" → PLAY_MODULE', () => {
    expect(ok("tampilkan modul tes di layar 1").intent).toEqual({
      intent: "PLAY_MODULE", alias: "tes", target: "tv1",
    });
  });
  it('"tampilkan office di layar dua" → OPEN_SCENE', () => {
    expect(ok("tampilkan office di layar dua").intent).toEqual({
      intent: "OPEN_SCENE", scene: "office", target: "tv2",
    });
  });
  it("scene tanpa sasaran ditanya balik, bukan ditebak", () => {
    const h = parseKalimat("tampilkan office", vocab);
    expect(h.ok).toBe(false);
    if (!h.ok) expect(h.error).toMatch(/layar berapa/);
  });
  it("scene di komp murid ditolak", () => {
    expect(parseKalimat("tampilkan office di komp tiga", vocab).ok).toBe(false);
  });
  it("nama yang bukan modul maupun scene ditolak dengan daftar keduanya", () => {
    const h = parseKalimat("tampilkan kalkulator di layar satu", vocab);
    expect(h.ok).toBe(false);
    if (!h.ok) expect(h.error).toMatch(/scene: office/);
  });
});

describe("serentak: '... dan ...'", () => {
  it("contoh Hadi: tampilkan tes di layar 1 dan tampilkan office di layar 2", () => {
    const h = ok("tampilkan modul tes di layar 1 dan tampilkan office di layar 2");
    expect(h.intent).toEqual({
      intent: "MAJEMUK",
      tahap: [[
        { intent: "PLAY_MODULE", alias: "tes", target: "tv1" },
        { intent: "OPEN_SCENE", scene: "office", target: "tv2" },
      ]],
    });
    expect(h.bagian?.map((b) => b.jenis)).toEqual([null, "serentak"]);
  });
  it("tiga bagian serentak masih boleh", () => {
    const h = ok("puter tes di layar satu dan buka office di layar dua dan tutup layar tiga");
    expect((h.intent as { tahap: unknown[][] }).tahap[0]).toHaveLength(3);
  });
});

describe("berurutan: '... lalu / habis itu ...'", () => {
  it("contoh Hadi: tolong pindah ke layar 2 habis itu ke layar 3 (kata kerja dipinjam)", () => {
    expect(ok("tolong pindah ke layar 2 habis itu ke layar 3").intent).toEqual({
      intent: "MAJEMUK",
      tahap: [[{ intent: "MOVE", to: "tv2" }], [{ intent: "MOVE", to: "tv3" }]],
    });
  });
  it("'lalu layar tiga' tanpa 'ke' juga dipahami sebagai pindah", () => {
    expect(ok("pindah ke layar dua lalu layar tiga").intent).toEqual({
      intent: "MAJEMUK",
      tahap: [[{ intent: "MOVE", to: "tv2" }], [{ intent: "MOVE", to: "tv3" }]],
    });
  });
  it("kata kerja HANYA dipinjam dari pindah - 'sapa komp satu lalu komp dua' ditolak", () => {
    expect(parseKalimat("sapa komp satu lalu komp dua", vocab).ok).toBe(false);
  });
  it("campuran: serentak lalu berurutan", () => {
    expect(ok("puter tes di layar satu dan buka office di layar dua lalu pindah ke layar tiga").intent).toEqual({
      intent: "MAJEMUK",
      tahap: [
        [
          { intent: "PLAY_MODULE", alias: "tes", target: "tv1" },
          { intent: "OPEN_SCENE", scene: "office", target: "tv2" },
        ],
        [{ intent: "MOVE", to: "tv3" }],
      ],
    });
  });
  it('"setelah itu", "kemudian", "terus" juga penghubung berurutan', () => {
    for (const p of ["setelah itu", "kemudian", "terus"]) {
      const h = ok(`pindah ke layar dua ${p} pindah ke layar tiga`);
      expect((h.intent as { tahap: unknown[][] }).tahap).toHaveLength(2);
    }
  });
  it("'Torang' di tengah kalimat tidak mengganggu", () => {
    expect(ok("Torang, pindah ke layar dua, lalu Torang pindah ke layar tiga").intent).toMatchObject({
      intent: "MAJEMUK",
    });
  });
});

describe("pagar kalimat majemuk", () => {
  it(`lebih dari ${MAKS_BAGIAN} perintah ditolak dengan saran tata`, () => {
    const h = parseKalimat(
      "tutup layar satu dan tutup layar dua dan tutup layar tiga dan tutup layar empat",
      vocab
    );
    expect(h.ok).toBe(false);
    if (!h.ok) expect(h.error).toMatch(/paling banyak 3.*tata/);
  });
  it("satu bagian gagal → seluruh kalimat ditolak, bagian mana disebut", () => {
    const h = parseKalimat("puter tes di layar satu dan terbangkan layar dua", vocab);
    expect(h.ok).toBe(false);
    if (!h.ok) expect(h.error).toMatch(/bagian 2/);
  });
  it("stop tidak bisa digabung", () => {
    const h = parseKalimat("pindah ke layar dua lalu stop", vocab);
    expect(h.ok).toBe(false);
    if (!h.ok) expect(h.error).toMatch(/harus diucapkan sendiri/);
  });
  it("ekor kalimat tidak pernah dibuang: 'pindah ke layar 2 lalu ...' tidak jadi pindah tunggal", () => {
    expect(parseKalimat("pindah ke layar dua lalu terbang", vocab).ok).toBe(false);
  });
  it("modul yang namanya mengandung 'dan' tetap bisa dipanggil", () => {
    const v = { aliases: [{ alias: "tanya dan jawab" }] };
    expect(parseKalimat("puter tanya dan jawab di layar satu", v)).toEqual({
      ok: true,
      intent: { intent: "PLAY_MODULE", alias: "tanya dan jawab", target: "tv1" },
    });
  });
});

describe('"tata <nama>"', () => {
  it("tata yang terdaftar", () => {
    expect(ok("Torang, tata pembukaan").intent).toEqual({ intent: "TATA", nama: "pembukaan" });
  });
  it("salah dengar sedikit tetap ketemu, dan DILAPORKAN mirip", () => {
    const h = ok("tata pembukan");
    expect(h.intent).toEqual({ intent: "TATA", nama: "pembukaan" });
    expect(h.mirip).toEqual({ didengar: "pembukan", dipakai: "pembukaan" });
  });
  it("tata yang tidak ada ditolak dengan daftar", () => {
    const h = parseKalimat("tata penutupan", vocab);
    expect(h.ok).toBe(false);
    if (!h.ok) expect(h.error).toMatch(/pembukaan, bersih/);
  });
  it("tata tidak bisa digabung", () => {
    expect(parseKalimat("tata pembukaan lalu pindah ke layar dua", vocab).ok).toBe(false);
  });
});
