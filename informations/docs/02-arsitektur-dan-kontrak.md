# 02 — Arsitektur & Kontrak

## A. Arsitektur

```
                        CLOUD — stage.torang.ai
        ┌──────────────────────────────────────────────────┐
        │ registry endpoint · SHOW-STATE per ruangan         │
        │ cue router (WS, start_at terjadwal) · ACK tracking │
        │ rules engine telemetri (dedup/agregasi/ambang)     │
        │ manifest konten + sync · login sederhana + binding │
        │ panel guru (web) · dashboard multi-cabang          │
        └──────────────┬───────────────────────────────────┘
           pesan kecil │ WS (BUKAN file video)
     ┌─────────────────┴──────────────────────┐
┌────┴──────────────────────────┐   ┌──────────┴──────────────┐
│ MESIN GURU (Windows, teacher) │   │ 20 KOMP MURID (student)  │
│ · display 1 = PANEL OPERATOR  │   │ · tray + login sederhana │
│ · 4 BrowserWindow kiosk →     │   │ · overlay "jendela sopan"│
│   TV1..TV4 (scene manager)    │   │ · GLOW pinggir layar     │
│ · SEMUA audio → PA            │   │ · file-watcher client_id │
│ · Whisper lokal + OpenClaw    │   │   → bind kursi otomatis  │
│   (mic PTT) → parser → cue    │   │ · cache konten + sync    │
│ · host pixel office (localhost│   └──────────────────────────┘
│   fork Star-Office) + JEMBATAN│
│   event → cloud               │
│ · cache konten + sync         │
└───────────────────────────────┘
```

Konsekuensi TV-via-mesin-guru: sinkron TV↔TV↔PA trivial (satu mesin). `start_at` + NTP
tetap dipakai untuk komputer murid (toleransi ±300 ms cukup untuk overlay/glow).
Show-state & cue tetap via cloud (satu sumber kebenaran multi-cabang); render TV lokal.

### A1. Alur cue
```
Mic PTT ditekan → Whisper lokal → parser whitelist → toast konfirmasi 1 dtk
 [gagal → hotkey / klip reaction] → POST /cues (via OpenClaw)
 → cloud: show-state pilih klip exit/enter + offset → broadcast cue start_at=now+1.5s
 → endpoint ACK → panel hijau → serentak: TV window (video muted) + PA + komp murid
```
### A2. Alur konten (terpisah dari cue)
Pusat upload aset + `manifest.json` → sync agent tiap mesin tarik delta saat idle →
kelas tidak pernah menunggu download; cloud tidak pernah streaming video.
### A3. Alur sesi
Pre-flight → `/session/open` → murid login (nama+kursi) → binding `client_id` otomatis →
show → kehadiran & progres tercatat.

## B. Protokol cue (WS cloud → endpoint)

```ts
type CueType = "PLAY_VIDEO" | "MOVE_CHARACTER" | "SWITCH_SCENE" | "OVERLAY_KNOCK"
             | "OVERLAY_GREET" | "SFX" | "GLOW" | "STOP" | "GO";
interface Cue {
  cue_id: string;                  // "m03-c07"
  type: CueType;
  targets: string[];               // ["tv1"] | ["komp3","komp7"] | ["all_tv"] | ["all_student"] | ["teacher"]
  asset?: string;                  // "m03_materi_instal_hermes"
  enter_from?: "left"|"right"|null;
  exit_to?:   "left"|"right"|null;
  start_at: string;                // ISO, ~1.5 dtk di depan
  audio?: { play_on: "teacher"; asset: string };
  payload?: Record<string, unknown>;
  session: { branch: string; room: string; cohort: string };
}
```
Payload baku:
- `OVERLAY_GREET`: `{ title, subtitle, style: "hatch"|"sapa", duration_ms }`
- `GLOW`: `{ preset: "hatch_pulse"|"wave"|"breathe", duration_ms, offset_ms? }`
- `SWITCH_SCENE`: `{ scene: "idle"|"show-video"|"pixel-office"|"web-app", url? }`
- `OVERLAY_KNOCK`: `{ asset_next, title }` (SFX ketok dikirim paralel ke `teacher`)

Aturan: cue boleh **bundle** (array, `start_at` sama). Endpoint **wajib ACK**
`{cue_id, endpoint_id, received_at, clock_skew_ms}`. `MOVE_CHARACTER` dari guru cukup
menyebut tujuan; **server** menjabarkannya jadi exit di asal + enter di tujuan.

## C. REST (ringkas)
```
POST /endpoints/register   { endpoint_id, role, branch, room, screen_id?, app_version, content_version }
POST /session/open         { cohort }                  → aktifkan rules engine + form login
POST /session/close        { cohort }
POST /session/bind         { seat_id, client_id, cohort }          // dari file-watcher
POST /session/login        { seat_id, student_id, cohort }
POST /cues                 Cue | Cue[]                            // parser / panel / (fase 3) ahli
GET  /manifest/:vertical   → { version, assets[], modules[] }
GET  /state/:room          → show-state + status endpoint + skew
```

## D. Grammar suara (whitelist tertutup — SOP semua cabang)

Pola: **"Torang, [AKSI] [OBJEK] [TARGET]"**

| Aksi | Cue | Contoh |
|---|---|---|
| puter | PLAY_VIDEO | "Torang, puter video instal Hermes di komp tiga" |
| pindah | MOVE_CHARACTER | "Torang, pindah ke TV tiga" |
| buka | SWITCH_SCENE | "Torang, buka pixel office di TV dua" |
| lanjut | GO | "Torang, lanjut" |
| ulang | PLAY_VIDEO (transisi di-cut) | "Torang, ulang" |
| stop | STOP | "Torang, stop" |
| semua | modifier target | "...di semua layar" / "semua komp" |
| sapa | OVERLAY_GREET | "Torang, sapa komp lima" |

- Target baku: `TV satu..empat`, `komp satu..dua puluh`, `semua layar`, `semua komp`.
  Normalisasi angka Indonesia wajib.
- Objek modul = **alias** dari manifest cohort aktif; fuzzy match HANYA pada daftar itu.
- Parser = pemetaan ke cue whitelist. LLM tidak pernah mengarang aksi.
- Setiap hasil parse → **toast konfirmasi 1 dtk** (Esc batal) sebelum kirim.
- Hotkey global (GO/ULANG/STOP + F1–F4 klip reaction) selalu aktif — backup senyap.

## E. Show-state
Cloud memegang per ruangan: `{ character_on: "tv1"|"tv2"|..|"komp7"|null, pose, last_dir }`.
Peta geometri per ruangan di registry (posisi TV & kursi relatif) → arah exit/enter
dihitung server. Guru tidak pernah memikirkan arah.
Disiplin arah = HUKUM: exit-kanan selalu disambut enter-kiri di layar berikutnya.

## F. Scene model (per TV window, app teacher)
| Scene | Isi |
|---|---|
| `idle` | Logo/ambience (default). Bukan layar hitam |
| `show-video` | `<video muted>` H.264; mendukung enter/exit + idle loop; frame akhir enter = frame awal idle |
| `pixel-office` | Webview → host office `localhost`. Hanya saat di-cue |
| `web-app` | Webview URL whitelist pusat |
Transisi antar scene mulus (fade/wipe). Torang tidak wajib ada di layar.

## G. Aset & manifest (kontrak dengan tim produksi)
- `m{modul}_{jenis}_{slug}.mp4`, jenis `materi|enter_l|enter_r|exit_l|exit_r|idle|knock`;
  audio terpisah `{asset}_audio.m4a` (diputar mesin guru → PA).
- Reaction pack global `rx_{mikir|ngambek|ketawa|ya|nggak|budek|catat}.mp4`.
- SFX `sfx_{hatch|whoosh|sting|fanfare|knock}.m4a`.
- `manifest.json`: `{ version, vertical, assets:[{name,hash,bytes}], modules:[{id, alias,
  title, presenter:"torang"|"ahli-{nama}", energy_tag, cues[]}] }` — **sumber kosakata parser**.
- Transisi 1.5–2.5 dtk. Sync agent = delta by hash, saat idle, beberapa hari sekali.

## H. Sinkronisasi waktu
Komputer murid: Windows Time aktif + `start_at`. Endpoint dengan skew > 250 ms → merah di
panel & dashboard saat pre-flight. Toleransi lip-sync manusia ≈ 100 ms (hanya relevan bila
audio & video beda mesin — di desain ini TV & PA satu mesin).

## I. Skema DB (awal; Postgres disarankan)
```
cohorts(id, branch, room, vertical, starts_at, milestone_thresholds jsonb)
students(id, cohort_id, nama, external_user_id NULL)
seats(id, room, seat_id, machine_fingerprint NULL)
bindings(id, cohort_id, seat_id, client_id, agent_name, bound_at)
sessions(id, cohort_id, opened_at, closed_at)
cue_log(id, session_id, cue_id, type, targets, sent_at, acks jsonb)
hatch_state(cohort_id, client_id, hatched_at)      -- PK gabungan → dedup
attendance(cohort_id, student_id, seat_id, logged_in_at)
endpoints(id, branch, room, role, screen_id, last_seen, clock_skew_ms, content_version)
```

## J. Struktur repo yang disarankan (bukan wajib)
```
/apps/cloud     NestJS: REST + WS + rules engine + panel guru
/apps/desktop   Electron: main + renderer (mode teacher | student)
/packages/contracts   tipe TS bersama — SUMBER KEBENARAN cue/event/DTO
/tools          mock-agents.ts · seed-assets.ts
/docs           paket ini + /decisions (ADR)
```
