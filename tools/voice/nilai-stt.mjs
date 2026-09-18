#!/usr/bin/env node
/**
 * nilai-stt — mengukur apakah Whisper cukup tepat untuk voice command panggung.
 *
 * Yang diukur BUKAN ketepatan kata, melainkan ketepatan INTENT ujung-ke-ujung:
 *   WAV → whisper-cli → transkrip → (normalisasi) → parseKalimat → intent
 * Sebab parser itu pemaaf. Whisper boleh menulis "tivi tiga" asal intent yang
 * keluar tetap {MOVE, tv3}. Sebaliknya, transkrip yang sempurna pun tidak ada
 * gunanya kalau parser menolaknya.
 *
 * Dilaporkan terpisah: ketepatan dengan transkrip MENTAH dan setelah
 * NORMALISASI — supaya terlihat berapa banyak keberhasilan yang ditolong tabel
 * salah-dengar, bukan oleh Whisper sendiri.
 *
 * Pemakaian:
 *   node nilai-stt.mjs                          # pakai bin & model hasil pasang-whisper.ps1
 *   node nilai-stt.mjs --model model/ggml-small.bin
 *   node nilai-stt.mjs --tanpa-bias             # tanpa initial prompt (pembanding)
 *   node nilai-stt.mjs --palsu contoh-transkrip # uji harness tanpa mic & model
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseKalimat } from "../openclaw/torang-cue.mjs";
import { rapikanTranskrip } from "./normalisasi-stt.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));

// --- argumen -----------------------------------------------------------------
const argv = process.argv.slice(2);
function opsi(nama, bawaan) {
  const i = argv.indexOf(`--${nama}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : bawaan;
}
const flag = (nama) => argv.includes(`--${nama}`);

const dirRekaman = path.resolve(DIR, opsi("rekaman", "rekaman"));
const fileKalimat = path.resolve(DIR, opsi("kalimat", "kalimat-uji.json"));
const fileModel = path.resolve(DIR, opsi("model", path.join("model", "ggml-base-q8_0.bin")));
const fileBin = path.resolve(DIR, opsi("bin", path.join("bin", "whisper-cli.exe")));
const dirPalsu = flag("palsu") ? path.resolve(DIR, opsi("palsu", "contoh-transkrip")) : null;
const threads = opsi("threads", "8");
const pakaiBias = !flag("tanpa-bias");
const pakaiGrammar = flag("grammar");
const dendaGrammar = opsi("denda-grammar", "100.0");
const fileGrammar = path.resolve(DIR, "torang.gbnf");
const kondisi = pakaiGrammar ? "grammar-nyala" : "grammar-mati";
const fileLaporan = path.resolve(
  DIR,
  opsi("laporan", `laporan-uji-${new Date().toISOString().slice(0, 10)}-${kondisi}.md`)
);

// --- bias kosakata (initial prompt Whisper) ----------------------------------
const BIAS = [
  "Torang.",
  "Perintah panggung: puter, pindah, buka, tutup, lanjut, ulang, stop, sapa, glow.",
  "Sasaran: layar satu, layar dua, layar tiga, layar empat,",
  "TV satu, TV dua, TV tiga, TV empat, komp, semua layar, semua komp.",
  "Angka: satu, dua, tiga, empat, lima, enam, tujuh, delapan, sembilan, sepuluh,",
  "sebelas, dua belas, tiga belas, empat belas, lima belas, enam belas,",
  "tujuh belas, delapan belas, sembilan belas, dua puluh.",
].join(" ");

// --- bantu -------------------------------------------------------------------
const samaIntent = (a, b) => kunci(a) === kunci(b);
function kunci(o) {
  if (o === null || o === undefined) return "null";
  return JSON.stringify(Object.keys(o).sort().reduce((m, k) => ((m[k] = o[k]), m), {}));
}
function persentil(angka, p) {
  if (angka.length === 0) return null;
  const s = [...angka].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

/** Jalankan whisper-cli pada satu WAV. Kembalikan transkrip + timing internal. */
function jalankanWhisper(wav) {
  const args = ["-m", fileModel, "-f", wav, "-l", "id", "-nt", "-t", String(threads)];
  if (pakaiBias) args.push("--prompt", BIAS);
  // whisper.cpp hanya menyalakan grammar kalau --grammar DAN --grammar-rule
  // dua-duanya dikirim; kurang satu, ia DILEWATI DIAM-DIAM.
  if (pakaiGrammar) {
    args.push("--grammar", fileGrammar, "--grammar-rule", "root", "--grammar-penalty", String(dendaGrammar));
  }
  const t0 = Date.now();
  const r = spawnSync(fileBin, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const dinding = Date.now() - t0;
  if (r.error) return { gagal: `tidak bisa menjalankan ${fileBin}: ${r.error.message}` };

  const err = r.stderr ?? "";
  const ambilMs = (label) => {
    const m = err.match(new RegExp(`${label}\\s*=\\s*([\\d.]+)\\s*ms`));
    return m ? Math.round(parseFloat(m[1])) : null;
  };
  const load = ambilMs("load time");
  const total = ambilMs("total time");
  if (pakaiGrammar && /skipping grammar sampling/.test(err)) {
    return { gagal: "grammar DILEWATI whisper - aturan 'root' tidak ketemu di torang.gbnf" };
  }
  return {
    transkrip: (r.stdout ?? "").replace(/\r/g, "").split("\n").map((s) => s.trim()).filter(Boolean).join(" "),
    msMuatModel: load,
    msTotal: total,
    // Di produksi model TINGGAL di memori — jadi ongkos muat tidak dihitung.
    msProduksi: load !== null && total !== null ? total - load : null,
    msDinding: dinding,
  };
}

/** Mode --palsu: baca transkrip dari berkas .txt, tanpa mic dan tanpa model. */
function bacaPalsu(id) {
  const f = path.join(dirPalsu, `${id}.txt`);
  if (!fs.existsSync(f)) return null;
  return { transkrip: fs.readFileSync(f, "utf8").trim(), msMuatModel: 0, msTotal: null, msProduksi: null, msDinding: 0 };
}

// --- periksa prasyarat -------------------------------------------------------
let daftar = JSON.parse(fs.readFileSync(fileKalimat, "utf8")).kalimat;
// --inti: hanya 8 kalimat yang menjawab dua pertanyaan menentukan (apakah "TV"
// terbaca, dan apakah grammar memaksa kalimat terlarang jadi sah). Dipakai
// untuk percobaan cepat; angka untuk rapat tetap dari paket penuh.
if (flag("inti")) daftar = daftar.filter((k) => k.inti);
if (!dirPalsu) {
  const kurang = [];
  if (!fs.existsSync(fileBin)) kurang.push(`binary Whisper: ${fileBin}`);
  if (!fs.existsSync(fileModel)) kurang.push(`model: ${fileModel}`);
  if (!fs.existsSync(dirRekaman)) kurang.push(`folder rekaman: ${dirRekaman}`);
  if (pakaiGrammar && !fs.existsSync(fileGrammar)) kurang.push(`grammar: ${fileGrammar}`);
  if (kurang.length) {
    console.error("Belum lengkap:\n  - " + kurang.join("\n  - "));
    console.error("\nJalankan dulu: tools\\voice\\PASANG-WHISPER.bat lalu REKAM-UJI.bat");
    console.error("Atau uji harness-nya saja tanpa mic:  node nilai-stt.mjs --palsu");
    process.exit(2);
  }
}

// --- jalankan ----------------------------------------------------------------
const hasil = [];
for (const k of daftar) {
  const wav = path.join(dirRekaman, `${k.id}.wav`);
  const jalan = dirPalsu ? bacaPalsu(k.id) : fs.existsSync(wav) ? jalankanWhisper(wav) : null;
  if (!jalan) { hasil.push({ ...k, lewat: "belum direkam" }); continue; }
  if (jalan.gagal) { hasil.push({ ...k, lewat: jalan.gagal }); continue; }

  const mentah = parseKalimat(jalan.transkrip);
  const rapi = rapikanTranskrip(jalan.transkrip);
  const sesudah = rapi.ok ? parseKalimat(rapi.teks) : { ok: false, error: rapi.alasanTolak };

  const harusTolak = k.intent === null;
  hasil.push({
    ...k,
    transkrip: jalan.transkrip,
    teksRapi: rapi.teks,
    perubahan: rapi.perubahan,
    benarMentah: harusTolak ? !mentah.ok : mentah.ok && samaIntent(mentah.intent, k.intent),
    benarRapi: harusTolak ? !sesudah.ok : sesudah.ok && samaIntent(sesudah.intent, k.intent),
    dapatMentah: mentah.ok ? mentah.intent : `ditolak: ${mentah.error}`,
    dapatRapi: sesudah.ok ? sesudah.intent : `ditolak: ${sesudah.error}`,
    ms: jalan.msProduksi,
    msTotal: jalan.msTotal,
    msMuatModel: jalan.msMuatModel,
  });
}

// --- ringkas -----------------------------------------------------------------
const diuji = hasil.filter((h) => !h.lewat);
const sah = diuji.filter((h) => h.intent !== null);
const tolakan = diuji.filter((h) => h.intent === null);
const lat = diuji.map((h) => h.ms).filter((n) => typeof n === "number");

const pct = (a, b) => (b === 0 ? "-" : `${Math.round((a / b) * 100)}%`);
const benarM = sah.filter((h) => h.benarMentah).length;
const benarR = sah.filter((h) => h.benarRapi).length;
const salahTerima = tolakan.filter((h) => !h.benarRapi).length;
const ditolong = sah.filter((h) => !h.benarMentah && h.benarRapi).length;

const baris = [];
const P = (s) => { baris.push(s); console.log(s); };

P("");
P(`# Hasil uji STT — ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
P("");
P(`Model: \`${path.basename(fileModel)}\` · bias kosakata: ${pakaiBias ? "AKTIF" : "mati"} · **grammar: ${pakaiGrammar ? `NYALA (denda ${dendaGrammar})` : "mati"}** · threads: ${threads}${dirPalsu ? " · **MODE PALSU (tanpa mic/model)**" : ""}`);
P("");
P("## Angka yang menentukan");
P("");
P("| Ukuran | Hasil |");
P("|---|---|");
P(`| Intent benar, transkrip **mentah** | **${pct(benarM, sah.length)}** (${benarM}/${sah.length}) |`);
P(`| Intent benar, setelah **normalisasi** | **${pct(benarR, sah.length)}** (${benarR}/${sah.length}) |`);
P(`| Ditolong tabel salah-dengar | ${ditolong} kalimat |`);
P(`| **Salah terima** (kalimat terlarang yang lolos) | **${salahTerima}** dari ${tolakan.length} — harus 0 |`);
if (lat.length) {
  P(`| Latensi Whisper (median) | ${persentil(lat, 50)} ms |`);
  P(`| Latensi Whisper (p90) | ${persentil(lat, 90)} ms |`);
  P(`| Latensi Whisper (paling lama) | ${Math.max(...lat)} ms |`);
  const muat = diuji.map((h) => h.msMuatModel).filter((n) => typeof n === "number" && n > 0);
  if (muat.length) P(`| Ongkos muat model (sekali saat app nyala, TIDAK masuk hitungan di atas) | ${persentil(muat, 50)} ms |`);
}
P("");
P("Anggaran §C: transkrip keluar ≤ 700 ms untuk ucapan ~2 detik.");
if (lat.length) {
  const lewat = lat.filter((n) => n > 700).length;
  P(lewat === 0
    ? `Semua ${lat.length} ucapan masuk anggaran.`
    : `**${lewat} dari ${lat.length} ucapan MELEWATI anggaran.** Coba model lebih kecil, atau naikkan threads.`);
}
P("");
P("## Per kalimat");
P("");
P("| # | Diucapkan | Didengar Whisper | Mentah | Rapi | ms |");
P("|---|---|---|---|---|---|");
for (const h of hasil) {
  if (h.lewat) { P(`| ${h.id} | ${h.ucap} | _${h.lewat}_ | – | – | – |`); continue; }
  const tanda = (b) => (b ? "OK" : "**SALAH**");
  P(`| ${h.id} | ${h.ucap} | \`${h.transkrip || "(kosong)"}\` | ${tanda(h.benarMentah)} | ${tanda(h.benarRapi)} | ${h.ms ?? "–"} |`);
}
P("");
const gagal = hasil.filter((h) => !h.lewat && !h.benarRapi);
if (gagal.length) {
  P("## Yang masih salah setelah normalisasi");
  P("");
  for (const h of gagal) {
    P(`- **${h.id}** "${h.ucap}"`);
    P(`  - Whisper dengar: \`${h.transkrip || "(kosong)"}\``);
    P(`  - Setelah dirapikan: \`${h.teksRapi || "(kosong)"}\``);
    P(`  - Parser menghasilkan: \`${JSON.stringify(h.dapatRapi)}\``);
    P(`  - Seharusnya: \`${h.intent === null ? "DITOLAK" : JSON.stringify(h.intent)}\``);
  }
  P("");
}
// Banding bentuk sasaran: "TV" (resmi di kartu) vs "layar" (kontrol C1-C3).
const bentukTv = sah.filter((h) => /\bTV\b/.test(h.ucap));
const bentukLayar = sah.filter((h) => /\blayar\b/.test(h.ucap) && !/semua layar/.test(h.ucap));
if (bentukTv.length && bentukLayar.length) {
  const benar = (a) => a.filter((h) => h.benarRapi).length;
  P("## Bentuk sasaran: \"TV\" vs \"layar\"");
  P("");
  P('Kartu operator memakai **"TV"**. `layar` diterima parser sebagai cadangan dan diuji');
  P("di sini sebagai pembanding, karena Whisper base sempat gagal dua kali pada \"TV\".");
  P("");
  P("| Bentuk | Intent benar | Contoh |");
  P("|---|---|---|");
  P(`| \`TV N\` (resmi) | **${pct(benar(bentukTv), bentukTv.length)}** (${benar(bentukTv)}/${bentukTv.length}) | ${bentukTv.map((h) => h.id).join(", ")} |`);
  P(`| \`layar N\` (cadangan) | **${pct(benar(bentukLayar), bentukLayar.length)}** (${benar(bentukLayar)}/${bentukLayar.length}) | ${bentukLayar.map((h) => h.id).join(", ")} |`);
  P("");
  const selisih = benar(bentukLayar) / bentukLayar.length - benar(bentukTv) / bentukTv.length;
  if (selisih > 0.15) {
    P("**\"layar\" jelas lebih tinggi.** Ini bahan untuk menimbang ulang bentuk di kartu -");
    P("keputusannya keputusan pertunjukan, bukan keputusan teknis.");
  } else if (selisih < -0.15) {
    P("**\"TV\" lebih tinggi.** Dugaan dari satu rekaman sebelumnya keliru; kartu sudah benar.");
  } else {
    P("Selisihnya tipis pada sampel sekecil ini - belum cukup untuk mengubah apa pun.");
  }
  P("");
}

const perubahanDipakai = diuji.flatMap((h) => h.perubahan ?? []).filter((p) => p.jadi !== "dibuang");
if (perubahanDipakai.length) {
  const hitung = new Map();
  for (const p of perubahanDipakai) {
    const k = `${p.dari} → ${p.jadi}`;
    hitung.set(k, (hitung.get(k) ?? 0) + 1);
  }
  P("## Salah-dengar yang benar-benar terjadi");
  P("");
  P("Ini yang perlu dijaga di tabel normalisasi; sisanya boleh dibuang supaya tabel tetap pendek.");
  P("");
  for (const [k, n] of [...hitung].sort((a, b) => b[1] - a[1])) P(`- \`${k}\` — ${n}×`);
  P("");
}

fs.writeFileSync(fileLaporan, baris.join("\n") + "\n", "utf8");
console.log(`\nLaporan ditulis: ${fileLaporan}`);
process.exit(salahTerima > 0 ? 1 : 0);
