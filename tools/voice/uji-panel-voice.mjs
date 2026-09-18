/**
 * Uji tampilan indikator voice di panel operator, tanpa membuka Electron.
 *
 * KENAPA ADA: satu aturan di panel.ts gampang sekali rusak tanpa ketahuan -
 * tiap ucapan berakhir dengan laporan keadaan "diam", dan kalau blok hasil ikut
 * dikosongkan, kalimat yang DITOLAK lenyap sebelum sempat dibaca guru. Persis
 * kejadian yang paling perlu dilihat. Uji ini mengunci aturan itu.
 *
 * Belum masuk `npm test` karena butuh jsdom, yang belum jadi dependensi repo.
 *
 * Cara pakai:
 *     npm run build -w apps/theater      (menghasilkan dist/renderer/panel.js)
 *     npm i jsdom --no-save
 *     node tools/voice/uji-panel-voice.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIST = path.join(AKAR, "apps", "theater", "dist", "renderer");

let JSDOM;
try {
  ({ JSDOM } = await import("jsdom"));
} catch {
  console.error("jsdom belum ada. Jalankan: npm i jsdom --no-save");
  process.exit(2);
}
for (const f of ["panel.html", "panel.js"]) {
  if (!fs.existsSync(path.join(DIST, f))) {
    console.error(`${f} belum dibangun. Jalankan dulu: npm run build -w apps/theater`);
    process.exit(2);
  }
}

const html = fs
  .readFileSync(path.join(DIST, "panel.html"), "utf8")
  .replace('<script src="./panel.js"></script>', "");
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
const w = dom.window;

let cbVoice = null;
const kosong = () => {};
w.torang = {
  boot: () =>
    Promise.resolve({
      mode: "teacher", endpoint_id: "teacher-1", cloud_api: "http://x", room_key: "k",
      version: "uji", isPanel: true, hotkeys: null,
      voice: { keadaan: "diam" }, voice_tombol: "F8",
    }),
  onVoice: (cb) => { cbVoice = cb; },
  onStatus: kosong, onState: kosong, onAudio: kosong, onCue: kosong, onStop: kosong,
  onScene: kosong, sendEvent: kosong, sendIntent: kosong, panelBukaTv: kosong,
  panelUnbind: kosong, panelResetMurid: kosong, onOverlayShow: kosong,
  overlayOpen: kosong, overlayShown: kosong, onGlowShow: kosong, studentBoot: kosong,
  studentOptions: kosong, studentLogin: kosong, onStudentStatus: kosong,
};
w.eval(fs.readFileSync(path.join(DIST, "panel.js"), "utf8"));
await new Promise((r) => setTimeout(r, 30)); // tunggu boot().then selesai

const $ = (s) => w.document.querySelector(s);
let gagal = 0;
const cek = (nama, dapat, harap) => {
  const ok = harap instanceof RegExp ? harap.test(dapat) : dapat === harap;
  console.log(`${ok ? "  OK  " : "  XX  "} ${nama}${ok ? "" : `\n        dapat: ${JSON.stringify(dapat)}`}`);
  if (!ok) gagal++;
};

cek("boot: pill jadi SIAP MENDENGAR", $("#vpill").textContent, "SIAP MENDENGAR");
cek("boot: kelas pill = diam", $("#vpill").className, "vpill diam");
cek("boot: tombol PTT ditampilkan", $("#vtombol").textContent, "· tekan F8 untuk bicara");

cbVoice({ keadaan: "merekam" });
cek("merekam: pill merah berdenyut", $("#vpill").className, "vpill merekam");

cbVoice({ keadaan: "memproses", didengar: "Torang puter tes di TV tiga",
          intent: { intent: "PLAY_MODULE", alias: "tes", target: "tv3" }, ms: 412 });
cek("hasil: kalimat yang terdengar", $("#vdengar").textContent, "“Torang puter tes di TV tiga”");
cek("hasil: intent + latensi", $("#vhasil").textContent, "✓ PLAY_MODULE · tes · tv3  (412 ms)");
cek("hasil: warna hijau", $("#vhasil").firstChild.className, "ok");

cbVoice({ keadaan: "diam" });
cek("PENTING: hasil TIDAK hilang saat kembali diam", $("#vhasil").textContent, /PLAY_MODULE/);
cek("  dan pill tetap ikut berubah", $("#vpill").textContent, "SIAP MENDENGAR");

cbVoice({ keadaan: "memproses", didengar: "Torang buka jendela", intent: null,
          alasan: "kata 'jendela' tidak ada di kosakata" });
cek("tolak: alasan tampil", $("#vhasil").textContent, /✕ ditolak: kata 'jendela' tidak ada/);
cek("tolak: kelas merah", $("#vhasil").firstChild.className, "tolak");
cbVoice({ keadaan: "diam" });
cek("PENTING: kalimat DITOLAK bertahan setelah diam", $("#vhasil").textContent, /ditolak/);

cbVoice({ keadaan: "memproses", didengar: "Torang puter test di TV satu",
          intent: { intent: "PLAY_MODULE", alias: "tes", target: "tv1" },
          mirip: { didengar: "test", dipakai: "tes" }, ms: 380 });
cek("samar: tebakan nama modul dilaporkan", $("#vmirip").textContent,
    "⚠ dengar “test” → dipakai “tes”");

cbVoice({ keadaan: "memproses", didengar: "Torang stop", intent: { intent: "STOP" }, ms: 200 });
cek("samar: peringatan hilang saat ucapan berikutnya normal", $("#vmirip").textContent, "");

cek("riwayat: baris menumpuk", ($("#vriwayat").innerHTML.match(/<br>/g) || []).length + 1, 4);

// Transkrip datang dari Whisper - teks bebas. Tidak boleh pernah jadi HTML.
cbVoice({ keadaan: "memproses", didengar: "<img src=x onerror=alert(1)>", intent: null, alasan: "ditolak" });
cek("keamanan: transkrip TIDAK jadi elemen HTML", $("#vdengar").querySelector("img"), null);
cek("keamanan: riwayat di-escape", $("#vriwayat").innerHTML, /&lt;img/);

cbVoice({ keadaan: "mati", alasan: "tidak ada perangkat mic yang terbaca" });
cek("mati: pill abu-abu", $("#vpill").className, "vpill mati");
cek("mati: alasannya kelihatan", $("#vhasil").textContent, /tidak ada perangkat mic/);

console.log(gagal ? `\n${gagal} uji GAGAL` : "\nSemua uji lulus.");
process.exit(gagal ? 1 : 0);
