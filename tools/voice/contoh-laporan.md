
# Hasil uji STT — 2026-09-18 04:55

Model: `ggml-base-q8_0.bin` · bias kosakata: AKTIF · threads: 8 · **MODE PALSU (tanpa mic/model)**

## Angka yang menentukan

| Ukuran | Hasil |
|---|---|
| Intent benar, transkrip **mentah** | **64%** (14/22) |
| Intent benar, setelah **normalisasi** | **91%** (20/22) |
| Ditolong tabel salah-dengar | 6 kalimat |
| **Salah terima** (kalimat terlarang yang lolos) | **0** dari 4 — harus 0 |

Anggaran §C: transkrip keluar ≤ 700 ms untuk ucapan ~2 detik.

## Per kalimat

| # | Diucapkan | Didengar Whisper | Mentah | Rapi | ms |
|---|---|---|---|---|---|
| 01 | Torang, puter modul tes di TV satu | `Torang, putar modul tes di TV satu.` | OK | OK | – |
| 02 | Torang, puter modul tes di TV dua | `Torang, puter modul tes di TV 2.` | OK | OK | – |
| 03 | Torang, puter modul tes di TV tiga | `Torong, muter modul tes di tivi tiga.` | **SALAH** | OK | – |
| 04 | Torang, puter modul tes di TV empat | `Torang, puter modul tes di TV empat.` | OK | OK | – |
| 05 | Torang, pindah ke TV satu | `Torang, pindah ke TV satu.` | OK | OK | – |
| 06 | Torang, pindah ke TV dua | `Torang, pindah ke TV dua.` | OK | OK | – |
| 07 | Torang, pindah ke TV tiga | `Torang, pindah ke TV 3.` | OK | OK | – |
| 08 | Torang, pindah ke TV empat | `Torang, pindah ke te ve empat.` | **SALAH** | OK | – |
| 09 | Torang, sapa komp satu | `Torang, sapa komp satu.` | OK | OK | – |
| 10 | Torang, sapa komp lima | `Torang, sapa kom lima.` | **SALAH** | OK | – |
| 11 | Torang, sapa komp sembilan | `Torang, sapa komputer sembilan.` | OK | OK | – |
| 12 | Torang, sapa komp dua belas | `Torang, sapa komp dua belas.` | OK | OK | – |
| 13 | Torang, sapa komp enam belas | `Torang, sapa komp 16.` | OK | OK | – |
| 14 | Torang, sapa komp dua puluh | `Torang, sapa komp dua pulu.` | **SALAH** | OK | – |
| 15 | Torang, lanjut | `Torang, lanjut.` | OK | OK | – |
| 16 | Torang, ulang | `Torang, ulangi.` | **SALAH** | OK | – |
| 17 | Torang, stop | `Terima kasih telah menonton.` | **SALAH** | **SALAH** | – |
| 18 | Torang, buka office di TV tiga | `Torang, buka office di TV tiga.` | OK | OK | – |
| 19 | Torang, tutup TV tiga | `Torang, tutup TV tiga.` | OK | OK | – |
| 20 | Torang, buka window TV empat | `Torang, buka windows TV-empat.` | **SALAH** | OK | – |
| 21 | Torang, glow semua komp | `Torang, glow semua kompi.` | OK | OK | – |
| 22 | Torang, puter modul tes di semua layar | `Torang, puter modul tes di semua lahar.` | **SALAH** | **SALAH** | – |
| T1 | Torang, tolong sapa komputer enam | `Torang, tolong sapa komputer enam.` | OK | OK | – |
| T2 | Torang, matikan semua TV | `Torang, matikan semua TV.` | OK | OK | – |
| T3 | Torang, pindah ke komp tujuh | `Torang, pindah ke komp tujuh.` | OK | OK | – |
| T4 | Torang, puter modul tes di TV lima | `Torang, puter modul tes di TV lima.` | OK | OK | – |

## Yang masih salah setelah normalisasi

- **17** "Torang, stop"
  - Whisper dengar: `Terima kasih telah menonton.`
  - Setelah dirapikan: `terima kasih telah menonton`
  - Parser menghasilkan: `"ditolak: frasa halusinasi Whisper: \"terima kasih telah menonton\""`
  - Seharusnya: `{"intent":"STOP"}`
- **22** "Torang, puter modul tes di semua layar"
  - Whisper dengar: `Torang, puter modul tes di semua lahar.`
  - Setelah dirapikan: `torang puter modul tes di semua lahar`
  - Parser menghasilkan: `"ditolak: target tidak dikenal: \"semua lahar\""`
  - Seharusnya: `{"intent":"PLAY_MODULE","alias":"modul tes","target":"all_tv"}`

## Salah-dengar yang benar-benar terjadi

Ini yang perlu dijaga di tabel normalisasi; sisanya boleh dibuang supaya tabel tetap pendek.

- `putar → puter` — 1×
- `torong → torang` — 1×
- `muter → puter` — 1×
- `tivi → tv` — 1×
- `te ve → tv` — 1×
- `kom → komp` — 1×
- `dua pulu → dua puluh` — 1×
- `ulangi → ulang` — 1×
- `windows → window` — 1×
- `kompi → komp` — 1×

