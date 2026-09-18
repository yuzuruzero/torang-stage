/**
 * normalisasi-stt — merapikan transkrip Whisper SEBELUM masuk parser grammar.
 *
 * ATURAN YANG MENGIKAT (jangan dilonggarkan tanpa alasan tertulis):
 *
 *   Lapisan ini HANYA memetakan salah-dengar dari kata yang SUDAH ADA di
 *   kosakata tertutup. Ia TIDAK menebak, TIDAK mencocokkan secara samar
 *   (fuzzy/Levenshtein), dan TIDAK pernah mengarang kata yang tidak diucapkan.
 *
 *   Alasannya sama dengan alasan parser bergrammar tertutup: begitu lapisan ini
 *   boleh menebak, keamanan §5 bocor lewat pintu belakang — kalimat ngawur bisa
 *   "dibetulkan" menjadi perintah yang sah. Tabel di bawah sengaja dibuat
 *   pendek, eksplisit, dan bisa dibaca manusia supaya bisa diaudit.
 *
 * Setiap perubahan dicatat dan dilaporkan, supaya saat menilai hasil uji kita
 * tahu persis berapa banyak keberhasilan yang berasal dari Whisper dan berapa
 * yang ditolong lapisan ini.
 */

/**
 * Frasa halusinasi Whisper — muncul saat masukan hening atau terlalu berisik.
 * Ini kelemahan Whisper yang terkenal: model dilatih dari subtitle YouTube,
 * jadi saat tidak ada ucapan ia cenderung "mengingat" penutup video.
 * Transkrip yang cocok DITOLAK, bukan diteruskan ke parser.
 */
export const FRASA_HALUSINASI = [
  /terima kasih (telah|sudah|udah) menonton/i,
  /jangan lupa (like|subscribe|di ?subscribe|komen)/i,
  /subtitle (oleh|by|dibuat)/i,
  /sampai jumpa di video (berikutnya|selanjutnya)/i,
  /^(terima kasih|makasih|musik|music|silakan|ya)\.?$/i,
  /^(you|thank you|thanks for watching)\.?$/i,
];

/** Salah-dengar tingkat FRASA (dicek sebelum tingkat kata). */
export const PETA_FRASA = new Map([
  ["te ve", "tv"],
  ["ti vi", "tv"],
  ["te fe", "tv"],
  ["kom puter", "komputer"],
  ["dua pulu", "dua puluh"],
  ["se belas", "sebelas"],
  ["sem bilan", "sembilan"],
]);

/**
 * Salah-dengar tingkat KATA. Kiri = yang mungkin ditulis Whisper,
 * kanan = kata sah di kosakata tertutup.
 *
 * Yang SENGAJA TIDAK dimasukkan, karena terlalu berisiko:
 *   "kamu" → komp   (kata umum, sering muncul di ucapan biasa)
 *   "tolong" → apa pun  (justru harus tetap ditolak — lihat kalimat uji T1)
 *   "empat" → apa pun selain empat
 */
/**
 * Kata yang TIDAK BOLEH diperlakukan sebagai salah-dengar "Torang", sekarang
 * maupun nanti. Ini kata sopan/pengisi yang mungkin diucapkan guru di depan
 * perintah sungguhan ("tolong sapa komp lima"). Kalau salah satunya dipetakan
 * ke "torang", ia akan dibuang parser, dan kalimat improvisasi yang seharusnya
 * DITOLAK berubah jadi perintah sah. Kalimat uji T1 menjaga ini.
 *
 * Perhatikan: "tolong" dan "perang" sama-sama berjarak dua huruf dari "torang".
 * Jadi tidak ada aturan kemiripan otomatis yang bisa memisahkan keduanya -
 * itulah sebabnya pemetaannya harus daftar tertulis, bukan hitungan jarak.
 */
export const BUKAN_PEMANGGIL = new Set([
  "tolong", "coba", "ayo", "silakan", "silahkan", "mohon", "minta", "sekarang",
]);

export const PETA_KATA = new Map([
  // pemanggil. "Torang" bukan kata Indonesia, jadi Whisper selalu mencari kata
  // nyata yang paling mirip - ini bagian paling rapuh dari seluruh kalimat.
  // Salah dengar di sini TIDAK bisa membuat perintah palsu: pemanggil dibuang
  // parser, dan sisanya tetap harus lolos grammar tertutup.
  ["torong", "torang"], ["turang", "torang"], ["dorang", "torang"],
  ["torak", "torang"], ["tolang", "torang"], ["torang", "torang"],
  ["perang", "torang"],   // TERBUKTI 18 Sep 2026 di rekaman Hadi
  // layar
  ["tivi", "tv"], ["tipi", "tv"], ["teve", "tv"], ["tve", "tv"], ["tefe", "tv"],
  ["tifi", "tv"],         // TERBUKTI 18 Sep 2026 di rekaman Hadi
  // komputer murid
  ["kom", "komp"], ["kompi", "komp"], ["kompie", "komp"], ["komputernya", "komp"],
  // aksi
  ["muter", "puter"], ["mutar", "puter"], ["putar", "puter"], ["puta", "puter"],
  ["lanjutkan", "lanjut"], ["lanjutin", "lanjut"],
  ["ulangi", "ulang"], ["diulang", "ulang"],
  ["setop", "stop"],
  ["sapain", "sapa"], ["sapalah", "sapa"],
  ["glo", "glow"], ["glau", "glow"], ["gelo", "glow"],
  ["bukak", "buka"], ["bukalah", "buka"],
  ["tutuplah", "tutup"], ["tutub", "tutup"],
  // objek
  ["windows", "window"], ["windo", "window"], ["jendelanya", "jendela"],
  ["layer", "layar"], ["layarnya", "layar"],
  // angka
  ["ampat", "empat"], ["tigo", "tiga"], ["limo", "lima"],
]);

/**
 * Rapikan transkrip mentah dari Whisper.
 *
 * @param {string} mentah teks apa adanya dari whisper-cli
 * @param {Map<string,string>} [petaTambahan] pemetaan nama scene/modul dari
 *   config — BUKAN tebakan; isinya harus berasal dari manifest/config nyata.
 * @returns {{ok:boolean, teks:string, perubahan:Array<{dari:string,jadi:string}>, alasanTolak?:string}}
 */
export function rapikanTranskrip(mentah, petaTambahan) {
  const perubahan = [];
  let teks = String(mentah ?? "");

  // 1. Buang penanda non-ucapan: [BLANK_AUDIO], [Musik], (suara kipas)
  const sebelumKurung = teks;
  teks = teks.replace(/\[[^\]]*\]/g, " ").replace(/\([^)]*\)/g, " ");
  if (teks !== sebelumKurung) perubahan.push({ dari: "penanda non-ucapan", jadi: "dibuang" });

  // 2. Huruf kecil, buang tanda baca (termasuk hubung — parser tidak membuangnya)
  teks = teks
    .toLowerCase()
    .replace(/[.,!?;:"'()\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (teks.length === 0) {
    return { ok: false, teks: "", perubahan, alasanTolak: "transkrip kosong" };
  }

  // 3. Tolak halusinasi SEBELUM dirapikan — jangan sampai frasa sampah
  //    dipoles jadi sesuatu yang kebetulan lolos parser.
  for (const pola of FRASA_HALUSINASI) {
    if (pola.test(teks)) {
      return { ok: false, teks, perubahan, alasanTolak: `frasa halusinasi Whisper: "${teks}"` };
    }
  }

  // 4. Salah-dengar tingkat frasa
  for (const [dari, jadi] of PETA_FRASA) {
    const pola = new RegExp(`\\b${dari}\\b`, "g");
    if (pola.test(teks)) {
      teks = teks.replace(pola, jadi);
      perubahan.push({ dari, jadi });
    }
  }

  // 5. Salah-dengar tingkat kata
  const peta = petaTambahan ? new Map([...PETA_KATA, ...petaTambahan]) : PETA_KATA;
  // Penjaga: kata sopan/pengisi tidak boleh pernah berubah jadi pemanggil,
  // termasuk lewat petaTambahan yang datang dari config.
  for (const kata of BUKAN_PEMANGGIL) {
    if (peta.get(kata) === "torang") {
      throw new Error(`pemetaan terlarang: "${kata}" -> "torang" (lihat BUKAN_PEMANGGIL)`);
    }
  }
  teks = teks
    .split(" ")
    .map((kata) => {
      const ganti = peta.get(kata);
      if (ganti && ganti !== kata) {
        perubahan.push({ dari: kata, jadi: ganti });
        return ganti;
      }
      return kata;
    })
    .join(" ");

  teks = teks.replace(/\s+/g, " ").trim();
  if (teks.length === 0) {
    return { ok: false, teks: "", perubahan, alasanTolak: "tidak ada yang tersisa setelah dirapikan" };
  }

  return { ok: true, teks, perubahan };
}
