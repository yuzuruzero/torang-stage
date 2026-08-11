# Log Keputusan Teknis (wewenang programmer — master §15)

Format ringkas: keputusan → alasan → catatan. Keputusan PRODUK tidak diulang di
sini (lihat master doc; itu terkunci).

## D1 · TypeScript di semua paket, monorepo npm workspaces
`packages/shared` (protokol) + `apps/cloud` + `apps/theater`. Alasan: satu
bahasa untuk cloud & Electron; kontrak pesan dibagi sebagai **source TS**
(tanpa build step terpisah) — cloud memakai `tsx`, theater dibundel esbuild.
Catatan: saat packaging NSIS nanti tambah langkah build resmi.

## D2 · HTTP = Fastify, WS = `ws`, validasi = zod (v4)
Alasan: ringan, matang, TS-friendly. **Validasi DUA SISI**: cloud memvalidasi
semua input; endpoint memvalidasi ulang cue + whitelist type/target dan menolak
yang asing (ACK `rejected`) — prinsip "jangan percaya perintah mentah".

## D3 · Penyimpanan fase 1 = in-memory + log JSONL
Show-state, registry, ACK = ephemeral (memang state pertunjukan); jejak ke
`apps/cloud/logs/cue-log.jsonl`. **Postgres masuk saat login sederhana &
binding (§8)** — skema tabel sudah ditetapkan master doc. Alasan: jangan bawa
DB sebelum ada data yang benar-benar butuh tahan lama.

## D4 · Geometri arah = RING searah jarum jam `[tv1, tv2, tv3, tv4]`
`pindah` memilih jalur ring terpendek; seri (layar berseberangan) → searah
jarum jam. Searah jarum jam = `exit_r` disambut `enter_l` (HUKUM §6 dijaga
`resolveDirection` + test). **ASUMSI yang perlu kalibrasi di ruangan asli
bersama tim video**; kelak jadi data registry per-ruangan, bukan konstanta.

## D5 · MOVE_CHARACTER di wire diurai jadi 2 cue PLAY_VIDEO
Exit di layar asal (T) + enter di tujuan (T + durasi_exit − overlap 300 ms);
enter membawa `payload.then_asset` (idle loop). Alasan: satu cue = satu
target+aset+waktu — sederhana & sinkron; sesuai §3.3 ("kombinasi otomatis").
Durasi dari manifest (diukur ffprobe saat generate aset).

## D6 · REPLAY ("ulang") = cue terakhir ber-role materi/enter, transisi di-CUT
Enter di-replay sebagai keadaan akhirnya (idle di layar tujuan) tanpa transisi.
Simplifikasi fase 1 — tinjau ulang saat rundown modul asli ada.

## D7 · Electron: esbuild, tanpa framework UI, jembatan IPC sempit
main+preload = CJS node, renderer = IIFE browser. `contextIsolation` aktif,
renderer tanpa Node; preload hanya mengekspos kanal yang didefinisikan
(`global.d.ts`). Panel operator masih vanilla TS — React dipertimbangkan saat
panel membesar (rundown pohon, antrean unbound, dsb).

## D8 · Hotkey global menembak API cloud, BUKAN playback lokal
`Ctrl+Alt+G/S/R` → `POST /api/intent` → cue kembali via WS. Alasan: menguji
jalur cue yang SAMA dengan voice nanti (§14 "hotkey GO manual DULUAN — jalur
cue teruji tanpa STT"); hotkey tetap backup senyap saat voice gagal.

## D9 · Audio dari window panel (mesin guru) → PA; video TV muted
Elemen `<audio>` tersembunyi di panel operator, dijadwalkan pada `start_at`
yang sama dengan video (keputusan #5: satu PA sentral). Sinkron TV↔PA trivial
karena satu mesin (keputusan #9).

## D10 · Auth fase 1 = `room_key` (REST + WS hello), SHA-256 + timingSafeEqual
Default dev `dev-room-key` (cloud memperingatkan). TLS urusan Caddy saat deploy.
Kebijakan join_key per-batch (statik vs rotasi) = open item tim — slot sudah ada.
Cloud bind `127.0.0.1` secara default; `TORANG_HOST=0.0.0.0` eksplisit bila perlu.

## D11 · Aset placeholder DI-COMMIT (total ~140 KB)
Supaya `npm install && npm run dev` langsung jalan tanpa ffmpeg di Windows.
Regenerasi: `npm run assets` (ffmpeg; di Windows bisa lewat WSL). Penamaan file
mengikuti kontrak §6 (`m99_{jenis}_tes.*` + `_audio.m4a`) + `manifest.json`
dengan durasi terukur.

## D12 · Waktu: `start_at` absolut jam server; offset klien via ping/pong
Offset = `server_now + rtt/2 − now`, dikirim balik ke cloud (tanda merah panel
bila >250 ms, §7). STOP tanpa lead (langsung). Ketepatan terukur di smoke test:
telat 0–1 ms (satu mesin).

## D13 · EOL & git
`.gitattributes`: `*.sh` LF, `*.bat`/`*.ps1` CRLF (pelajaran repo torang-murid);
aset biner ditandai `binary`. Skrip `.sh` di-`chmod +x` sebelum commit.

## D14 · (v0.2.0, amandemen D3) Roster/binding fase 1 = file JSON, bukan DB
Login sederhana §8 disimpan `apps/cloud/logs/bindings-{cohort}.json` (tahan
restart); daftar murid = `config/cohort-dev.json` (diinput admin/implementor).
Alasan: dev di Windows Hadi tanpa Docker/DB; datanya kecil; BENTUKNYA mengikuti
tabel §8 (`students`, `seats`, `bindings`) supaya migrasi ke Postgres di
torang-sg-1 mekanis. Field `client_id` sudah ada (diisi fase 2 file-watcher).

## D15 · (v0.2.0) Keputusan mode student
- **room_key hanya di proses main** — renderer login memanggil API lewat IPC,
  tidak pernah memegang kunci (least privilege).
- Overlay tampil dengan `showInactive()` — sopan, TIDAK merebut fokus (#6).
- Ketukan (PLAY_VIDEO ke komp) **click-gated**: ACK berhenti di `scheduled`
  sampai murid mengklik → `played` setelah materi selesai. Status jujur:
  panel melihat siapa yang belum membuka.
- Cue yang terpotong STOP tetap berstatus `scheduled` tanpa `played` (dikenal;
  kandidat status `stopped` di protokol menyusul bila mengganggu di gladi).
- GLOW = satu window fullscreen transparan click-through. **Verifikasi
  transparansi di Windows asli wajib** (di Xvfb headless jatuh ke hitam —
  artefak compositing). Fallback yang sudah dirancang bila bermasalah:
  4 window bar tepi (menghitam pun hanya menutup 14 px pinggir).
- Multi-instance satu mesin dev: `userData` dipisah per peran/kursi.

## D16 · (v0.3.0) Jembatan OpenClaw = TEKS dulu, parser deterministik di skrip
Alur voice §2.1 dicicil dari belakang: skill OpenClaw guru meneruskan kalimat
APA ADANYA ke `torang-cue.mjs`; parser grammar §5 (kosakata tertutup, angka
kata satu–dua puluh) yang menentukan intent — LLM tidak pernah memutuskan
aksi; kalimat asing DITOLAK dengan pesan jelas. Kosakata alias dari
`GET /api/vocab` (manifest = sumber kosakata §6), cloud tetap memvalidasi
ulang. Konfirmasi-toast 1 dtk (§5) DITUNDA ke tahap PTT/Whisper — ketikan
sudah tindakan sadar, mic yang rawan salah dengar. "glow" ditambahkan sebagai
aksi EKSTENSI di luar 8 kata resmi (praktis untuk uji; tim kurikulum boleh
mencoret). "buka" (scene/pixel office) ditolak jujur: fase 2.

## D17 · (v0.2.6) JANGAN globalShortcut `Ctrl+Alt+HURUF` di Windows
Setara AltGr+huruf → mengganggu pengetikan aplikasi lain selama app hidup
(insiden Claude desktop 11 Agu, terkonfirmasi hilang setelah pindah).
Hotkey = tombol F: `Ctrl+Alt+F9/F10/F11`; `hotkeys:false` mematikan total.
