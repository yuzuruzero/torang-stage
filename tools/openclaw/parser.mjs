/**
 * parser.mjs - grammar tertutup Panggung Torang (HUKUM pasal 5).
 *
 * Berkas ini MURNI pustaka: tidak ada CLI, tidak ada top-level await, tidak
 * ada efek samping saat diimpor. Itu syarat supaya app Electron bisa
 * membundelnya (esbuild, keluaran CJS) dan memakai parser yang SAMA PERSIS
 * dengan yang dipakai jembatan Hermes, torang-dengar, dan seluruh tes.
 *
 * Satu parser, satu perilaku. Salinan kedua akan menyimpang diam-diam, dan
 * yang menyimpang adalah bagian yang menentukan apa yang boleh dieksekusi.
 *
 * CLI-nya ada di torang-cue.mjs, yang mengimpor dari sini.
 */

// ---------------------------------------------------------------------------
// Angka bahasa Indonesia (satu..dua puluh) + digit
// ---------------------------------------------------------------------------
const SATUAN = {
  satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7,
  delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11,
};

/** Baca angka 1–20 dari awal daftar token. Kembalikan [angka, jumlahTokenTerpakai] atau null. */
export function bacaAngka(tokens) {
  if (tokens.length === 0) return null;
  const t0 = tokens[0];
  if (/^\d{1,2}$/.test(t0)) {
    const n = parseInt(t0, 10);
    return n >= 1 && n <= 20 ? [n, 1] : null;
  }
  if (t0 in SATUAN) {
    const n = SATUAN[t0];
    const t1 = tokens[1];
    if (t1 === "belas" && n >= 2 && n <= 9) return [10 + n, 2]; // dua belas..sembilan belas
    if (t1 === "puluh" && n === 2) return [20, 2]; // dua puluh
    return [n, 1];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Parser grammar §5: "Torang, [AKSI] [OBJEK] [TARGET]" — kosakata TERTUTUP
// ---------------------------------------------------------------------------
function normalisasi(kalimat) {
  return kalimat
    .toLowerCase()
    .replace(/[.,!?;:"'()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Baca target dari daftar token: tv N | komp N | semua layar | semua komp. */
export function bacaTarget(tokens) {
  if (tokens.length === 0) return null;
  if (tokens[0] === "semua") {
    if (tokens[1] === "layar" || tokens[1] === "tv") return ["all_tv", 2];
    if (tokens[1] === "komp" || tokens[1] === "komputer" || tokens[1] === "murid") {
      return ["all_student", 2];
    }
    return null;
  }
  // "tv tiga" DAN "layar tiga" menunjuk sasaran yang sama.
  //
  // "layar" ditambahkan 18 Sep 2026 setelah uji suara pertama: Whisper base
  // berulang kali gagal pada "TV" - singkatan dua huruf yang diucapkan
  // "ti-vi", terdengar jadi "tifi", dan sekali malah menempel dengan kata
  // sebelumnya jadi satu token ("di TV tiga" -> "difitiga"). "layar" kata
  // Indonesia utuh, jauh lebih kokoh buat mesin maupun buat telinga murid di
  // ruang berisik. Dua-duanya diterima; kartu operator baru diubah setelah
  // ada angka yang membandingkan keduanya.
  if (tokens[0] === "tv" || tokens[0] === "layar") {
    const n = bacaAngka(tokens.slice(1));
    if (n && n[0] >= 1 && n[0] <= 4) return [`tv${n[0]}`, 1 + n[1]];
    return null;
  }
  if (/^tv[1-4]$/.test(tokens[0])) return [tokens[0], 1];
  if (tokens[0] === "komp" || tokens[0] === "komputer") {
    const n = bacaAngka(tokens.slice(1));
    if (n) return [`komp${n[0]}`, 1 + n[1]];
    return null;
  }
  if (/^komp([1-9]|1[0-9]|20)$/.test(tokens[0])) return [tokens[0], 1];
  return null;
}

// ---------------------------------------------------------------------------
// Pencocokan nama modul - SATU-SATUNYA tempat kemiripan boleh dipakai
// ---------------------------------------------------------------------------

/** Jarak Levenshtein, cukup untuk nama modul yang pendek. */
export function jarakKata(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0 || n === 0) return Math.max(m, n);
  let baris = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let diagonal = baris[0];
    baris[0] = i;
    for (let j = 1; j <= n; j++) {
      const simpan = baris[j];
      baris[j] = Math.min(
        baris[j] + 1,          // hapus
        baris[j - 1] + 1,      // sisip
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1) // ganti
      );
      diagonal = simpan;
    }
  }
  return baris[n];
}

/**
 * Cocokkan nama modul yang didengar ke daftar alias dari manifest.
 *
 * KENAPA KEMIRIPAN BOLEH DI SINI, dan tidak boleh di tempat lain:
 *
 * Kemiripan dilarang untuk pemanggil dan kata aksi, sebab di sana ia bisa
 * MENCIPTAKAN perintah dari kalimat yang seharusnya ditolak - "tolong" dan
 * "perang" sama-sama berjarak 2 dari "torang" (lihat BUKAN_PEMANGGIL).
 *
 * Di sini keadaannya berbeda secara mendasar. Kita hanya sampai ke fungsi ini
 * SETELAH aksi dan sasaran terbaca sah; yang tersisa cuma "modul yang mana".
 * Salah pilih berarti video yang salah tayang - kelihatan seketika oleh guru
 * dan bisa dibatalkan dengan "stop". Menolak berarti tidak terjadi apa-apa.
 * Tidak ada jalan untuk mengarang perintah dari sini.
 *
 * Tiga pagar supaya tetap jujur:
 *   1. hanya mencocokkan ke daftar alias dari manifest (himpunan tertutup)
 *   2. ambang jarak menyesuaikan panjang kata - kata pendek lebih ketat
 *   3. harus ada pemenang TUNGGAL; kalau dua alias sama dekat, DITOLAK dengan
 *      menyebut keduanya, bukan ditebak
 *
 * Mengembalikan { alias, samar } atau null.
 */
export function cocokkanAlias(didengar, aliases) {
  if (aliases.includes(didengar)) return { alias: didengar, samar: false };

  // Ambang dihitung dari kata yang LEBIH PENDEK di antara keduanya, bukan dari
  // yang didengar saja. Alasannya: kata pendek membawa sedikit informasi, jadi
  // alias 3 huruf tidak boleh menyerap kata 5 huruf hanya karena ambangnya
  // kebetulan longgar. ("teksi" tidak boleh jadi "tes"; "test" boleh.)
  const ambangUntuk = (a, b) => {
    const n = Math.min(a.length, b.length);
    return n <= 4 ? 1 : n <= 8 ? 2 : 3;
  };
  const berjarak = aliases
    .map((alias) => ({ alias, jarak: jarakKata(didengar, alias) }))
    .filter((x) => x.jarak <= ambangUntuk(didengar, x.alias))
    .sort((a, b) => a.jarak - b.jarak);

  // Pagar kedua: cocokkan PER KATA, bukan cuma per huruf.
  //
  // Jarak huruf gagal pada kasus yang sering muncul di nama modul: satu kata
  // Inggris ditulis Whisper sesuai bunyinya. "menyusun brand guideline" ->
  // "menyusun brand gaidlain" berjarak 4 huruf - terlalu jauh untuk ambang
  // global, padahal dua dari tiga katanya persis sama.
  //
  // Melonggarkan ambang global untuk menangkap itu akan membuat SEMUA nama
  // lebih mudah tertukar. Jadi yang dipakai strukturnya: jumlah kata harus
  // sama, tepat SATU kata yang berbeda, dan kata itu masih setengah mirip.
  // Jauh lebih sempit daripada sekadar menaikkan angka.
  if (berjarak.length === 0) {
    const kataDengar = didengar.split(" ");
    const perKata = [];
    for (const alias of aliases) {
      const kataAlias = alias.split(" ");
      if (kataAlias.length < 2 || kataAlias.length !== kataDengar.length) continue;
      const beda = [];
      for (let i = 0; i < kataAlias.length; i++) {
        if (kataAlias[i] !== kataDengar[i]) beda.push(i);
      }
      if (beda.length !== 1) continue;
      const i = beda[0];
      const j = jarakKata(kataDengar[i], kataAlias[i]);
      if (j <= Math.floor(kataAlias[i].length / 2)) perKata.push({ alias, jarak: j });
    }
    if (perKata.length === 1) return { alias: perKata[0].alias, samar: true };
    if (perKata.length > 1) return { ambigu: perKata.map((x) => x.alias) };
    return null;
  }
  // seri = ambigu = tolak. Lebih baik guru mengulang daripada video salah.
  if (berjarak.length > 1 && berjarak[1].jarak === berjarak[0].jarak) {
    return { ambigu: berjarak.filter((x) => x.jarak === berjarak[0].jarak).map((x) => x.alias) };
  }
  return { alias: berjarak[0].alias, samar: true };
}

/**
 * Parse kalimat → intent whitelist. `vocab.aliases` = daftar alias modul dari
 * cloud (manifest). Hasil: {ok:true, intent, echo} atau {ok:false, error}.
 */
/**
 * Kata sopan dan partikel. Orang tidak bicara seperti mesin: "Torang, TOLONG
 * putar tes di TV tiga" keluar begitu saja, dan menolaknya membuat guru harus
 * mengingat kalimat yang kaku di depan kelas - beban yang dibuat-buat.
 *
 * Kenapa ini TIDAK melonggarkan pagar: kata-kata ini tidak membawa makna
 * perintah apa pun, dan dibuang hanya di UJUNG kalimat (awal dan akhir), tidak
 * pernah di tengah - jadi tidak bisa memotong nama modul atau nama scene. Yang
 * tersisa tetap harus lolos grammar tertutup yang sama persis. Tidak ada
 * kalimat baru yang jadi sah karenanya; yang berubah cuma kalimat yang tadinya
 * ditolak padahal isinya sudah benar.
 *
 * Tidak dilaporkan ke guru (beda dengan pencocokan samar nama modul, yang
 * SELALU dilaporkan): membuang "tolong" tidak bisa mengubah modul atau sasaran
 * mana yang terpilih, jadi tidak ada yang perlu diperiksa manusia.
 */
export const KATA_PENGISI = new Set([
  "tolong", "coba", "ayo", "silakan", "silahkan", "mohon", "minta",
  "sekarang", "dong", "donk", "ya", "yah", "deh", "nih", "sih", "please",
]);

/** Buang kata pengisi di awal & akhir saja. Nama modul terdaftar tidak pernah
 *  dibuang - modul yang kebetulan bernama "coba" tetap bisa dipanggil. */
function buangPengisi(tokens, aliases) {
  const dilindungi = new Set(aliases ?? []);
  const bolehBuang = (t) => KATA_PENGISI.has(t) && !dilindungi.has(t);
  let awal = 0;
  let akhir = tokens.length;
  while (awal < akhir && bolehBuang(tokens[awal])) awal++;
  while (akhir > awal && bolehBuang(tokens[akhir - 1])) akhir--;
  return awal === 0 && akhir === tokens.length ? tokens : tokens.slice(awal, akhir);
}

// ---------------------------------------------------------------------------
// Kalimat majemuk (24 Sep 2026)
//
// Di kelas keempat TV menampilkan hal berbeda, jadi guru perlu menyebut
// beberapa layar dalam satu napas. Dua jenis penghubung, dua arti:
//
//   "dan"                    -> SERENTAK  (mulai bersamaan)
//   "lalu", "habis itu", ... -> BERURUTAN (menunggu video sebelumnya selesai)
//
// Tiap bagian tetap harus lolos grammar tertutup yang SAMA PERSIS dengan
// kalimat tunggal - kalimat majemuk tidak membuka satu kata baru pun. Satu
// bagian gagal = seluruh kalimat ditolak: setengah perintah yang jalan lebih
// membingungkan daripada tidak ada yang jalan.
// ---------------------------------------------------------------------------

/** Paling banyak sekian perintah per kalimat (sama dengan MAKS_BAGIAN_MAJEMUK
 *  di protokol). Empat layar sekaligus -> pakai "tata <nama>". */
export const MAKS_BAGIAN = 3;

const PENGHUBUNG_SERENTAK = new Set(["dan"]);
const PENGHUBUNG_URUT_1 = new Set(["lalu", "kemudian", "terus", "trus"]);
/** Penghubung dua kata: "habis itu", "setelah itu", ... */
const PENGHUBUNG_URUT_2 = new Set(["habis", "abis", "setelah", "sesudah", "sehabis"]);

/** Aksi yang tidak masuk akal digabung: kendali pertunjukan & pemulihan. */
const HARUS_SENDIRI = { STOP: "stop", GO: "lanjut", REPLAY: "ulang", REOPEN_WINDOW: "buka window" };

/**
 * Pecah token di penghubung. Mengembalikan daftar bagian beserta jenis
 * penghubung DI DEPANNYA ("serentak" | "urut"; bagian pertama null).
 */
function pecahBagian(tokens) {
  const bagian = [];
  let kini = [];
  let jenisKini = null;
  let jenisBerikut = null;
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    let jenis = null;
    let lompat = 0;
    if (PENGHUBUNG_SERENTAK.has(t)) jenis = "serentak";
    else if (PENGHUBUNG_URUT_1.has(t)) jenis = "urut";
    else if (PENGHUBUNG_URUT_2.has(t) && tokens[k + 1] === "itu") { jenis = "urut"; lompat = 1; }
    if (jenis) {
      // Penghubung beruntun ("dan habis itu") dilebur; "urut" menang.
      jenisBerikut = jenisBerikut === "urut" || jenis === "urut" ? "urut" : "serentak";
      k += lompat;
      continue;
    }
    // (penghubung di awal kalimat - kini masih kosong - diabaikan saja)
    if (jenisBerikut && kini.length > 0) {
      bagian.push({ tokens: kini, jenis: jenisKini });
      kini = [];
      jenisKini = jenisBerikut;
    }
    jenisBerikut = null;
    kini.push(t);
  }
  if (kini.length > 0) bagian.push({ tokens: kini, jenis: jenisKini });
  return bagian;
}

/** Adakah penghubung di luar nama modul terdaftar? */
function adaPenghubung(tokens) {
  return tokens.some(
    (t, k) =>
      PENGHUBUNG_SERENTAK.has(t) ||
      PENGHUBUNG_URUT_1.has(t) ||
      (PENGHUBUNG_URUT_2.has(t) && tokens[k + 1] === "itu")
  );
}

export function parseKalimat(kalimat, vocab) {
  const bersih = normalisasi(kalimat).replace(/^torang\s+/, "");
  const semua = bersih.split(" ").filter(Boolean);
  if (semua.length === 0) return { ok: false, error: "kalimat kosong" };
  const aliases = (vocab?.aliases ?? []).map((a) => a.alias);

  if (!adaPenghubung(semua)) return parseBagian(semua, vocab);

  const bagian = pecahBagian(semua);
  const hasilMajemuk = parseMajemuk(bagian, vocab);
  if (hasilMajemuk.ok) return hasilMajemuk;

  // Nama modul yang kebetulan mengandung penghubung ("tanya dan jawab")?
  // Hanya dicoba kalau memang ada alias seperti itu - kalau tidak, kalimat
  // tunggal akan diam-diam mengabaikan ekor kalimat ("pindah ke layar 2 lalu
  // ke layar 3" terbaca "pindah ke layar 2" saja).
  if (aliases.some((a) => adaPenghubung(a.split(" ")))) {
    const tunggal = parseBagian(semua, vocab);
    if (tunggal.ok) return tunggal;
  }
  return hasilMajemuk;
}

function parseMajemuk(bagian, vocab) {
  if (bagian.length > MAKS_BAGIAN) {
    return {
      ok: false,
      error: `terlalu panjang: ${bagian.length} perintah dalam satu kalimat, paling banyak ${MAKS_BAGIAN}. Untuk mengatur banyak layar sekaligus pakai "tata <nama>"`,
    };
  }
  const tahap = [];
  const rincian = [];
  let mirip;
  let sebelumnya = null;
  for (let k = 0; k < bagian.length; k++) {
    let tok = bagian[k].tokens;
    if (tok[0] === "torang") tok = tok.slice(1); // "..., lalu Torang pindah ..."
    // "pindah ke layar 2 lalu ke layar 3" / "... lalu layar 3": kata kerja
    // dihilangkan, dipinjam dari bagian sebelumnya - HANYA untuk pindah.
    if (sebelumnya?.intent === "MOVE") {
      const t2 = tok[0] === "ke" ? tok.slice(1) : tok;
      const tgt = bacaTarget(t2);
      if (tgt && tgt[1] === t2.length) tok = ["pindah", ...tok];
    }
    const teks = tok.join(" ");
    const h = parseBagian(tok, vocab);
    if (!h.ok) return { ok: false, error: `bagian ${k + 1} ("${teks}"): ${h.error}` };
    if (HARUS_SENDIRI[h.intent.intent]) {
      return {
        ok: false,
        error: `"${HARUS_SENDIRI[h.intent.intent]}" harus diucapkan sendiri, tidak bisa digabung dengan perintah lain`,
      };
    }
    if (h.intent.intent === "TATA") {
      return { ok: false, error: '"tata" mengatur semua layar sekaligus - ucapkan sendiri, tanpa digabung' };
    }
    if (h.mirip && !mirip) mirip = h.mirip;
    if (k === 0 || bagian[k].jenis === "urut") tahap.push([h.intent]);
    else tahap[tahap.length - 1].push(h.intent);
    rincian.push({ teks, intent: h.intent, jenis: k === 0 ? null : bagian[k].jenis });
    sebelumnya = h.intent;
  }
  if (rincian.length === 1) {
    return { ok: true, intent: rincian[0].intent, ...(mirip ? { mirip } : {}) };
  }
  return {
    ok: true,
    intent: { intent: "MAJEMUK", tahap },
    bagian: rincian,
    ...(mirip ? { mirip } : {}),
  };
}

/** Kata benda yang boleh menyela kata kerja dan nama: "puter VIDEO tes". */
const KATA_BENDA_MATERI = new Set(["video", "modul"]);

/** Satu perintah (satu bagian kalimat). Token sudah dinormalisasi. */
function parseBagian(tokensMentah, vocab) {
  let tokens = buangPengisi(tokensMentah, (vocab?.aliases ?? []).map((a) => a.alias));
  if (tokens.length === 0) return { ok: false, error: "kalimat kosong" };

  const aksi = tokens[0];
  const sisa = tokens.slice(1);

  if (aksi === "lanjut" || aksi === "go") return { ok: true, intent: { intent: "GO" } };
  if (aksi === "ulang") return { ok: true, intent: { intent: "REPLAY" } };
  if (aksi === "stop" || aksi === "berhenti") return { ok: true, intent: { intent: "STOP" } };

  if (aksi === "pindah") {
    const t = sisa[0] === "ke" ? sisa.slice(1) : sisa;
    const target = bacaTarget(t);
    if (!target) return { ok: false, error: "pindah ke mana? (contoh: \"pindah ke TV tiga\")" };
    if (!target[0].startsWith("tv")) {
      return { ok: false, error: "pindah hanya antar TV (nyelem ke komp = fase 2)" };
    }
    return { ok: true, intent: { intent: "MOVE", to: target[0] } };
  }

  if (aksi === "sapa") {
    const target = bacaTarget(sisa);
    if (!target || !target[0].startsWith("komp")) {
      return { ok: false, error: "sapa komp berapa? (contoh: \"sapa komp lima\")" };
    }
    return { ok: true, intent: { intent: "SAPA", target: target[0] } };
  }

  if (aksi === "buka") {
    // "buka office di TV tiga" / "buka layar TV empat" (pemulihan jendela).
    let t = sisa;
    // "buka lagi TV empat" / "buka window TV empat" → pemulihan jendela.
    if (t[0] === "lagi" || t[0] === "window" || t[0] === "jendela" || t[0] === "layar") {
      const t2 = t[0] === "lagi" && (t[1] === "window" || t[1] === "jendela" || t[1] === "layar")
        ? t.slice(2)
        : t.slice(1);
      const target = bacaTarget(t2[0] === "ke" ? t2.slice(1) : t2);
      if (!target || !(target[0].startsWith("tv") || target[0] === "all_tv")) {
        return { ok: false, error: 'buka window TV berapa? (contoh: "buka window TV empat")' };
      }
      return { ok: true, intent: { intent: "REOPEN_WINDOW", target: target[0] } };
    }
    // Selain itu: buka scene bernama, mis. "buka office di TV tiga".
    const posDi = t.lastIndexOf("di");
    if (posDi < 1) {
      return { ok: false, error: 'format: "buka office di <target TV>"' };
    }
    const scene = t.slice(0, posDi).join("-");
    if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(scene)) {
      return { ok: false, error: `nama scene tidak sah: "${scene}"` };
    }
    const target = bacaTarget(t.slice(posDi + 1));
    if (!target || !(target[0].startsWith("tv") || target[0] === "all_tv")) {
      return { ok: false, error: "scene hanya untuk TV (tv1..tv4 atau semua layar)" };
    }
    return { ok: true, intent: { intent: "OPEN_SCENE", scene, target: target[0] } };
  }

  if (aksi === "tutup") {
    const target = bacaTarget(sisa);
    if (!target || !(target[0].startsWith("tv") || target[0] === "all_tv")) {
      return { ok: false, error: 'tutup layar mana? (contoh: "tutup TV tiga")' };
    }
    return { ok: true, intent: { intent: "CLOSE_SCENE", target: target[0] } };
  }

  if (aksi === "glow") {
    // EKSTENSI di luar 8 kata §5 (glow resmi = efek otomatis W1); praktis utk uji.
    const target = bacaTarget(sisa) ?? ["all_student", 0];
    if (target[0].startsWith("tv")) return { ok: false, error: "glow hanya layar murid" };
    return {
      ok: true,
      intent: { intent: "GLOW", target: target[0], preset: "pulse", duration_ms: 4000 },
    };
  }

  if (aksi === "tata") {
    const nama = sisa.join(" ");
    if (!/^[a-z0-9]+( [a-z0-9]+)?$/.test(nama)) {
      return { ok: false, error: 'tata yang mana? (contoh: "tata pembukaan")' };
    }
    const daftar = vocab?.tata;
    if (Array.isArray(daftar) && daftar.length > 0 && !daftar.includes(nama)) {
      const cocok = cocokkanAlias(nama, daftar);
      if (cocok && !cocok.ambigu) {
        return { ok: true, intent: { intent: "TATA", nama: cocok.alias }, ...(cocok.samar ? { mirip: { didengar: nama, dipakai: cocok.alias } } : {}) };
      }
      return { ok: false, error: `tata "${nama}" tidak ada. Tersedia: ${daftar.join(", ")}` };
    }
    return { ok: true, intent: { intent: "TATA", nama } };
  }

  if (aksi === "puter" || aksi === "putar" || aksi === "tampilkan") {
    const t = KATA_BENDA_MATERI.has(sisa[0]) ? sisa.slice(1) : sisa;
    if (t.length === 0) {
      return { ok: false, error: `${aksi} apa? (contoh: "${aksi} tes di layar satu")` };
    }
    // Sasaran BOLEH tidak disebut: diputar di layar tempat Torang berada
    // (keputusan Hadi 24 Sep 2026) - cloud yang tahu Torang di mana.
    const posDi = t.lastIndexOf("di");
    let namaKata, target = null;
    if (posDi >= 1) {
      namaKata = t.slice(0, posDi).join(" ");
      target = bacaTarget(t.slice(posDi + 1));
      if (!target || target[1] !== t.length - posDi - 1) {
        return { ok: false, error: `target tidak dikenal: "${t.slice(posDi + 1).join(" ")}"` };
      }
    } else if (posDi === 0) {
      return { ok: false, error: `format: "${aksi} <nama> di <target>"` };
    } else {
      namaKata = t.join(" ");
    }

    // "tampilkan" melayani modul DAN scene: nama modul menang kalau persis,
    // lalu nama scene persis, baru kemiripan nama modul. Nama modul & scene
    // yang sama dilarang saat pendaftaran - di sini urutan cuma jaring terakhir.
    const scenes = Array.isArray(vocab?.scenes) ? vocab.scenes : ["office"];
    const aliases = (vocab?.aliases ?? []).map((a) => a.alias.toLowerCase());
    const namaScene = namaKata.split(" ").join("-");
    if (aksi === "tampilkan" && !aliases.includes(namaKata) && scenes.includes(namaScene)) {
      if (!target) {
        return { ok: false, error: `${namaKata} ditampilkan di layar berapa? (contoh: "tampilkan ${namaKata} di layar dua")` };
      }
      if (!(target[0].startsWith("tv") || target[0] === "all_tv")) {
        return { ok: false, error: "scene hanya untuk TV (tv1..tv4 atau semua layar)" };
      }
      return { ok: true, intent: { intent: "OPEN_SCENE", scene: namaScene, target: target[0] } };
    }

    const denganTarget = (alias) =>
      target ? { intent: "PLAY_MODULE", alias, target: target[0] } : { intent: "PLAY_MODULE", alias };

    if (aliases.length === 0) {
      // Tanpa daftar alias (cloud tidak terjangkau), alias diteruskan apa adanya;
      // cloud yang akan menolak kalau memang tidak ada.
      return { ok: true, intent: denganTarget(namaKata) };
    }

    const cocok = cocokkanAlias(namaKata, aliases);
    if (!cocok) {
      const tambahan = aksi === "tampilkan" ? ` · scene: ${scenes.join(", ")}` : "";
      return {
        ok: false,
        error: `modul "${namaKata}" tidak ada di manifest. Tersedia: ${aliases.join(", ")}${tambahan}`,
      };
    }
    if (cocok.ambigu) {
      return {
        ok: false,
        error: `modul "${namaKata}" sama dekatnya dengan ${cocok.ambigu.map((a) => `"${a}"`).join(" dan ")} - ulangi dengan lebih jelas`,
      };
    }
    return {
      ok: true,
      intent: denganTarget(cocok.alias),
      ...(cocok.samar ? { mirip: { didengar: namaKata, dipakai: cocok.alias } } : {}),
    };
  }

  return {
    ok: false,
    error: `aksi tidak dikenal: "${aksi}". Kosakata: puter, tampilkan, pindah, buka, tutup, tata, lanjut, ulang, stop, sapa, glow`,
  };
}
