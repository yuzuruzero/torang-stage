# Kalimat Baku Panggung Torang

**Cetak dan tempel di meja operator.**

Kosakata panggung **tertutup** — hanya kalimat di bawah ini yang dikenali, dan
itu memang disengaja: hasil yang selalu sama lebih berharga daripada kalimat
yang luwes. Kalimat di luar daftar ini ditolak dengan jelas, tidak pernah
dikira-kira.

Semua boleh diawali "Torang, …" atau langsung ke kata aksinya.

---

## Memutar materi

| Ucapkan | Yang terjadi |
|---|---|
| **puter tes di TV satu** | materi modul `tes` tayang di TV1 |
| **puter tes** | tayang di layar **tempat Torang sedang berada** (TV1 kalau Torang belum muncul) |
| **tampilkan modul tes di TV satu** | sama dengan "puter" |
| **puter tes di semua layar** | tayang serentak di 4 TV |
| **puter tes di komp lima** | tayang di komputer murid nomor 5 |

Ganti `tes` dengan nama modul lain yang sudah terdaftar. Daftar nama yang sah
ada di pilihan tiap kotak TV pada panel guru.

Kalau Torang sedang di layar lain, ia **pindah dulu**: keluar dari layar lama,
masuk ke layar tujuan, baru materinya diputar. Guru tidak perlu mengucapkan
"pindah" lebih dulu.

## Memindahkan Torang

| Ucapkan | Yang terjadi |
|---|---|
| **pindah ke TV tiga** | Torang keluar dari layar sekarang, masuk ke TV3 |

Arah keluar-masuk dihitung sendiri oleh sistem. Guru tidak perlu memikirkannya.

## Menyapa murid

| Ucapkan | Yang terjadi |
|---|---|
| **sapa komp lima** | kartu sapaan bernama muncul di komputer 5 |
| **glow semua komp** | bingkai bercahaya di semua layar murid |

## Layar monitoring (pixel office)

| Ucapkan | Yang terjadi |
|---|---|
| **buka office di TV tiga** | TV3 menampilkan pixel office |
| **tampilkan office di TV tiga** | sama dengan "buka" |
| **tutup TV tiga** | TV3 kembali ke idle (kalau Torang di sana, Torang pamit) |

Selama sebuah TV menampilkan office, Torang tidak bisa dipindahkan ke situ.
Tutup dulu kalau layar itu mau dipakai.

## Beberapa layar dalam satu kalimat

Paling banyak **tiga perintah** dalam satu kalimat. Dua kata penghubung, dua arti:

| Penghubung | Artinya | Contoh |
|---|---|---|
| **dan** | **bersamaan** | **tampilkan modul tes di TV satu dan tampilkan office di TV dua** |
| **lalu** / **habis itu** / **setelah itu** | **berurutan** — perintah berikutnya menunggu video sebelumnya **selesai** | **pindah ke TV dua habis itu ke TV tiga** |

- Pada "pindah", kata kerjanya boleh tidak diulang: *"pindah ke TV dua lalu TV tiga"*.
- Kalau satu bagian salah, **seluruh kalimat ditolak** — tidak ada yang setengah jalan.
- **stop, lanjut, ulang, buka window, dan tata** harus diucapkan sendiri.
- Satu layar tidak boleh disebut dua kali dalam satu kalimat, dan hanya satu
  perintah yang boleh memindahkan Torang (Torang cuma ada satu).
- Langkah yang sedang menunggu tampil di panel. **stop** membatalkannya; tombol
  "Batalkan langkah yang menunggu" membatalkan tanpa menghentikan tayangan.

## Tata layar (keempat TV sekaligus)

| Ucapkan | Yang terjadi |
|---|---|
| **tata pembukaan** | keempat TV diatur sesuai preset "pembukaan" |

Preset dibuat dan disunting di kartu **Tata layar** pada panel guru: pilih isi
tiap TV (modul, scene, kosongkan, atau biarkan), beri nama satu-dua kata, simpan.
Nama baru langsung bisa diucapkan (setelah `buat-grammar` dijalankan bila grammar
dinyalakan — lihat catatan di bawah).

## Konfirmasi 1 detik

Setelah mesin menangkap perintah, kalimatnya tampil besar di panel selama
**1 detik** sebelum dijalankan:

- **Salah tangkap?** Tekan **tombol bicara lagi** (atau tombol **✕ BATAL** di panel).
  Tidak ada yang dikirim.
- **Mau langsung?** Tekan **tombol ya** (F9) untuk mengirim tanpa menunggu.

Jeda ini ada karena "komp enam" dan "komp enam belas" sama-sama kalimat sah —
parser tidak bisa menolak salah dengar yang sah. Lamanya bisa diatur di config
(`voice.konfirmasi_ms`; 0 = mati).

## Jalannya pertunjukan

| Ucapkan | Yang terjadi |
|---|---|
| **lanjut** | maju ke langkah rundown berikutnya |
| **ulang** | ulangi cue terakhir |
| **stop** | hentikan semua, kembali idle |

## Kalau ada jendela TV yang hilang

| Ucapkan | Yang terjadi |
|---|---|
| **buka window TV empat** | jendela TV4 dibuka kembali |
| **buka lagi window TV empat** | sama |

Jendela yang masih hidup tidak terganggu. Aman diucapkan kapan saja.

---

## Cara menyebut target

- TV: **TV satu** … **TV empat** (boleh juga "TV 1")
- Komputer murid: **komp satu** … **komp dua puluh** (boleh "komputer lima")
- Semua TV: **semua layar**
- Semua murid: **semua komp**

## Yang TIDAK dikenali

- Kalimat bebas: ~~"coba tampilkan videonya dong"~~
- Nama modul atau tata yang belum terdaftar
- Lebih dari tiga perintah dalam satu kalimat → pakai **tata**

Kata sopan di awal/akhir kalimat ("tolong", "coba", "dong") **boleh** sejak
18 Sep 2026 — dibuang sebelum diperiksa, tidak mengubah arti.

Kalau ditolak, panggung memberi tahu kata apa yang tidak dikenali beserta
daftar kata yang sah. Ulangi dengan kalimat baku — jangan diulang lebih keras.

## Cadangan tanpa suara

Tiga hal terpenting selalu bisa lewat papan ketik, dari mana saja di mesin guru:

| Tombol | Fungsi |
|---|---|
| **Ctrl + Alt + F9** | GO (langkah berikutnya) |
| **Ctrl + Alt + F10** | STOP |
| **Ctrl + Alt + F11** | ULANG |

Panel operator juga punya semua tombolnya. Suara adalah kenyamanan, bukan
satu-satunya jalan.

## Catatan untuk operator: grammar & nama baru

Kalau grammar Whisper dinyalakan (`voice.grammar: true`), Whisper hanya bisa
menuliskan nama modul, scene, dan tata yang tercantum di `tools\voice\torang.gbnf`.
Setelah mendaftarkan modul baru atau menyimpan tata baru, jalankan
`node tools\voice\buat-grammar.mjs` (cloud harus hidup) supaya nama itu bisa
diucapkan.

## Keputusan 18 Sep 2026: "TV" tetap bentuk resmi

Uji suara pertama menunjukkan Whisper base tersandung pada **"TV"** - singkatan dua huruf
yang diucapkan "ti-vi", dua kali salah (`tifi`, dan sekali menempel dengan kata sebelumnya
jadi `difitiga`), sementara **"layar tiga"** terbaca benar dan bahkan sedikit lebih cepat.

**Kartu tetap memakai "TV".** Hadi memutuskan begitu: istilah itu sudah dikenal guru dan
murid, dan mengganti istilah di tengah persiapan pertunjukan punya ongkosnya sendiri -
ongkos yang tidak terlihat di angka latensi mana pun.

Parser menerima **"layar tiga"** persis sama dengan "TV tiga", jadi guru yang telanjur
mengucapkannya tidak akan ditolak. Tapi yang diajarkan dan dilatih adalah "TV".

Konsekuensinya jujur saja: karena "TV" yang harus jalan, **bebannya pindah ke mesin.**
Grammar GBNF (`tools/voice/torang.gbnf`) yang membatasi keluaran Whisper ke kalimat sah
saja berubah dari pelengkap menjadi calon perbaikan utama untuk masalah "TV" ini. Uji 29
kalimat dijalankan dua kali - grammar mati dan grammar nyala - dan C1-C3 memakai "layar"
sebagai pembanding, supaya keputusan ini punya angka, bukan cuma satu rekaman.
