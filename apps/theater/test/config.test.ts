/**
 * Regresi insiden 11 Agu: config student ber-BOM (tulisan PowerShell 5.1)
 * gagal di-JSON.parse → app diam-diam jatuh ke mode teacher → PC murid
 * membuka panggung. Aturan sekarang: BOM ditoleransi; config rusak/mode
 * asing → LEMPAR error jelas, tidak pernah menebak mode.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadTheaterConfig } from "../src/main/config.js";

const dibuat: string[] = [];

function tulisConfig(isi: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "torang-cfg-"));
  const file = path.join(dir, "torang-theater.config.json");
  writeFileSync(file, isi);
  process.env.TORANG_THEATER_CONFIG = file;
  dibuat.push(file);
  return dir;
}

afterEach(() => {
  delete process.env.TORANG_THEATER_CONFIG;
});

describe("loadTheaterConfig", () => {
  it("config student BER-BOM (PowerShell 5.1) tetap terbaca sebagai student", () => {
    const dir = tulisConfig(
      "\uFEFF" + JSON.stringify({ mode: "student", seat: "komp7" })
    );
    const cfg = loadTheaterConfig(dir);
    expect(cfg.mode).toBe("student");
    expect(cfg.seat).toBe("komp7");
  });

  it("config rusak → LEMPAR error jelas (tidak diam-diam jadi teacher)", () => {
    const dir = tulisConfig("{ mode: student "); // JSON invalid
    expect(() => loadTheaterConfig(dir)).toThrow(/tidak bisa dibaca/);
  });

  it("mode asing → error jelas", () => {
    const dir = tulisConfig(JSON.stringify({ mode: "dalang" }));
    expect(() => loadTheaterConfig(dir)).toThrow(/mode tidak dikenal/);
  });

  it("tanpa file config → default teacher (mesin dev)", () => {
    delete process.env.TORANG_THEATER_CONFIG;
    const kosong = mkdtempSync(path.join(tmpdir(), "torang-kosong-"));
    const cfg = loadTheaterConfig(kosong);
    expect(cfg.mode).toBe("teacher");
  });
});
