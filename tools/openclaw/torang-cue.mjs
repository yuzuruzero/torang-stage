#!/usr/bin/env node
/**
 * torang-cue — jembatan OpenClaw guru → Panggung Torang (jalur TEKS, pra-voice).
 *
 * Dipakai skill OpenClaw "panggung-torang": agent MENERUSKAN kalimat perintah
 * apa adanya ke skrip ini. PARSER-LAH yang menentukan aksi (grammar tertutup
 * §5) — LLM tidak pernah improvisasi aksi (keamanan master doc). Kalimat yang
 * tak cocok grammar DITOLAK dengan pesan jelas, bukan dikira-kira.
 *
 * Pemakaian:
 *   node torang-cue.mjs "Torang, puter video tes di TV satu"
 *   node torang-cue.mjs --dry "Torang, sapa komp lima"   # parse saja, tanpa kirim
 *   node torang-cue.mjs --state                          # ringkasan dashboard
 *   node torang-cue.mjs --vocab                          # kosakata (alias modul dll)
 *
 * Config: ~/.torang-stage/config.json {"api":"http://<ip>:8787","room_key":"..."}
 * (ditulis pasang-jembatan-openclaw.sh; bisa dioverride env TORANG_STAGE_API /
 * TORANG_STAGE_KEY.)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Angka bahasa Indonesia (satu..dua puluh) + digit
// ---------------------------------------------------------------------------
const SATUAN = {
  satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7,
  delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11,
};

/** Baca angka 1–20 dari awal daftar token. Kembalikan [angka, jumlahTokenTerpakai] atau null. */
export function bacaAngka(tokens) {
  if (tokens.length === 0) return null;
  const t0 = tokens[0];
  if (/^\d{1,2}$/.test(t0)) {
    const n = parseInt(t0, 10);
    return n >= 1 && n <= 20 ? [n, 1] : null;
  }
  if (t0 in SATUAN) {
    const n = SATUAN[t0];
    const t1 = tokens[1];
    if (t1 === "belas" && n >= 2 && n <= 9) return [10 + n, 2]; // dua belas..sembilan belas
    if (t1 === "puluh" && n === 2) return [20, 2]; // dua puluh
    return [n, 1];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Parser grammar §5: "Torang, [AKSI] [OBJEK] [TARGET]" — kosakata TERTUTUP
// ---------------------------------------------------------------------------
function normalisasi(kalimat) {
  return kalimat
    .toLowerCase()
    .replace(/[.,!?;:"'()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Baca target dari daftar token: tv N | komp N | semua layar | semua komp. */
export function bacaTarget(tokens) {
  if (tokens.length === 0) return null;
  if (tokens[0] === "semua") {
    if (tokens[1] === "layar" || tokens[1] === "tv") return ["all_tv", 2];
    if (tokens[1] === "komp" || tokens[1] === "komputer" || tokens[1] === "murid") {
      return ["all_student", 2];
    }
    return null;
  }
  if (tokens[0] === "tv") {
    const n = bacaAngka(tokens.slice(1));
    if (n && n[0] >= 1 && n[0] <= 4) return [`tv${n[0]}`, 1 + n[1]];
    return null;
  }
  if (/^tv[1-4]$/.test(tokens[0])) return [tokens[0], 1];
  if (tokens[0] === "komp" || tokens[0] === "komputer") {
    const n = bacaAngka(tokens.slice(1));
    if (n) return [`komp${n[0]}`, 1 + n[1]];
    return null;
  }
  if (/^komp([1-9]|1[0-9]|20)$/.test(tokens[0])) return [tokens[0], 1];
  return null;
}

/**
 * Parse kalimat → intent whitelist. `vocab.aliases` = daftar alias modul dari
 * cloud (manifest). Hasil: {ok:true, intent, echo} atau {ok:false, error}.
 */
export function parseKalimat(kalimat, vocab) {
  const bersih = normalisasi(kalimat).replace(/^torang\s+/, "");
  const tokens = bersih.split(" ").filter(Boolean);
  if (tokens.length === 0) return { ok: false, error: "kalimat kosong" };

  const aksi = tokens[0];
  const sisa = tokens.slice(1);

  if (aksi === "lanjut" || aksi === "go") return { ok: true, intent: { intent: "GO" } };
  if (aksi === "ulang") return { ok: true, intent: { intent: "REPLAY" } };
  if (aksi === "stop" || aksi === "berhenti") return { ok: true, intent: { intent: "STOP" } };

  if (aksi === "pindah") {
    const t = sisa[0] === "ke" ? sisa.slice(1) : sisa;
    const target = bacaTarget(t);
    if (!target) return { ok: false, error: "pindah ke mana? (contoh: \"pindah ke TV tiga\")" };
    if (!target[0].startsWith("tv")) {
      return { ok: false, error: "pindah hanya antar TV (nyelem ke komp = fase 2)" };
    }
    return { ok: true, intent: { intent: "MOVE", to: target[0] } };
  }

  if (aksi === "sapa") {
    const target = bacaTarget(sisa);
    if (!target || !target[0].startsWith("komp")) {
      return { ok: false, error: "sapa komp berapa? (contoh: \"sapa komp lima\")" };
    }
    return { ok: true, intent: { intent: "SAPA", target: target[0] } };
  }

  if (aksi === "glow") {
    // EKSTENSI di luar 8 kata §5 (glow resmi = efek otomatis W1); praktis utk uji.
    const target = bacaTarget(sisa) ?? ["all_student", 0];
    if (target[0].startsWith("tv")) return { ok: false, error: "glow hanya layar murid" };
    return {
      ok: true,
      intent: { intent: "GLOW", target: target[0], preset: "pulse", duration_ms: 4000 },
    };
  }

  if (aksi === "puter" || aksi === "putar") {
    let t = sisa[0] === "video" ? sisa.slice(1) : sisa;
    const posDi = t.lastIndexOf("di");
    if (posDi < 1) {
      return { ok: false, error: "format: \"puter video <nama modul> di <target>\"" };
    }
    const aliasKata = t.slice(0, posDi).join(" ");
    const target = bacaTarget(t.slice(posDi + 1));
    if (!target) return { ok: false, error: `target tidak dikenal: "${t.slice(posDi + 1).join(" ")}"` };

    const aliases = (vocab?.aliases ?? []).map((a) => a.alias.toLowerCase());
    if (aliases.length > 0 && !aliases.includes(aliasKata)) {
      return {
        ok: false,
        error: `modul "${aliasKata}" tidak ada di manifest. Tersedia: ${aliases.join(", ")}`,
      };
    }
    return {
      ok: true,
      intent: { intent: "PLAY_MODULE", alias: aliasKata, target: target[0] },
    };
  }

  if (aksi === "buka") {
    return { ok: false, error: "\"buka\" (pixel office/scene) belum tersedia — fase 2" };
  }

  return {
    ok: false,
    error: `aksi tidak dikenal: "${aksi}". Kosakata: puter, pindah, lanjut, ulang, stop, sapa, glow`,
  };
}

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
