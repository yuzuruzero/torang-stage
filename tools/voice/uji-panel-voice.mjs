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

// Jawaban tiruan untuk kartu "Video baru" - pendaftaran sungguhan dikerjakan
// torang-modul di main, yang tidak ada di sini.
let inboxPalsu = { folder: "D:\\torang-stage\\video-baru", isi: [] };
let usulPalsu = () => ({ ok: true, pesan: "", jalur: "x", nama: "x", alias: "x", durasi_ms: 0, modul_baru: true });
let daftarPalsu = () => ({ ok: true, pesan: "", alias: "x" });
w.torang = {
  boot: () =>
    Promise.resolve({
      mode: "teacher", endpoint_id: "teacher-1", cloud_api: "http://x", room_key: "k",
      version: "uji", isPanel: true, hotkeys: null,
      voice: { keadaan: "diam" }, voice_tombol: "F8", voice_tombol_ya: "F9",
    }),
  onVoice: (cb) => { cbVoice = cb; },
  jalurBerkas: (f) => `C:\\Users\\guru\\Desktop\\${f.name}`,
  modulInbox: async () => inboxPalsu,
  modulUsul: async (jalur) => usulPalsu(jalur),
  modulDaftar: async (jalur, alias) => daftarPalsu(jalur, alias),
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

// --- usulan kalimat terdekat ------------------------------------------------
cbVoice({ keadaan: "memproses", didengar: "Torang tayangkan tes di TV tiga", intent: null,
          alasan: 'aksi tidak dikenal: "tayangkan"', saran: { kalimat: "puter tes di tv tiga" } });
cek("usulan tampil", $("#vsaran").textContent, /maksudnya: .*Torang, puter tes di tv tiga/);
cek("usulan menyebut tombolnya", $("#vsaran").textContent, /tekan F9 untuk membenarkan/);
cek("usulan terlihat (bukan display:none)", $("#vsaran").className, "tampil");

cbVoice({ keadaan: "diam" });
cek("PENTING: usulan bertahan saat kembali diam", $("#vsaran").className, "tampil");

cbVoice({ keadaan: "memproses", didengar: "Torang puter tes di TV tiga",
          intent: { intent: "PLAY_MODULE", alias: "tes", target: "tv3" }, saran: null });
cek("usulan hilang begitu ada perintah yang diterima", $("#vsaran").className, "");

cbVoice({ keadaan: "memproses", didengar: "blah", intent: null, alasan: "ditolak", saran: null });
cek("ditolak TANPA usulan: kotak usulan tetap kosong", $("#vsaran").textContent, "");

cbVoice({ keadaan: "mati", alasan: "tidak ada perangkat mic yang terbaca" });
cek("mati: pill abu-abu", $("#vpill").className, "vpill mati");
cek("mati: alasannya kelihatan", $("#vhasil").textContent, /tidak ada perangkat mic/);

// --- kartu "Video baru" -> modul --------------------------------------------
const tunggu = () => new Promise((r) => setTimeout(r, 10));

inboxPalsu = {
  folder: "D:\\torang-stage\\video-baru",
  isi: [
    { nama: "video instal hermes.mp4", jalur: "D:\\v\\video instal hermes.mp4", alias: "hermes", durasi_ms: 92000, modul_baru: true, galat: null },
    { nama: "rusak.mp4", jalur: "D:\\v\\rusak.mp4", alias: "", durasi_ms: 0, modul_baru: true, galat: "ffprobe tidak bisa membaca berkas ini" },
  ],
};
w.eval("muatInbox()");
await tunggu();

const baris = () => Array.from(w.document.querySelectorAll("#vbDaftar .vb-baris"));
cek("inbox: dua berkas tampil", baris().length, 2);
cek("inbox: folder disebut", $("#vbFolder").textContent, /video-baru/);
cek("inbox: alias usulan sudah terisi", baris()[0].querySelector("input").value, "hermes");
cek("inbox: berkas rusak menampilkan alasannya", baris()[1].textContent, /ffprobe tidak bisa membaca/);
cek("inbox: berkas rusak TIDAK diberi tombol daftar", baris()[1].querySelector("button"), null);

// pendaftaran berhasil
let dikirim = null;
daftarPalsu = (jalur, alias) => { dikirim = { jalur, alias }; return { ok: true, pesan: "", alias }; };
baris()[0].querySelector("button").click();
await tunggu();
cek("daftar: jalur & alias diteruskan apa adanya", JSON.stringify(dikirim), '{"jalur":"D:\\\\v\\\\video instal hermes.mp4","alias":"hermes"}');
cek("daftar: hasilnya kalimat yang bisa LANGSUNG diucapkan", baris()[0].textContent, /ucapkan: "Torang, puter hermes di TV satu"/);
cek("daftar: tombol hilang setelah berhasil", baris()[0].querySelector("button"), null);

// pendaftaran gagal - tombol harus kembali, bukan mati selamanya
inboxPalsu.isi = [inboxPalsu.isi[0]];
w.eval("muatInbox()");
await tunggu();
daftarPalsu = () => ({ ok: false, pesan: 'alias "hermes" sudah dipakai modul lain', alias: "hermes" });
baris()[0].querySelector("button").click();
await tunggu();
cek("gagal: alasannya tampil", baris()[0].textContent, /sudah dipakai modul lain/);
cek("gagal: tombol kembali bisa ditekan", baris()[0].querySelector("button").disabled, false);

// tarik-lepas
usulPalsu = (jalur) => ({ ok: true, pesan: "", jalur, nama: "seret.mp4", alias: "seret", durasi_ms: 5000, modul_baru: true });
const dt = { files: [{ name: "seret.mp4" }] };
const evDrop = new w.Event("drop", { bubbles: true, cancelable: true });
Object.defineProperty(evDrop, "dataTransfer", { value: dt });
$("#lepas").dispatchEvent(evDrop);
await tunggu();
cek("seret: berkas dari luar folder ikut terbaca", baris()[0].textContent, /seret\.mp4/);
cek("seret: aliasnya diusulkan", baris()[0].querySelector("input").value, "seret");

// nama berkas = ketikan bebas
inboxPalsu.isi = [{ nama: "<img src=x onerror=alert(1)>.mp4", jalur: "D:\\v\\x.mp4", alias: "x", durasi_ms: 1000, modul_baru: true, galat: null }];
w.eval("muatInbox()");
await tunggu();
cek("keamanan: nama berkas TIDAK jadi elemen HTML", baris()[0].querySelector("img"), null);

console.log(gagal ? `\n${gagal} uji GAGAL` : "\nSemua uji lulus.");
process.exit(gagal ? 1 : 0);
