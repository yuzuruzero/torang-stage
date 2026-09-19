/**
 * Tebakan kalimat terdekat - jalan HANYA setelah parser menolak.
 *
 * MASALAH YANG DIPECAHKAN
 * Guru salah sebut satu kata, atau menambah satu kata, dan perintahnya ditolak.
 * Di depan kelas ia tidak punya jalan keluar selain mengulang-ulang menebak
 * kalimat yang "benar" - dan tiap bentuk kalimat baru harus lewat programmer
 * dulu. Itu yang tidak bisa dipakai, bukan ketatnya parser.
 *
 * KENAPA INI BUKAN "PARSER YANG MENEBAK"
 * Tiga hal yang membuatnya tetap aman:
 *
 * 1. Kalimat yang sah jumlahnya TERBATAS dan bisa didaftar semua. Jadi ini
 *    bukan menafsirkan kalimat bebas; ini memilih satu dari daftar tertutup.
 * 2. Intent-nya TIDAK PERNAH dibuat di sini. Kandidat yang menang dijalankan
 *    ulang lewat `parseKalimat` yang sama persis, dan intent yang dipakai
 *    adalah keluaran parser itu. Kemiripan cuma memilih kalimat mana yang
 *    DIUSULKAN - ia tidak pernah menyusun perintah.
 * 3. Hasilnya TIDAK dieksekusi. Ia diusulkan ke guru dan baru jalan kalau
 *    guru membenarkannya. Salah tebak berakhir jadi pertanyaan, bukan jadi
 *    video yang salah tayang.
 *
 * Dua pagar angka: jarak harus cukup dekat (30% panjang kalimat, minimal 1),
 * dan pemenangnya harus BENAR-BENAR lebih dekat daripada juara kedua - kalau
 * dua kalimat sama dekatnya, lebih baik tidak mengusulkan apa pun daripada
 * melempar koin.
 */
import { parseKalimat, jarakKata, cocokkanAlias, KATA_PENGISI } from "./parser.mjs";

const ANGKA_KATA = [
  null, "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan",
  "sembilan", "sepuluh", "sebelas", "dua belas", "tiga belas", "empat belas",
  "lima belas", "enam belas", "tujuh belas", "delapan belas", "sembilan belas",
  "dua puluh",
];

// "tv tiga" dan "layar tiga" menunjuk sasaran yang sama, dan keduanya diterima
// parser - jadi keduanya harus ikut jadi kandidat. Kalau tidak, guru yang
// mengucapkan sinonim yang SAH akan dihitung salah sejauh selisih dua kata itu.
const TV = [1, 2, 3, 4].flatMap((n) => [`tv ${ANGKA_KATA[n]}`, `layar ${ANGKA_KATA[n]}`]);
const KOMP = Array.from({ length: 20 }, (_, i) => `komp ${ANGKA_KATA[i + 1]}`);

/**
 * Semua kalimat yang sah saat ini. Daftar ini ikut berubah kalau modul
 * bertambah - itu sebabnya ia dibangun tiap kali, bukan ditulis tetap.
 *
 * @param {{aliases?: Array<{alias: string}>}} [vocab]
 * @returns {string[]} kalimat tanpa pemanggil, dalam bentuk yang dibaca parser
 */
export function kalimatSah(vocab) {
  const alias = (vocab?.aliases ?? []).map((a) => String(a.alias).toLowerCase());
  const sasaranModul = [...TV, ...KOMP, "semua layar", "semua komp"];
  const keluar = ["lanjut", "ulang", "stop"];

  for (const a of alias) {
    for (const s of sasaranModul) keluar.push(`puter ${a} di ${s}`);
  }
  for (const t of TV) {
    keluar.push(`pindah ke ${t}`, `tutup ${t}`, `buka window ${t}`);
  }
  keluar.push("tutup semua layar", "buka window semua layar", "pindah ke semua layar");
  for (const k of KOMP) keluar.push(`sapa ${k}`, `glow ${k}`);
  keluar.push("glow semua komp");
  return keluar;
}

/**
 * Jarak PER KATA, bukan per huruf.
 *
 * Per huruf, "tayangkan" salah (9 huruf) dihitung jauh lebih mahal daripada
 * "tiga" jadi "dua" (3 huruf) - padahal yang pertama cuma salah sebut kata
 * kerja, sementara yang kedua MENGUBAH TV MANA yang dituju. Ukuran yang
 * mencampur keduanya tidak bisa dipakai buat memutuskan apa pun.
 *
 * Di sini tiap kata yang meleset berharga paling banyak 1, sebanding dengan
 * seberapa jauh ejaannya; kata yang hilang atau kelebihan berharga tepat 1.
 * Jadi "satu kata salah" selalu berarti hal yang sama, sepanjang apa pun
 * katanya.
 */
export function jarakKalimat(a, b) {
  const x = a.split(" ").filter(Boolean);
  const y = b.split(" ").filter(Boolean);
  const biaya = (p, q) => (p === q ? 0 : jarakKata(p, q) / Math.max(p.length, q.length));
  let baris = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    let diagonal = baris[0];
    baris[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const simpan = baris[j];
      baris[j] = Math.min(
        baris[j] + 1,                        // hapus
        baris[j - 1] + 1,                    // sisip
        diagonal + biaya(x[i - 1], y[j - 1]) // ganti
      );
      diagonal = simpan;
    }
  }
  return baris[y.length];
}

/** Buang pemanggil, tanda baca, dan spasi ganda - bentuk yang dibandingkan. */
function rapi(teks) {
  const kata = String(teks ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^torang\s+/, "")
    .split(" ")
    .filter(Boolean);
  // Kata sopan dibuang di sini juga - dengan aturan yang sama seperti parser
  // (ujung saja). Kalau tidak, "tolong" terhitung satu kata meleset dan
  // memakan jatah kesalahan yang seharusnya untuk salah sebut yang sungguhan.
  let i = 0;
  let j = kata.length;
  while (i < j && KATA_PENGISI.has(kata[i])) i++;
  while (j > i && KATA_PENGISI.has(kata[j - 1])) j--;
  return kata.slice(i, j).join(" ");
}

/**
 * Cari satu kalimat sah yang paling dekat dengan yang terdengar.
 *
 * @param {string} didengar transkrip apa adanya (boleh berpemanggil)
 * @param {{aliases?: Array<{alias: string}>}} [vocab]
 * @returns {{kalimat: string, jarak: number, intent: object} | null}
 */
export function cariSaran(didengar, vocab) {
  const teks = rapi(didengar);
  if (!teks) return null;

  const urut = kalimatSah(vocab)
    .map((kalimat) => ({ kalimat, jarak: jarakKalimat(teks, kalimat) }))
    .sort((a, b) => a.jarak - b.jarak);
  if (urut.length === 0) return null;

  const terbaik = urut[0];

  // Pagar 1: cukup dekat, diukur dalam "berapa kata yang meleset".
  // Perintah satu kata ("stop", "lanjut", "ulang") dijaga jauh lebih ketat:
  // bunyi sembarangan gampang mendarat di dekat kata pendek, dan justru
  // perintah itulah yang paling mengganggu kalau salah jalan di tengah kelas.
  const jmlKata = terbaik.kalimat.split(" ").length;
  const ambang = jmlKata === 1 ? 0.35 : Math.max(1, jmlKata * 0.34);
  if (terbaik.jarak > ambang) return null;

  // Pagar 2: intent TIDAK dibuat di sini - parser yang membuatnya, dari
  // kalimat yang diusulkan. Kemiripan cuma memilih kalimat mana yang diajukan.
  const hasil = parseKalimat(`torang ${terbaik.kalimat}`, vocab);
  if (!hasil.ok) return null;
  const sidikBaik = JSON.stringify(hasil.intent);

  // Pagar 3: pemenangnya harus MENANG JELAS - tapi lawannya yang dihitung
  // adalah kalimat dengan INTENT BERBEDA, bukan sekadar tulisan berbeda.
  // "puter tes di tv tiga" dan "puter tes di layar tiga" adalah perintah yang
  // sama; menghitung keduanya sebagai dua saingan membuat sinonim saling
  // memakan margin, dan usulan yang sebenarnya yakin jadi ikut dibuang.
  let saingan = Infinity;
  for (const kandidat of urut.slice(1, 16)) {
    const h = parseKalimat(`torang ${kandidat.kalimat}`, vocab);
    if (h.ok && JSON.stringify(h.intent) !== sidikBaik) { saingan = kandidat.jarak; break; }
  }
  if (saingan - terbaik.jarak < 0.5) return null;

  // Pagar 4: NAMA MODUL tidak boleh ditebak jauh.
  //
  // Salah menebak kata aksi tidak berbahaya - pilihannya cuma 8 dan guru
  // melihat usulannya sebelum jalan. Salah menebak nama modul lain urusannya:
  // itu menentukan VIDEO APA yang tayang di depan kelas. Jadi bagian nama
  // modul harus lolos `cocokkanAlias` - pencocok berpagar yang sama yang
  // dipakai jalur normal - bukan sekadar "kalimatnya secara keseluruhan mirip".
  //
  // Tanpa ini, "puter pisang di TV tiga" akan mengusulkan "puter tes di TV
  // tiga", karena sisa kalimatnya yang panjang menenggelamkan satu kata yang
  // sepenuhnya salah itu.
  if (hasil.intent.intent === "PLAY_MODULE") {
    const kata = teks.split(" ");
    const posDi = kata.lastIndexOf("di");
    // Dua kemungkinan letak nama modul, karena kata aksinya bisa saja TIDAK
    // terucap sama sekali ("instal hermes di layar dua"): dengan kata aksi di
    // depan, dan tanpa. Yang mana pun, namanya tetap harus lolos cocokkanAlias.
    const alias = (vocab?.aliases ?? []).map((a) => String(a.alias).toLowerCase());
    const calonNama = posDi > 0
      ? [kata.slice(1, posDi).join(" "), kata.slice(0, posDi).join(" ")].filter(Boolean)
      : [];
    if (calonNama.length > 0 && alias.length > 0) {
      const lolos = calonNama.some((n) => {
        const cocok = cocokkanAlias(n, alias);
        return cocok && !cocok.ambigu && cocok.alias === hasil.intent.alias;
      });
      if (!lolos) return null;
    }
  }

  return { kalimat: terbaik.kalimat, jarak: terbaik.jarak, intent: hasil.intent };
}
