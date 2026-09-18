# Uji tahap A — apakah Whisper cukup tepat untuk voice command panggung?

Folder ini **bukan** jalur voice yang sesungguhnya. Ini alat ukur: satu hari kerja
untuk menjawab pertanyaan yang menentukan apakah jalur voice layak dibangun sama
sekali.

## Pertanyaannya

> Kalau guru mengucapkan kalimat baku di ruang kelas, berapa persen yang sampai ke
> panggung sebagai perintah yang **benar**, dan berapa lama?

Perhatikan apa yang **tidak** diukur: ketepatan kata. Parser panggung itu pemaaf —
Whisper boleh menulis "tivi tiga" asalkan yang keluar tetap `{MOVE, tv3}`. Sebaliknya,
transkrip yang sempurna tidak ada gunanya kalau parser menolaknya. Jadi yang diukur
adalah **intent ujung-ke-ujung**.

## Tiga langkah

```
1. PASANG-WHISPER.bat     unduh whisper.cpp + model (~90 MB, sekali saja)
2. REKAM-UJI.bat          rekam 26 kalimat baku dari mic
   (tanpa mic? IMPOR-REKAMAN.bat - lihat bagian di bawah)
3. NILAI-UJI.bat          jalankan Whisper + parser, cetak angkanya
```

Setelah langkah 1, semuanya jalan **offline**. Tidak ada akun, API key, atau langganan.

## Cara merekam yang menghasilkan angka jujur

Rekam seperti guru akan bicara **di kelas**, bukan seperti orang mengisi suara:

- berdiri sejauh jarak yang sebenarnya dari mic
- volume bicara normal, kecepatan normal
- **biarkan berisiknya ada** — AC, kipas, murid bicara, proyektor

Rekaman studio yang bersih akan menghasilkan angka yang menyenangkan dan menyesatkan.
Kalau nanti gagal di kelas sungguhan, angka itu tidak menyelamatkan siapa pun.

## Mencoba satu rekaman saja

Tidak perlu menyiapkan 26 kalimat untuk sekadar melihat apakah jalurnya hidup:

```
.\coba-satu.ps1 -Berkas rekaman-mentah\rekaman-hp.mp4
```

Menerima format apa pun yang bisa dibaca ffmpeg (mp4, m4a, mp3, wav), mengubahnya jadi
WAV 16 kHz mono, lalu menjalankan **jalur yang sama persis** dengan yang nanti dipakai
voice command: Whisper -> normalisasi -> parser -> intent. Mencetak apa yang didengar
Whisper, latensinya (sudah dikurangi ongkos muat model), dan intent yang keluar - baik
dari transkrip mentah maupun setelah dirapikan.

Ini uji termurah untuk pertanyaan yang paling awal: apakah Whisper mengenali bahasa
Indonesia di mesin ini, dan seberapa cepat.

## Kalau mesinnya tidak punya mic

Ada dua jalan, tergantung bentuk rekamannya.

**Satu rekaman panjang berisi semua kalimat** (cara paling enteng: ucapkan 26 kalimat
berturut-turut dengan jeda diam di antaranya) - potong dulu di jeda heningnya:

```
.\pisah-rekaman.ps1 -Berkas rekaman-mentah\rekaman-hp.mp4 -LihatSaja
```

`-LihatSaja` menampilkan rencana potongan tanpa menulis apa pun. Kalau jumlah potongan
sudah pas dengan 26 kalimat, ulangi tanpa `-LihatSaja`. Kalau tidak pas, skrip menolak
menulis dan memberi tahu arah setelan yang perlu diubah (`-Hening`, `-Ambang`) - sebab
potongan yang meleset satu menggeser SEMUA pasangan sesudahnya, dan laporannya jadi bohong
dengan cara yang tidak kelihatan dari angkanya.

Supaya pemotongannya bersih: jeda **diam** minimal 1 detik antar kalimat, jangan berdehem
atau menghela napas keras di jeda itu, dan jangan berhenti di tengah kalimat.

**Berkas terpisah per kalimat** - langsung impor:

```
.\impor-rekaman.ps1 -Folder D:\rekaman-hp
```

Ia mengubah tiap berkas jadi WAV 16 kHz mono dan menaruhnya di `rekaman/`. Pasangan
berkas-ke-kalimat diambil dari **nama berkas** kalau namanya memuat id (`01`, `17`,
`T1`); kalau tidak, dari urutan - dan skrip mengatakan yang mana yang dipakai, lalu
menampilkan tabel pasangan untuk dikonfirmasi sebelum menulis apa pun. Urutan itu
rapuh: satu rekaman yang terlewat menggeser semua sisanya, jadi menamai berkas dengan
id jauh lebih aman.

**Batas yang harus disebut setiap kali angkanya dilaporkan:** rekaman HP bukan
pengganti uji di PC guru. Mic-nya beda, jaraknya beda, berisik ruangannya beda, CPU-nya
beda. Yang bisa dijawab rekaman HP:

> Apakah Whisper mengenali kalimat baku bahasa Indonesia sama sekali?

Yang **tidak** bisa dijawab:

> Apakah cukup tepat di ruang kelas?

Pertanyaan kedua itu yang menentukan, dan ia tetap menunggu mic di PC guru. Melaporkan
angka rekaman HP seolah menjawab pertanyaan kedua akan lebih berbahaya daripada tidak
punya angka sama sekali.

## Membaca laporannya

`contoh-laporan.md` menunjukkan bentuk keluarannya (dibuat dengan transkrip palsu,
tanpa mic — lihat bagian paling bawah).

Tiga angka yang menentukan:

| Angka | Artinya |
|---|---|
| **Intent benar, transkrip mentah** | seberapa jauh Whisper sendiri bisa dipercaya |
| **Intent benar, setelah normalisasi** | hasil sesungguhnya — ini yang dipakai memutuskan |
| **Salah terima** | kalimat terlarang yang lolos jadi perintah. **Harus 0.** |

Angka ketiga lebih penting daripada dua yang pertama. Sistem yang gagal mengenali
perintah cuma merepotkan guru; sistem yang **salah** mengenali perintah bisa
memutar video yang salah di depan satu kelas. Karena itu daftar kalimat uji berisi
empat kalimat yang memang **harus ditolak** (`T1`–`T4`).

Anggaran latensi §C: transkrip keluar ≤ 700 ms untuk ucapan ~2 detik. Angka yang
dilaporkan sudah **mengurangi ongkos muat model**, sebab di produksi model tinggal
di memori dan hanya dimuat sekali saat app nyala.

## Isi folder

| Berkas | Isi |
|---|---|
| `pasang-whisper.ps1` | pemasang. Periksa dulu, baru pasang; punya `-CekSaja` |
| `rekam-uji.ps1` | perekam terpandu (ffmpeg → WAV 16 kHz mono) |
| `impor-rekaman.ps1` | memasukkan rekaman dari HP/perangkat lain, untuk mesin tanpa mic |
| `pisah-rekaman.ps1` | memotong satu rekaman panjang jadi 26 berkas, di jeda heningnya |
| `coba-satu.ps1` | uji SATU rekaman: suara -> Whisper -> normalisasi -> parser -> intent |
| `nilai-stt.mjs` | penilai: Whisper → normalisasi → parser → laporan |
| `normalisasi-stt.mjs` | tabel salah-dengar + penolak halusinasi Whisper |
| `kalimat-uji.json` | 26 kalimat + intent yang benar (4 di antaranya harus ditolak) |
| `contoh-transkrip/` | transkrip palsu untuk menguji harness tanpa mic |

## Batas lapisan normalisasi

`normalisasi-stt.mjs` hanya memetakan **salah-dengar dari kata yang sudah ada di
kosakata tertutup** — `tivi` → `tv`, `kom` → `komp`. Ia tidak mencocokkan secara
samar dan tidak menebak.

Itu bukan kemalasan, itu batas keamanan. Begitu lapisan ini boleh menebak, disiplin
grammar tertutup §5 bocor lewat pintu belakang: kalimat ngawur bisa "dibetulkan"
menjadi perintah yang sah. Karena itu `tolong` sengaja **tidak** dipetakan ke apa pun,
dan kalimat uji `T1` memastikan ia tetap ditolak.

Laporan mencetak daftar salah-dengar yang benar-benar terjadi, supaya tabelnya bisa
dipangkas sesuai kenyataan — bukan ditambah terus berdasarkan dugaan.

## Menguji harness-nya sendiri, tanpa mic dan tanpa model

```
node nilai-stt.mjs --palsu
```

Membaca `contoh-transkrip/*.txt` sebagai ganti menjalankan Whisper. Berguna untuk
memastikan penilai dan parser bekerja sebelum repot dengan mic — dan untuk melihat
bentuk laporannya.

## Pilihan model

Bawaan `base-q8_0` (~82 MB). Kosakata kita tertutup (9 aksi, 27 sasaran), jadi model
besar hanya menambah latensi tanpa menambah ketepatan yang berarti. Naik ke `small`
**hanya kalau laporan menunjukkan `base` benar-benar salah dengar**, dan laporkan
selisih angkanya:

```
powershell -File pasang-whisper.ps1 -Model small-q5_1
node nilai-stt.mjs --model model/ggml-small-q5_1.bin
```

Membandingkan dengan dan tanpa bias kosakata:

```
node nilai-stt.mjs --tanpa-bias
```

## Aturan: skrip Windows ditulis murni ASCII

`pasang-whisper.ps1` dan `rekam-uji.ps1` tidak memakai satu pun karakter di luar
ASCII. Bukan gaya, melainkan syarat.

Windows PowerShell 5.1 - yang dipanggil oleh `powershell` di berkas `.bat`, dan masih
bawaan Windows - membaca `.ps1` **tanpa BOM** memakai codepage ANSI mesin, bukan UTF-8.
Di mesin cp1252, satu tanda pisah em (`—`) yang tersimpan sebagai UTF-8 terbaca jadi
tiga karakter, dan yang terakhir adalah tanda kutip ganda melengkung - yang diterima
parser PowerShell sebagai pembatas string. Satu tanda pisah di dalam **komentar** sudah
cukup untuk merobohkan seluruh skrip, dengan galat yang menunjuk baris yang sama sekali
tidak bersalah.

Dijaga oleh `skrip-windows.test.ts`, yang ikut jalan di `npm test` dan memindai semua
`.ps1`, `.bat`, dan `.cmd` di `tools/`. Kalau tes itu gagal: ganti `—` dengan `--`,
`·` dengan `|`, dan kutip melengkung dengan kutip lurus.

## Aturan: program luar dipanggil lewat `Jalankan-Luar`

Aturan kedua untuk skrip di folder ini: `ffmpeg` dan `whisper-cli.exe` TIDAK pernah
dipanggil langsung dengan `& ffmpeg ...`. Selalu lewat fungsi `Jalankan-Luar`.

Windows PowerShell 5.1 memperlakukan tiap baris yang ditulis program luar ke **stderr**
sebagai error record. Dengan `$ErrorActionPreference = "Stop"`, satu baris keterangan
biasa sudah menghentikan skrip. Celakanya kedua program yang kita pakai menulis hampir
semua keterangannya ke stderr: `ffmpeg -list_devices` mencetak daftar mic ke sana, dan
whisper mencetak `load_backend: loaded CPU backend ...` ke sana. Jadi keduanya mustahil
dipakai tanpa pembungkus ini.

`Jalankan-Luar` menurunkan `$ErrorActionPreference` ke `Continue` hanya selama panggilan
(dikembalikan di blok `finally`, termasuk kalau programnya tidak ada), mengembalikan
keluaran sebagai teks dan kode keluar sebagai angka. PowerShell 7 tidak berperilaku
seperti 5.1 di sini - itulah sebabnya jebakan ini tidak muncul saat diuji di luar Windows.

## Yang diperlukan

- **Node.js** — sudah ada (dipakai torang-stage)
- **ffmpeg** — untuk merekam. `winget install Gyan.FFmpeg`
- **Visual C++ Redistributable x64** — biasanya sudah ada; kalau `whisper-cli.exe`
  tidak mau jalan, ini penyebab yang paling sering
