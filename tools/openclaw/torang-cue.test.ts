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
  it("buka (pixel office) jujur: belum tersedia", () => {
    expect(parseKalimat("Torang, buka pixel office di TV dua", vocab).error).toMatch(/fase 2/);
  });
});
