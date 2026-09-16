#!/usr/bin/env node
/**
 * torang-modul — mendaftarkan video baru ke manifest Panggung Torang.
 *
 * Dibuat supaya guru (atau agent Hermes atas nama guru) tidak perlu menyunting
 * manifest.json dengan tangan: taruh video di folder, sebut satu perintah,
 * sisanya dikerjakan di sini — ffprobe durasi, nama file sesuai kontrak §6,
 * sisip blok modul, muat ulang manifest di cloud.
 *
 * PERINTAH
 *   inbox                      daftar video yang menunggu di folder video-baru
 *   usul <file>                usulkan id/alias/slug + durasi; TIDAK menulis
 *   daftar <file>              daftarkan sungguhan (lihat opsi di bawah)
 *
 * OPSI daftar
 *   --alias=<kata>   kata yang diucapkan guru (default: usulan dari nama file)
 *   --slug=<slug>    potongan slug di nama file (default: dari nama file)
 *   --id=<mNN>       nomor modul (default: nomor bebas berikutnya)
 *   --jenis=<j>      materi|enter_l|enter_r|exit_l|exit_r|idle|knock (default materi)
 *   --ke=<id|alias>  tambahkan klip ke modul yang SUDAH ada, bukan bikin baru
 *   --audio=<file>   berkas audio (default: cari yang senama di folder sama)
 *   --durasi-ms=<n>  pakai durasi ini kalau ffprobe tidak ada
 *   --timpa          boleh menimpa aset senama (yang lama dicadangkan dulu)
 *   --tanpa-reload   jangan panggil reload manifest di cloud
 *   --dry            tampilkan rencana, JANGAN tulis apa pun
 *   --json           keluaran JSON (untuk agent/skrip)
 *   --aset=<dir>     timpa folder aset (default apps/theater/assets-dev)
 *   --api= / --key=  timpa alamat cloud / kunci ruangan
 *
 * KELUAR: 0 sukses · 1 gagal · 2 salah pakai.
 *
 * CATATAN: aset diresolusi LOKAL per mesin. Video yang ditargetkan ke komp
 * murid harus ada juga di folder aset PC murid itu — perintah ini hanya
 * menyentuh mesin tempat ia dijalankan.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(DIR, "..", "..");
const JENIS_SAH = ["materi", "enter_l", "enter_r", "exit_l", "exit_r", "idle", "knock"];
const EKST_VIDEO = [".mp4", ".webm", ".mov", ".mkv"];
const EKST_AUDIO = [".m4a", ".mp3", ".aac", ".wav"];

let JSON_MODE = false;

function keluar(kode, pesan, data) {
  if (JSON_MODE) {
    console.log(JSON.stringify({ ok: kode === 0, pesan, ...(data ?? {}) }, null, 2));
  } else if (pesan) {
    console.log(pesan);
  }
  process.exit(kode);
}
const gagal = (p, d) => keluar(1, `DITOLAK: ${p}`, d);
const salahPakai = (p) => keluar(2, `SALAH PAKAI: ${p}`, null);

// ---------------------------------------------------------------------------
// Flag & config
// ---------------------------------------------------------------------------
function baca(argv) {
  const flags = {};
  const sisa = [];
  for (const a of argv) {
    const m = a.match(/^--([a-z-]+)(?:=(.*))?$/);
    if (m) flags[m[1]] = m[2] ?? true;
    else sisa.push(a);
  }
  return { flags, sisa };
}

function config(flags) {
  const file = path.join(os.homedir(), ".torang-stage", "config.json");
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    /* pakai env/default */
  }
  return {
    api: flags.api ?? process.env.TORANG_STAGE_API ?? cfg.api ?? "http://127.0.0.1:8787",
    room_key: flags.key ?? process.env.TORANG_STAGE_KEY ?? cfg.room_key ?? "dev-room-key",
  };
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------
function folderAset(flags) {
  return path.resolve(flags.aset ?? path.join(REPO, "apps", "theater", "assets-dev"));
}
function bacaManifest(dirAset) {
  const p = path.join(dirAset, "manifest.json");
  if (!fs.existsSync(p)) gagal(`manifest tidak ada: ${p}`);
  try {
    return { p, m: JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "")) };
  } catch (e) {
    gagal(`manifest tidak terbaca sebagai JSON: ${e.message}`);
  }
}

function idBerikutnya(manifest) {
  // 90+ disisakan untuk modul dummy (m99 "tes"), supaya modul asli tidak
  // meloncat ke m100 begitu dummy-nya ikut terhitung.
  const angka = (manifest.modules ?? [])
    .map((m) => /^m(\d+)$/.exec(m.id ?? ""))
    .filter(Boolean)
    .map((x) => Number(x[1]))
    .filter((n) => n < 90);
  const n = angka.length ? Math.max(...angka) + 1 : 1;
  if (n >= 90) gagal("nomor modul di bawah m90 sudah habis — sebutkan --id sendiri");
  return "m" + String(n).padStart(2, "0");
}

function slugify(teks) {
  return teks
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Buang kata pembuka yang tidak membedakan apa-apa ("video instal x" → "instal x"). */
const KATA_BUANG = new Set(["video", "materi", "klip", "final", "fix", "revisi", "new", "baru"]);

function usulkanNama(fileVideo, manifest) {
  const dasar = path.basename(fileVideo, path.extname(fileVideo));
  let bagian = slugify(dasar).split("-").filter((x) => x && !KATA_BUANG.has(x));
  if (bagian.length === 0) bagian = [slugify(dasar) || "modul"];
  const slug = bagian.join("-");
  // Alias = kata terakhir yang bermakna; kalau terlalu pendek/angka, pakai slug penuh.
  const akhir = bagian[bagian.length - 1];
  let alias = akhir.length >= 3 && !/^\d+$/.test(akhir) ? akhir : slug;
  const terpakai = new Set((manifest.modules ?? []).map((m) => String(m.alias).toLowerCase()));
  if (terpakai.has(alias)) alias = slug;
  return { slug, alias, aliasBentrok: terpakai.has(alias) };
}

// ---------------------------------------------------------------------------
// Durasi
// ---------------------------------------------------------------------------
function durasiMs(file, flags) {
  if (flags["durasi-ms"]) {
    const n = Number(flags["durasi-ms"]);
    if (!Number.isFinite(n) || n <= 0) salahPakai("--durasi-ms harus angka > 0");
    return Math.round(n);
  }
  try {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file],
      { encoding: "utf8" }
    ).trim();
    const detik = Number(out);
    if (!Number.isFinite(detik) || detik <= 0) throw new Error(`durasi aneh: "${out}"`);
    return Math.round(detik * 1000);
  } catch (e) {
    gagal(
      `durasi tidak terbaca (${e.message}).\n` +
        `ffprobe tidak ada di PATH? Pasang ffmpeg, atau sebutkan --durasi-ms=<angka>.`
    );
  }
}

// ---------------------------------------------------------------------------
// Perintah
// ---------------------------------------------------------------------------
function folderInbox(flags) {
  return path.resolve(flags.inbox ?? path.join(REPO, "video-baru"));
}

function cmdInbox(flags) {
  const dir = folderInbox(flags);
  if (!fs.existsSync(dir)) {
    return keluar(0, `Folder ${dir} belum ada — buat foldernya lalu taruh video di situ.`, {
      folder: dir,
      video: [],
    });
  }
  const video = fs
    .readdirSync(dir)
    .filter((f) => EKST_VIDEO.includes(path.extname(f).toLowerCase()))
    .sort();
  if (JSON_MODE) return keluar(0, null, { folder: dir, video });
  if (video.length === 0) return keluar(0, `Tidak ada video di ${dir}`);
  console.log(`Video menunggu di ${dir}:`);
  for (const f of video) console.log(`  - ${f}`);
  console.log(`\nLangkah berikutnya: torang-modul usul "${path.join(dir, video[0])}"`);
  keluar(0, null, null);
}

function siapkan(fileVideo, flags) {
  if (!fileVideo) salahPakai('butuh path video, contoh: torang-modul usul "D:\\video\\instal hermes.mp4"');
  const abs = path.resolve(fileVideo);
  if (!fs.existsSync(abs)) gagal(`berkas tidak ada: ${abs}`);
  const ext = path.extname(abs).toLowerCase();
  if (!EKST_VIDEO.includes(ext)) gagal(`bukan berkas video (${ext}). Yang dikenal: ${EKST_VIDEO.join(", ")}`);

  const dirAset = folderAset(flags);
  const { p: pManifest, m: manifest } = bacaManifest(dirAset);
  const usul = usulkanNama(abs, manifest);

  const jenis = String(flags.jenis ?? "materi");
  if (!JENIS_SAH.includes(jenis)) salahPakai(`--jenis tidak sah: ${jenis}. Yang sah: ${JENIS_SAH.join(", ")}`);

  // Menambah klip ke modul yang sudah ada?
  let modulLama = null;
  if (flags.ke) {
    const cari = String(flags.ke).toLowerCase();
    modulLama = (manifest.modules ?? []).find(
      (m) => String(m.id).toLowerCase() === cari || String(m.alias).toLowerCase() === cari
    );
    if (!modulLama) gagal(`modul "${flags.ke}" tidak ada di manifest`);
  }

  const id = modulLama ? modulLama.id : String(flags.id ?? idBerikutnya(manifest));
  if (!/^m\d+$/.test(id)) salahPakai(`--id harus bentuk m<angka>, mis. m03 (dapat: ${id})`);
  const slug = modulLama ? modulLama.slug : String(flags.slug ?? usul.slug);
  const alias = modulLama ? modulLama.alias : String(flags.alias ?? usul.alias);

  if (!modulLama) {
    const bentrokId = (manifest.modules ?? []).find((m) => m.id === id);
    if (bentrokId) gagal(`id ${id} sudah dipakai modul "${bentrokId.alias}". Pakai --ke=${id} kalau mau menambah klip ke situ.`);
    const bentrokAlias = (manifest.modules ?? []).find(
      (m) => String(m.alias).toLowerCase() === alias.toLowerCase()
    );
    if (bentrokAlias) gagal(`alias "${alias}" sudah dipakai modul ${bentrokAlias.id}. Sebutkan --alias lain.`);
  } else if ((modulLama.assets ?? []).some((a) => a.jenis === jenis)) {
    gagal(`modul ${id} sudah punya klip '${jenis}'. Hapus/ganti manual kalau memang mau ditukar.`);
  }

  const namaAset = `${id}_${jenis}_${slug}${ext}`;
  const ms = durasiMs(abs, flags);

  // Audio pendamping: --audio, atau berkas senama di folder yang sama.
  let audioSumber = flags.audio ? path.resolve(String(flags.audio)) : null;
  if (audioSumber && !fs.existsSync(audioSumber)) gagal(`audio tidak ada: ${audioSumber}`);
  if (!audioSumber) {
    const dasar = path.join(path.dirname(abs), path.basename(abs, ext));
    for (const e of EKST_AUDIO) {
      if (fs.existsSync(dasar + e)) { audioSumber = dasar + e; break; }
    }
  }
  let audio = null;
  if (audioSumber) {
    const eAudio = path.extname(audioSumber).toLowerCase();
    audio = {
      sumber: audioSumber,
      nama: `${id}_${jenis}_${slug}_audio${eAudio}`,
      durasi_ms: durasiMs(audioSumber, {}),
    };
  }

  return { abs, ext, dirAset, pManifest, manifest, modulLama, id, alias, slug, jenis, namaAset, ms, audio, usul };
}

function cmdUsul(fileVideo, flags) {
  const r = siapkan(fileVideo, flags);
  if (JSON_MODE) {
    return keluar(0, null, {
      sumber: r.abs,
      id: r.id, alias: r.alias, slug: r.slug, jenis: r.jenis,
      nama_aset: r.namaAset, durasi_ms: r.ms,
      audio: r.audio ? { nama: r.audio.nama, durasi_ms: r.audio.durasi_ms } : null,
      modul_baru: !r.modulLama,
      perlu_konfirmasi: "alias",
    });
  }
  console.log(`Usulan untuk: ${path.basename(r.abs)}`);
  console.log(`  modul     : ${r.id}${r.modulLama ? " (sudah ada)" : " (baru)"}`);
  console.log(`  alias     : ${r.alias}      <- kata yang diucapkan guru`);
  console.log(`  slug      : ${r.slug}`);
  console.log(`  jenis     : ${r.jenis}`);
  console.log(`  nama aset : ${r.namaAset}`);
  console.log(`  durasi    : ${r.ms} ms (${(r.ms / 1000).toFixed(1)} dtk)`);
  if (r.audio) console.log(`  audio     : ${r.audio.nama} (${r.audio.durasi_ms} ms)`);
  else console.log(`  audio     : tidak ada`);
  console.log(`\nBelum ada yang ditulis. Kalau alias sudah cocok:`);
  console.log(`  torang-modul daftar "${r.abs}" --alias=${r.alias}`);
  keluar(0, null, null);
}

function salinAman(dari, ke, flags) {
  if (fs.existsSync(ke)) {
    if (!flags.timpa) {
      gagal(`aset senama sudah ada: ${ke}\nTambahkan --timpa kalau memang mau diganti (yang lama dicadangkan dulu).`);
    }
    const cadangan = `${ke}.backup-${stempel()}`;
    fs.copyFileSync(ke, cadangan);
    catatan.push(`aset lama dicadangkan: ${path.basename(cadangan)}`);
  }
  fs.copyFileSync(dari, ke);
}

function stempel() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const catatan = [];

async function cmdDaftar(fileVideo, flags) {
  const r = siapkan(fileVideo, flags);
  const tujuanAset = path.join(r.dirAset, r.namaAset);
  const tujuanAudio = r.audio ? path.join(r.dirAset, r.audio.nama) : null;

  const rencana = {
    salin: [`${r.abs} -> ${tujuanAset}`, ...(r.audio ? [`${r.audio.sumber} -> ${tujuanAudio}`] : [])],
    manifest: r.pManifest,
    modul: r.modulLama ? `tambah klip '${r.jenis}' ke ${r.id}` : `modul baru ${r.id} alias "${r.alias}"`,
  };

  if (flags.dry) {
    if (JSON_MODE) return keluar(0, null, { dry: true, rencana });
    console.log("RENCANA (--dry, tidak ada yang ditulis):");
    for (const s of rencana.salin) console.log(`  salin    ${s}`);
    console.log(`  manifest ${rencana.manifest}: ${rencana.modul}`);
    return keluar(0, null, null);
  }

  // 1. Salin aset
  salinAman(r.abs, tujuanAset, flags);
  if (r.audio) salinAman(r.audio.sumber, tujuanAudio, flags);

  // 2. Cadangkan manifest lalu sisipkan
  const cadangan = `${r.pManifest}.backup-${stempel()}`;
  fs.copyFileSync(r.pManifest, cadangan);

  const m = r.manifest;
  const klip = { file: r.namaAset, jenis: r.jenis, duration_ms: r.ms };
  if (r.modulLama) {
    r.modulLama.assets.push(klip);
    if (r.audio) {
      r.modulLama.audio = r.modulLama.audio ?? [];
      r.modulLama.audio.push({ file: r.audio.nama, for_jenis: r.jenis, duration_ms: r.audio.durasi_ms });
    }
  } else {
    m.modules.push({
      id: r.id,
      alias: r.alias,
      slug: r.slug,
      presenter: "torang",
      energy: "netral",
      assets: [klip],
      audio: r.audio ? [{ file: r.audio.nama, for_jenis: r.jenis, duration_ms: r.audio.durasi_ms }] : [],
    });
  }
  fs.writeFileSync(r.pManifest, JSON.stringify(m, null, 2) + "\n", "utf8");

  // 3. Muat ulang manifest di cloud
  let reload = "dilewati (--tanpa-reload)";
  if (!flags["tanpa-reload"]) {
    const cfg = config(flags);
    try {
      const res = await fetch(`${cfg.api}/api/manifest/reload`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ room_key: cfg.room_key }),
      });
      const body = await res.json().catch(() => ({}));
      reload = res.ok
        ? `OK (${body.modules} modul, release ${body.release})`
        : `GAGAL ${res.status} ${body.error ?? ""}`.trim();
    } catch (e) {
      reload = `tidak terjangkau (${e.message}) — panggung mati?`;
    }
  }

  const hasil = {
    id: r.id, alias: r.alias, slug: r.slug, jenis: r.jenis,
    aset: tujuanAset, audio: tujuanAudio, manifest: r.pManifest,
    cadangan_manifest: cadangan, reload, catatan,
  };
  if (JSON_MODE) return keluar(0, null, hasil);

  console.log(`TERDAFTAR \u2714  ${r.id} alias "${r.alias}"`);
  for (const c of catatan) console.log(`  ! ${c}`);
  console.log(`  aset     : ${r.namaAset}`);
  if (tujuanAudio) console.log(`  audio    : ${path.basename(tujuanAudio)}`);
  console.log(`  manifest : disisipkan (cadangan: ${path.basename(cadangan)})`);
  console.log(`  reload   : ${reload}`);
  console.log(`\nCoba: torang puter ${r.alias} tv1`);
  if (!r.modulLama && r.jenis === "materi") {
    console.log(`Catatan: modul ini baru punya klip 'materi'. Perintah "pindah"`);
    console.log(`selagi modul ini aktif butuh klip exit_l/exit_r + enter_l/enter_r.`);
  }
  console.log(`Kalau mau diputar di komp murid, aset ini harus ada juga di PC murid.`);
  keluar(0, null, null);
}

// ---------------------------------------------------------------------------
function bantuan() {
  console.log(`torang-modul — daftarkan video baru ke manifest panggung

  torang-modul inbox                    video yang menunggu di folder video-baru
  torang-modul usul <file>              usulkan id/alias/slug (tidak menulis)
  torang-modul daftar <file> [opsi]     daftarkan sungguhan

Opsi penting: --alias= --id= --jenis= --ke= --audio= --timpa --dry --json
Selengkapnya: baca komentar di atas berkas ini.`);
}

async function main() {
  const { flags, sisa } = baca(process.argv.slice(2));
  JSON_MODE = flags.json === true;
  const cmd = (sisa[0] ?? "").toLowerCase();
  switch (cmd) {
    case "inbox": return cmdInbox(flags);
    case "usul": return cmdUsul(sisa[1], flags);
    case "daftar": return await cmdDaftar(sisa[1], flags);
    case "": case "help": case "--help": bantuan(); return process.exit(sisa[0] ? 0 : 2);
    default: salahPakai(`perintah tidak dikenal: ${cmd}`);
  }
}

main().catch((e) => gagal(e.message));
