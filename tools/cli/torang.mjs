#!/usr/bin/env node
/**
 * torang — pengendali Panggung Torang lewat baris perintah (CLI).
 *
 * KENAPA ADA: panel web guru bagus untuk tangan manusia, tapi agent (Hermes,
 * OpenClaw, cron, skrip uji) butuh pintu yang bisa dipanggil tanpa mengklik
 * apa pun. CLI ini pintunya. Ia memakai API yang SAMA dengan tombol panel
 * (POST /api/intent), jadi tidak ada jalur istimewa dan tidak ada logika
 * panggung yang digandakan di sini.
 *
 * BEDANYA DENGAN tools/openclaw/torang-cue.mjs:
 *   torang-cue.mjs = parser kalimat bahasa Indonesia (grammar tertutup §5).
 *   torang.mjs     = perintah eksplisit ber-subcommand + pembungkus admin.
 * Keduanya hidup berdampingan: `torang say "<kalimat>"` memanggil parser itu,
 * jadi tidak ada grammar yang ditulis ulang.
 *
 * BATAS KEAMANAN (jangan dilonggarkan tanpa keputusan sadar):
 *   - Target divalidasi lokal dengan regex yang sama dengan protokol
 *     (tv1..tv4 · komp1..komp20 · teacher · all_tv · all_student).
 *   - Alias modul dicek ke /api/vocab (manifest = sumber kosakata, §6).
 *     Alias yang tidak ada di manifest DITOLAK sebelum dikirim.
 *   - Perintah admin (unbind · reset-rundown · reset-roster · reload-manifest)
 *     ditandai ADMIN dan
 *     dimaksudkan untuk guru/implementor, bukan untuk agent.
 *   - Tidak ada perintah OS di sini. CLI ini hanya bicara HTTP ke cloud.
 *
 * PEMAKAIAN
 *   torang state                      ringkasan panggung
 *   torang murid                      siapa online + binding kursi↔nama
 *   torang vocab                      kosakata sah (alias modul, target)
 *
 *   torang sapa komp6                 kartu sapaan bernama di satu komputer
 *   torang puter tes tv1              putar modul (alias manifest) di target
 *   torang pindah tv3                 pindahkan Torang antar TV
 *   torang glow komp6 [preset] [ms]   nyalakan bingkai layar murid
 *   torang lanjut | ulang | stop      rundown maju · replay · kill switch
 *
 *   torang say "Torang, sapa komputer enam"    lewat parser kalimat
 *
 *   ADMIN (bukan untuk agent):
 *   torang unbind komp3               lepas ikatan kursi↔nama
 *   torang reset-rundown              kembalikan penunjuk rundown ke awal
 *   torang reset-roster               hapus SEMUA binding kursi
 *   torang reload-manifest            muat ulang manifest aset
 *
 * OPSI
 *   --dry        tampilkan intent yang akan dikirim, JANGAN kirim
 *   --json       keluaran JSON (untuk skrip); default keluaran manusia
 *   --api=URL    timpa alamat cloud
 *   --key=KUNCI  timpa kunci ruangan
 *
 * KELUAR (exit code): 0 sukses · 1 ditolak/gagal · 2 salah pakai.
 *
 * CONFIG: ~/.torang-stage/config.json {"api":"http://127.0.0.1:8787",
 * "room_key":"..."} — sama dengan yang dipakai jembatan OpenClaw. Bisa
 * ditimpa env TORANG_STAGE_API / TORANG_STAGE_KEY, atau flag di atas.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
function bacaConfig(flags) {
  const file = path.join(os.homedir(), ".torang-stage", "config.json");
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    /* pakai env/default */
  }
  return {
    api: flags.api ?? process.env.TORANG_STAGE_API ?? cfg.api ?? "http://127.0.0.1:8787",
    room_key:
      flags.key ?? process.env.TORANG_STAGE_KEY ?? cfg.room_key ?? "dev-room-key",
    file,
  };
}

// ---------------------------------------------------------------------------
// Target: normalisasi ringan lalu validasi dengan regex protokol
// ---------------------------------------------------------------------------
const RE_TARGET = /^(tv[1-4]|komp([1-9]|1[0-9]|20)|teacher|all_tv|all_student)$/;

/** "komp 6" / "komputer6" / "TV 1" / "semua komp" → bentuk resmi, atau null. */
export function normalisasiTarget(masukan) {
  const s = String(masukan ?? "").toLowerCase().trim().replace(/\s+/g, " ");
  if (!s) return null;

  if (["semua komp", "semua komputer", "semua murid", "all_student", "all student"].includes(s)) {
    return "all_student";
  }
  if (["semua tv", "semua layar", "all_tv", "all tv"].includes(s)) return "all_tv";
  if (s === "guru" || s === "teacher") return "teacher";

  const m = s.match(/^(tv|komp|komputer)\s*0*(\d{1,2})$/);
  if (m) {
    const n = parseInt(m[2], 10);
    const nama = m[1] === "tv" ? `tv${n}` : `komp${n}`;
    return RE_TARGET.test(nama) ? nama : null;
  }
  return RE_TARGET.test(s) ? s : null;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
async function ambil(cfg, jalur) {
  const res = await fetch(`${cfg.api}${jalur}`);
  if (!res.ok) throw new Error(`${jalur} → HTTP ${res.status}`);
  return await res.json();
}

async function kirim(cfg, jalur, body) {
  const res = await fetch(`${cfg.api}${jalur}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ room_key: cfg.room_key, ...body }),
  });
  let j = {};
  try {
    j = await res.json();
  } catch {
    /* biarkan kosong; status yang bicara */
  }
  return { status: res.status, body: j };
}

// ---------------------------------------------------------------------------
// Bantuan keluaran
// ---------------------------------------------------------------------------
let MODE_JSON = false;

function keluar(kode, data, teks) {
  if (MODE_JSON) console.log(JSON.stringify(data, null, 2));
  else if (teks) console.log(teks);
  process.exit(kode);
}

function salahPakai(pesan) {
  keluar(2, { ok: false, error: pesan }, `SALAH PAKAI: ${pesan}\nLihat: torang --help`);
}

function ditolak(pesan) {
  keluar(1, { ok: false, error: pesan }, `DITOLAK: ${pesan}`);
}

/** Kirim intent ke cloud, laporkan cue yang terbentuk. */
async function kirimIntent(cfg, intent, flags) {
  if (flags.dry) {
    keluar(0, { ok: true, dry: true, intent }, `[dry] intent: ${JSON.stringify(intent)}`);
  }
  const { status, body } = await kirim(cfg, "/api/intent", { intent });
  if (!body?.ok) {
    keluar(
      1,
      { ok: false, http: status, error: body?.error ?? "?", intent },
      `DITOLAK CLOUD (HTTP ${status}): ${body?.error ?? "?"}`
    );
  }
  const cues = (body.cues ?? []).map((c) => `${c.type}→[${c.targets}]`).join(", ");
  keluar(
    0,
    { ok: true, intent, note: body.note ?? null, cues: body.cues ?? [] },
    `TERKIRIM ✔ ${body.note ? `(${body.note}) ` : ""}cue: ${cues || "(tidak ada — mis. rundown selesai)"}`
  );
}

/** Alias modul harus ada di manifest (§6). Cloud memeriksa juga; ini supaya
 *  pesan salahnya keluar cepat dan menyebut daftar yang sah. */
async function pastikanAlias(cfg, alias) {
  let vocab;
  try {
    vocab = await ambil(cfg, "/api/vocab");
  } catch {
    return; // cloud yang akan menolak kalau memang salah
  }
  const daftar = (vocab.aliases ?? []).map((a) => a.alias.toLowerCase());
  if (daftar.length && !daftar.includes(alias.toLowerCase())) {
    ditolak(`modul "${alias}" tidak ada di manifest. Tersedia: ${daftar.join(", ")}`);
  }
}

// ---------------------------------------------------------------------------
// Subcommand
// ---------------------------------------------------------------------------
async function cmdState(cfg) {
  const s = await ambil(cfg, "/api/state");
  const murid = s.endpoints.filter((e) => e.role === "student").map((e) => e.endpoint_id);
  const teks = [
    `Panggung ${cfg.api}`,
    `- Torang di layar : ${s.show.screen ?? "(idle, tidak di layar)"}`,
    `- Modul aktif     : ${s.show.active_module ?? "-"}`,
    `- Murid online    : ${murid.length ? murid.join(", ") : "(belum ada)"}`,
    `- Binding kursi   : ${s.bindings.length ? s.bindings.map((b) => `${b.seat_id}=${b.nama}`).join(", ") : "(belum ada login)"}`,
    `- Rundown         : langkah ${s.rundown.pointer + 1}/${s.rundown.steps.length} — ${s.rundown.steps[s.rundown.pointer] ?? "selesai"}`,
  ].join("\n");
  keluar(0, s, teks);
}

async function cmdMurid(cfg) {
  const s = await ambil(cfg, "/api/state");
  const online = new Set(
    s.endpoints.filter((e) => e.role === "student").map((e) => e.endpoint_id)
  );
  const bind = new Map(s.bindings.map((b) => [b.seat_id, b.nama]));
  const kursi = [...new Set([...online, ...bind.keys()])].sort(
    (a, b) => (parseInt(a.replace(/\D/g, ""), 10) || 0) - (parseInt(b.replace(/\D/g, ""), 10) || 0)
  );
  if (kursi.length === 0) keluar(0, { ok: true, murid: [] }, "(belum ada murid online maupun terikat)");
  const baris = kursi.map(
    (k) => `- ${k.padEnd(7)} ${online.has(k) ? "ONLINE " : "offline"}  ${bind.get(k) ?? "(belum login)"}`
  );
  keluar(
    0,
    { ok: true, murid: kursi.map((k) => ({ seat_id: k, online: online.has(k), nama: bind.get(k) ?? null })) },
    baris.join("\n")
  );
}

async function cmdVocab(cfg) {
  const v = await ambil(cfg, "/api/vocab");
  const teks = [
    `Aksi   : ${v.actions.join(", ")}`,
    `Modul  : ${v.aliases.map((a) => a.alias).join(", ") || "(manifest kosong)"}`,
    `Target : ${v.targets.tv.join(", ")} · ${v.targets.komp.join(", ")} · ${v.targets.groups.join(", ")}`,
  ].join("\n");
  keluar(0, v, teks);
}

async function cmdSapa(cfg, args, flags) {
  const target = normalisasiTarget(args.join(" "));
  if (!target) salahPakai('sapa siapa? contoh: torang sapa komp6');
  if (!target.startsWith("komp") && target !== "all_student") {
    ditolak(`sapa hanya untuk layar murid, bukan "${target}"`);
  }
  await kirimIntent(cfg, { intent: "SAPA", target }, flags);
}

async function cmdGlow(cfg, args, flags) {
  const PRESET = ["pulse", "breathe", "wave"];
  const sisa = [...args];
  let durasi = 4000;
  let preset = "pulse";
  // Ambil dari BELAKANG: [target...] [preset] [durasi_ms]
  if (sisa.length && /^\d+$/.test(sisa[sisa.length - 1])) durasi = parseInt(sisa.pop(), 10);
  if (sisa.length && PRESET.includes(sisa[sisa.length - 1].toLowerCase())) {
    preset = sisa.pop().toLowerCase();
  }
  const target = normalisasiTarget(sisa.join(" ")) ?? "all_student";
  if (!target.startsWith("komp") && target !== "all_student") {
    ditolak(`glow hanya untuk layar murid, bukan "${target}"`);
  }
  if (!(durasi > 0 && durasi <= 60000)) ditolak("durasi glow harus 1–60000 ms");
  await kirimIntent(cfg, { intent: "GLOW", target, preset, duration_ms: durasi }, flags);
}

async function cmdPuter(cfg, args, flags) {
  if (args.length < 2) salahPakai('format: torang puter <alias-modul> <target>   (contoh: torang puter tes tv1)');
  const target = normalisasiTarget(args[args.length - 1]);
  if (!target) ditolak(`target tidak dikenal: "${args[args.length - 1]}"`);
  const alias = args.slice(0, -1).join(" ");
  await pastikanAlias(cfg, alias);
  await kirimIntent(cfg, { intent: "PLAY_MODULE", alias, target }, flags);
}

async function cmdPindah(cfg, args, flags) {
  const target = normalisasiTarget(args.join(" "));
  if (!target) salahPakai('pindah ke mana? contoh: torang pindah tv3');
  if (!target.startsWith("tv")) ditolak("pindah hanya antar TV (nyelem ke komp = fase 2)");
  await kirimIntent(cfg, { intent: "MOVE", to: target }, flags);
}

async function cmdSay(cfg, args, flags) {
  const kalimat = args.join(" ");
  if (!kalimat) salahPakai('say butuh kalimat, contoh: torang say "Torang, sapa komputer enam"');
  const berkasParser = path.join(DIR, "..", "openclaw", "torang-cue.mjs");
  const { parseKalimat } = await import(pathToFileURL(berkasParser).href);
  let vocab = null;
  try {
    vocab = await ambil(cfg, "/api/vocab");
  } catch {
    /* parser tetap jalan; cloud yang validasi alias */
  }
  const hasil = parseKalimat(kalimat, vocab);
  if (!hasil.ok) ditolak(`parser: ${hasil.error}`);
  await kirimIntent(cfg, hasil.intent, flags);
}

async function cmdAdmin(cfg, nama, args, flags) {
  const peta = {
    unbind: { jalur: "/api/unbind", butuhKursi: true },
    "reset-rundown": { jalur: "/api/rundown/reset" },
    "reset-roster": { jalur: "/api/roster/reset" },
    "reload-manifest": { jalur: "/api/manifest/reload" },
  };
  const def = peta[nama];
  let body = {};
  if (def.butuhKursi) {
    const kursi = normalisasiTarget(args.join(" "));
    if (!kursi || !kursi.startsWith("komp")) salahPakai("unbind kursi mana? contoh: torang unbind komp3");
    body = { seat_id: kursi };
  }
  if (flags.dry) keluar(0, { ok: true, dry: true, admin: nama, body }, `[dry] admin ${nama} ${JSON.stringify(body)}`);
  const { status, body: j } = await kirim(cfg, def.jalur, body);
  if (!j?.ok) keluar(1, { ok: false, http: status, error: j?.error ?? "?" }, `GAGAL (HTTP ${status}): ${j?.error ?? "?"}`);
  keluar(0, { ok: true, ...j }, `OK ✔ ${nama} ${JSON.stringify(j)}`);
}

const BANTUAN = `torang — pengendali Panggung Torang lewat CLI

Keadaan panggung
  torang state                    ringkasan (Torang di layar mana, rundown, dll)
  torang murid                    daftar kursi: online / terikat nama siapa
  torang vocab                    kosakata sah (alias modul + target)

Aksi panggung
  torang sapa <komp>              contoh: torang sapa komp6
  torang puter <modul> <target>   contoh: torang puter tes tv1
  torang pindah <tv>              contoh: torang pindah tv3
  torang glow <target> [preset] [ms]   preset: pulse|breathe|wave (default pulse 4000)
  torang lanjut | ulang | stop
  torang say "<kalimat guru>"     lewat parser kalimat §5

ADMIN (guru/implementor — bukan untuk agent)
  torang unbind <kursi>           torang reset-rundown
  torang reset-roster             torang reload-manifest

Opsi
  --dry        tampilkan intent, jangan kirim
  --json       keluaran JSON
  --api=URL --key=KUNCI           timpa config

Target sah: tv1..tv4 · komp1..komp20 · teacher · all_tv (semua tv) · all_student (semua komp)
Config: ~/.torang-stage/config.json — atau env TORANG_STAGE_API / TORANG_STAGE_KEY`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const semua = process.argv.slice(2);
  const flags = { dry: false, json: false, api: null, key: null };
  const args = [];
  for (const a of semua) {
    if (a === "--dry") flags.dry = true;
    else if (a === "--json") flags.json = true;
    else if (a.startsWith("--api=")) flags.api = a.slice(6);
    else if (a.startsWith("--key=")) flags.key = a.slice(6);
    else if (a === "--help" || a === "-h") args.unshift("--help");
    else args.push(a);
  }
  MODE_JSON = flags.json;

  const perintah = (args.shift() ?? "--help").toLowerCase();
  if (perintah === "--help") {
    console.log(BANTUAN);
    process.exit(0);
  }

  const cfg = bacaConfig(flags);

  try {
    switch (perintah) {
      case "state":
      case "keadaan":
        return await cmdState(cfg);
      case "murid":
        return await cmdMurid(cfg);
      case "vocab":
      case "kosakata":
        return await cmdVocab(cfg);

      case "sapa":
        return await cmdSapa(cfg, args, flags);
      case "glow":
        return await cmdGlow(cfg, args, flags);
      case "puter":
      case "putar":
        return await cmdPuter(cfg, args, flags);
      case "pindah":
        return await cmdPindah(cfg, args, flags);
      case "lanjut":
      case "go":
        return await kirimIntent(cfg, { intent: "GO" }, flags);
      case "ulang":
        return await kirimIntent(cfg, { intent: "REPLAY" }, flags);
      case "stop":
      case "berhenti":
        return await kirimIntent(cfg, { intent: "STOP" }, flags);
      case "say":
      case "kalimat":
        return await cmdSay(cfg, args, flags);

      case "unbind":
      case "reset-rundown":
      case "reset-roster":
      case "reload-manifest":
        return await cmdAdmin(cfg, perintah, args, flags);

      default:
        salahPakai(`perintah tidak dikenal: "${perintah}"`);
    }
  } catch (err) {
    keluar(
      1,
      { ok: false, error: err.message, api: cfg.api },
      `GAGAL: ${err.message}\nCek: cloud hidup? (jalankan "Torang Panggung.bat")\n     config ${cfg.file} → api=${cfg.api}`
    );
  }
}

await main();
