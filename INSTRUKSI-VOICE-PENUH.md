# Tugas: Bangun jalur Voice Penuh (mic PTT + Whisper lokal) untuk Torang Stage

**Versi:** 2 (17 Sep 2026, sore) · **Menggantikan:** draf instruksi versi 1
**Status:** siap dikerjakan setelah 4 pertanyaan di bagian E dijawab Hadi

---

## A. Konteks

Repo: `yuzuruzero/torang-stage`. Tag terakhir **v0.3.3** (18 Agu), **tapi ada pekerjaan
7–16 Sep yang belum ditag** (scene office, `transisi_default`, CLI `torang` &
`torang-modul`, skill Hermes, perbaikan "tinggalkan layar lama"). Jumlah test sekarang
**93**, bukan 79. Baca `STATUS-PROYEK.md` — diperbarui 17 Sep, sudah mencerminkan ini.

Tujuannya: guru mengendalikan panggung dengan suara tanpa menyentuh komputer, sambil
**menghadap murid**. Guru menahan tombol PTT, bicara "Torang, puter tes di TV satu",
panggung bereaksi. **Tanpa LLM di jalur keputusan.**

**Kenapa tanpa LLM** (baru, hasil diskusi 17 Sep — tulis ini di ADR): memanggil cue itu
pekerjaan **refleks**, bukan pertimbangan. Melewatkannya ke agent LLM membuat jedanya
terukur dalam detik, dan yang lebih merusak, **variansnya** lebar. Pertunjukan bisa
menyesuaikan diri dengan jeda yang selalu sama; tidak dengan jeda yang kadang 3 detik
kadang 14 — guru akan mengira perintahnya tidak terdengar, mengulangi, lalu dua cue
terbang sekaligus. Hermes tetap dipakai, tapi untuk pekerjaan pertimbangan (lihat §H).

**Mesin guru sudah diketahui:** AMD Ryzen 7 8700G (8 inti / 16 thread, ~4,1 GHz),
64 GB RAM, ASRock B650M Pro RS, Windows 11 Pro. Ini **bukan** PC lemah — CPU-nya sanggup
menjalankan Whisper untuk ucapan pendek tanpa GPU. Jangan merancang jalur cadangan untuk
PC lemah.

## B. Baca dulu sebelum menulis kode

1. `panggung-torang-MASTER-programmer.md` (di folder `torangapp/spec-induk/`). Sumber
   kebenaran produk; kalau bertentangan, file ini menang. Fokus §2.1 (alur voice), §5
   (grammar + toast konfirmasi), §6 (manifest = sumber kosakata), §14/§14.1 (akseptasi).
2. `informations/docs/02-arsitektur-dan-kontrak.md` §D dan
   `informations/05-checklist-kesesuaian-TERISI-2026-09-17.md` baris D1–D7.
3. `DECISIONS.md` — sekarang **D1–D20**. Terutama D8 (hotkey menembak API cloud, jalur
   yang sama dengan voice), D12 (`start_at` & lead), D16 (parser deterministik), D17
   (jangan `Ctrl+Alt+HURUF`).
4. `KEAMANAN.md` dan `STATUS-PROYEK.md`.
5. `tools/openclaw/torang-cue.mjs` — `parseKalimat`, `bacaTarget`, `bacaAngka`.
6. `tools/cli/torang.mjs` — `normalisasiTarget`. **Ini tempat ketiga**, lihat §D.2.
7. `apps/theater/src/main/main.ts` (`sendIntent()`, `globalShortcut`, status panel) dan
   `apps/theater/src/main/config.ts`.
8. `packages/shared/src/protocol.ts` — `IntentSchema`, `TargetSchema`, `LEAD_MS`.

Kalau master doc tidak ada di workspace, **berhenti dan tanyakan**. Jangan menebak §5/§14.1.

## C. Alur target

```
Tombol PTT DITAHAN
  → rekam mic (16 kHz mono)
  → tombol DILEPAS            ← penanda akhir ucapan; TIDAK ADA deteksi hening
  → Whisper lokal → teks
  → normalisasi sempit
  → parseKalimat()             (parser YANG SAMA dengan torang-cue)
  → POST /api/intent           (jalur YANG SAMA dengan hotkey, lewat sendIntent)
  → cue dijadwalkan start_at = now + 1,5 dtk; endpoint mulai pre-load
  → SELAMA 1,5 dtk itu: kartu konfirmasi di layar guru + bisikan earpiece
  → batal sebelum start_at  →  cue dibatalkan, tidak ada yang tayang
  → tidak dibatalkan        →  cue tayang sesuai jadwal
```

**Anggaran latensi** (ukur dan laporkan per tahap):

| Dari | Sampai | Target |
|---|---|---|
| tombol dilepas | teks keluar dari Whisper | ≤ 700 ms (ucapan ~2 dtk) |
| tombol dilepas | cue terkirim ke cloud | ≤ 1000 ms |
| tombol dilepas | gambar mulai bergerak | ≤ 2500 ms (lead 1,5 dtk sudah termasuk) |

Angka final dikalibrasi dari patokan yang diukur Hadi. Kalau target tidak tercapai di PC
guru, **laporkan dan berhenti** — jangan diam-diam menambah waktu tunggu supaya "lebih
akurat".

## D. Aturan keras

1. **Tidak ada LLM di jalur ini.** Teks Whisper hanya diproses parser grammar tertutup.
   Kalimat yang tidak cocok **ditolak** dengan pesan jelas, bukan ditebak.
2. **Parser tidak boleh ditulis dua kali — dan sekarang ada TIGA tempat, bukan dua.**
   `tools/openclaw/torang-cue.mjs` (parser kalimat), `tools/cli/torang.mjs`
   (`normalisasiTarget`), dan `protocol.ts` (`TargetSchema` regex). Satukan sumber
   kebenarannya di `packages/shared`, lalu ketiga pemakai menariknya dari sana. Kalau
   tidak, akan ada tiga definisi "komp enam" yang diam-diam berbeda. `torang-cue.mjs`,
   `torang say`, dan `torang <subcommand>` harus tetap berfungsi; 93 test harus tetap hijau.
3. **Jalur kirim yang sama.** Lewat `sendIntent()` / `POST /api/intent`. Jangan bikin
   endpoint baru. Cloud tetap memvalidasi ulang.
4. **STOP tidak pernah bergantung pada voice.** Hotkey `Ctrl+Alt+F9/F10/F11` dan tombol
   STOP di panel tetap bekerja walau mic, Whisper, atau modelnya gagal dimuat. Kegagalan
   voice tidak boleh membuat app crash — cukup indikator merah di panel.
5. **Hanya mode teacher.** Mode student tidak pernah membuka mikrofon.
6. **STT LOKAL SAJA. Tidak ada opsi cloud, termasuk sebagai fallback.** Alasannya dua, dan
   dua-duanya mengikat: keputusan #3 mensyaratkan STT lokal, dan Hadi menetapkan
   kemandirian penyedia sebagai prinsip produk (panggung multi-cabang tidak boleh
   bergantung pada kuota/harga satu perusahaan). Jangan menyediakan `stt_provider` di
   config — ketiadaan pilihan itu sendiri yang menegakkan aturannya.
7. **Deteksi hening DILARANG sebagai penentu akhir ucapan.** Menunggu hening berarti
   menebak kapan guru selesai, dan itu persis sumber lambat yang kita hindari. Tombol
   dilepas = ucapan selesai, titik. (Batas `max_record_ms` tetap ada sebagai pengaman,
   bukan sebagai penentu.)
8. **Normalisasi transkripsi harus sempit dan eksplisit.** Misal: salah dengar kata
   pembuka ("tolong"/"toran"/"terang" di posisi pertama → "torang"), atau angka digit →
   bentuk yang dipahami `bacaAngka`. **Setiap aturan wajib punya unit test.** Dilarang
   melonggarkan grammar supaya "lebih banyak kalimat lolos".
9. **Hotkey baru** mengikuti D17: tidak boleh `Ctrl+Alt+HURUF`.
10. Semua file yang ditulis skrip PowerShell harus UTF-8 **tanpa BOM** (insiden 11 Agu).
11. Audio tidak pernah disimpan kecuali flag debug aktif.

## E. Empat pertanyaan untuk Hadi — ajukan sekaligus, beri rekomendasi, lalu TUNGGU

**E1. Perangkat PTT.**
Rekomendasi: **clicker/presenter wireless** yang tombolnya terbaca sebagai tombol keyboard,
dipegang guru. Catatan teknis penting: tombol mute di mic wireless **tidak terbaca
komputer** — ia hanya membisukan mic itu sendiri, jadi tidak bisa dipakai sebagai PTT.
Catatan kedua: `globalShortcut` Electron hanya menangkap *key down*, tidak ada *key up*,
jadi mode tahan butuh hook native (`uiohook-napi`). **Ongkos itu layak dibayar** — lihat
aturan D.7. Presenter biasanya mengirim PageUp/PageDown/B/F5; mendaftarkannya global akan
merebut tombol itu dari aplikasi lain, jadi tanyakan tombol mana yang aman.

**E2. Perilaku konfirmasi.** Dua pilihan:
- **(a) Menumpang lead** (rekomendasi): cue dikirim langsung, kartu muncul selama jendela
  1,5 detik yang memang sudah ada untuk pre-load, batal sebelum `start_at` membatalkan cue.
  Ongkos latensi **nol**. Risikonya: kalau batalnya telat, gambar sempat berkedip sesaat.
- **(b) Menahan dulu**: kartu muncul 1 detik, baru cue dikirim. Tidak pernah ada yang
  tayang salah, tapi **menambah 1 detik penuh** di atas lead.

Butuh keputusan Hadi. Ini menyentuh §5 master doc — kalau master doc sudah menjawabnya,
master doc yang menang.

**E3. Konfirmasi untuk semua perintah, atau hanya sasaran komp murid?**
Rekomendasi: **hanya komp murid**. "Lanjut", "stop", dan perintah ke TV terlihat langsung
dan mudah diperbaiki; sapaan bernama ke kursi yang salah mempermalukan anak tertentu.
Menyaring begini menjaga ritme pertunjukan dan menaruh pengamanan di tempat yang memang
butuh.

**E4. Apakah kata "Torang" wajib diucapkan** saat memakai PTT, atau opsional karena
tombolnya sudah jadi tanda niat? Rekomendasi: **opsional diterima, tidak wajib** — parser
memaafkan ketiadaannya, tapi guru tetap diajari mengucapkannya karena itu bagian
pertunjukan (murid harus mendengar gurunya memerintah Torang).

## F. Rancangan yang disarankan (boleh diubah dengan alasan tertulis di DECISIONS)

- **Tempat kode:** app theater mode teacher. Proses main memegang PTT dan state rekaman;
  rekaman diambil di renderer panel lewat `getUserMedia`, dikirim sebagai PCM ke main lewat
  IPC yang didefinisikan di `preload.ts` / `global.d.ts` (`contextIsolation` tetap aktif).
  STT di main atau sidecar, **modelnya tinggal di memori** — jangan dinyalakan ulang tiap
  ucapan, ongkos memuat model akan menghabiskan seluruh anggaran latensi.
- **Mesin STT:** `whisper.cpp` atau `faster-whisper` lewat sidecar. Mulai dari model
  **`base`** dengan kuantisasi int8, bukan `small` — kosakata kita tertutup (8 aksi, 27
  sasaran), jadi model besar hanya menambah latensi tanpa menambah ketepatan yang berarti.
  Naikkan ke `small` **hanya** kalau benchmark menunjukkan `base` benar-benar salah dengar.
  Laporkan angkanya.
- **Bias kosakata Whisper:** isi *initial prompt* dengan "Torang", kata aksi (puter, pindah,
  lanjut, ulang, stop, sapa, glow, buka, tutup), angka satu sampai dua puluh, "TV", "komp",
  dan alias modul dari `GET /api/vocab`. Muat ulang saat manifest berubah.
- **Bisikan earpiece** (baru, wajib — lihat §G): setelah parse berhasil, ucapkan **sasarannya
  saja** ("komp enam belas") ke perangkat audio kedua memakai TTS bawaan Windows. Netral,
  bukan suara Torang. Perangkat outputnya dipilih di config; kalau kosong, fitur mati dan
  panel menandainya.
- **Batas keyakinan:** transkripsi kosong, terlalu pendek, atau berisi frasa halusinasi
  Whisper ("terima kasih telah menonton" dan sejenisnya — kelemahan Whisper yang terkenal
  saat hening) → tolak, jangan kirim apa pun.
- **Config baru** di `TheaterConfig`, default aman:
  ```json
  "voice": {
    "enabled": false,
    "ptt_key": "F8",
    "ptt_mode": "hold",
    "whisper_model": "base",
    "language": "id",
    "max_record_ms": 8000,
    "konfirmasi": {
      "mode": "tumpang_lead",
      "hanya_untuk_komp": true,
      "bisikan_earpiece": true,
      "perangkat_earpiece": ""
    }
  }
  ```
- **Umpan balik di panel operator:** indikator mic (idle / merekam / memproses), teks
  terakhir yang didengar, intent hasil parse atau alasan penolakan, dan **latensi per
  tahap** sesuai tabel §C.
- **Log** tiap ucapan (teks, hasil parse, latensi per tahap) ke file lokal untuk kalibrasi
  di ruang kelas.

## G. Kenapa earpiece wajib

Guru memberi perintah sambil **menghadap murid**, bukan menatap monitor. Kartu konfirmasi
di layar hanya tertangkap kalau dia kebetulan melirik — jadi sebagai satu-satunya umpan
balik, ia tidak menyelesaikan masalahnya. Satu earphone di satu telinga, dari output audio
kedua mesin guru, membisikkan sasaran — hanya guru yang dengar, murid tidak dengar apa pun.
Guru membatalkan lewat tombol di clicker yang sudah dia pegang, tanpa menoleh dan tanpa
bersuara.

Ini **tidak melanggar keputusan #5** (satu PA sentral): earphone adalah output kedua untuk
satu orang, bukan PA kedua untuk kelas.

## H. Di luar cakupan

- **Hermes / OpenClaw tidak diubah.** Hermes tetap dipakai untuk tugas pertimbangan:
  mendaftarkan video, menanyakan keadaan panggung, urusan admin. Jalur voice ini berdiri
  sendiri dan tidak bergantung pada agent mana pun.
- **Wake word** ("Hey Torang") fase berikutnya. Rancang modul pemicu agar kelak bisa
  ditukar dari PTT ke wake word tanpa mengubah pipeline sesudahnya.
- Aksi `buka`/`tutup` (scene): parser kalimat masih menolaknya padahal cloud & CLI sudah
  mendukung. **Menyusulkannya masuk cakupan tugas ini** (perbaikan kecil di parser), karena
  kalau tidak, guru bisa "buka office tv3" lewat CLI tapi tidak lewat suara.

## I. Pengujian

- Unit test (vitest): normalisasi transkripsi, integrasi parser, filter halusinasi, state
  machine PTT, dan pembatalan sebelum `start_at`.
- **STT palsu** (fake provider) supaya e2e jalan tanpa model: teks masuk → intent sampai ke
  cloud → cue terbentuk. Pola sama dengan `apps/cloud/test/e2e-cue-path.test.ts`.
- Beberapa fixture WAV pendek berbahasa Indonesia untuk uji Whisper sungguhan (manual /
  opsional, tidak wajib di CI).
- `npm test` tetap hijau (93+), `tools/smoke-headless.sh` tetap jalan.
- Skrip uji manual `npm run voice:tes`: merekam, mencetak transkrip + hasil parse (`--dry`)
  + latensi per tahap, **tanpa mengirim** ke cloud.

## J. Urutan kerja — berhenti di tiap checkpoint dan laporkan

1. Baca dokumen, ajukan 4 pertanyaan §E. **Checkpoint.**
2. Satukan parser & normalisasi target dari tiga tempat ke `packages/shared`; 93 test tetap
   hijau. **Checkpoint.**
3. Rekaman + PTT tahan-untuk-bicara + indikator panel, dengan STT palsu. **Checkpoint.**
4. Whisper sungguhan + bias kosakata + **benchmark latensi di PC guru vs tabel §C**.
   **Checkpoint — laporkan angkanya sebelum lanjut.**
5. Konfirmasi (kartu + bisikan earpiece + pembatalan) + pengiriman intent + log.
   **Checkpoint.**
6. Susulkan `buka`/`tutup` di parser kalimat. **Checkpoint.**
7. Dokumentasi: tambahkan **D21** di `DECISIONS.md` (**bukan D18 — D18/D19/D20 sudah
   terpakai sejak 17 Sep**), perbarui `STATUS-PROYEK.md`, tulis `PANDUAN-VOICE.md` untuk
   guru (pasang mic & earpiece, uji, kalibrasi, cara darurat pakai hotkey).
8. Versi: **tag dulu pekerjaan 7–16 Sep yang belum ditag** (usul v0.3.4), baru voice ini
   jadi **v0.4.0**. Jangan lompat langsung ke 0.4.0 — pekerjaan September akan tenggelam.

**Jangan push ke GitHub dan jangan menjalankan `tools/push-ke-github.sh` tanpa izin
eksplisit Hadi.**

**Setiap perubahan wajib dicatat** di `D:\projects\torangapp\_changelog\` + satu baris di
`INDEX.md`; perubahan MAYOR/STRUKTUR di-backup dulu ke `_backup\`. Baca
`_changelog\README.md`.
