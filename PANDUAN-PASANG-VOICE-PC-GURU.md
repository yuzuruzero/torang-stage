# Memasang Panggung Torang + voice command

Ditulis 18 Sep 2026.

---

## PC BARU: satu perintah

Buka **PowerShell** di PC itu, tempel satu baris ini, Enter:

```powershell
iex "& { $(irm https://raw.githubusercontent.com/yuzuruzero/torang-stage/main/tools/pasang-guru.ps1) }"
```

Ia akan menanyakan kunci ruangan, lalu mengerjakan semuanya sendiri:

| | |
|---|---|
| Node.js | dipasang lewat winget kalau belum ada |
| Torang Stage | diunduh dari GitHub + `npm install` |
| Config panggung | ditulis dengan kunci ruangan yang kamu isi |
| Shortcut Desktop | `Torang Panggung.bat` (tanpa jendela terminal) + `Torang Panggung (dengan terminal).bat` (untuk mencari masalah) |
| ffmpeg | dipasang lewat winget kalau belum ada |
| whisper.cpp + model | diunduh (~90 MB), lalu **diverifikasi** dengan benar-benar mentranskripsikan 1 detik hening |
| Voice di app | **dinyalakan langsung di config** (`F8`, mode toggle) - tidak perlu menyunting JSON sendiri |

Kalau kunci ruangannya sudah kamu tahu dari awal, langsung isikan:

```powershell
iex "& { $(irm https://raw.githubusercontent.com/yuzuruzero/torang-stage/main/tools/pasang-guru.ps1) } -RoomKey kunciku"
```

Mesin yang tidak akan dipakai voice command: tambahkan `-TanpaVoice` supaya tidak
mengunduh 90 MB percuma.

**Satu-satunya jeda yang mungkin:** kalau Node.js baru saja dipasang, PATH-nya belum
terbaca di jendela itu. Skrip akan bilang begitu - tutup PowerShell, buka yang baru,
tempel perintah yang sama lagi.

---

## PC GURU yang sudah ada versi lama

Sama, satu perintah - tapi **dua hal harus disiapkan dulu**, kalau tidak pemasangan
gagal di tengah.

### a. Kunci ruangan: tidak perlu diapa-apakan

Pemasang **membaca sendiri** kunci dari config yang sudah ada di mesin itu dan
memakainya lagi. Ia akan mencetak `Kunci ruangan diambil dari pemasangan lama: ...`
- cocokkan sekilas, itu saja.

Kunci ini dipakai bersama semua PC murid, jadi kunci berubah = seluruh kelas tidak
bisa masuk, dan gejalanya muncul di mesin murid, bukan di sini. Berikan `-RoomKey`
**hanya** kalau memang mau menggantinya (dan semua PC murid ikut diganti).

### b. Tutup panggung yang sedang jalan

Pemasang **memindahkan** folder lama (tidak menghapus - jadi cadangannya ada sebagai
`torang-stage-lama-<tanggal>`). Windows menolak memindahkan folder yang sedang dipakai.

Tutup panel operator, keempat window TV, dan jendela hitam "Torang Cloud".

Baru jalankan:

```powershell
iex "& { $(irm https://raw.githubusercontent.com/yuzuruzero/torang-stage/main/tools/pasang-guru.ps1) }"
```

> Perintah ini mengunduh pemasang ke memori, bukan ke dalam folder Torang. Itu yang
> membuatnya aman memindahkan folder lama - beda dengan menjalankan
> `tools\pasang-guru.ps1` dari dalam folder yang mau dipindahkan itu sendiri.

---

## Sesudah terpasang: coba

**1. Nyalakan panggung** - double-click `Torang Panggung.bat` di Desktop.
Harus muncul: panel guru dan 4 window TV - **tanpa jendela terminal** (sejak
v0.4.1 cloud & app jalan tersembunyi; keluarannya di folder `logs\`:
`cloud.log`, `app.log`). Tutup panel = cloud ikut berhenti. Kalau ada yang
gagal, muncul kotak pesan dengan letak lognya. Perlu melihat terminal? Pakai
`Torang Panggung (dengan terminal).bat`.

**2. Uji sambungan tanpa mic dan tanpa Whisper.** Buka PowerShell baru:

```powershell
cd $env:USERPROFILE\torang-stage\tools\voice
node torang-dengar.mjs --ucap "Torang, puter tes di TV tiga"
```

Harus terlihat:

```
    Kunci    : <kuncimu> (dari apps/theater/torang-theater.config.json)
  intent   : {"intent":"PLAY_MODULE","alias":"tes","target":"tv3"}
  TERKIRIM : PLAY_VIDEO->[tv3]
```

**Lalu lihat window TV3 - videonya harus benar-benar jalan.** "TERKIRIM" cuma berarti
cue keluar dari cloud; yang membuktikan sampai ke layar adalah gambarnya bergerak.

**3. Uji dengan mic:**

```powershell
node torang-dengar.mjs --daftar-mic
.\TORANG-DENGAR.bat
```

Tekan Enter, ucapkan salah satu kalimat dari `KALIMAT-BAKU-VOICE.md`, misalnya
**"Torang, puter tes di TV tiga"**.

**4. Nyalakan voice DI DALAM app (push-to-talk, tanpa jendela PowerShell).**

Ini bentuk yang dipakai di kelas. Buka `apps\theater\torang-theater.config.json`,
tambahkan atau ubah blok `voice`:

```json
  "voice": {
    "enabled": true,
    "tombol": "F8",
    "berkas_uji": ""
  }
```

Lalu jalankan `npm run guru`. Di log panggung harus muncul satu baris:

```
  voice siap - F8 (toggle), mic: <nama mic>
```

Tekan **F8**, ucapkan kalimatnya, tekan **F8** lagi. Videonya harus tayang - dan tidak
boleh ada satu pun kedipan jendela hitam.

**Kalau perintahnya ditolak**, panel akan menawarkan kalimat sah yang paling dekat:

```
maksudnya: "Torang, puter tes di TV tiga"
tekan F9 untuk membenarkan - atau bicara lagi
```

**F9** menjalankannya. Tombolnya sengaja berbeda dari F8: kalau tombolnya sama, guru
yang cuma ingin mengulang ucapannya akan menjalankan usulan tanpa bermaksud. Usulan
kedaluwarsa sendiri setelah 15 detik, dan hilang begitu kamu bicara lagi.

Yang tidak akan pernah diusulkan: nama modul yang beda jauh. Salah menebak kata aksi
cuma memilih perintah lain dari daftar yang ada dan kamu melihatnya dulu; salah
menebak nama modul menentukan video apa yang tayang di depan kelas.

**4b. Kalau mesin itu TIDAK punya mic.**

Isi `berkas_uji` dengan sebuah rekaman; tombol F8 akan memutar berkas itu lewat rantai
yang sama persis, tanpa merekam apa pun:

```json
  "voice": {
    "enabled": true,
    "tombol": "F8",
    "berkas_uji": "rekaman-mentah/tes3.m4a"
  }
```

Path relatif dihitung dari `tools\voice`. Barisnya jadi:

```
  voice siap - F8 (toggle), BERKAS UJI tes3.m4a (mic tidak dipakai)
```

Satu kali tekan F8 = satu kali putar. Yang terbukti dengan ini: voice benar-benar hidup
di dalam app, Whisper jalan dari dalam proses Electron, parser dipanggil, dan cue-nya
sampai ke TV. Yang **belum** terbukti: penangkapan mic - itu saja.

**Kosongkan lagi `berkas_uji` sebelum dipakai di kelas**, kalau tidak F8 akan selalu
memutar rekaman yang sama alih-alih mendengarkan.

---

## Memakai clicker sebagai tombol bicara

Kode tidak peduli tombolnya datang dari keyboard atau dari clicker - yang dicari
cuma **tombol apa yang dikirim clicker itu**.

**1. Cari tahu.** Buka PowerShell, tempel, Enter, lalu tekan tiap tombol clicker:

```powershell
while ($true) { $k = [Console]::ReadKey($true); "$($k.Key)   $($k.Modifiers)" }
```

Tiap tekanan mencetak satu baris, misalnya `PageDown   0` atau `F5   Shift`.
Ctrl+C untuk berhenti. **Kalau menekan tombol clicker tidak mencetak apa pun**,
tombol itu bukan tombol keyboard - kabari, itu perlu cara lain.

**2. Tulis ke config** (`apps\theater\torang-theater.config.json`), apa adanya
seperti yang tercetak - nama seperti `OemPeriod` atau `MediaPlay` diterjemahkan
sendiri oleh app:

```json
  "voice": {
    "enabled": true,
    "tombol": "PageDown",
    "tombol_ya": "PageUp"
  }
```

Kalau barisnya menyebut modifier (`F5   Shift`), tulis `"Shift+F5"`.

**3. Nyalakan ulang panggung.** Kartu Voice command akan menyebut tombol barunya.

Pengaturan ini **bertahan** saat panggung dipasang ulang - pemasang membacanya dari
config lama.

Dua hal yang perlu diketahui:

- Tombolnya didaftarkan untuk seluruh Windows. Selama panggung menyala, tombol itu
  **tidak sampai ke program lain** - kalau clicker yang sama dipakai untuk slide
  PowerPoint, keduanya akan berebut.
- **Jangan pakai `Escape`**, walaupun clicker mengirimnya: Escape dipakai di mana-mana
  untuk menutup dialog, dan selama panggung menyala ia akan berhenti bekerja.

## Kalau ada yang tidak beres

Tempelkan **seluruh** keluaran langkah yang gagal, jangan diringkas. Yang paling sering
menipu adalah galat yang menunjuk baris yang tidak bersalah.

> **Kalau baru saja push ke GitHub:** URL `/main/` di raw.githubusercontent
> menyimpan cache beberapa menit, jadi bisa saja yang terunduh masih versi lama.
> Tunggu sebentar, atau ganti `main` di URL dengan sha commitnya
> (`git rev-parse --short HEAD`) - URL ber-sha tidak pernah basi.

| Yang terjadi | Artinya | Tindakan |
|---|---|---|
| Berhenti minta buka PowerShell baru | Node.js baru dipasang, PATH belum terbaca | tutup, buka baru, ulangi perintah yang sama |
| `Move-Item` gagal | ada yang masih memakai folder lama | tutup panggung + Explorer yang membuka folder itu |
| `dir tools\voice` kosong | kode di GitHub belum berisi jalur suara | pastikan push terakhir sudah masuk |
| Whisper gagal verifikasi | Visual C++ Redistributable belum ada | pasang "Microsoft Visual C++ Redistributable x64", lalu `tools\voice\PASANG-WHISPER.bat` |
| ffmpeg tidak terpasang | winget tidak ada di mesin itu | `winget install Gyan.FFmpeg`, atau pasang manual |
| `--ucap` gagal kirim, HTTP 401/403 | kunci ruangan beda | bandingkan baris `Kunci :` dengan isi Desktop bat |
| panel: `ffmpeg (...) tidak melihat satu pun mic` | mic tidak tercolok, atau izin Windows tertutup | Settings > Privacy & security > Microphone: **"Let desktop apps access your microphone"** ON |
| `--ucap` jalan, `--daftar-mic` kosong | belum ada mic, atau izin Windows tertutup | Settings > Privacy & security > Microphone: nyalakan **"Microphone access"** DAN **"Let desktop apps access your microphone"**, lalu PowerShell baru |
| mic jalan tapi kalimat ditolak | Whisper salah dengar | tempel baris `didengar :` - itu bahan memperbaiki tabel salah-dengar |
| `voice siap` tidak muncul sama sekali | `voice.enabled` masih `false` | perbaiki config, jalankan ulang `npm run guru` |
| `tombol F8 sudah dipakai app lain` | program lain merebut F8 | ganti `tombol` jadi `F9` atau `CommandOrControl+Shift+Space` |
| `berkas_uji tidak ada: ...` | path salah | path relatif dihitung dari `tools\voice`; cek dengan `dir tools\voice\rekaman-mentah` |
| F8 ditekan, tidak terjadi apa-apa | panggung belum tersambung ke cloud | cek panel operator dulu - voice memakai sambungan yang sama |

---

## Memasang ulang jalur suaranya saja

Kalau Torang Stage sudah terpasang dan cuma bagian suaranya yang perlu diulang:

```powershell
cd $env:USERPROFILE\torang-stage\tools\voice
.\PASANG-WHISPER.bat
```

`-CekSaja` melaporkan keadaan tanpa mengunduh apa pun.
