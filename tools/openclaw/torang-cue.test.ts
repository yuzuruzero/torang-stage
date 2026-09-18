/**
 * Test parser grammar §5 (jembatan OpenClaw). Parser DETERMINISTIK: kalimat
 * di luar kosakata DITOLAK, tidak pernah dikira-kira.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error — modul JS polos (skrip mandiri utk WSL, tanpa tipe)
import { bacaAngka, bacaTarget, parseKalimat } from "./torang-cue.mjs";

const vocab = {
  aliases: [
    { alias: "tes", module_id: "m99" },
    { alias: "instal hermes", module_id: "m03" },
  ],
};

describe("bacaAngka (satu..dua puluh + digit)", () => {
  it("kata dasar", () => {
    expect(bacaAngka(["tiga"])).toEqual([3, 1]);
    expect(bacaAngka(["sepuluh"])).toEqual([10, 1]);
    expect(bacaAngka(["sebelas"])).toEqual([11, 1]);
  });
  it("belasan & dua puluh", () => {
    expect(bacaAngka(["dua", "belas"])).toEqual([12, 2]);
    expect(bacaAngka(["sembilan", "belas"])).toEqual([19, 2]);
    expect(bacaAngka(["dua", "puluh"])).toEqual([20, 2]);
  });
  it("digit + di luar jangkauan", () => {
    expect(bacaAngka(["7"])).toEqual([7, 1]);
    expect(bacaAngka(["21"])).toBeNull();
    expect(bacaAngka(["nol"])).toBeNull();
  });
});

describe("bacaTarget", () => {
  it("tv & komp (kata + gabung)", () => {
    expect(bacaTarget(["tv", "tiga"])).toEqual(["tv3", 2]);
    expect(bacaTarget(["tv1"])).toEqual(["tv1", 1]);
    expect(bacaTarget(["komp", "dua", "belas"])).toEqual(["komp12", 3]);
    expect(bacaTarget(["komp5"])).toEqual(["komp5", 1]);
  });
  it("grup semua", () => {
    expect(bacaTarget(["semua", "layar"])).toEqual(["all_tv", 2]);
    expect(bacaTarget(["semua", "komp"])).toEqual(["all_student", 2]);
  });
  it("tv5 / komp21 ditolak", () => {
    expect(bacaTarget(["tv", "lima"])).toBeNull();
    expect(bacaTarget(["tv5"])).toBeNull();
    expect(bacaTarget(["komp21"])).toBeNull();
  });
});

describe("parseKalimat (grammar §5)", () => {
  it("puter — kalimat acceptance §14.1", () => {
    const r = parseKalimat("Torang, puter video tes di TV satu", vocab);
    expect(r).toEqual({
      ok: true,
      intent: { intent: "PLAY_MODULE", alias: "tes", target: "tv1" },
    });
  });
  it("puter alias dua kata + komp", () => {
    const r = parseKalimat("torang puter video instal hermes di komp tiga", vocab);
    expect(r.intent).toEqual({
      intent: "PLAY_MODULE",
      alias: "instal hermes",
      target: "komp3",
    });
  });
  it("alias di luar manifest ditolak dengan daftar yang tersedia", () => {
    const r = parseKalimat("Torang, puter video ngawur di TV satu", vocab);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/tes, instal hermes/);
  });
  it("pindah / sapa / lanjut / ulang / stop", () => {
    expect(parseKalimat("Torang, pindah ke TV tiga", vocab).intent).toEqual({
      intent: "MOVE",
      to: "tv3",
    });
    expect(parseKalimat("Torang, sapa komp lima", vocab).intent).toEqual({
      intent: "SAPA",
      target: "komp5",
    });
    expect(parseKalimat("Torang, lanjut", vocab).intent).toEqual({ intent: "GO" });
    expect(parseKalimat("Torang, ulang", vocab).intent).toEqual({ intent: "REPLAY" });
    expect(parseKalimat("Torang, stop", vocab).intent).toEqual({ intent: "STOP" });
  });
  it("pindah ke komp ditolak (nyelem = fase 2)", () => {
    const r = parseKalimat("Torang, pindah ke komp tiga", vocab);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/fase 2/);
  });
  it("glow default semua murid; glow tv ditolak", () => {
    expect(parseKalimat("Torang, glow", vocab).intent).toMatchObject({
      intent: "GLOW",
      target: "all_student",
    });
    expect(parseKalimat("Torang, glow tv satu", vocab).ok).toBe(false);
  });
  it("aksi asing DITOLAK, tidak dikira-kira (LLM-proof)", () => {
    const r = parseKalimat("Torang, hapus semua file", vocab);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/aksi tidak dikenal/);
  });
  // Sampai 17 Sep 2026 tes ini memastikan "buka" DITOLAK dengan alasan "fase 2".
  // Sejak "buka <scene> di <tv>" jadi nyata, cabang penolakan itu tidak pernah
  // lagi tercapai - kode matinya sudah dihapus, dan tesnya diganti perilaku
  // yang sekarang. Nama scene dengan spasi digabung dengan tanda hubung.
  it("buka scene bernama dua kata -> scene ber-tanda-hubung", () => {
    const h = parseKalimat("Torang, buka pixel office di TV dua", vocab);
    expect(h.ok).toBe(true);
    expect(h.intent).toEqual({ intent: "OPEN_SCENE", scene: "pixel-office", target: "tv2" });
  });

  // Parser TIDAK memvalidasi scene-nya ada atau tidak - itu urusan tiap mesin
  // saat memetakan nama scene ke URL dari config-nya sendiri (disiplin §6:
  // cue membawa NAMA, mesin yang menerjemahkan). Yang dijaga parser cuma
  // bentuk namanya.
  it("nama scene yang tidak sah tetap ditolak parser", () => {
    expect(parseKalimat("Torang, buka !!! di TV dua", vocab).ok).toBe(false);
    expect(parseKalimat("Torang, buka di TV dua", vocab).ok).toBe(false);
  });
});

describe("kosakata baru: buka / tutup / buka window", () => {
  it("buka scene di TV", () => {
    expect(parseKalimat("Torang, buka office di TV tiga", vocab)).toEqual({
      ok: true,
      intent: { intent: "OPEN_SCENE", scene: "office", target: "tv3" },
    });
  });

  it("buka scene di semua layar", () => {
    expect(parseKalimat("buka office di semua layar", vocab).intent).toEqual({
      intent: "OPEN_SCENE",
      scene: "office",
      target: "all_tv",
    });
  });

  it("tutup layar", () => {
    expect(parseKalimat("Torang, tutup TV tiga", vocab).intent).toEqual({
      intent: "CLOSE_SCENE",
      target: "tv3",
    });
  });

  it("buka window / buka lagi / buka layar → pemulihan jendela", () => {
    const harap = { intent: "REOPEN_WINDOW", target: "tv4" };
    expect(parseKalimat("Torang, buka window TV empat", vocab).intent).toEqual(harap);
    expect(parseKalimat("Torang, buka lagi window TV empat", vocab).intent).toEqual(harap);
    expect(parseKalimat("Torang, buka layar TV empat", vocab).intent).toEqual(harap);
  });

  it("scene tidak berlaku di komp murid", () => {
    const r = parseKalimat("buka office di komp tiga", vocab);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("hanya untuk TV");
  });

  it("tetap menolak kata di luar kosakata (grammar TERTUTUP)", () => {
    const r = parseKalimat("Torang, tolong sapa komputer enam", vocab);
    expect(r.ok).toBe(false);
    // Pesannya menyebut seluruh kosakata yang sah — itu yang dibaca guru.
    expect(r.error).toContain("buka");
    expect(r.error).toContain("tutup");
  });
});

describe('sasaran "layar N" (sinonim TV, ditambahkan setelah uji suara 18 Sep 2026)', () => {
  it('"layar tiga" sama dengan "TV tiga"', () => {
    expect(parseKalimat("Torang, pindah ke layar tiga")).toEqual(
      parseKalimat("Torang, pindah ke TV tiga")
    );
    expect(parseKalimat("Torang, puter tes di layar satu", vocab)).toEqual(
      parseKalimat("Torang, puter tes di TV satu", vocab)
    );
  });

  it('"semua layar" tetap berarti keempat TV, bukan layar bernomor', () => {
    const h = parseKalimat("Torang, puter tes di semua layar", vocab);
    expect(h.ok).toBe(true);
    expect(h.intent.target).toBe("all_tv");
  });

  it("layar tetap hanya satu sampai empat", () => {
    expect(parseKalimat("Torang, pindah ke layar lima").ok).toBe(false);
    expect(parseKalimat("Torang, tutup layar nol").ok).toBe(false);
  });

  it("sapa tetap hanya untuk komp, tidak menerima layar", () => {
    expect(parseKalimat("Torang, sapa layar lima").ok).toBe(false);
  });
});
