# STATUS PROYEK — Torang Stage (baca ini dulu di sesi baru)

**Terakhir diperbarui:** 24 Sep 2026 · **versi kode v0.4.1** (tag `v0.4.0` di GitHub = commit `bcad0c5`; 0.4.1 = perbaikan galat tutup panel, belum ditag) · tag sebelumnya **v0.3.3** (18 Agu)
**+ pekerjaan 7–16 Sep yang BELUM ditag** · GitHub: `github.com/yuzuruzero/torang-stage`
**Guna dokumen:** satu file untuk memahami apa yang SUDAH jadi, apa yang
TERVERIFIKASI di dunia nyata, dan apa langkah berikutnya — tanpa Hadi harus
menjelaskan ulang. Dokumen ini DIPERBARUI setiap rilis.

## Konteks 1 menit

Torang Stage = implementasi fase 1 "Panggung Torang" (Theater of AI): kelas
2 hari yang dipentaskan — guru jadi dalang (voice → agent), video Torang
pre-rendered berpindah antar 4 TV + 20 komp murid, telemetri pixel office
menyusul di fase 2. **Sumber kebenaran produk:** `panggung-torang-MASTER-programmer.md`
di folder `torangapp` (semua keputusan TERKUNCI; kalau ragu, file itu menang).
Keputusan teknis repo ini: `DECISIONS.md` (D1–D20). Keamanan: `KEAMANAN.md`.

**Baru (17 Sep):** atasan Hadi mengirim paket 6 dokumen rujukan —
`informations/docs/` (00 INDEX · 01 konsep & 20 keputusan terkunci · 02
arsitektur & kontrak · 03 telemetri/hatch · 04 acceptance & degradasi · 05
checklist). Hasil audit kode terhadap paket itu:
`informations/05-checklist-kesesuaian-TERISI-2026-09-17.md` — **baca itu untuk
tahu persis mana yang sesuai, beda, dan belum ada (62 item).**

**v0.4.0 (24 Sep) — panel & kalimat perintah untuk 4 layar.** Naik dari
0.3.3 karena mencakup SEMUA pekerjaan sejak 18 Agu yang belum pernah ditag
(CLI, voice PTT + Whisper, PC guru baru) ditambah perubahan 24 Sep di bawah.
Panel guru menampilkan versinya dan memberi peringatan merah kalau cloud yang
jalan versinya berbeda. Dokumen ini belum
ditulis ulang penuh sejak 17 Sep (voice PTT + Whisper sudah jalan sejak 18–19
Sep; PC guru baru 22 Sep — lihat `_changelog\INDEX.md` di torangapp). Yang
ditambahkan 24 Sep (D22–D27, `KALIMAT-BAKU-VOICE.md`):

- ✅ **Bug diperbaiki:** `puter` ke layar lain kini exit → enter → materi (dulu
  materi mulai bersamaan dengan exit, tanpa enter).
- ✅ `puter tes` tanpa sasaran = layar tempat Torang berada; kata kerja `tampilkan`
  (modul maupun scene).
- ✅ **Kalimat majemuk** maks. 3 perintah: `dan` = serentak, `lalu`/`habis itu`
  = menunggu video sebelumnya selesai. Semua-atau-tidak; STOP membatalkan antrean.
- ✅ **Tata layar**: preset 4 TV (`apps/cloud/config/tata-layar.json`), disunting &
  dijalankan dari panel, diucapkan "tata <nama>".
- ✅ **Konfirmasi 1 dtk** sebelum perintah suara dikirim + tombol BATAL.
- ✅ **Panel guru mengikuti deck (layar 1)** (D29): rundown klik-untuk-lompat,
  peta ruangan TV + 20 kursi dengan menu klik, riwayat cue, bilah suara bawah
  (PTT · transkrip · konfirmasi 1 dtk · GO/ULANG/STOP); alat lain di laci ⚙.
- ✅ **Video tersendat di PC guru baru (22 Sep)** — obatnya kini di repo (D21):
  decoder video software + anti-throttling window TV. Pasang ulang panel tidak
  perlu disunting tangan lagi. PC yang justru tersendat: geser tombol "mode
  video cadangan" di panel guru / jendela login murid (D28).
- ⏳ **Belum diuji di Electron sungguhan** — panel diuji di Chromium headless
  dengan data tiruan; cloud & parser diuji otomatis (tes: 212 → 281).

## Apa yang sudah jadi

**Sampai v0.3.3 (4–18 Agu):**

- ✅ **Cloud** (calon stage.torang.ai, sekarang jalan lokal): registry endpoint,
  show-state (arah exit/enter OTOMATIS, ring tv1→tv2→tv3→tv4), cue router WS
  (`start_at` T+1.5s, ACK per cue, timeout jelas), panel guru web `/panel`,
  login murid ketik-nama + lepas kursi + reset kelas, `/api/vocab`.
- ✅ **App teacher** (Electron): panel operator + 4 window TV (idle/show-video;
  `dev_tv_count` utk PC lemah) + audio→PA + hotkey global **Ctrl+Alt+F9/F10/F11**
  (GO/STOP/ULANG — menembak cloud, jalur sama dgn voice) + reconnect otomatis.
- ✅ **App student**: login ketik nama (kursi preset per PC), overlay "jendela
  sopan" (greet bernama, ketukan click-gated → murid yang buka fullscreen),
  GLOW pinggir layar, STOP membersihkan semua. TIDAK PERNAH menampilkan panggung.
- ✅ **Installer**: `tools/PASANG-GURU.bat` · `tools/PASANG-MURID.bat`.
  Panduan: `PANDUAN-PASANG-MURID.md`.
- ✅ **Jembatan OpenClaw (teks)**: skill `panggung-torang` + parser grammar §5
  deterministik (`tools/openclaw/`) + `--state`. Pemasang WSL tersedia.
- ✅ Modul dummy `m99` alias **"tes"** (aset placeholder di-commit, ~140 KB).

**Setelah v0.3.3 — belum ditag (7–16 Sep):**

- ✅ **CLI `torang`** (`tools/cli/torang.mjs`): kendali panggung dari baris
  perintah untuk guru/implementor — sapa, puter, pindah, glow, buka, tutup,
  state, admin. Sudah diuji melawan cloud sungguhan di PC guru.
- ✅ **`torang-modul`**: daftarkan video baru tanpa menyunting JSON, dan
  `ambil <url>` mengunduh dari tautan dengan 5 lapis pemeriksaan (penentu
  `ffprobe` — isi berkas, bukan nama/Content-Type; `.exe` berlabel `video/mp4`
  terbukti ditolak). Streaming langsung tetap ditolak.
- ✅ **Skill Hermes** (`tools/hermes/`): pemasang skill `panggung-torang` ke
  Hermes. Lokasi yang benar ternyata `%LOCALAPPDATA%\hermes\skills\<kategori>\`,
  BUKAN `~/.hermes/skills` seperti dokumentasi resmi.
- ✅ **Scene office di TV**: intent `buka`/`tutup` (`SWITCH_SCENE`). Cue membawa
  NAMA scene, URL dipetakan lokal (D18). TV ber-scene keluar dari cincin arah (D19).
- ✅ **`transisi_default`**: video baru cukup satu berkas materi — klip
  enter/exit/idle dipinjam (D20).
- ✅ **Perbaikan HUKUM §6**: `puter` ke TV lain kini meninggalkan layar lama
  dengan klip exit (dulu Torang tampak di 3 tempat sekaligus).
- ✅ **Panel guru**: dropdown modul (dari `/api/vocab`) × 27 target, tombol
  "Buka ulang window TV", menutup panel = menutup 4 window TV.
- ✅ **`assets.ts` memuat ulang peta aset sendiri** — video baru langsung bisa
  diputar tanpa tutup-buka app; manifest rusak tidak lagi mengosongkan peta.
- ✅ **Uji: 93 test** (`npm test`) + smoke headless (`tools/smoke-headless.sh`).

## Terverifikasi di DUNIA NYATA (bukan cuma sandbox)

- ✅ Guru↔murid **lintas mesin**: komp2 konek, **sapa + glow sampai di PC murid**.
- ✅ Fix keyboard v0.2.6 dikonfirmasi (D17 — jangan pakai `Ctrl+Alt+HURUF`).
- ✅ CLI `torang` lulus uji melawan cloud sungguhan di PC guru (7 Sep).
- ✅ **Skill Hermes terdeteksi & jalan di PC guru** (16 Sep).
- ✅ Bug "Torang di 3 tempat" ketemu saat uji nyata 16 Sep → sudah diperbaiki.
- ⏳ **Jembatan OpenClaw BELUM PERNAH terpasang** — macet firewall (adapter
  vEthernet WSL dihitung profil PUBLIC). Lihat "Langkah berikutnya" #1.
- ⏳ **Window TV kadang hilang sendiri saat uji — SEBABNYA MASIH MISTERI.**
  Penawarnya sudah ada (tombol "Buka ulang window TV"), penyebabnya belum.
- ⏳ **Belum dilaporkan:** GLOW di PC murid transparan atau menghitamkan layar
  (kalau hitam → fallback 4 bar tepi sudah dirancang, D15).
- ⚠ **Mode kiosk 4 TV belum pernah dijalankan pada konfigurasi aslinya** —
  kiosk baru aktif bila mesin guru melihat ≥5 display. Yang teruji baru grid
  dev 2×2 di satu monitor.

## Langkah berikutnya (urut)

1. **KEPUTUSAN HADI: jalur agent resmi — OpenClaw atau Hermes?**
   Dokumen atasan (01, keputusan #3) mengunci OpenClaw. Kenyataannya OpenClaw
   tidak pernah berhasil terpasang, sementara Hermes sudah terbukti jalan.
   Kalau Hermes yang dipakai, keputusan terkunci itu perlu **diamandemen resmi
   ke atasan**, bukan dibiarkan berbeda diam-diam. Semua langkah voice di
   bawah menunggu ini.
   *(Kalau tetap OpenClaw: PowerShell admin →*
   `netsh advfirewall firewall add rule name="Torang Stage 8787" dir=in action=allow protocol=TCP localport=8787`
   *, cloud hidup, lalu di WSL* `bash tools/openclaw/pasang-jembatan-openclaw.sh`*.)*
2. **Susulkan parser kalimat**: `buka`/`tutup` sudah jalan lewat CLI & cloud tapi
   `torang-cue.mjs` masih menjawab "belum tersedia — fase 2". Kecil, tapi harus
   beres sebelum demo suara.
3. **Voice penuh**: mic PTT + Whisper lokal (nol baris sekarang) + toast
   konfirmasi 1 dtk (ditunda sadar di D16). Target: acceptance fase 1 §14.1.
4. **Aset reaction `rx_*` + SFX `sfx_*`** — belum ada satu pun; memblokir hotkey
   F1–F4 dan `sfx_hatch` fase 2.
5. **Deploy `stage.torang.ai`** di VPS torang-sg-1 (Docker+Caddy+TLS) — belum
   ada SSH; roster pindah Postgres (D14). Selama cloud hidup di mesin guru,
   acceptance poin 5 ("internet diputus") **tidak bisa diuji jujur**.
6. **Packaging**: installer NSIS tanpa Node + student-only ramping + code
   signing + autostart murid (belum ada `Tray`/`setLoginItemSettings`).
7. **Fase 2**: telemetri pixel office (fork Star-Office; spec v2 di torangapp)
   → X1 hatch → X2 milestone. **Belum disentuh sama sekali** kecuali slot
   `client_id` di binding.

Open item menunggu tim: **kalibrasi geometri arah (D4) di ruangan asli — harus
sebelum klip asli diproduksi, kalau arah salah klip dibuat ulang** · art Hadi
(bg + sprite) · kebijakan join_key per batch · pengadaan GPU ≥4 output + kabel
HDMI aktif/HDBaseT ke TV3/TV4 + mic PTT (**belum ada spek tertulis maupun
pengajuan**) · provision stage.torang.ai.

## Cara menjalankan (ringkas)

- **PC guru (dev/kelas):** `jalankan-cloud-lan.bat` (terima kunci sbg argumen)
  → `npm run dev:app`. Panel web: `http://127.0.0.1:8787/panel`.
- **PC murid:** `tools/PASANG-MURID.bat` (sekali) → "Torang Kelas.bat" di
  Desktop → murid ketik nama.
- **Uji cepat di satu mesin:** 3 terminal — `npm run dev:cloud` ·
  `npm run dev:app` · `npm run dev:student`.
- **Kendali dari baris perintah:** `tools/cli/torang.cmd state` · `torang sapa komp6`
  · `torang puter tes tv1` · `torang buka office tv3`.

## Cara kerja dengan Claude (Cowork) — pola yang terbukti

- Claude membangun di sandbox → **zip (isi flat + .git)** → kirim ke
  `D:\projects\torang-stage` → ekstrak → **verifikasi md5 dua sisi** → commit
  sudah termasuk → **Hadi yang push** (`bash tools/push-ke-github.sh`; Claude
  TIDAK BISA push — token read-only).
- **Setiap perubahan WAJIB dicatat** di `D:\projects\torangapp\_changelog\`
  + satu baris di `INDEX.md`. Perubahan MAYOR/STRUKTUR: backup dulu ke
  `_backup\<nama-sama-dengan-catatan>\`.
- **JANGAN pernah menaruh file di `.github/workflows/`** untuk di-push —
  kredensial Hadi tanpa scope `workflow`; CI diaktifkan via web UI memakai
  `tools/ci-test.yml`.
- Jebakan yang sudah dibayar mahal (jangan diulang): BOM dari PowerShell 5.1
  (D15/insiden mode teacher) · globalShortcut Ctrl+Alt+huruf (D17) · profil
  firewall vEthernet WSL = Public · `unzip -o` gagal di mount Cowork (delete
  dilarang) · skill Hermes di folder yang salah (16 Sep).
- Update PC murid = push lalu jalankan installer lagi di PC-nya.
- Setiap rilis: perbarui `STATUS-PROYEK.md` ini + `DECISIONS.md` bila ada
  keputusan baru. **Tag repo juga** — v0.3.3 tertinggal 4 minggu di belakang
  kode, dan itu yang membuat dokumen ini sempat bohong.
