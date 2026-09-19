# Panduan Tambah Video ke Panggung

Panggung tidak tahu apa-apa soal berkas video sampai video itu **terdaftar di
manifest**. Manifest adalah sumber kosakata sekaligus daftar aset: nama modul
yang tidak ada di sana ditolak sebelum apa pun dikirim ke panggung.

Dulu itu berarti menyunting `manifest.json` dengan tangan. Sekarang tidak lagi.

## Cara paling gampang: lewat panel operator

Panggung sedang jalan? Kartu **"Video baru -> modul"** ada di panel operator.

1. **Seret berkas videonya ke kotak putus-putus** di kartu itu - dari mana saja,
   Desktop atau flashdisk, tidak harus dari folder `video-baru\`.
   (Atau taruh di `video-baru\` lalu klik **Muat ulang folder**.)
2. Panel menampilkan usulan alias - kata yang nanti diucapkan guru. Ubah kalau perlu.
3. Klik **Daftarkan**.
4. Panel menjawab dengan kalimat yang bisa langsung diucapkan:
   `ucapkan: "Torang, puter hermes di TV satu"`

Tidak perlu menyalakan ulang apa pun: daftar modul disegarkan tiap ucapan, jadi modul
yang baru didaftarkan langsung dikenali voice command.

Panel tidak mengerjakan pendaftarannya sendiri - ia memanggil `torang-modul` yang sama
dengan cara-cara di bawah, termasuk seluruh pemeriksaan keamanannya. Yang dihapus kartu
itu cuma keharusan membuka PowerShell.

## Cara cepat (lewat agent Hermes)

1. Taruh berkas video di `video-baru\` di PC guru.
2. Bilang ke Hermes: **"Torang, daftarkan video baru."**
3. Hermes membacakan usulan alias — kata yang nanti kamu ucapkan untuk
   memanggil video itu. Setujui, atau sebut kata lain.
4. Selesai. Coba: *"Torang, puter &lt;alias&gt; di TV satu."*

Agent tidak pernah menyunting manifest sendiri — dia memanggil
`tools\cli\torang-modul.cmd`, dan perintah itu yang menjaga aturannya.

## Cara manual (tanpa agent)

```
tools\cli\torang-modul.cmd inbox
tools\cli\torang-modul.cmd usul "video-baru\video instal hermes.mp4"
tools\cli\torang-modul.cmd daftar "video-baru\video instal hermes.mp4" --alias=hermes
```

`usul` tidak menulis apa pun — aman dijalankan untuk mengintip. `daftar`
mengerjakan semuanya: baca durasi pakai ffprobe, beri nama sesuai kontrak
(`m{NN}_{jenis}_{slug}.mp4`), salin ke `apps\theater\assets-dev\`, cadangkan
manifest lama, sisipkan bloknya, lalu muat ulang manifest di cloud.

Opsi yang sering dipakai:

| Opsi | Guna |
|---|---|
| `--alias=<kata>` | kata yang diucapkan guru |
| `--jenis=<j>` | `materi` (default), `enter_l`, `enter_r`, `exit_l`, `exit_r`, `idle`, `knock` |
| `--ke=<alias>` | tambahkan klip ke modul yang SUDAH ada |
| `--audio=<file>` | audio terpisah (kalau namanya beda dengan videonya) |
| `--dry` | tampilkan rencananya, jangan tulis |
| `--durasi-ms=<n>` | kalau ffprobe tidak terpasang |

## Dari tautan (URL)

```
tools\cli\torang-modul.cmd ambil "https://contoh.com/materi.mp4"
tools\cli\torang-modul.cmd daftar "https://contoh.com/materi.mp4" --alias=hermes
```

`ambil` mengunduh + memeriksa lalu berhenti (berkasnya mendarat di
`video-baru\`); `daftar` melakukan keduanya sekaligus. Untuk YouTube dan situs
sejenis perlu `yt-dlp` terpasang; untuk tautan ke berkas video langsung tidak
perlu apa-apa.

**Yang tidak diunduh mentah-mentah.** Nama berkas dan Content-Type dari
internet gampang dipalsukan, jadi bukan itu yang dipercaya:

| Lapis | Yang dilakukan |
|---|---|
| 1 | Hanya `https` (`http` cuma untuk alamat LAN/localhost) — menutup `file://`, `ftp://` |
| 2 | Batas ukuran (`--maks-mb`, default 2048) dicek sebelum & sesudah unduh |
| 3 | Unduhan mendarat di karantina `video-baru\.unduh\`, bukan di folder aset |
| 4 | **ffprobe harus bisa mendekodenya** — wajib punya stream video + durasi > 0 |
| 5 | Nama & ekstensi ditentukan dari isi berkas, bukan dari URL |

Lapis 4 yang menentukan. File `.exe` yang disajikan dengan Content-Type
`video/mp4` tetap ditolak, karena yang diuji isinya, bukan labelnya. Berkas yang
gagal langsung dihapus dan tidak pernah menyentuh `assets-dev\`. Tidak ada
berkas unduhan yang dijalankan — hanya dibaca ffprobe lalu disalin.

Batas kejujurannya: ini menutup "yang terunduh ternyata program", bukan video
yang sengaja dirancang mengeksploitasi bug decoder. Untuk itu, jaga ffmpeg tetap
mutakhir dan jangan menarik dari sumber sembarangan.

**Hak cipta.** Untuk video milik sendiri atau berlisensi, aman. Mengunduh video
orang lain dari YouTube melanggar ketentuan layanan mereka, dan memakainya di
kelas berbayar punya risiko hak cipta tersendiri — ini keputusan bisnis, bukan
soal teknis.

## Tiga hal yang perlu diingat

**1. Satu klip `materi` cukup untuk "puter", tapi tidak untuk "pindah".**
Perintah "Torang, pindah ke TV tiga" selagi modul itu aktif butuh klip
`exit_l`/`exit_r` + `enter_l`/`enter_r` milik modul yang sama. Kalau belum ada,
perintahnya ditolak dengan pesan yang menyebut klip mana yang kurang.
Tambahkan menyusul:

```
tools\cli\torang-modul.cmd daftar "torang keluar kanan.mp4" --ke=hermes --jenis=exit_r
```

**2. Aset dibaca LOKAL per mesin.** Video yang mau tayang di komputer murid
harus ada juga di folder aset PC murid itu. `torang-modul` hanya menyentuh
mesin tempat ia dijalankan. Untuk video yang cuma tayang di TV, tidak masalah —
TV jalan dari mesin guru.

**3. App panggung tidak perlu di-restart.** Sejak 16 Sep 2026 peta aset dimuat
ulang sendiri begitu datang cue yang menyebut aset yang belum dikenal (jeda 3
detik antar-muat-ulang). Kalau video baru tetap dijawab "aset tidak ditemukan
di cache lokal", berarti berkasnya belum sampai di folder aset mesin itu —
bukan soal restart.

## Kalau ada yang salah

- **`reload` bukan OK** di keluaran `daftar` → manifest sudah tersimpan, cloud
  yang belum memuatnya. Nyalakan panggung, lalu `tools\cli\torang.cmd reload-manifest`.
- **Salah alias** → daftarkan ulang dengan alias benar memakai `--id` yang sama
  dan `--timpa`, atau pulihkan `manifest.json.backup-<tanggal-jam>` yang otomatis
  dibuat di `apps\theater\assets-dev\`.
- **ffprobe tidak ada** → pasang ffmpeg, atau sebutkan `--durasi-ms`. Durasi
  harus akurat: dipakai menjadwalkan klip enter tepat setelah exit selesai.
