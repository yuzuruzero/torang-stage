# 05 — Checklist Kesesuaian (diisi programmer → direview Hadi)

**Cara isi:** untuk tiap baris, isi kolom **Status** dengan salah satu:
`✅ sesuai` · `🟡 beda` (jelaskan) · `⬜ belum ada` · `➖ tidak relevan`.
Kolom **Kondisi sekarang** = apa yang benar-benar ada di kode hari ini (bukan rencana).
Baris **🟡 beda** WAJIB diisi alasannya — beberapa mungkin memang lebih baik dari spec.

Tanggal pengisian: ______ · Commit/branch yang dicek: ______

---

## A. Keputusan arsitektur (paling penting — cek dulu)

| # | Item | Cara cek cepat | Status | Kondisi sekarang |
|---|---|---|---|---|
| A1 | 4 TV = 4 BrowserWindow di app **teacher**, bukan endpoint/instance terpisah | Ada kode yang membuka window per display? Tidak ada "role tv" mandiri? | | |
| A2 | Satu codebase Electron, 2 mode `teacher` / `student` via config/arg | Cara memilih mode saat start? | | |
| A3 | Target Windows (packaging, autostart, path) | Build target & autostart mechanism | | |
| A4 | Cloud di server torang.ai, subdomain terpisah | URL/env yang dipakai | | |
| A5 | Cloud hanya mengirim pesan kecil; **video tidak pernah lewat cloud** saat kelas | Ada endpoint streaming/download saat cue? Seharusnya tidak | | |
| A6 | Aset ter-cache lokal + sync agent (delta by hash, saat idle) | Ada mekanisme sync? Manifest? | | |
| A7 | Scene-based murni di dalam app (tanpa mengatur window app lain di OS) | Ada kode focus/minimize aplikasi eksternal? Seharusnya tidak | | |
| A8 | **Semua audio dari mesin guru → PA**; video TV & murid muted | Cek elemen video `muted`; audio hanya diputar di teacher | | |
| A9 | Tidak ada relay LAN / offline mode | Ada kode fallback LAN broadcast? Seharusnya tidak (fase ini) | | |
| A10 | Identitas agent = `client_id`, bukan `agent_name`/hostname | Kunci di tabel/map memakai apa? | | |

## B. Protokol & kontrak

| # | Item | Cara cek | Status | Kondisi sekarang |
|---|---|---|---|---|
| B1 | Tipe cue sesuai 02 §B (`PLAY_VIDEO`, `MOVE_CHARACTER`, `SWITCH_SCENE`, `OVERLAY_KNOCK`, `OVERLAY_GREET`, `SFX`, `GLOW`, `STOP`, `GO`) | Enum/union di kode | | |
| B2 | Cue punya `start_at` terjadwal (~1.5 dtk di depan), bukan "mainkan sekarang" | Endpoint pre-load lalu mulai pada waktu? | | |
| B3 | Endpoint mengirim **ACK** per cue; panel menampilkannya | Ada pesan ACK dari endpoint? | | |
| B4 | Cue **bundle** (array dengan `start_at` sama) didukung | Router menerima array? | | |
| B5 | Tipe cue/event/DTO hidup di **satu package bersama** (tidak diduplikasi cloud vs desktop) | Ada `packages/contracts` atau setara? | | |
| B6 | REST minimal ada: register endpoint, session open/close, bind, login, cues, manifest, state | Daftar route | | |
| B7 | Kontrak event telemetri `agent_join` / `agent_room_change` / `agent_offline` (03 §D) | Emitter di fork host office | | |

## C. Show-state & arah

| # | Item | Cara cek | Status | Kondisi sekarang |
|---|---|---|---|---|
| C1 | Cloud menyimpan posisi Torang per ruangan (`character_on`, `last_dir`) | Ada state ini di server? | | |
| C2 | `MOVE_CHARACTER` dari guru hanya menyebut tujuan; **server** menjabarkan exit-asal + enter-tujuan | Logika ada di server, bukan di parser/klien? | | |
| C3 | Peta geometri ruangan (posisi TV & kursi) ada di registry | Konfigurasi ruangan | | |
| C4 | Klip transisi berarah (`enter_l/r`, `exit_l/r`) dipilih otomatis; arah konsisten | Uji: pindah TV1→TV2 memilih exit_r + enter_l | | |

## D. Suara & parser

| # | Item | Cara cek | Status | Kondisi sekarang |
|---|---|---|---|---|
| D1 | Whisper **lokal** di mesin guru (bukan API cloud) | Dependensi/engine yang dipakai | | |
| D2 | Mic PTT: audio hanya diproses saat tombol ditekan | Cara menangkap sinyal PTT | | |
| D3 | Parser = **whitelist tertutup** 8 aksi + target baku; normalisasi angka Indonesia | Daftar aksi di kode | | |
| D4 | Fuzzy match modul **hanya** pada alias manifest cohort aktif | Sumber daftar alias | | |
| D5 | **Toast konfirmasi 1 dtk** (Esc batal) sebelum cue dikirim | Ada jeda + tombol batal? | | |
| D6 | Eksekusi cue **melewati OpenClaw** (skill/tool memanggil API) | Alur dari teks → API | | |
| D7 | **Hotkey** GO/ULANG/STOP + F1–F4 reaction selalu aktif, bekerja **tanpa** suara | Uji tanpa mic | | |

## E. App student

| # | Item | Cara cek | Status | Kondisi sekarang |
|---|---|---|---|---|
| E1 | Login sederhana: nama + kursi per cohort; skema punya `external_user_id` nullable | Form + tabel | | |
| E2 | Overlay **"jendela sopan"**: tidak merebut fokus, murid klik → fullscreen | Perilaku window (always-on-top tanpa steal focus?) | | |
| E3 | GLOW pinggir layar (window transparan click-through) dengan preset | Ada preset `hatch_pulse`/`wave`/`breathe`? | | |
| E4 | Sapaan nama **teks saja** (tidak memutar audio di komp murid) | Tidak ada audio playback di student | | |
| E5 | File-watcher `client_id` → `POST /session/bind` otomatis | Path yang dipantau & endpoint yang dipanggil | | |
| E6 | Tray + autostart Windows | Mekanisme | | |

## F. App teacher

| # | Item | Cara cek | Status | Kondisi sekarang |
|---|---|---|---|---|
| F1 | Panel operator: rundown modular (bisa lompat), status endpoint, riwayat cue + ACK | Fitur panel | | |
| F2 | Scene manager per TV window: `idle`/`show-video`/`pixel-office`/`web-app` | Enum scene | | |
| F3 | `idle` = ambience/logo, bukan layar hitam | Tampilan default | | |
| F4 | Webview pixel office menunjuk `localhost` (host office satu mesin) | URL scene | | |
| F5 | Jembatan event: subscribe emitter lokal → WS cloud, **buffer + retry** saat putus | Ada antrean lokal? | | |
| F6 | Master switch efek otomatis per jenis; default mengikuti modul aktif | Toggle di panel | | |
| F7 | Antrean **unbound agent** + bind manual (dropdown kursi) | Fitur panel | | |
| F8 | Indikator skew jam & status internet/cloud yang JELAS (bukan diam) | Banner/warna status | | |

## G. Rules engine telemetri (fase 2)

| # | Item | Cara cek | Status | Kondisi sekarang |
|---|---|---|---|---|
| G1 | Dedup hatch: sekali per `client_id` per cohort (persisten, bukan hanya in-memory) | Tabel `hatch_state` atau setara | | |
| G2 | Min-gap 4 dtk; agregasi ≥3 join dalam 5 dtk → satu cue | Logika antrean | | |
| G3 | Milestone ambang 10/15/20 (konfigurasi per cohort) tepat sekali masing-masing | Uji mock | | |
| G4 | Aktif hanya setelah `/session/open` | Guard | | |
| G5 | `tools/mock-agents` ada: 20 join beruntun & bersamaan | Ada tool-nya? | | |

## H. Aset & manifest

| # | Item | Cara cek | Status | Kondisi sekarang |
|---|---|---|---|---|
| H1 | Penamaan `m{modul}_{jenis}_{slug}.mp4` + audio terpisah `{asset}_audio.m4a` | Contoh file/loader | | |
| H2 | Reaction pack global `rx_*` & SFX `sfx_*` | Daftar aset | | |
| H3 | `manifest.json` berisi `modules[].alias` & `presenter` — dan parser membaca alias dari sini | Sumber alias parser | | |
| H4 | Aset placeholder untuk uji dibuat sendiri (tidak menunggu tim video) | `seed-assets` atau setara | | |

## I. Yang seharusnya TIDAK ada (kalau ada, tandai 🟡 dan diskusikan)

| # | Item | Status | Kondisi sekarang |
|---|---|---|---|
| I1 | Relay LAN / offline mode | | |
| I2 | Instance app terpisah per TV / "server cabang" | | |
| I3 | Avatar live / lip-sync real-time | | |
| I4 | Kontrol lampu IoT | | |
| I5 | Mode ahli-live (sebelum fase 1–2 lolos) | | |
| I6 | Ranking/timer per murid di layar | | |
| I7 | Audio playback di komputer murid | | |
| I8 | Parser suara yang membiarkan LLM mengarang aksi di luar whitelist | | |

## J. Ringkasan untuk Hadi (diisi programmer)
- Fase yang sedang dikerjakan: ______
- Item 🟡 beda yang perlu keputusan: ______
- Item ⬜ yang memblokir acceptance fase 1: ______
- Estimasi lolos acceptance fase 1: ______
- Pengadaan yang sudah/belum diajukan (GPU, kabel, mic PTT): ______
