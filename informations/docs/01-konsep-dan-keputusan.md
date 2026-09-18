# 01 — Konsep & Keputusan Terkunci

## A. Konsep dalam satu halaman

Sistem pertunjukan kelas. Hampir semua materi = **video pre-rendered** bersuara karakter
Torang (3D) atau ahli. **Guru = dalang**: memicu semuanya lewat perintah suara
("Torang, puter video instal Hermes di komp tiga") melalui OpenClaw di mesin guru.
Torang tampak **hidup berpindah antar layar** (klip keluar/masuk berarah).
**Telemetri** (pixel office): agent yang murid install muncul sebagai karakter nyata di
layar; tindakan murid memicu efek panggung otomatis. **Multi-cabang**: kontrol dari cloud,
konten ter-cache lokal, semua konten & SOP dari pusat → semua cabang identik.
**Debut target: kelas berbayar September–Oktober 2026.**

Tiga lapis pengalaman:
1. **Panggung scripted** — video + cue suara. Terkontrol, standar pusat.
2. **Dunia live (telemetri)** — agent murid yang benar-benar online. Tidak bisa dipalsukan.
3. **Kanvas ruangan** — 24 layar (4 TV + 20 monitor) + PA: glow, sapaan nama, sorak serentak.
Momen terkuat = persilangan lapis (contoh: murid ke-20 online → otomatis fanfare + gelombang
layar + Torang "kantor penuh!").

## B. Ruangan (Central Park, Jakarta Barat)
- Memanjang; DEPAN = presenter. **TV1 65" depan-kiri (HERO)**, **TV2 42" depan-kanan**,
  **TV3 32" belakang-kanan**, **TV4 32" belakang-kiri** (belakang = di punggung murid).
- Dua baris meja back-to-back: **Baris A** & **Baris B**, ±20 workstation (desktop Torang;
  laptop sendiri boleh, jalur sama).
- Mesin guru di DEPAN dekat TV1; PA sentral; **router/AP milik Torang** (Wi-Fi gedung
  rawan client isolation — jangan diandalkan untuk LAN kelas).

## C. 20 keputusan TERKUNCI

| # | Hal | Keputusan |
|---|-----|-----------|
| 1 | Wujud Torang | Video pre-rendered. App = pemutar + routing. BUKAN avatar live / game engine |
| 2 | Naskah | Modular: pohon segmen, guru bebas urutan, tiap modul scripted |
| 3 | Telinga | OpenClaw di mesin guru + **mic push-to-talk hardware** + **Whisper lokal** untuk STT |
| 4 | Pindah layar | Ilusi kontinu: klip exit/enter berarah, disiplin arah wajib |
| 5 | Audio | **SATU PA** dari mesin guru. Video di TV & komputer murid **MUTED**. Komputer murid tidak punya speaker |
| 6 | Layar murid | Overlay "jendela sopan" (tidak merebut fokus) + glow; murid klik → fullscreen |
| 7 | Target push | 1 komp / beberapa / broadcast semua |
| 8 | Topologi | Cloud di **server torang.ai eksisting**, subdomain baru (usul `stage.torang.ai`) + konten lokal di tiap mesin. **Tanpa server cabang** |
| 9 | Penggerak TV | **Semua 4 TV dicolok ke mesin guru** (GPU multi-output). TV = 4 jendela kiosk app teacher, BUKAN endpoint terpisah |
| 10 | OS | **Semua Windows** (guru + murid) |
| 11 | App | **Electron**, satu codebase, 2 mode: `teacher` & `student` |
| 12 | Scene TV | Scene-based murni di dalam app (webview/video). Tanpa mengatur window aplikasi lain di OS |
| 13 | Internet | **Wajib**. Tanpa relay LAN. Mati → kelas pindah modul PPT/manual (di luar sistem); hotspot HP = backup link |
| 14 | Login | E-learning belum ada → **login sederhana** (nama + kursi per cohort), skema siap ditukar (`external_user_id` nullable) |
| 15 | Presenter | 3 mode: `torang` / `ahli-rekaman` / `ahli-live` (fase 3). Field `presenter` di manifest; cue presenter-agnostik |
| 16 | Peran kelas | GURU = operator show/MC; IMPLEMENTOR = pendamping murid (install, binding manual) |
| 17 | Sapaan nama | **Teks saja** di layar murid; audio pendukung dari PA |
| 18 | Kejujuran | Voice command ASLI; telemetri ASLI; jawaban Torang = rekaman, tak pernah diklaim live; label LIVE vs rekaman tak dikaburkan; telemetri hanya melihat agent |
| 19 | Hardware | Freeze — tanpa alat baru, KECUALI konsekuensi #9 (GPU + kabel + mic PTT) dan 1 webcam ruangan (fase 3) |
| 20 | Aset uji | Placeholder dibuat sendiri (video teks/warna + TTS bebas). Jangan menunggu tim video untuk fase 1 |

## D. Yang boleh kamu putuskan sendiri (catat sebagai ADR singkat)
- Detail integrasi Whisper ↔ OpenClaw (Whisper standalone menyuapi teks sah; **eksekusi cue
  tetap melewati OpenClaw** demi cerita dogfooding).
- Lib WS, ORM, struktur DB final, format manifest, codec/resolusi (usulan: 1080p H.264).
- Path final file `client_id` di Windows (cek implementasi skill monitor).
- Spek GPU mesin guru & model mic PTT (usulkan → approval pengadaan Hadi/Friesca).
- Stack detail (usulan: NestJS + Postgres; Electron + React + Vite; whisper.cpp/faster-whisper).
