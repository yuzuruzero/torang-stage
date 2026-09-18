# 05 — Checklist Kesesuaian (TERISI)

**Diisi:** 17 Sep 2026 · **Folder yang dicek:** `D:\projects\torang-stage`
**Versi repo:** v0.3.3 (tag terakhir 18 Agu) **+ pekerjaan belum ditag 7–16 Sep**
(CLI `torang`, `torang-modul`, skill Hermes, scene office, `transisi_default`,
perbaikan "tinggalkan layar lama"). Git commit belum dicek — penilaian ini dari
isi berkas kerja, bukan dari tag rilis.
**Diisi oleh:** sesi Cowork (audit kode), untuk diverifikasi Hadi.

Legenda: `✅ sesuai` · `🟡 beda` · `⬜ belum ada` · `➖ tidak relevan`

> Catatan penting sebelum membaca: paket dokumen ini bertanggal 16 Sep 2026,
> sedangkan repo ini sudah dibangun sejak 4 Agu mengacu
> `panggung-torang-MASTER-programmer.md`. Jadi sebagian besar "beda" di bawah
> BUKAN salah arah — melainkan (a) fase 2/3 yang memang belum dikerjakan, atau
> (b) keputusan teknis yang sudah tercatat di `DECISIONS.md` (D1–D17).

---

## A. Keputusan arsitektur

| # | Item | Status | Kondisi sekarang |
|---|---|---|---|
| A1 | 4 TV = 4 BrowserWindow di app teacher | ✅ | `apps/theater/src/main/windows.ts` → `buatWindowTv()` membuka window per display (kiosk fullscreen bila ≥5 display; grid 2×2 saat dev, `dev_tv_count` untuk PC lemah). Peran WS hanya `teacher`/`student`/`panel` — **tidak ada role "tv" mandiri**. Tambahan di luar spec: tombol "Buka ulang window TV" + menutup panel = menutup 4 TV (insiden uji 16 Sep). |
| A2 | Satu codebase Electron, 2 mode | ✅ | `mode: "teacher" \| "student"` di `torang-theater.config.json`, dipilih lewat `--config=<file>`. Config rusak/BOM → **gagal keras**, tidak diam-diam jatuh ke default (insiden PC murid jadi panggung, 11 Agu). |
| A3 | Target Windows | 🟡 | Installer Windows ada (`tools/PASANG-GURU.bat`, `PASANG-MURID.bat` + `.ps1`): kunci ruangan, firewall, deteksi IP LAN, shortcut Desktop. **Belum ada**: packaging NSIS tanpa Node, code signing, dan **autostart** (murid membuka "Torang Kelas.bat" manual). |
| A4 | Cloud di server torang.ai, subdomain terpisah | 🟡 | Kode siap (semua alamat dari env/config: `TORANG_HOST/PORT/ROOM_KEY`), tapi **cloud masih dijalankan di mesin guru** (`127.0.0.1:8787`, `jalankan-cloud-lan.bat`). `stage.torang.ai` belum di-provision — belum ada SSH ke torang-sg-1. **Ini pembeda terbesar terhadap dokumen.** |
| A5 | Video tidak pernah lewat cloud | ✅ | Cue hanya membawa **nama aset**; berkas diresolusi lokal (`assets.ts` → `pathToFileURL(assets_dir/…)`). Tidak ada endpoint streaming/unduh aset saat kelas. |
| A6 | Aset ter-cache lokal + sync agent (delta by hash) | 🟡 | Cache lokal + manifest: **ada** (`assets-dev/manifest.json`, skema punya slot `sha256`). **Sync agent: belum ada** — aset di-commit ke repo; update PC murid = jalankan installer lagi. `torang-modul ambil <url>` sudah bisa mengunduh video baru **di mesin guru** (5 lapis pemeriksaan, penentu `ffprobe`), tapi belum ada distribusi otomatis ke 20 komp. |
| A7 | Scene-based murni, tanpa mengatur window app lain | ✅ | Tidak ada `exec/spawn`, tidak ada pemanggilan window OS di `apps/theater/src/main/*`. |
| A8 | Semua audio dari mesin guru → PA; video muted | ✅ | `tv.html`: `<video id="video" muted …>`. Audio = `<audio id="pa">` **di panel operator mesin guru** (D9), dijadwalkan pada `start_at` yang sama. Mode student **tidak punya elemen audio sama sekali**. |
| A9 | Tidak ada relay LAN / offline mode | ✅ | Tidak ada kode fallback LAN broadcast. (Catatan jujur: cloud *saat ini* kebetulan hidup di mesin guru dan diakses lewat LAN — itu akibat A4 belum beres, bukan fitur relay.) |
| A10 | Identitas agent = `client_id` | 🟡 | Field `client_id` **sudah ada** di struktur binding (`roster.ts`, nullable, bertahan lintas login/kursi) — tapi belum ada yang mengisinya. Identitas kursi saat ini `student_id`. Slot siap, alur fase 2. |

## B. Protokol & kontrak

| # | Item | Status | Kondisi sekarang |
|---|---|---|---|
| B1 | 9 tipe cue | 🟡 | Kesembilan tipe **ada di `CueTypeSchema`** (`packages/shared/src/protocol.ts`). Yang **berperilaku**: `PLAY_VIDEO`, `STOP`, `SWITCH_SCENE` (teacher) · `PLAY_VIDEO`, `OVERLAY_GREET`, `GLOW`, `STOP` (student). `SFX` dan `OVERLAY_KNOCK` **baru tipe, belum ada handler** — ketukan sekarang dikirim sebagai `PLAY_VIDEO` ke komp (click-gated). `MOVE_CHARACTER` sengaja **diurai di server** jadi 2 `PLAY_VIDEO` (D5) — sesuai maksud 02 §B, beda bentuk di wire. |
| B2 | `start_at` terjadwal ~1.5 dtk | ✅ | `LEAD_MS = 1500`; endpoint pre-load lalu mulai pada waktu. `STOP` sengaja tanpa lead (saklar darurat). Ketepatan terukur smoke test: telat 0–1 ms (satu mesin). |
| B3 | ACK per cue, tampil di panel | ✅ | Status: `received / scheduled / played / rejected / error` + `detail` + `will_play_at`. Tampil di panel web `/panel`. Cue murid yang belum diklik jujur berhenti di `scheduled` — guru bisa lihat siapa yang belum membuka. |
| B4 | Cue bundle | ✅ | Planner mengembalikan array cue; router mengirim sebagai bundle. Catatan: bundle `pindah` sengaja **beda `start_at`** (enter = exit + durasi − overlap 300 ms), bukan serentak. |
| B5 | Tipe hidup di satu package bersama | ✅ | `packages/shared` (`@torang/shared`) dipakai cloud + Electron + test. Tidak ada duplikasi tipe. |
| B6 | REST minimal | 🟡 | **Ada**: `/api/state`, `/api/vocab`, `/api/intent`, `/api/login`, `/api/login/options`, `/api/roster/reset`, `/api/unbind`, `/api/rundown/reset`, `/api/manifest/reload`. **Belum ada**: `/session/open`, `/session/close`, `/session/bind`, `GET /manifest/:vertical`. **Beda disengaja**: registrasi endpoint lewat **WS `hello`**, bukan `POST /endpoints/register` (satu jalur, sekalian auth `room_key` + ukur skew). `state` belum per-`:room` — cloud ini masih satu ruangan. |
| B7 | Kontrak event telemetri | ⬜ | Belum ada. Fork host office belum disentuh. |

## C. Show-state & arah

| # | Item | Status | Kondisi sekarang |
|---|---|---|---|
| C1 | Cloud menyimpan posisi Torang | ✅ | `show-state.ts`: `{ screen, lastDir, activeModule, scenes }`. 🟡 satu ruangan per proses (belum map per-room), dan in-memory (D3 — memang state pertunjukan). |
| C2 | Server menjabarkan exit+enter | ✅ | `planner.planMove()`. Guru/parser hanya menyebut tujuan. |
| C3 | Peta geometri di registry | 🟡 | Masih **konstanta di kode**: `DEFAULT_GEOMETRY.ring = [tv1,tv2,tv3,tv4]` searah jarum jam (D4). Posisi kursi murid belum ada. D4 sudah menandai ini **asumsi yang perlu kalibrasi di ruangan asli** lalu pindah ke registry. |
| C4 | Klip berarah dipilih otomatis, arah konsisten | ✅ | `resolveDirection()` + `oppositeDirection()` — exit_r selalu disambut enter_l; ada test khusus. **Bonus di luar checklist:** bug lama ditemukan saat uji 16 Sep — `puter` ke TV lain memindahkan Torang tanpa memberi tahu layar lama (Torang tampak di 3 tempat). Sekarang layar lama ditinggalkan dengan klip exit (`cueTinggalkanLayar`). |

## D. Suara & parser

| # | Item | Status | Kondisi sekarang |
|---|---|---|---|
| D1 | Whisper lokal | ⬜ | **Nol baris.** Tidak ada dependensi STT apa pun di repo. |
| D2 | Mic PTT | ⬜ | Belum ada. |
| D3 | Parser whitelist tertutup + angka Indonesia | ✅ | `tools/openclaw/torang-cue.mjs`: grammar tertutup, angka kata satu–dua puluh, kalimat asing **DITOLAK** dengan pesan jelas (14 test). Aksi: `puter, pindah, lanjut, ulang, stop, sapa, glow`. 🟡 **DRIFT yang perlu dibereskan:** cloud & CLI sudah mendukung `buka`/`tutup` (scene), tapi parser kalimat masih menjawab *"buka … belum tersedia — fase 2"*. |
| D4 | Fuzzy match hanya pada alias manifest | ✅ (lebih ketat) | Alias ditarik dari `GET /api/vocab` yang bersumber manifest. Pencocokan saat ini **persis (exact, case-insensitive)**, bukan fuzzy — lebih aman untuk jalur teks; fuzzy baru perlu saat masuk suara. |
| D5 | Toast konfirmasi 1 dtk | ⬜ (ditunda sadar) | D16: ditunda ke tahap PTT/Whisper — "ketikan sudah tindakan sadar, mic yang rawan salah dengar". Harus ada sebelum acceptance fase 1 poin 1. |
| D6 | Eksekusi cue melewati OpenClaw | 🟡 | Skill `panggung-torang` + pemasang WSL **ada**, tapi **belum pernah terpasang** — macet firewall (adapter vEthernet WSL dihitung profil Public). Sementara itu muncul **dua jalur baru**: CLI `tools/cli/torang.mjs` (guru/implementor) dan **skill Hermes** (`tools/hermes/`, terbukti jalan di PC guru 16 Sep). **Butuh keputusan Hadi:** jalur agent resmi = OpenClaw atau Hermes? |
| D7 | Hotkey selalu aktif tanpa suara | 🟡 | `Ctrl+Alt+F9/F10/F11` = GO/STOP/ULANG → `POST /api/intent` (jalur cue yang **sama** dengan voice nanti, D8). **Belum ada F1–F4 klip reaction** — aset `rx_*` juga belum ada. ⚠ D17: jangan pernah pakai `Ctrl+Alt+HURUF` di Windows (= AltGr+huruf, merusak pengetikan app lain). |

## E. App student

| # | Item | Status | Kondisi sekarang |
|---|---|---|---|
| E1 | Login nama + kursi; `external_user_id` nullable | 🟡 | Login nama + kursi **ada** (kursi preset per PC, murid tinggal ketik nama; bentrok kursi ditolak dengan pesan manusiawi). Penyimpanan = JSON `bindings-{cohort}.json` (D14, bentuk mengikuti tabel §8 supaya migrasi Postgres mekanis). **Field `external_user_id` belum ada** — yang ada `student_id` + `client_id`. |
| E2 | Overlay "jendela sopan" | ✅ | `showInactive()` — muncul tanpa merebut fokus; ketukan **click-gated**: murid yang mengklik → fullscreen. |
| E3 | GLOW click-through + preset | 🟡 | Window transparan `setIgnoreMouseEvents(true, {forward:true})`, preset `pulse` / `breathe` / `wave`. **Nama beda** dari dokumen (`hatch_pulse` → `pulse`). ⚠ **Transparansi di Windows asli belum dilaporkan** (di headless jatuh ke hitam); fallback 4 bar tepi sudah dirancang (D15) tapi belum dibangun. |
| E4 | Sapaan teks saja | ✅ | Tidak ada elemen/pemutaran audio di mode student sama sekali. |
| E5 | File-watcher `client_id` → bind | ⬜ | Belum ada. |
| E6 | Tray + autostart Windows | ⬜ | Tidak ada `Tray` maupun `setLoginItemSettings` di kode. Murid membuka shortcut Desktop manual. |

## F. App teacher

| # | Item | Status | Kondisi sekarang |
|---|---|---|---|
| F1 | Panel: rundown modular (bisa lompat), status endpoint, riwayat cue + ACK | 🟡 | Status endpoint, riwayat cue + ACK, dropdown modul (dari `/api/vocab`) × 27 target, sapa/ketuk/glow, lepas kursi, reset kelas — **ada**. Rundown masih **pointer linear** (`GO` maju satu langkah, hanya bisa di-reset); **lompat bebas / pohon segmen belum ada**. |
| F2 | Scene manager per TV | ✅ | `idle` / `show-video` / scene webview. **Lebih baik dari spec:** `pixel-office` dan `web-app` disatukan jadi satu mekanisme — cue hanya membawa **nama** scene, URL dipetakan di config mesin guru (`scenes: { office: "http://127.0.0.1:19000" }`). Artinya cue dari jaringan **tidak pernah bisa** menyuruh TV membuka alamat sembarangan; ada test otomatis "cue tidak boleh mengandung http". |
| F3 | `idle` bukan layar hitam | ✅ | Logo "TORANG" bernapas (`tv.html #idle`). |
| F4 | Webview office → `localhost` | ✅ | Default `http://127.0.0.1:19000`. TV yang sedang ber-scene **keluar dari cincin arah** — Torang tidak akan menimpa layar monitoring (keputusan Hadi 16 Sep). |
| F5 | Jembatan event telemetri + buffer/retry | ⬜ | Belum ada. |
| F6 | Master switch efek otomatis | ⬜ | Belum ada (belum ada efek otomatis untuk di-switch). |
| F7 | Antrean unbound + bind manual | ⬜ | Belum ada. (`/api/unbind` = melepas kursi murid, hal yang berbeda.) |
| F8 | Indikator skew & status koneksi | 🟡 | Skew: **ada**, >250 ms merah di panel web. Status koneksi panel + reconnect otomatis: **ada**. **Belum diuji**: perilaku saat internet benar-benar mati (acceptance fase 1 poin 5) — sekarang cloud lokal, jadi skenario itu belum pernah terjadi sungguhan. |

## G. Rules engine telemetri (fase 2)

| # | Item | Status | Kondisi sekarang |
|---|---|---|---|
| G1 | Dedup hatch per `client_id` | ⬜ | Belum ada. |
| G2 | Min-gap 4 dtk + agregasi | ⬜ | Belum ada. |
| G3 | Milestone 10/15/20 | ⬜ | Belum ada. |
| G4 | Guard `/session/open` | ⬜ | Belum ada (endpoint sesi juga belum ada — lihat B6). |
| G5 | `tools/mock-agents` | ⬜ | Belum ada. |

## H. Aset & manifest

| # | Item | Status | Kondisi sekarang |
|---|---|---|---|
| H1 | Penamaan `m{modul}_{jenis}_{slug}` + audio terpisah | ✅ | `m99_materi_tes.mp4`, `m99_enter_l_tes.mp4`, …, `m99_materi_tes_audio.m4a`. Jenis persis 7 macam sesuai kontrak. |
| H2 | Reaction pack `rx_*` & SFX `sfx_*` | ⬜ | Belum ada satu pun. Memblokir hotkey F1–F4 (D7) dan `sfx_hatch` (fase 2). |
| H3 | Manifest `alias` + `presenter`, sumber kosakata parser | 🟡 | `alias` ✅, `presenter` ✅, dan parser memang membaca alias dari manifest (lewat `/api/vocab`) ✅. **Beda**: belum ada `vertical`, dan `modules[].cues[]` tidak ada — pemetaan cue dihitung runtime oleh planner, bukan disimpan di manifest. **Tambahan di luar dokumen**: `transisi_default` — modul baru yang cuma punya klip materi boleh **meminjam** klip enter/exit/idle, supaya video baru cukup satu berkas dan Torang tidak terkunci di satu layar (permintaan Hadi 16 Sep). |
| H4 | Placeholder dibuat sendiri | ✅ | `tools/make-placeholders.mjs` (ffmpeg) + aset m99 ~140 KB **di-commit** supaya `npm install && npm run dev` langsung jalan tanpa ffmpeg di Windows (D11). |

## I. Yang seharusnya TIDAK ada

| # | Item | Status | Kondisi sekarang |
|---|---|---|---|
| I1 | Relay LAN / offline mode | ✅ tidak ada | — |
| I2 | Instance per TV / server cabang | ✅ tidak ada | Satu app teacher, 4 window. |
| I3 | Avatar live / lip-sync | ✅ tidak ada | Murni pemutar video. |
| I4 | Kontrol lampu IoT | ✅ tidak ada | — |
| I5 | Mode ahli-live | ✅ tidak ada | Tidak ada WebRTC di repo. |
| I6 | Ranking/timer per murid | ✅ tidak ada | Panel hanya menampilkan online/offline + nama. |
| I7 | Audio di komputer murid | ✅ tidak ada | Mode student tanpa elemen audio. |
| I8 | Parser yang membiarkan LLM mengarang aksi | ✅ tidak ada | Parser deterministik di skrip; `SKILL.md` melarang agent memanggil API langsung atau menyusun ulang kalimat yang ditolak; cloud memvalidasi ulang dengan zod (validasi dua sisi, D2); klien menolak cue asing dengan ACK `rejected`. |

---

## J. Ringkasan untuk Hadi

**Fase yang sedang dikerjakan:** Fase 1, sekitar **75% jalur panggung** — seluruh
rantai *intent → cloud → cue → TV/komp murid* sudah hidup dan **terbukti lintas
mesin** (sapa + glow sampai di PC murid). Yang tersisa di fase 1 hampir semuanya
**jalur suara** dan **deploy**. Fase 2 (telemetri) **belum disentuh sama sekali** —
selain slot `client_id` yang sudah disiapkan. 93 test otomatis hijau.

**Item 🟡 yang perlu keputusan Hadi:**

1. **Jalur agent: OpenClaw atau Hermes?** (D6) Skill OpenClaw tidak pernah berhasil
   terpasang (firewall WSL), sementara skill Hermes sudah terbukti jalan di PC guru.
   Dokumen 01 #3 mengunci "OpenClaw di mesin guru" — kalau Hermes yang dipakai,
   keputusan itu perlu diamandemen resmi. **Ini yang paling mendesak.**
2. **Parser kalimat tertinggal dari cloud** — `buka`/`tutup` (scene office di TV)
   sudah jalan lewat CLI tapi masih ditolak parser kalimat. Sekadar menyusul, tapi
   harus dilakukan sebelum demo suara.
3. **Nama preset GLOW** beda (`pulse` vs `hatch_pulse`) — sepele, tapi kalau
   dokumen 03 dipakai apa adanya nanti bentrok. Samakan sekarang atau kunci nama
   yang di kode.
4. **`MOVE_CHARACTER` diurai di server jadi 2 `PLAY_VIDEO`** (D5) dan **registrasi
   endpoint lewat WS `hello`** (bukan REST) — dua-duanya sengaja dan menurut saya
   lebih sederhana, tapi beda bentuk dari 02 §B/§C. Minta restu supaya tidak
   dianggap penyimpangan nanti.
5. **Geometri ring [tv1→tv2→tv3→tv4] masih asumsi** (D4). Perlu satu jam di ruangan
   Central Park bersama tim video untuk mengunci arah, sebelum klip asli diproduksi —
   kalau arah salah, klip harus dibuat ulang.

**Item ⬜ yang memblokir acceptance fase 1:**

| Yang memblokir | Poin acceptance |
|---|---|
| Whisper lokal + mic PTT + toast konfirmasi | 1, 2, 3 (semua "tanpa menyentuh keyboard") |
| Aset `rx_*` + hotkey F1–F4 | 4 (sebagian; GO/STOP/ULANG sudah lolos) |
| Deploy `stage.torang.ai` | 5 (skenario "internet diputus" belum bisa diuji jujur selama cloud hidup di mesin guru) |
| Verifikasi transparansi GLOW di Windows asli | 3 (efek bisa jadi menghitamkan layar murid) |

**Estimasi lolos acceptance fase 1:** tidak dijanjikan dari sisi audit ini — tapi
urutannya jelas: (a) kunci jalur agent, (b) Whisper+PTT+toast, (c) aset reaction,
(d) deploy. (a)–(c) tidak bergantung pada pengadaan; (d) menunggu SSH torang-sg-1.

**Pengadaan:** GPU ≥4 output, kabel HDMI aktif/HDBaseT ke TV3/TV4, dan mic PTT
**belum ada spesifikasi tertulis maupun pengajuan** di repo ini. Karena kiosk 4 TV
baru aktif bila mesin guru melihat ≥5 display, seluruh mode panggung sebenarnya
**belum pernah dijalankan pada konfigurasi aslinya** — yang teruji baru grid dev 2×2.

**Yang dibangun melebihi dokumen (tidak ada di checklist, sengaja ada):**

- Scene office di TV + TV ber-scene keluar dari cincin arah — layar monitoring
  tidak akan tertimpa Torang di tengah kelas.
- `transisi_default`: video materi baru cukup satu berkas.
- `torang-modul daftar/ambil <url>`: guru mendaftarkan video baru tanpa menyunting
  JSON; unduh dari tautan dengan 5 lapis pemeriksaan (penentu `ffprobe` — isi, bukan
  nama berkas; `.exe` berlabel `video/mp4` terbukti ditolak).
- CLI `torang` untuk guru/implementor.
- Perbaikan "tinggalkan layar lama" (HUKUM ilusi kontinu §6).
