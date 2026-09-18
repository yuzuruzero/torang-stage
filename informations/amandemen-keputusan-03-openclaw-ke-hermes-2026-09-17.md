# Usulan Amandemen Keputusan Terkunci #3 — Telinga Panggung

**Tanggal:** 17 Sep 2026 · **Dari:** tim programmer Torang Stage · **Untuk:** pemilik dokumen
`01-konsep-dan-keputusan.md`
**Menyertai:** `05-checklist-kesesuaian-TERISI-2026-09-17.md` (lihat baris **D1, D2, D6**)
**Menggantikan:** versi pertama surat ini (17 Sep pagi), yang berargumen dari kegagalan
pemasangan OpenClaw. Alasan itu terlalu sempit dan bukan yang sebenarnya menentukan.

---

## Yang diusulkan

Keputusan #3 sekarang berbunyi: *"Telinga: OpenClaw di mesin guru + mic push-to-talk
hardware + Whisper lokal untuk STT."* Kami mengusulkan **dua** perubahan.

| | Sekarang | Usulan |
|---|---|---|
| **A. Agent** | OpenClaw | **Hermes** |
| **B. Pemanggilan cue** | lewat agent (§18: "demi cerita dogfooding") | **tidak lewat agent sama sekali** — mic PTT → Whisper lokal → parser whitelist → API panggung |

Usulan B yang lebih besar, dan itu yang mohon paling diperhatikan. Mic PTT dan STT lokal
**tidak berubah** — justru diperkuat.

---

## Alasan utama: kemandirian penyedia model

Panggung Torang dirancang **multi-cabang** (keputusan #8). Konsekuensinya sering terlewat:
setiap ketergantungan pada satu perusahaan AI berlipat sebanyak jumlah cabang, dan
berulang setiap bulan.

Hermes dan OpenClaw adalah **cangkang agent** — model di belakangnya bisa ditukar. Kalau
kuota satu penyedia habis, harganya naik, atau layanannya bermasalah, otaknya diganti
tanpa menyentuh panggung. Memakai asisten milik satu perusahaan (ChatGPT, Claude, atau
yang lain) sebagai telinga panggung berarti menyerahkan harga, batas pemakaian, dan
ketersediaan produk berbayar kami kepada pihak yang tidak kami kendalikan.

**Dan jalur refleks di usulan B adalah bentuk paling murni dari prinsip itu: nol
penyedia.** Whisper berjalan lokal, parsernya kode kami sendiri. Tidak ada token, tidak
ada akun, tidak ada batas pemakaian, dan tetap hidup saat internet mati — yang justru
penting karena keputusan #13 sudah menetapkan internet sebagai syarat, jadi setiap
ketergantungan tambahan memperparah mode gagal yang sama.

## Alasan kedua: pemisahan sesi — ini syarat pementasan, bukan kerapian

Agent guru dipakai untuk dua hal yang sangat berbeda: **mendemokan ke murid** (bagian
dari pertunjukan, dan kadang tampil di layar) dan **mengendalikan panggung** (urusan
belakang panggung). Kalau keduanya berbagi satu sesi, yang muncul saat demo adalah
gulungan perintah `sapa komp6`, `puter tes tv1`.

Keputusan #18 menetapkan teater diakui sebagai teater. Tapi mesin belakang panggung tidak
seharusnya ikut naik panggung. Jalur refleks menyelesaikan ini sepenuhnya: **ia tidak
punya sesi sama sekali** — tidak ada riwayat yang bisa bocor ke layar.

## Alasan ketiga: kecepatan, dan terutama keterduga-annya

Memanggil cue itu pekerjaan **refleks**, bukan pertimbangan. Di teater sungguhan, stage
manager berkata "Go" dan cue menyala seketika.

Bila kalimat guru harus melewati transkripsi lalu LLM yang memutuskan perintah, jedanya
terukur dalam **detik**, bukan sepersekian detik. Dan yang lebih merusak bukan lambatnya
— melainkan **variansnya**. Pertunjukan bisa menyesuaikan diri dengan jeda yang selalu
sama; guru membentuk ritme di sekitarnya. Pertunjukan tidak bisa menyesuaikan diri dengan
jeda yang kadang 3 detik dan kadang 14 — guru akan mengira perintahnya tidak terdengar,
mengulanginya, lalu dua cue terbang sekaligus.

Parser whitelist menjawab dalam milidetik dan **selalu** dalam milidetik.

## Alasan keempat: OpenClaw memang tidak pernah berhasil dipasang

Jembatannya dibangun lengkap sejak 11 Agu, tapi macet di firewall — adapter vEthernet WSL
dihitung Windows sebagai profil Public. Lebih dari sebulan, belum pernah sekali pun jalan
di PC guru. Hermes terpasang dan terbukti bekerja pada 16 Sep.

Kami menaruh ini di urutan **terakhir** dengan sengaja. Kalaupun OpenClaw berhasil
dipasang besok, tiga alasan di atas tetap berlaku.

---

## Yang TIDAK berubah

- **Keputusan #18 utuh.** Voice command tetap ASLI — guru benar-benar bicara, mesin
  benar-benar mentranskripsi. Whisper itu model neural; ini bukan tombol yang menyamar
  jadi suara. Telemetri tetap asli, jawaban Torang tetap rekaman dan tidak pernah diklaim
  live.
- **Mic PTT dan STT lokal** persis seperti tertulis di keputusan #3.
- **Hermes tetap dipakai**, untuk tugas yang memang pekerjaan agent: mendaftarkan video
  baru, menanyakan keadaan panggung, urusan admin. Di sana lambat beberapa detik tidak
  masalah, dan di sanalah nilai dogfooding-nya sebenarnya paling terasa — karena itulah
  jenis pekerjaan yang murid lakukan dengan agent mereka sendiri. Murid tidak memanggil
  cue; murid menyuruh agent mengerjakan tugas majemuk.
- **Yang murid install tetap Hermes**, dan ini tidak bisa ditawar: seluruh telemetri fase 2
  membaca aktivitas agent lewat `client_id` dan skill monitor untuk memunculkan karakter di
  pixel office. Tanpa itu, X1 "hatch moment" tidak ada.
- Cue tetap whitelist tertutup; cloud tetap memvalidasi ulang; klien tetap menolak cue asing.
- Hotkey guru tetap jalur cadangan senyap.

## Yang BERUBAH — dan butuh komitmen baru

**1. Toast konfirmasi 1 detik (dokumen 02 §D) naik dari "boleh ditunda" jadi WAJIB.**
Parser menolak kalimat yang janggal, tapi tidak bisa menolak kalimat yang **sah namun
salah dengar**: "sapa komp enam" dan "sapa komp enam belas" dua-duanya sah. Toast + batal
adalah satu-satunya tempat kesalahan itu tertangkap sebelum tampil di layar murid.

Rancangan kami: konfirmasi **menumpang jendela 1,5 detik yang sudah ada** (`start_at`
lead untuk pre-load endpoint), bukan menambah waktu baru. Ongkos latensinya nol.

**2. Satu earphone untuk guru** — tambahan yang belum ada di dokumen mana pun, dan menurut
kami wajib. Guru memberi perintah sambil **menghadap murid**, bukan menatap monitor. Kartu
konfirmasi di layar hanya tertangkap kalau dia kebetulan melirik. Satu earphone di satu
telinga, dari output audio kedua mesin guru, membisikkan sasarannya ("komp enam belas") —
hanya guru yang dengar, murid tidak dengar apa pun. Cara kerja stage manager dan pembawa
acara TV live sejak puluhan tahun.

Ini **tidak melanggar keputusan #5** (satu PA sentral): earphone adalah output kedua untuk
satu orang, bukan PA kedua untuk kelas. Dan tidak melanggar #18: yang membisikkan cukup
suara sintetis netral, bukan suara Torang — karena penonton tidak pernah mendengarnya, ia
tidak perlu berpura-pura menjadi siapa pun.

## Yang kami minta

Restui kedua amandemen — **atau** koreksi kami kalau ada alasan mengunci OpenClaw, atau
mengharuskan cue lewat agent, yang belum kami ketahui: komitmen ke pihak lain, arah
produk, atau pertimbangan komersial. Kalau ada, sebutkan saja; kami sesuaikan.
