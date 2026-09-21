/**
 * "Contekan" kosakata untuk Whisper (initial prompt) - SATU sumber untuk app
 * panggung, torang-dengar, dan nilai-stt.
 *
 * Sebelumnya ada tiga salinan, dan urutan isinya sudah mulai berbeda. Tiga hal
 * yang dipelajari 19 Sep 2026 dari transkrip PC guru ("Puter, ters, d, tv, satu."):
 *
 * 1. Kata penghubung WAJIB ada di contekan. Contekan lama tidak memuat "di"
 *    maupun "ke" - dan Whisper menulis "d". Satu huruf itu yang menggagalkan
 *    seluruh kalimat, karena parser memakai "di" sebagai batas nama modul.
 *
 * 2. Nama modul WAJIB ada. Contekan lama tidak menyebut satu pun nama modul,
 *    jadi "tes" terdengar "ters". Daftarnya diambil dari /api/vocab saat itu
 *    juga - modul yang baru didaftarkan langsung ikut.
 *
 * 3. Whisper MENIRU gaya contekan. Daftar kata berkoma menghasilkan transkrip
 *    berkoma di tiap kata - "dieja". Komanya sendiri tidak berbahaya (dibuang
 *    normalisasi), tapi memecah kalimat jadi kata tunggal membuat kata pendek
 *    seperti "di" gampang terpotong jadi "d".
 *
 * KENAPA TETAP BUKAN CONTOH KALIMAT PERINTAH UTUH
 * Contekan berbentuk "Torang, puter tes di TV satu." memang paling kuat
 * mengarahkan - tapi Whisper dikenal MENGULANG contekannya saat mendengar
 * hening. Tombol yang tertekan tanpa sengaja akan menghasilkan perintah sah
 * yang langsung menayangkan video. Jadi contekan ini memuat semua kata yang
 * diperlukan dalam kalimat biasa, tanpa pernah membentuk satu perintah yang sah.
 *
 * @param {string[]} [aliases] nama modul dari /api/vocab
 * @returns {string}
 */
export function promptWhisper(aliases) {
  const modul = [...new Set((aliases ?? []).map((a) => String(a).trim().toLowerCase()).filter(Boolean))]
    .slice(0, 20); // contekan Whisper terbatas (~224 token); nama modul tidak boleh mendesak kosakata inti
  const bagian = [
    "Guru memanggil Torang lalu menyebut perintah panggung dalam bahasa Indonesia.",
    "Kata kerja yang dipakai: puter, pindah, buka, tutup, lanjut, ulang, stop, sapa, glow.",
    "Kata penghubung: di, ke, window, video, semua.",
    "Tempat: TV, layar, komp; bilangan satu sampai dua puluh.",
  ];
  if (modul.length > 0) bagian.push(`Nama modul yang ada: ${modul.join(", ")}.`);
  return bagian.join(" ");
}
