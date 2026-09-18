# Panggung Torang (Theater of AI) — Paket Dokumen Rujukan
**Versi paket:** 1.0 · **Tanggal:** 16 Sep 2026 · **Untuk:** programmer yang sudah mulai membangun.

Paket ini BUKAN pengganti CLAUDE.md-mu dan BUKAN perintah untuk memulai ulang.
Tujuannya satu: **memastikan yang sudah dan akan dibangun sesuai konsep & keputusan**
yang disepakati Hadi. Kalau ada yang sudah kamu bangun berbeda dari dokumen ini, jangan
langsung dirombak — catat di `05-checklist-kesesuaian.md` kolom "Kondisi sekarang" lalu
diskusikan dengan Hadi. Beberapa keputusan bisa saja lebih baik versimu.

## Cara pakai (30 menit)
1. Baca `01-konsep-dan-keputusan.md` — 20 keputusan terkunci. Ini yang paling penting.
2. Isi `05-checklist-kesesuaian.md` — tandai per item: sesuai / beda / belum ada.
   Ini yang akan Hadi review.
3. Pakai `02`, `03`, `04` sebagai rujukan detail saat mengerjakan item yang "belum ada"
   atau "beda".

## Isi paket
| File | Isi | Kapan dibaca |
|---|---|---|
| `01-konsep-dan-keputusan.md` | Konsep 1 halaman + 20 keputusan terkunci + ruangan | Sekarang |
| `02-arsitektur-dan-kontrak.md` | Arsitektur, protokol cue, grammar suara, aset/manifest, DB, show-state, scene | Saat implementasi |
| `03-telemetri-dan-hatch.md` | Integrasi pixel office, kontrak event, binding, rules engine, X1 | Fase 2 |
| `04-rencana-acceptance-degradasi.md` | Fase kerja, acceptance test, mode gagal, SOP pre-flight, yang JANGAN dibangun | Untuk menyusun prioritas |
| `05-checklist-kesesuaian.md` | Daftar cek yang diisi programmer → direview Hadi | Sekarang, lalu berkala |

## Dokumen pendamping yang sudah kamu pegang
- `theater-of-ai-pixel-office-spec-v2.md` + `RECAP.md` pixel office — kontrak Star-Office,
  `client_id`, skill monitor. Dirujuk di `03`.

## Prinsip yang mengikat semua dokumen
- Kalau dokumen ini bertentangan dengan spec lama (v0–v1.3), **dokumen ini yang menang**.
- Kalau dokumen ini bertentangan dengan kode yang sudah jalan dan teruji, **diskusikan**,
  jangan diam-diam pilih salah satu.
