# torang-stage — Panggung Torang (Theater of AI)

Codebase Fase 1: **cloud control plane** (calon `stage.torang.ai`) + **app
Electron** satu codebase (mode `teacher` & `student`) untuk sistem pertunjukan
kelas Theater of AI.

Sumber kebenaran produk: `panggung-torang-MASTER-programmer.md` (folder
`torangapp`) — semua keputusan arsitektur TERKUNCI di sana. Keputusan teknis
yang jadi wewenang programmer (§15) dicatat di [`DECISIONS.md`](DECISIONS.md).

## Status (v0.2.0 — 11 Agu 2026)

Terbangun & teruji (54 unit/e2e test + smoke test Electron headless
teacher+student):

- ✅ Cloud minimal: registry endpoint · WS cue router (`start_at` T+1.5 dtk, ACK
  per cue, timeout jelas) · show-state (arah exit/enter OTOMATIS — disiplin
  arah §6) · panel guru web (`/panel`) · auth room_key.
- ✅ App teacher: panel operator + 4 window TV (scene idle/show-video) + audio
  → PA (dari mesin guru) + **hotkey global GO/STOP/ULANG lewat jalur cue penuh**
  (sesuai §14: hotkey DULUAN, voice belakangan) + reconnect otomatis.
- ✅ Modul dummy `m99` alias **"tes"** end-to-end dengan aset placeholder
  (video teks/warna + beep — keputusan #20).
- ✅ **App student (v0.2.0)**: login sederhana (nama dari daftar cohort + kursi,
  bisa preset dari config mesin) · binding kursi↔nama TAHAN RESTART · overlay
  "jendela sopan" (greet bernama & ketukan — **murid yang mengklik** untuk
  fullscreen, tidak pernah merebut fokus) · GLOW pinggir layar (pulse/breathe/
  wave, click-through) · intent baru `SAPA` & `GLOW` · STOP membersihkan semua.
- ⬜ Voice (Whisper + parser + jalur OpenClaw) — terakhir fase 1.
- ⬜ Deploy `stage.torang.ai` di torang-sg-1 (Docker+Caddy) — setelah stabil lokal.

> Cek manual di Windows asli (tidak bisa diverifikasi di sandbox headless):
> window GLOW harus TRANSPARAN (di Xvfb jatuh ke hitam — artefak headless).
> Kalau di mesinmu layar menghitam saat glow, laporkan — fallback 4 bar tepi
> sudah dirancang.

## Naik ke GitHub & instal di PC murid

Lihat **[PANDUAN-PASANG-MURID.md](PANDUAN-PASANG-MURID.md)**: sekali push oleh
Hadi (`bash tools/push-ke-github.sh` dari WSL), lalu tiap PC murid dipasang
dengan `tools/PASANG-MURID.bat` (unduh zip repo — tanpa git di PC murid).
PC guru untuk uji LAN: `jalankan-cloud-lan.bat`.

## Cara menjalankan (dev, Windows/Linux/mac)

Prasyarat: **Node.js ≥ 20** (`node -v`) + internet untuk `npm install` pertama.

```bash
npm install          # sekali; mengunduh dependency + binari Electron

# Terminal 1 — cloud (lokal dulu):
npm run dev:cloud    # panel guru web: http://127.0.0.1:8787/panel

# Terminal 2 — app teacher:
npm run dev:app      # panel operator + 4 window TV kecil (layout dev)
```

Lalu coba (tombol di panel, atau hotkey global):

1. **GO** (`Ctrl+Alt+G`) → TV1 memutar materi "tes" + beep tiap detik (=audio
   PA); panel menunjukkan ACK `played`.
2. **GO** lagi → Torang **pindah ke TV3**: klip *exit ke kanan* di TV1 disambut
   *enter dari kiri* di TV3 (arah dihitung cloud dari show-state), lalu idle loop.
3. **GO** terus sampai rundown habis; **Ulang** (`Ctrl+Alt+R`) = replay CUT;
   **STOP** (`Ctrl+Alt+S`) = semua kembali idle.
4. Matikan cloud (Ctrl+C) → panel operator menunjukkan **TERPUTUS** dan app
   mencoba sambung ulang — gagal harus JELAS, bukan diam (§12).

**Mencoba mode student di mesin yang sama** (terminal ke-3):

```bash
npm run dev:student   # window kecil "Selamat datang di kelas Torang"
```

Pilih nama (daftar dev: Andi, Budi, Citra, …) + kursi (preset `komp1`) → Masuk
kelas. Lalu dari panel: **Sapa komp1** → kartu "Halo, {nama}!" meluncur masuk
di pojok tanpa merebut fokus; **Glow semua** → bingkai layar menyala; **Ketuk
komp1** → kartu ketukan muncul, klik → materi fullscreen, selesai → hilang.
Tombol GO menjalankan semuanya berurutan dari rundown dummy.

Konfigurasi per mesin: salin `apps/theater/torang-theater.config.example.json`
(atau `torang-student.config.example.json`) → `torang-theater.config.json`
(di-gitignore) dan sesuaikan; app juga menerima `--config=path`. Cloud
dikonfigurasi lewat env `TORANG_*` (lihat `apps/cloud/src/config.ts`).
Daftar murid dev: `apps/cloud/config/cohort-dev.json`.

## Test

```bash
npm test                        # unit + e2e jalur cue (tanpa Electron)
bash tools/smoke-headless.sh    # smoke test penuh dengan Electron (butuh Xvfb — sandbox/CI)
npm run assets                  # regenerasi aset placeholder (butuh ffmpeg)
```

## Struktur

```
packages/shared/   protokol cue + skema pesan + manifest (zod, validasi DUA SISI)
apps/cloud/        registry · show-state · planner (intent→cue) · WS router · panel web
apps/theater/      Electron: main (windows, ws, scheduler, hotkey) + renderer (tv, panel)
tools/             make-placeholders.mjs (aset dummy) · smoke-headless.sh
```

## Prinsip yang dijaga di kode (jangan dilanggar)

- Klien **memvalidasi ulang** setiap cue (schema + whitelist type/target);
  yang tak dikenal → ACK `rejected`, tidak dieksekusi. Tidak ada jalur dari cue
  ke perintah OS.
- Telemetri kelak SATU ARAH; cue hanya memutar konten/efek dalam app.
- STOP = kill switch, selalu tersedia (hotkey + panel + cloud).
- Kegagalan (endpoint offline, ACK timeout, cloud putus) tampil MERAH di panel —
  sistem gagal dengan jelas, bukan diam.
