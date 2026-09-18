# 04 — Rencana Kerja, Acceptance, Degradasi

## A. Urutan kerja (debut Sep–Okt 2026)
Prinsip: **buktikan panggung dengan biaya sekecil mungkin, baru produksi massal.**
Hotkey manual dibangun **SEBELUM** jalur suara — seluruh jalur cue harus bisa diuji tanpa STT.

### Fase 1 — Panggung dasar
- Cloud minimal: register endpoint, WS cue router + ACK, show-state, `/cues`, panel guru sederhana.
- App teacher: 4 BrowserWindow kiosk (display 2–5), scene manager (`idle`/`show-video`/
  `pixel-office`), semua audio → PA, **hotkey GO/ULANG/STOP + F1–F4 reaction**.
- App student: login sederhana, overlay sopan, GLOW, tray + autostart.
- `seed-assets`: aset placeholder (1 materi + 4 transisi + idle + 1 SFX). Jangan tunggu tim video.
- Suara: Whisper lokal → parser whitelist → toast konfirmasi → cue via OpenClaw.
- Cek NTP/clock-skew + tampil di panel.

**ACCEPTANCE FASE 1** — didemokan di ruangan asli, tanpa menyentuh keyboard saat demo:
1. "Torang, puter video tes di TV satu" → toast → video di TV1 + suara PA serentak.
2. "Torang, pindah ke TV tiga" → klip exit di TV1 + enter di TV3, arah benar otomatis.
3. "Torang, sapa komp lima" → overlay nama murid (dari login) muncul di komp 5.
4. Poin 1–3 bisa dilakukan lewat hotkey tanpa suara.
5. Internet diputus → panel menampilkan status jelas; tidak crash, tidak diam.

### Fase 2 — Telemetri & wow
- Fork host office: emitter event lokal (03 §D).
- App teacher: jembatan event (subscribe lokal → WS cloud, buffer+retry).
- App student: file-watcher `client_id` → `/session/bind`.
- Cloud: rules engine (03 §F) + cue `OVERLAY_GREET`/`SFX`/`GLOW` + antrean unbound + bind manual.
- X2 milestone, X11 progres kooperatif (TV2), X7 absen teatrikal.
- `mock-agents`: 20 agent join beruntun/bersamaan.
- Gladi resik penuh dengan guru + implementor.

**ACCEPTANCE FASE 2:**
1. Mock 20 agent → tepat 20 hatch, tanpa duplikat; re-join tidak memicu ulang.
2. Join bertumpuk (≥3 dalam 5 dtk) → satu cue agregasi; min-gap 4 dtk terjaga.
3. Join tanpa binding → tercatat, masuk antrean unbound; bind manual → efek susulan muncul.
4. Ambang 10/15/20 memicu milestone tepat sekali masing-masing.
5. Master switch OFF → nol efek otomatis.
6. Sesi belum dibuka → join tidak memicu apa pun.

### Fase 3 — Sesudah debut (JANGAN dikerjakan lebih dulu)
Mode ahli-live (scene WebRTC + panel ahli dengan cue terbatas & token role + kamera ruangan;
**guru pegang override**; one-to-many ke banyak cabang), quest/badge, kamera sinematik,
bookend kantor, mode foto, klip "ngintip", laporan royalti, integrasi e-learning penuh.

## B. Mode gagal & jawaban sistem
| Gagal | Perilaku yang WAJIB |
|---|---|
| Suara salah dengar | Toast konfirmasi menahan sebelum tampil; guru bisa Esc; hotkey + klip `rx_ngambek` (kegagalan jadi komedi) |
| Endpoint murid offline | Efek personal di-skip; kursi merah di panel |
| Binding tak ditemukan | Antrean unbound → bind manual → efek menyusul |
| Cloud putus sesaat | Jembatan buffer+retry; TV tetap jalan (lokal); panel tampilkan status |
| Internet mati total | Sistem **gagal dengan jelas** (banner status), tidak diam. Kelas pindah modul manual (di luar sistem) |
| Jam melenceng > 250 ms | Endpoint merah saat pre-flight |
| Join sebelum sesi dibuka | Diabaikan rules engine |
| Dua agent nama sama | Aman (identitas client_id) |

## C. SOP pre-flight (yang harus didukung panel guru, 5 menit sebelum kelas)
1. Cek internet; siagakan hotspot HP (backup link).
2. Semua endpoint HIJAU: online + skew OK + versi konten sama.
3. Tes PTT: "Torang, tes" → konfirmasi muncul **tanpa** menembak ke TV.
4. Sound check PA + 1 cue percobaan ke TV1 sebelum murid masuk.
5. Hotkey & klip reaction siap.
6. `/session/open` → rules engine aktif + form login murid tampil.

## D. Prinsip yang mengikat semua efek
- Efek besar 2–3× sehari; drop terbesar untuk penutup (rundown menandai).
- Semua efek = cue type biasa di satu sistem, satu `start_at`.
- Auto-trigger ber-cooldown & bisa OFF.
- Progres selalu **kooperatif** (tanpa ranking/timer per murid di layar).
- Teater diakui teater. Tidak pernah mengklaim kemampuan AI palsu.

## E. JANGAN dibangun sekarang
Relay LAN / offline mode · server per cabang · avatar 3D live / lip-sync · kontrol lampu IoT ·
integrasi e-learning penuh · laporan royalti · OS-level window switching · mode ahli-live
(sebelum fase 1–2 lolos acceptance).

## F. Pengadaan yang menyertai (bukan tugas coding, tapi programmer mendefinisikan spek)
- Mesin guru: GPU ≥4 output video + monitor guru (5 display); sanggup 4× playback 1080p +
  pixel office + Whisper + OpenClaw serentak.
- Kabel HDMI aktif/optik atau extender HDBaseT ke TV3/TV4 (ruangan panjang, >10 m).
- Mic wireless dengan tombol PTT hardware → input audio mesin guru; output audio → PA.
- (Fase 3) 1 webcam ruangan.
