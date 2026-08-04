/**
 * Membuat aset placeholder modul dummy m99 "tes" (master keputusan #20:
 * jangan menunggu tim video — video teks/warna buatan sendiri).
 *
 * Hasil → apps/theater/assets-dev/ + manifest.json (durasi diukur ffprobe).
 * Aset ini DI-COMMIT ke repo supaya `npm run dev` langsung jalan tanpa ffmpeg.
 * Regenerasi: `npm run assets` (butuh ffmpeg di PATH; di Windows bisa lewat WSL).
 *
 * Klip enter/exit menggambarkan karakter "TORANG" bergerak masuk/keluar layar
 * sesuai arah — supaya disiplin arah (HUKUM §6) kelihatan saat diuji mata.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "apps", "theater", "assets-dev");
mkdirSync(OUT, { recursive: true });

const FONT_CANDIDATES = [
  process.env.TORANG_FONT,
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "C:/Windows/Fonts/arialbd.ttf",
  "/mnt/c/Windows/Fonts/arialbd.ttf",
].filter(Boolean);
const FONT = FONT_CANDIDATES.find((f) => existsSync(f));
if (!FONT) {
  console.error("Font tidak ketemu — set TORANG_FONT=path/ke/font.ttf");
  process.exit(1);
}
const probe = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
if (probe.error) {
  console.error("ffmpeg tidak ada di PATH. Di Windows: jalankan lewat WSL atau install ffmpeg.");
  process.exit(1);
}

const W = 1280;
const H = 720;
const FPS = 24;

function ff(args) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
}

function durationMs(file) {
  const out = execFileSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    path.join(OUT, file),
  ]).toString().trim();
  return Math.round(parseFloat(out) * 1000);
}

/** drawtext dasar untuk "karakter" TORANG (kotak oranye). */
function karakter(extra) {
  return [
    `drawtext=fontfile=${FONT}:text='TORANG':fontsize=110:fontcolor=#0b0f1f`,
    `box=1:boxcolor=#f2a33c:boxborderw=26`,
    extra,
  ].join(":");
}

function label(text) {
  return `drawtext=fontfile=${FONT}:text='${text}':fontsize=34:fontcolor=#9fa8d8:x=(w-text_w)/2:y=40`;
}

function video(file, dur, bg, filters) {
  ff([
    "-f", "lavfi",
    "-i", `color=c=${bg}:s=${W}x${H}:r=${FPS}:d=${dur}`,
    "-vf", filters.join(","),
    "-an",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "veryfast",
    "-crf", "28",
    path.join(OUT, file),
  ]);
  console.log("✔", file);
}

const CY = "(h-text_h)/2";

// --- materi: 4 dtk, timecode berjalan + penanda detik (cek sinkron PA vs layar)
video("m99_materi_tes.mp4", 4, "#15204a", [
  label("MATERI DUMMY · modul m99 \\«tes\\»"),
  `drawtext=fontfile=${FONT}:text='%{eif\\:t\\:d} dtk':fontsize=200:fontcolor=#e8ebff:x=(w-text_w)/2:y=(h-text_h)/2`,
  `drawtext=fontfile=${FONT}:text='beep tiap detik dari PA':fontsize=30:fontcolor=#7580b3:x=(w-text_w)/2:y=h-90`,
]);

// --- enter dari kiri: karakter meluncur dari luar-kiri ke tengah
video("m99_enter_l_tes.mp4", 2, "#12303a", [
  label("ENTER DARI KIRI ←—"),
  karakter(`x=-text_w+(t/2)*((w+text_w)/2):y=${CY}`),
]);

// --- enter dari kanan
video("m99_enter_r_tes.mp4", 2, "#12303a", [
  label("—→ ENTER DARI KANAN"),
  karakter(`x=w-(t/2)*((w+text_w)/2):y=${CY}`),
]);

// --- exit ke kiri: dari tengah keluar sisi kiri
video("m99_exit_l_tes.mp4", 2, "#3a2a12", [
  label("EXIT KE KIRI"),
  karakter(`x=(w-text_w)/2-(t/2)*((w+text_w)/2+20):y=${CY}`),
]);

// --- exit ke kanan
video("m99_exit_r_tes.mp4", 2, "#3a2a12", [
  label("EXIT KE KANAN"),
  karakter(`x=(w-text_w)/2+(t/2)*((w+text_w)/2+20):y=${CY}`),
]);

// --- idle: karakter mengambang pelan (loop)
video("m99_idle_tes.mp4", 3, "#101528", [
  label("IDLE (loop)"),
  karakter(`x=(w-text_w)/2:y=(h-text_h)/2+18*sin(2*PI*t/3)`),
]);

// --- audio materi → PA: beep pendek tiap awal detik
ff([
  "-f", "lavfi",
  "-i", "aevalsrc=sin(880*2*PI*t)*gt(mod(t\\,1)\\,0)*lt(mod(t\\,1)\\,0.12):d=4",
  "-c:a", "aac",
  "-b:a", "96k",
  path.join(OUT, "m99_materi_tes_audio.m4a"),
]);
console.log("✔ m99_materi_tes_audio.m4a");

// --- manifest sesuai kontrak §6
const jenisDari = (f) => f.match(/^m\d+_(materi|enter_l|enter_r|exit_l|exit_r|idle|knock)_/)[1];
const files = [
  "m99_materi_tes.mp4",
  "m99_enter_l_tes.mp4",
  "m99_enter_r_tes.mp4",
  "m99_exit_l_tes.mp4",
  "m99_exit_r_tes.mp4",
  "m99_idle_tes.mp4",
];
const manifest = {
  manifest_version: 1,
  release: "dev-dummy-1",
  modules: [
    {
      id: "m99",
      alias: "tes",
      slug: "tes",
      presenter: "torang",
      energy: "netral",
      assets: files.map((f) => ({ file: f, jenis: jenisDari(f), duration_ms: durationMs(f) })),
      audio: [
        {
          file: "m99_materi_tes_audio.m4a",
          for_jenis: "materi",
          duration_ms: durationMs("m99_materi_tes_audio.m4a"),
        },
      ],
    },
  ],
};
writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("✔ manifest.json (durasi terukur ffprobe)");
