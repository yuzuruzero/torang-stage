/**
 * Contekan Whisper. Yang dijaga: kata yang terbukti hilang di PC guru ada di
 * dalamnya, nama modul ikut, dan contekan TIDAK PERNAH membentuk perintah sah -
 * karena Whisper bisa mengulang contekannya saat mendengar hening.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error - modul JS polos
import { promptWhisper } from "./prompt-whisper.mjs";
// @ts-expect-error - modul JS polos
import { parseKalimat } from "../openclaw/parser.mjs";
// @ts-expect-error - modul JS polos
import { rapikanTranskrip } from "./normalisasi-stt.mjs";

describe("promptWhisper", () => {
  it('memuat "di" dan "ke" - yang hilang dari contekan lama ("Puter, ters, d, tv, satu")', () => {
    const p = promptWhisper(["tes"]);
    expect(p).toMatch(/\bdi\b/);
    expect(p).toMatch(/\bke\b/);
  });

  it("memuat nama modul dari vocab", () => {
    expect(promptWhisper(["tes", "instal hermes"])).toMatch(/tes, instal hermes/);
  });

  it("tanpa modul tetap memuat kosakata inti", () => {
    const p = promptWhisper([]);
    for (const k of ["puter", "pindah", "tutup", "stop", "TV", "layar"]) expect(p).toContain(k);
    expect(p).not.toMatch(/Nama modul/);
  });

  it("nama modul tidak mendesak kosakata inti (dibatasi 20)", () => {
    const banyak = Array.from({ length: 50 }, (_, i) => `modul${i}`);
    const p = promptWhisper(banyak);
    expect(p).toContain("modul19");
    expect(p).not.toContain("modul20");
    expect(p).toContain("puter");
  });

  it("PAGAR: contekan yang DIULANG Whisper saat hening tidak pernah jadi perintah sah", () => {
    const vocab = { aliases: [{ alias: "tes" }, { alias: "instal hermes" }] };
    const p = promptWhisper(["tes", "instal hermes"]);
    // Whisper bisa mengulang seluruh contekan, atau sebagiannya per kalimat.
    const kandidat = [p, ...p.split(/(?<=\.)\s+/), `Torang, ${p}`];
    for (const k of kandidat) {
      const r = rapikanTranskrip(k);
      if (!r.ok) continue; // ditolak normalisasi pun sudah aman
      expect(parseKalimat(r.teks, vocab).ok, k).toBe(false);
    }
  });
});
