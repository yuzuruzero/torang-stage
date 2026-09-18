# 03 — Telemetri & X1 "Hatch Moment"

Rujukan internal pixel office: `theater-of-ai-pixel-office-spec-v2.md` + `RECAP.md` (kamu pegang).

## A. Titik sambung ke pixel office (rangkuman relevan)
- Host office = fork Star-Office di **mesin guru** (`localhost`). Murid join via kontrak
  `POST /join-agent` + `POST /agent-push` lewat LAN router Torang. Concurrency join-key ≥20.
- **Identitas = `client_id`** (UUID dibuat skill monitor saat install, disimpan
  `~/.torang-monitor/client_id`); `agent_name` hanya label display. Dua murid menamai agent
  "Bot" → dua karakter. Day-2 buka agent yang sama → karakter yang sama.
- Skill monitor permanen + auto-start; murid paste SATU snippet pre-filled (facilitator
  mengisi JOIN_KEY + OFFICE_URL per batch).
- 3 hook masih stub (`getAgentName`, `detectActiveSubAgent`, `auto-start`) — **tidak
  memblokir X1** (X1 hanya butuh event join).

## B. Definisi X1
Murid paste snippet → agent join → dalam ±1 dtk, tiga hal:
1. **Karakter muncul di Ruang Tamu di TV** — INTRINSIK dari render Star-Office (tanpa cue).
2. **Monitor murid glow + overlay** "Selamat datang, {agent_name}!" / "{nama_murid}, agen
   kamu resmi masuk kantor".
3. **SFX kecil dari PA** (`sfx_hatch`).
Urutan (1) dulu, (2)(3) menyusul ≤1 dtk — dramaturgi yang benar (publik dulu, personal
menyusul).

## C. Rantai kejadian
```
[Komp murid] skill monitor → POST /join-agent → [Mesin guru] host office
  → host office EMIT event lokal (§D)
  → app teacher (JEMBATAN): + {branch, room, cohort} → WS cloud (buffer+retry)
  → cloud rules engine: dedup → binding kursi → min-gap/agregasi
  → bundle start_at = now+0.8s:
       OVERLAY_GREET → komp murid ybs · GLOW → komp ybs · SFX sfx_hatch → teacher
  → ACK → panel guru
```

## D. Kontrak event (tambahan MINIMAL di fork host office)
Satu emitter WS/webhook lokal, satu titik di handler `/join-agent` + handler room-change
yang sudah ada:
```ts
type TelemetryEvent =
  | { type:"agent_join";        client_id:string; agent_name:string; ts:string }
  | { type:"agent_room_change"; client_id:string; room:"tamu"|"standby"|"web"|"cs"|"data"|"error"; ts:string }
  | { type:"agent_offline";     client_id:string; ts:string };
```
`agent_join` = kebutuhan X1. `agent_room_change` = bekal papan skor/quest/kamera
(definisikan sekarang supaya fork cukup sekali).

## E. Binding kursi ↔ client_id (nol input murid)
- App student menjalankan **file-watcher** pada file `client_id` (path Windows final: cek
  implementasi skill monitor; kemungkinan `%USERPROFILE%\.torang-monitor\client_id`).
  Saat file muncul/berubah → `POST /session/bind {seat_id, client_id, cohort}`.
- Digabung login → cloud memegang rantai:
  **kursi ↔ client_id ↔ agent_name ↔ nama murid ↔ cohort ↔ cabang.**
  Rantai ini juga fondasi absen teatrikal, quest, progres, dan hitungan royalti.
- **Fallback**: `agent_join` datang tanpa binding → hatch di TV tetap terjadi (intrinsik),
  glow personal di-skip, event masuk antrean **"unbound"** di panel guru → implementor bind
  manual (dropdown kursi) → efek personal menyusul.

## F. Rules engine (cloud)
1. **Dedup**: hatch SEKALI per `client_id` per cohort (`hatch_state` PK gabungan).
   Restart / re-join / Day-2 tidak memicu ulang.
2. **Min-gap 4 dtk** antar efek. Bila ≥3 join dalam 5 dtk → **agregasi** satu cue
   ("3 agent baru bergabung!") + glow ketiga monitor serentak + SFX sekali.
3. **Master switch** per jenis efek di panel guru; default mengikuti modul aktif
   (segmen install → ON; lecture/live → OFF).
4. **X2 milestone** (pipa yang sama): hitung distinct `client_id` ter-hatch; ambang dari
   `cohorts.milestone_thresholds` (default 10/15/20) → bundle SFX fanfare + GLOW `wave`
   semua layar + PLAY_VIDEO klip Torang "kantor penuh!" di TV1. Tiap ambang tepat sekali.
5. Aktif **hanya** setelah `/session/open`. Tes implementor sebelum kelas tidak memicu efek.

## G. Efek lain yang menumpang pipa ini (fase 2 akhir / fase 3)
- **X11 progres kooperatif**: scene `web-app` di TV2 menampilkan "Kantor terisi N/20" +
  sorak di ambang. **Tanpa ranking/timer individu** (jangan mempermalukan yang lambat).
- **X7 absen teatrikal**: loop OVERLAY_GREET + GLOW keliling kursi (A1..A10 → B10..B1) dari
  daftar login saat pembukaan.
- **X8 quest/badge** (fase 3, butuh hook `detectActiveSubAgent`): `agent_room_change` →
  badge "Web Designer direkrut ✓" di monitor; 3/3 → drop "Dream Team lengkap!".
- **X9 kamera sinematik** (fase 3, fitur frontend pixel office): zoom ke karakter murid yang
  baru berhasil.

## H. Mode gagal X1
| Gagal | Perilaku |
|---|---|
| Endpoint murid offline | Hatch TV tetap; glow di-skip; kursi merah di panel |
| Binding tidak ada | Fallback §E (antrean unbound → bind manual) |
| Cloud putus sesaat | Jembatan teacher buffer+retry; hatch TV tetap intrinsik |
| Join sebelum sesi dibuka | Rules engine tidak aktif |
| Dua agent nama sama | Aman: identitas = client_id |

## I. Uji wajib
`tools/mock-agents` (mode mock pixel office sudah ada): 20 agent join beruntun DAN
bersamaan → verifikasi dedup, agregasi, min-gap, fallback unbound, ambang milestone tepat
sekali, master switch OFF = nol efek.
