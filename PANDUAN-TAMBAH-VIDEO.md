# Panduan Tambah Video ke Panggung

Panggung tidak tahu apa-apa soal berkas video sampai video itu **terdaftar di
manifest**. Manifest adalah sumber kosakata sekaligus daftar aset: nama modul
yang tidak ada di sana ditolak sebelum apa pun dikirim ke panggung.

Dulu itu berarti menyunting `manifest.json` dengan tangan. Sekarang tidak lagi.

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
