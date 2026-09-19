/**
 * Membaca daftar mic dari keluaran `ffmpeg -list_devices true -f dshow`.
 *
 * SATU tempat, dipakai app panggung (voice.ts) DAN torang-dengar.mjs.
 *
 * Kenapa berkas sendiri: ffmpeg mencetak daftar perangkat dalam DUA format
 * berbeda tergantung versinya. rekam-uji.ps1 sudah menangani keduanya sejak
 * awal - tapi saat logikanya disalin ke JavaScript, format kedua tertinggal di
 * dua tempat sekaligus. Akibatnya 19 Sep 2026 di PC guru: mic terpasang, app
 * bilang "tidak ada perangkat mic yang terbaca". Salinan yang menyimpang
 * diam-diam, persis. Sekarang aturannya ada di satu berkas dengan tesnya.
 *
 * Format LAMA (ffmpeg 4.x, mis. bawaan ImageMagick 7.1.0) - pakai judul bagian:
 *
 *   [dshow @ 0] DirectShow video devices (some may be both video and audio devices)
 *   [dshow @ 0]  "Integrated Camera"
 *   [dshow @ 0] DirectShow audio devices
 *   [dshow @ 0]  "Microphone (Realtek Audio)"
 *   [dshow @ 0]     Alternative name "@device_cm_..."
 *
 * Format BARU (ffmpeg 5+) - tanpa judul, tiap baris diberi jenis di ujungnya:
 *
 *   [dshow @ 0] "Integrated Camera" (video)
 *   [dshow @ 0] "Microphone (USB Audio Device)" (audio)
 *   [dshow @ 0]   Alternative name "@device_cm_..."
 *
 * Perhatikan nama mic sendiri sering berisi tanda kurung - "(USB Audio Device)".
 * Jenis perangkatnya dibaca dari kurung SETELAH tanda kutip penutup, bukan dari
 * kurung mana pun di baris itu.
 *
 * @param {string} teks keluaran ffmpeg (stderr, boleh digabung stdout)
 * @returns {string[]} nama mic, urutan asli, tanpa duplikat
 */
export function uraiMicDshow(teks) {
  const baris = String(teks ?? "").split(/\r?\n/);
  const mic = [];

  // Cara 1: judul bagian (format lama).
  let diAudio = false;
  let adaJudul = false;
  for (const b of baris) {
    if (/DirectShow audio devices/.test(b)) { diAudio = true; adaJudul = true; continue; }
    if (/DirectShow video devices/.test(b)) { diAudio = false; adaJudul = true; continue; }
    if (!diAudio || /Alternative name/.test(b)) continue;
    const m = b.match(/"([^"]+)"/);
    if (m) mic.push(m[1]);
  }

  // Cara 2: jenis di ujung baris (format baru). Hanya kalau format lama tidak
  // dipakai sama sekali - kalau ada judul, keluaran itu format lama dan cara 1
  // sudah menjawabnya (termasuk jawaban "tidak ada mic").
  if (!adaJudul) {
    for (const b of baris) {
      if (/Alternative name/.test(b)) continue;
      const m = b.match(/"([^"]+)"\s*\(([^)]*)\)\s*$/);
      if (m && /\baudio\b/.test(m[2])) mic.push(m[1]);
    }
  }

  return [...new Set(mic)];
}

/**
 * Perangkat "audio" yang sebenarnya BUKAN mic: rekaman ulang dari suara yang
 * KELUAR dari PC sendiri (loopback) atau kabel audio virtual.
 *
 * Kasus nyata PC guru 19 Sep 2026 - urutan dari ffmpeg:
 *     "Stereo Mix (Realtek High Definition Audio)" (audio)   <- PERTAMA
 *     "Microphone (soundtech)" (audio)
 * Mengambil yang pertama berarti app "mendengarkan" video yang sedang tayang di
 * TV, bukan suara guru. Tidak ada galat apa pun - cuma perintah yang tidak
 * pernah terdengar, dan transkrip berisi potongan audio video. Kegagalan
 * paling membingungkan yang bisa dipilih.
 */
const BUKAN_MIC = [
  /stereo\s*mix/i,        // Realtek dan banyak kartu suara bawaan
  /what\s*u\s*hear/i,      // Creative
  /wave\s*out\s*mix/i,
  /mixage\s*st/i,          // Windows berbahasa Prancis
  /loopback/i,
  /\bcable\s+output\b/i,  // VB-Audio Virtual Cable
  /\bvirtual\b/i,
  /voicemeeter/i,
];

/** Nama yang jelas-jelas mic - didahulukan kalau ada beberapa kandidat. */
const TANDA_MIC = /mic|mikrofon|microfono|headset|lavalier|clip-?on|wireless/i;

/**
 * Pilih mic yang dipakai kalau config tidak menyebut satu.
 *
 * 1. buang perangkat loopback/virtual (lihat BUKAN_MIC)
 * 2. dari sisanya, dahulukan yang namanya jelas mic
 * 3. kalau tidak ada yang jelas, ambil sisa yang pertama
 *
 * Tidak pernah memilih loopback walaupun cuma itu yang ada: lebih baik app
 * bilang "tidak ada mic" dengan terang daripada diam-diam merekam speaker.
 *
 * @param {string[]} daftar hasil uraiMicDshow
 * @returns {string | null}
 */
export function pilihMic(daftar) {
  const nyata = (daftar ?? []).filter((n) => !BUKAN_MIC.some((re) => re.test(n)));
  return nyata.find((n) => TANDA_MIC.test(n)) ?? nyata[0] ?? null;
}
