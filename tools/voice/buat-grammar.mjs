#!/usr/bin/env node
/**
 * buat-grammar - menulis ulang bagian nama modul & scene di torang.gbnf dari
 * manifest yang sedang dipakai cloud (/api/vocab).
 *
 * KENAPA PERLU. Grammar membatasi apa yang boleh dihasilkan Whisper. Kalau
 * daftar modulnya ditulis tangan, dua hal buruk terjadi begitu manifest
 * berubah: modul baru MUSTAHIL diucapkan (tidak ada di grammar), dan modul
 * yang sudah dihapus masih bisa. Grammar yang tidak ikut manifest lebih
 * berbahaya daripada tidak punya grammar sama sekali.
 *
 * Ini juga jawaban untuk "gimana kalau nama modulnya susah": dengan grammar
 * menyala, Whisper tidak bisa menuliskan "test" kalau manifest cuma punya
 * "tes" - bukan karena ditambal sesudahnya, tapi karena tidak boleh muncul.
 *
 * Pemakaian:
 *   node buat-grammar.mjs              # ambil dari cloud, tulis torang.gbnf
 *   node buat-grammar.mjs --lihat      # tampilkan hasilnya, jangan tulis
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const GBNF = path.join(DIR, "torang.gbnf");
const lihatSaja = process.argv.includes("--lihat");

function bacaJson(f) {
  try { return JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, "")); } catch { return null; }
}
const jembatan = bacaJson(path.join(os.homedir(), ".torang-stage", "config.json")) ?? {};
const panggung = bacaJson(path.resolve(DIR, "..", "..", "apps", "theater", "torang-theater.config.json")) ?? {};
const api = process.env.TORANG_STAGE_API ?? jembatan.api ?? panggung.cloud_api ?? "http://127.0.0.1:8787";

/** Alias yang tidak bisa diucapkan tidak boleh masuk grammar. */
function bisaDiucapkan(alias) {
  return /^[a-z0-9]+( [a-z0-9]+)*$/.test(alias);
}

const res = await fetch(`${api}/api/vocab`).catch((e) => {
  console.error(`Tidak bisa membaca ${api}/api/vocab: ${e.message}`);
  console.error("Nyalakan cloud dulu, atau set TORANG_STAGE_API.");
  process.exit(1);
});
if (!res.ok) { console.error(`/api/vocab -> HTTP ${res.status}`); process.exit(1); }
const vocab = await res.json();

const semua = (vocab.aliases ?? []).map((a) => String(a.alias).toLowerCase());
const alias = [...new Set(semua)].filter(bisaDiucapkan).sort();
const dibuang = [...new Set(semua)].filter((a) => !bisaDiucapkan(a));

if (alias.length === 0) {
  console.error("Manifest tidak punya alias yang bisa diucapkan - torang.gbnf TIDAK diubah.");
  process.exit(1);
}

const asli = fs.readFileSync(GBNF, "utf8");
const barisModul = `modul       ::= ${alias.map((a) => `"${a}"`).join(" | ")}`;
const baru = asli.replace(/^modul\s*::=.*$/m, barisModul);
if (baru === asli && !asli.includes(barisModul)) {
  console.error("Baris 'modul ::=' tidak ketemu di torang.gbnf - tidak ada yang diubah.");
  process.exit(1);
}

console.log(`Dari ${api}/api/vocab:`);
console.log(`  ${alias.length} alias masuk grammar: ${alias.join(", ")}`);
if (dibuang.length) {
  console.log(`  ${dibuang.length} DILEWATI (ada karakter yang tidak bisa diucapkan): ${dibuang.join(", ")}`);
  console.log("  Alias seperti itu tidak akan pernah bisa dipanggil lewat suara.");
}
if (lihatSaja) { console.log("\n--lihat: torang.gbnf tidak diubah."); process.exit(0); }

fs.writeFileSync(GBNF, baru, "utf8");
console.log(`\ntorang.gbnf diperbarui.`);
