#!/usr/bin/env node
/**
 * torang-cue - jembatan agent guru -> Panggung Torang (jalur TEKS).
 *
 * Parsernya ada di parser.mjs dan diimpor dari sana, supaya app Electron bisa
 * memakai parser yang sama tanpa ikut membawa CLI ini. Ekspor lama tetap
 * diteruskan dari sini, jadi pemanggil dan tes yang sudah ada tidak berubah.
 *
 * Pemakaian:
 *   node torang-cue.mjs "Torang, puter video tes di TV satu"
 *   node torang-cue.mjs --dry "Torang, sapa komp lima"   # parse saja
 *   node torang-cue.mjs --state                          # ringkasan dashboard
 *   node torang-cue.mjs --vocab                          # kosakata
 *
 * Config: ~/.torang-stage/config.json {"api":"http://<ip>:8787","room_key":"..."}
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bacaAngka, bacaTarget, parseKalimat, cocokkanAlias, jarakKata } from "./parser.mjs";

export { bacaAngka, bacaTarget, parseKalimat, cocokkanAlias, jarakKata };

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function bacaConfig() {
  const file = path.join(os.homedir(), ".torang-stage", "config.json");
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    /* pakai env/default */
  }
  return {
    api: process.env.TORANG_STAGE_API ?? cfg.api ?? "http://127.0.0.1:8787",
    room_key: process.env.TORANG_STAGE_KEY ?? cfg.room_key ?? "dev-room-key",
  };
}

async function main() {
  const args = process.argv.slice(2);
  const cfg = bacaConfig();
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const kalimat = args.filter((a) => !a.startsWith("--")).join(" ");

  const ambil = async (p) => {
    const res = await fetch(`${cfg.api}${p}`);
    if (!res.ok) throw new Error(`${p} → HTTP ${res.status}`);
    return await res.json();
  };

  try {
    if (flags.has("--vocab")) {
      console.log(JSON.stringify(await ambil("/api/vocab"), null, 2));
      return;
    }
    if (flags.has("--state")) {
      const s = await ambil("/api/state");
      const murid = s.endpoints.filter((e) => e.role === "student").map((e) => e.endpoint_id);
      console.log(`Panggung ${cfg.api}`);
      console.log(`- Torang di layar : ${s.show.screen ?? "(idle, tidak di layar)"}`);
      console.log(`- Modul aktif     : ${s.show.active_module ?? "-"}`);
      console.log(`- Murid online    : ${murid.length ? murid.join(", ") : "(belum ada)"}`);
      console.log(
        `- Binding kursi   : ${s.bindings.length ? s.bindings.map((b) => `${b.seat_id}=${b.nama}`).join(", ") : "(belum ada login)"}`
      );
      console.log(`- Rundown         : langkah ${s.rundown.pointer + 1}/${s.rundown.steps.length} — ${s.rundown.steps[s.rundown.pointer] ?? "selesai"}`);
      return;
    }

    if (!kalimat) {
      console.log('Pemakaian: node torang-cue.mjs "Torang, puter video tes di TV satu"');
      console.log("           --dry (parse saja) · --state · --vocab");
      process.exit(2);
    }

    let vocab = null;
    try {
      vocab = await ambil("/api/vocab");
    } catch {
      /* parser tetap jalan tanpa daftar alias (validasi alias di cloud) */
    }

    const hasil = parseKalimat(kalimat, vocab);
    if (!hasil.ok) {
      console.log(`DITOLAK PARSER: ${hasil.error}`);
      process.exit(1);
    }
    console.log(`Dipahami sebagai: ${JSON.stringify(hasil.intent)}`);
    if (flags.has("--dry")) return;

    const res = await fetch(`${cfg.api}/api/intent`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ room_key: cfg.room_key, intent: hasil.intent }),
    });
    const j = await res.json();
    if (!j.ok) {
      console.log(`DITOLAK CLOUD (HTTP ${res.status}): ${j.error ?? "?"}`);
      process.exit(1);
    }
    console.log(
      `TERKIRIM ✔ ${j.note ? `(${j.note}) ` : ""}cue: ${(j.cues ?? [])
        .map((c) => `${c.type}→[${c.targets}]`)
        .join(", ") || "(tidak ada — mis. rundown selesai)"}`
    );
  } catch (err) {
    console.log(`GAGAL: ${err.message}`);
    console.log(`Cek: cloud hidup? config ~/.torang-stage/config.json → api=${cfg.api}`);
    process.exit(1);
  }
}

// Jalankan CLI hanya saat dieksekusi langsung (bukan saat diimpor test).
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  await main();
}
