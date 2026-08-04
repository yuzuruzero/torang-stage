# torang-stage — Panggung Torang (Theater of AI)

Codebase Fase 1: **cloud control plane** (calon `stage.torang.ai`) + **app
Electron** satu codebase (mode `teacher` & `student`) untuk sistem pertunjukan
kelas Theater of AI.

Sumber kebenaran produk: `panggung-torang-MASTER-programmer.md` (folder
`torangapp`) — semua keputusan arsitektur TERKUNCI di sana. Keputusan teknis
yang jadi wewenang programmer (§15) dicatat di [`DECISIONS.md`](DECISIONS.md).

## Status (v0.1.0 — 4 Agu 2026)

Terbangun & teruji (36 unit/e2e test + smoke test Electron headless):

- ✅ Cloud minimal: registry endpoint · WS cue router (`start_at` T+1.5 dtk, ACK
  per cue, timeout jelas) · show-state (arah exit/enter OTOMATIS — disiplin
  arah §6) · panel guru web (`/panel`) · auth room_key.
- ✅ App teacher: panel operator + 4 window TV (scene idle/show-video) + audio
  → PA (dari mesin guru) + **hotkey global GO/STOP/ULANG lewat jalur cue penuh**
  (sesuai §14: hotkey DULUAN, voice belakangan) + reconnect otomatis.
- ✅ Modul dummy `m99` alias **"tes"** end-to-end dengan aset placeholder
  (video teks/warna + beep — keputusan #20).
- ⬜ App student (login + overlay sopan + GLOW) — langkah berikutnya.
- ⬜ Voice (Whisper + parser + OpenClaw) — terakhir fase 1.
- ⬜ Deploy `stage.torang.ai` di torang-sg-1 (Docker+Caddy) — setelah stabil lokal.

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

Konfigurasi per mesin: salin `apps/theater/torang-theater.config.example.json`
→ `torang-theater.config.json` (di-gitignore) dan sesuaikan. Cloud dikonfigurasi
lewat env `TORANG_*` (lihat `apps/cloud/src/config.ts`).

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
