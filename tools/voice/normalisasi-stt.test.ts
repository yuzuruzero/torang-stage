/**
 * Test lapisan normalisasi transkrip Whisper.
 *
 * Yang dijaga di sini bukan "apakah kalimat bagus bisa lolos" - itu bagian
 * mudahnya. Yang dijaga adalah bahwa lapisan ini TIDAK pernah mengubah kalimat
 * di luar kosakata menjadi perintah yang sah. Sekali itu bisa terjadi,
 * disiplin grammar tertutup bocor lewat pintu belakang.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error - modul JS polos, tanpa tipe
import { rapikanTranskrip, PETA_KATA, BUKAN_PEMANGGIL } from "./normalisasi-stt.mjs";
// @ts-expect-error - modul JS polos, tanpa tipe
import { parseKalimat } from "../openclaw/torang-cue.mjs";

/** Jalankan jalur penuh: transkrip Whisper -> normalisasi -> parser. */
function jalur(transkrip: string) {
  const rapi = rapikanTranskrip(transkrip);
  if (!rapi.ok) return { ok: false as const, error: rapi.alasanTolak };
  return parseKalimat(rapi.teks);
}

describe("salah-dengar yang TERBUKTI terjadi di rekaman sungguhan", () => {
  // 18 Sep 2026, rekaman Hadi: Whisper menulis "Perang" untuk "Torang"
  // dan "tifi" untuk "TV".
  it("\"Perang\" + \"tifi\" tetap menghasilkan intent yang benar", () => {
    expect(jalur("Perang, putar modul tes di tifi tiga.")).toEqual({
      ok: true,
      intent: { intent: "PLAY_MODULE", alias: "modul tes", target: "tv3" },
    });
    expect(jalur("Perang, pindah ke tifi empat.")).toEqual({
      ok: true,
      intent: { intent: "MOVE", to: "tv4" },
    });
  });
});

describe('"d" jadi "di" - transkrip asli PC guru 19 Sep', () => {
  it('"Puter, ters, d, tv, satu." kini sampai ke modul yang benar', () => {
    // Dengan daftar modul, seperti di app: tanpa daftar, alias diteruskan mentah.
    const rapi = rapikanTranskrip("Puter, ters, d, tv, satu.");
    expect(rapi.ok).toBe(true);
    const r = parseKalimat(rapi.teks, { aliases: [{ alias: "tes" }] });
    expect(r.ok).toBe(true);
    // "ters" -> "tes" lewat pencocokan nama modul, dan itu DILAPORKAN ke guru.
    expect(r.intent).toEqual({ intent: "PLAY_MODULE", alias: "tes", target: "tv1" });
    expect(r.mirip).toEqual({ didengar: "ters", dipakai: "tes" });
  });
});

describe("lapisan ini tidak boleh menciptakan perintah", () => {
  it("kata di luar kosakata di depan perintah sah TETAP ditolak", () => {
    // Contohnya dulu memakai "tolong". Sejak 18 Sep "tolong" SENGAJA dibuang
    // parser sebagai kata sopan (KATA_PENGISI), jadi "Torang, tolong sapa komp
    // enam" kini memang sah - dan contoh itu tidak lagi menguji apa pun.
    // Tes ini sempat merah sejak commit 8641a1c tanpa ada yang menjalankannya.
    //
    // Yang dijaga tetap sama: kata yang BUKAN kata sopan dan bukan aksi tidak
    // boleh lolos hanya karena didahului pemanggil yang salah dengar.
    expect(jalur("Torang, periksa sapa komp enam").ok).toBe(false);
    expect(jalur("Perang, matikan sapa komp enam").ok).toBe(false);
    expect(jalur("Torang, coba periksa keadaan panggung").ok).toBe(false);
  });

  it("tidak ada kata di BUKAN_PEMANGGIL yang dipetakan ke pemanggil", () => {
    for (const kata of BUKAN_PEMANGGIL) {
      expect(PETA_KATA.get(kata)).not.toBe("torang");
    }
  });

  it("petaTambahan pun tidak boleh menyelundupkan pemetaan terlarang", () => {
    expect(() =>
      rapikanTranskrip("tolong sapa komp lima", new Map([["tolong", "torang"]]))
    ).toThrow(/BUKAN_PEMANGGIL/);
  });

  it("kalimat yang aksinya di luar kosakata tetap ditolak", () => {
    expect(jalur("Torang, matikan semua TV").ok).toBe(false);
    expect(jalur("Torang, puter modul tes di TV lima").ok).toBe(false);
    expect(jalur("Torang, pindah ke komp tujuh").ok).toBe(false);
  });
});

describe("halusinasi Whisper", () => {
  it("ditolak, tidak diteruskan ke parser", () => {
    for (const frasa of [
      "Terima kasih telah menonton.",
      "Jangan lupa like dan subscribe!",
      "[BLANK_AUDIO]",
      "   ",
    ]) {
      expect(jalur(frasa).ok).toBe(false);
    }
  });
});

describe("perubahan dilaporkan supaya bisa diaudit", () => {
  it("tiap penggantian dicatat", () => {
    const r = rapikanTranskrip("Perang, putar di tifi tiga");
    expect(r.ok).toBe(true);
    const ubah = r.perubahan.map((p: { dari: string; jadi: string }) => `${p.dari}>${p.jadi}`);
    expect(ubah).toContain("perang>torang");
    expect(ubah).toContain("putar>puter");
    expect(ubah).toContain("tifi>tv");
  });
});
