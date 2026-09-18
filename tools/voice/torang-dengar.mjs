#!/usr/bin/env node
/**
 * torang-dengar - penghubung suara ke Panggung Torang.
 *
 *     mic (tekan Enter) -> whisper-cli -> normalisasi -> parser -> POST /api/intent
 *
 * Ini jalur SUNGGUHAN, bukan simulasi: kalimat yang lolos benar-benar
 * menggerakkan panggung. Dipakai untuk mencoba langsung di kelas dengan
 * bermacam orang, alih-alih mengukur satu suara di satu mic.
 *
 * Dua hal yang sengaja BEDA dari rancangan akhir (INSTRUKSI-VOICE-PENUH.md):
 *
 *   1. Tekan Enter, bukan tahan tombol. Tombol tahan-untuk-bicara perlu
 *      global hotkey di dalam app Electron; ini jembatan untuk mencoba
 *      lebih dulu, bukan penggantinya.
 *   2. Model dimuat ulang tiap ucapan (whisper-cli dipanggil per ucapan),
 *      sekitar 120 ms ongkos tambahan. Di app nanti model tinggal di memori.
 *
 * TIAP UCAPAN DISIMPAN. Rekaman + transkrip + hasil parse ditulis ke
 * rekaman-lapangan/. Jadi memakainya di kelas SEKALIGUS mengumpulkan korpus
 * dari suara bermacam orang - persis yang tidak bisa diberikan oleh sesi
 * rekaman satu orang, dan tanpa merepotkan siapa pun.
 *
 * Pemakaian:
 *   node torang-dengar.mjs                     # dengarkan mic, kirim ke panggung
 *   node torang-dengar.mjs --dry               # parse saja, JANGAN kirim
 *   node torang-dengar.mjs --grammar           # batasi keluaran Whisper
 *   node torang-dengar.mjs --berkas x.m4a      # pakai berkas, tanpa mic
 *   node torang-dengar.mjs --ucap "Torang, stop"   # TANPA mic & TANPA whisper:
 *                                              # menguji jalur ke panggungnya saja
 *   node torang-dengar.mjs --mic "Microphone (Realtek(R) Audio)"
 *   node torang-dengar.mjs --daftar-mic
 *
 * Config: ~/.torang-stage/config.json {"api":"http://<ip>:8787","room_key":"..."}
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseKalimat } from "../openclaw/torang-cue.mjs";
import { rapikanTranskrip } from "./normalisasi-stt.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
function opsi(n, bawaan) {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : bawaan;
}

const EXE = path.join(DIR, "bin", "whisper-cli.exe");
const MODEL = path.resolve(DIR, opsi("model", path.join("model", "ggml-base-q8_0.bin")));
const GBNF = path.join(DIR, "torang.gbnf");
const DIR_LAPANGAN = path.join(DIR, "rekaman-lapangan");
const LOG = path.join(DIR_LAPANGAN, "catatan.jsonl");

const kering = flag("dry");
const pakaiGrammar = flag("grammar");
const denda = opsi("denda-grammar", "100.0");
const detik = opsi("detik", "4");
const threads = opsi("threads", "8");
const berkasMasuk = opsi("berkas", null);
// --ucap: lewati mic DAN whisper, suapkan kalimat langsung ke parser lalu ke
// panggung. Gunanya bukan main-main: ini cara memastikan config, room_key, dan
// sambungan ke cloud benar SEBELUM ikut menyalahkan mic atau Whisper saat ada
// yang tidak jalan di PC guru yang baru.
const ucapLangsung = opsi("ucap", null);

const BIAS = [
  "Torang.",
  "Perintah panggung: puter, pindah, buka, tutup, lanjut, ulang, stop, sapa, glow.",
  "Sasaran: TV satu, TV dua, TV tiga, TV empat, layar satu, layar dua, layar tiga,",
  "layar empat, komp, semua layar, semua komp.",
  "Angka: satu, dua, tiga, empat, lima, enam, tujuh, delapan, sembilan, sepuluh,",
  "sebelas, dua belas, tiga belas, empat belas, lima belas, enam belas,",
  "tujuh belas, delapan belas, sembilan belas, dua puluh.",
].join(" ");

const W = { abu: "\x1b[90m", hijau: "\x1b[32m", merah: "\x1b[31m", kuning: "\x1b[33m", biru: "\x1b[36m", mati: "\x1b[0m" };
const warna = (k, t) => `${W[k]}${t}${W.mati}`;

// --- config ----------------------------------------------------------------
function bacaJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  } catch {
    return null;
  }
}

/**
 * Cari alamat + kunci panggung, berurutan dari yang paling khusus:
 *
 *   1. env TORANG_STAGE_API / TORANG_STAGE_KEY
 *   2. ~/.torang-stage/config.json              (ditulis pemasang jembatan OpenClaw)
 *   3. apps/theater/torang-theater.config.json  (config panggung itu sendiri)
 *
 * Nomor 3 penting: di PC guru, pasang-guru.ps1 menulis kunci ruangan ke situ
 * dan TIDAK menulis ~/.torang-stage/config.json. Tanpa ini torang-dengar akan
 * memakai "dev-room-key", ditolak cloud, dan orang akan mengira mic atau
 * Whisper yang rusak - padahal cuma kuncinya beda.
 */
function bacaConfig() {
  const jembatan = bacaJson(path.join(os.homedir(), ".torang-stage", "config.json")) ?? {};
  const panggung = bacaJson(path.resolve(DIR, "..", "..", "apps", "theater", "torang-theater.config.json")) ?? {};
  const asal = process.env.TORANG_STAGE_KEY ? "env TORANG_STAGE_KEY"
    : jembatan.room_key ? "~/.torang-stage/config.json"
    : panggung.room_key ? "apps/theater/torang-theater.config.json"
    : "bawaan";
  return {
    api: process.env.TORANG_STAGE_API ?? jembatan.api ?? panggung.cloud_api ?? "http://127.0.0.1:8787",
    room_key: process.env.TORANG_STAGE_KEY ?? jembatan.room_key ?? panggung.room_key ?? "dev-room-key",
    asal,
  };
}
const cfg = bacaConfig();

// --- program luar ----------------------------------------------------------
function jalankan(program, args) {
  const r = spawnSync(program, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) return { gagal: `${program}: ${r.error.message}` };
  return { keluaran: r.stdout ?? "", galat: r.stderr ?? "", kode: r.status };
}

/**
 * Cari ffmpeg yang BENAR-BENAR bisa merekam mic (punya perangkat `dshow`).
 *
 * Di PC guru ditemukan ffmpeg bawaan ImageMagick berada lebih dulu di PATH.
 * Build seperti itu umumnya tanpa dshow, jadi memanggil "ffmpeg" begitu saja
 * akan gagal merekam - dengan galat yang terlihat seperti mic-nya rusak.
 */
let _ffmpeg = null;
function cariFfmpeg() {
  if (_ffmpeg) return _ffmpeg;
  const calon = ["ffmpeg"];
  const wingetDir = path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Packages");
  try {
    const tumpuk = [wingetDir];
    while (tumpuk.length) {
      const d = tumpuk.pop();
      for (const isi of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, isi.name);
        if (isi.isDirectory()) tumpuk.push(p);
        else if (isi.name.toLowerCase() === "ffmpeg.exe") calon.push(p);
      }
    }
  } catch { /* folder winget tidak ada - lewati */ }

  for (const c of calon) {
    const r = jalankan(c, ["-hide_banner", "-devices"]);
    if (r.gagal) continue;
    if (/^\s*D\w*\s+dshow\b/m.test((r.keluaran ?? "") + (r.galat ?? ""))) {
      _ffmpeg = c;
      if (c !== "ffmpeg") console.log(warna("abu", `  (ffmpeg dengan dshow: ${c})`));
      return c;
    }
  }
  _ffmpeg = "ffmpeg"; // biar galatnya muncul apa adanya, bukan disembunyikan
  return _ffmpeg;
}

function daftarMic() {
  const r = jalankan(cariFfmpeg(), ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"]);
  const baris = (r.galat ?? "").split(/\r?\n/);
  const mic = [];
  let diAudio = false;
  for (const b of baris) {
    if (/DirectShow audio devices/.test(b)) { diAudio = true; continue; }
    if (/DirectShow video devices/.test(b)) { diAudio = false; continue; }
    if (!diAudio || /Alternative name/.test(b)) continue;
    const m = b.match(/"([^"]+)"/);
    if (m) mic.push(m[1]);
  }
  return mic;
}

function rekam(tujuan, mic) {
  const r = jalankan(cariFfmpeg(), [
    "-hide_banner", "-loglevel", "error",
    "-f", "dshow", "-i", `audio=${mic}`,
    "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le",
    "-t", String(detik), "-y", tujuan,
  ]);
  return r.kode === 0 && fs.existsSync(tujuan);
}

function keWav(sumber, tujuan) {
  const r = jalankan(cariFfmpeg(), [
    "-hide_banner", "-loglevel", "error", "-i", sumber,
    "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le", "-y", tujuan,
  ]);
  return r.kode === 0 && fs.existsSync(tujuan);
}

function transkrip(wav) {
  const args = ["-m", MODEL, "-f", wav, "-l", "id", "-nt", "-t", String(threads), "--prompt", BIAS];
  if (pakaiGrammar) args.push("--grammar", GBNF, "--grammar-rule", "root", "--grammar-penalty", String(denda));
  const t0 = Date.now();
  const r = jalankan(EXE, args);
  const dinding = Date.now() - t0;
  if (r.gagal) return { gagal: r.gagal };
  if (pakaiGrammar && /skipping grammar sampling/.test(r.galat)) {
    return { gagal: "grammar DILEWATI whisper - aturan 'root' tidak ketemu di torang.gbnf" };
  }
  const ms = (label) => {
    const m = r.galat.match(new RegExp(`${label}\\s*=\\s*([\\d.]+)\\s*ms`));
    return m ? Math.round(parseFloat(m[1])) : null;
  };
  const muat = ms("load time");
  const total = ms("total time");
  return {
    teks: (r.keluaran ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(" "),
    msMuat: muat,
    msProduksi: muat !== null && total !== null ? total - muat : null,
    msDinding: dinding,
  };
}

async function ambil(p) {
  const res = await fetch(`${cfg.api}${p}`);
  if (!res.ok) throw new Error(`${p} -> HTTP ${res.status}`);
  return await res.json();
}

async function kirim(intent) {
  const res = await fetch(`${cfg.api}/api/intent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ room_key: cfg.room_key, intent }),
  });
  return { http: res.status, body: await res.json().catch(() => ({})) };
}

// --- satu putaran ----------------------------------------------------------
let nomor = 0;
async function proses(wav, vocab, sumberAsli, teksLangsung) {
  nomor++;
  const t = teksLangsung !== undefined
    ? { teks: teksLangsung, msMuat: null, msProduksi: null, msDinding: 0 }
    : transkrip(wav);
  if (t.gagal) { console.log(warna("merah", `  XX ${t.gagal}`)); return; }

  console.log(`  ${warna("abu", "didengar :")} ${warna("biru", `"${t.teks || "(kosong)"}"`)}`);

  const rapi = rapikanTranskrip(t.teks);
  if (rapi.perubahan?.length) {
    const ubah = rapi.perubahan.filter((p) => p.jadi !== "dibuang").map((p) => `${p.dari}->${p.jadi}`);
    if (ubah.length) console.log(`  ${warna("abu", "dirapikan:")} ${warna("abu", ubah.join(", "))}`);
  }
  const hasil = rapi.ok ? parseKalimat(rapi.teks, vocab) : { ok: false, error: rapi.alasanTolak };

  const catatan = {
    waktu: new Date().toISOString(),
    berkas: wav ? path.basename(wav) : null,
    sumber: sumberAsli ?? "mic",
    grammar: pakaiGrammar,
    model: path.basename(MODEL),
    transkrip: t.teks,
    rapi: rapi.teks ?? null,
    ms: t.msProduksi,
  };

  if (!hasil.ok) {
    console.log(`  ${warna("kuning", "DITOLAK  :")} ${hasil.error}`);
    catatan.hasil = "ditolak";
    catatan.alasan = hasil.error;
  } else {
    console.log(`  ${warna("hijau", "intent   :")} ${JSON.stringify(hasil.intent)}`);
    catatan.hasil = "intent";
    catatan.intent = hasil.intent;
    if (kering) {
      console.log(`  ${warna("abu", "         :")} ${warna("abu", "--dry, tidak dikirim ke panggung")}`);
    } else {
      try {
        const r = await kirim(hasil.intent);
        if (r.body?.ok) {
          const cue = (r.body.cues ?? []).map((c) => `${c.type}->[${c.targets}]`).join(", ");
          console.log(`  ${warna("hijau", "TERKIRIM :")} ${cue || "(tidak ada cue)"}`);
          catatan.kirim = "ok";
        } else {
          console.log(`  ${warna("merah", "DITOLAK CLOUD:")} HTTP ${r.http} ${r.body?.error ?? ""}`);
          if (r.http === 401 || r.http === 403) {
            console.log(`  ${warna("kuning", "         :")} kunci ruangan kemungkinan beda. Dipakai: "${cfg.room_key}" (dari ${cfg.asal})`);
          }
          catatan.kirim = `gagal ${r.http}`;
        }
      } catch (e) {
        console.log(`  ${warna("merah", "GAGAL KIRIM:")} ${e.message}`);
        catatan.kirim = `gagal ${e.message}`;
      }
    }
  }
  if (t.msProduksi !== null) {
    console.log(`  ${warna("abu", `           ${t.msProduksi} ms (muat model ${t.msMuat} ms)`)}`);
  }
  fs.appendFileSync(LOG, JSON.stringify(catatan) + "\n", "utf8");
}

// --- utama -----------------------------------------------------------------
async function utama() {
  if (flag("daftar-mic")) {
    const m = daftarMic();
    console.log(m.length ? m.map((x, i) => `  [${i}] ${x}`).join("\n") : "  (tidak ada perangkat rekam)");
    return;
  }

  for (const [nama, p] of (ucapLangsung ? [] : [["whisper-cli.exe", EXE], ["model", MODEL]])) {
    if (!fs.existsSync(p)) {
      console.log(warna("merah", `Belum ada ${nama}: ${p}`));
      console.log("Jalankan dulu: tools\\voice\\PASANG-WHISPER.bat");
      process.exit(2);
    }
  }
  fs.mkdirSync(DIR_LAPANGAN, { recursive: true });

  let vocab = null;
  try {
    vocab = await ambil("/api/vocab");
  } catch (e) {
    console.log(warna("kuning", `  !! tidak bisa membaca /api/vocab (${e.message})`));
    console.log(warna("abu", "     parser tetap jalan, tapi nama modul tidak divalidasi di sini"));
  }

  console.log("");
  console.log(warna("biru", "=== Torang dengar ==="));
  console.log(`    Panggung : ${cfg.api}${kering ? warna("kuning", "   [--dry: tidak mengirim]") : ""}`);
  console.log(`    Kunci    : ${cfg.room_key} ${warna("abu", `(dari ${cfg.asal})`)}`);
  console.log(`    Model    : ${path.basename(MODEL)}   Grammar: ${pakaiGrammar ? `NYALA (denda ${denda})` : "mati"}`);
  if (vocab?.aliases?.length) {
    console.log(`    Modul    : ${vocab.aliases.map((a) => a.alias).join(", ")}`);
  }
  console.log(`    Rekaman  : ${DIR_LAPANGAN}`);
  console.log("");

  // Mode ucap: tanpa mic, tanpa whisper - menguji jalur ke panggung saja.
  if (ucapLangsung) {
    console.log(warna("abu", `  (tanpa mic & tanpa whisper) "${ucapLangsung}"`));
    await proses(null, vocab, "ucap-langsung", ucapLangsung);
    console.log("");
    return;
  }

  // Mode berkas: tidak butuh mic sama sekali.
  if (berkasMasuk) {
    const sumber = path.resolve(berkasMasuk);
    if (!fs.existsSync(sumber)) { console.log(warna("merah", `tidak ada: ${sumber}`)); process.exit(1); }
    const wav = path.join(DIR_LAPANGAN, `${Date.now()}-berkas.wav`);
    if (!keWav(sumber, wav)) { console.log(warna("merah", "gagal mengubah berkas jadi WAV")); process.exit(1); }
    console.log(warna("abu", `  berkas: ${path.basename(sumber)}`));
    await proses(wav, vocab, path.basename(sumber));
    console.log("");
    return;
  }

  const mic = opsi("mic", null) ?? daftarMic()[0];
  if (!mic) {
    console.log(warna("merah", "  XX tidak ada perangkat rekam yang terbaca."));
    console.log("     Colok mic, atau pakai --berkas untuk mencoba tanpa mic.");
    process.exit(1);
  }
  console.log(`    Mic      : ${mic}`);
  console.log("");
  console.log(warna("abu", `  Tekan Enter lalu bicara (${detik} detik). Ctrl+C untuk berhenti.`));
  console.log("");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const tanya = () => new Promise((r) => rl.question(warna("abu", "  [Enter] bicara > "), r));

  for (;;) {
    await tanya();
    const wav = path.join(DIR_LAPANGAN, `${Date.now()}.wav`);
    process.stdout.write(warna("kuning", "  BICARA..."));
    if (!rekam(wav, mic)) {
      console.log(warna("merah", " gagal merekam - nama mic mungkin salah (--daftar-mic)"));
      continue;
    }
    console.log(warna("abu", " selesai"));
    await proses(wav, vocab, "mic");
    console.log("");
  }
}

utama().catch((e) => { console.log(warna("merah", `GAGAL: ${e.message}`)); process.exit(1); });
