# `torang` — pengendali panggung lewat CLI

Pintu baris-perintah ke Panggung Torang. Dibuat supaya **agent (Hermes,
OpenClaw), cron, dan skrip uji bisa mengendalikan panggung tanpa mengklik
panel web** — bukan lewat computer-use, melainkan satu perintah teks.

Memakai API yang sama dengan tombol di panel guru (`POST /api/intent`). Tidak
ada jalur istimewa, tidak ada logika panggung yang digandakan di sini.

## Pasang

Tidak ada pemasangan. Cukup Node ≥ 20 dan config yang sudah dipakai jembatan
OpenClaw:

`~/.torang-stage/config.json` (di Windows: `C:\Users\<nama>\.torang-stage\config.json`)

```json
{ "api": "http://127.0.0.1:8787", "room_key": "kunci-ruanganmu" }
```

Bisa ditimpa lewat env `TORANG_STAGE_API` / `TORANG_STAGE_KEY`, atau flag
`--api=` / `--key=`.

Panggil dengan path penuh (tidak menyentuh PATH sistem):

```
D:\projects\torang-stage\tools\cli\torang.cmd state      (Windows)
node tools/cli/torang.mjs state                          (mana saja)
```

## Perintah

| Perintah | Arti |
|---|---|
| `state` | ringkasan panggung: Torang di layar mana, modul aktif, rundown |
| `murid` | daftar kursi — online / offline / terikat nama siapa |
| `vocab` | kosakata sah: alias modul dari manifest + daftar target |
| `sapa <komp>` | kartu sapaan bernama, mis. `sapa komp6` |
| `puter <modul> <target>` | putar modul, mis. `puter tes tv1` |
| `pindah <tv>` | pindahkan Torang antar TV, mis. `pindah tv3` |
| `glow <target> [preset] [ms]` | bingkai layar murid; preset `pulse`\|`breathe`\|`wave` |
| `lanjut` · `ulang` · `stop` | rundown maju · replay · kill switch |
| `say "<kalimat>"` | lewat parser kalimat §5 (`tools/openclaw/torang-cue.mjs`) |

**ADMIN — untuk guru/implementor, bukan untuk agent:**
`unbind <kursi>` · `reset-rundown` · `reset-roster` · `reload-manifest`

Opsi: `--dry` (tampilkan intent, jangan kirim) · `--json` (keluaran mesin) ·
`--api=` · `--key=`.

Exit code: `0` sukses · `1` ditolak/gagal · `2` salah pakai.

## Batas yang dijaga

- Target divalidasi lokal dengan regex protokol: `tv1..tv4`, `komp1..komp20`,
  `teacher`, `all_tv`, `all_student`. Bentuk longgar (`komp 6`, `komputer6`,
  `semua komp`) dinormalkan; yang di luar itu ditolak sebelum dikirim.
- Alias modul dicek ke `/api/vocab` — manifest adalah sumber kosakata (§6).
  Modul karangan ditolak beserta daftar yang sah.
- Tidak ada perintah OS di sini. CLI ini hanya bicara HTTP ke cloud.
- STOP tetap tersedia di panel dan hotkey `Ctrl+Alt+S` — CLI tidak pernah
  menjadi satu-satunya jalan menghentikan panggung.

## Hubungannya dengan `tools/openclaw/torang-cue.mjs`

Berbeda peran, hidup berdampingan:

- `torang-cue.mjs` — parser kalimat bahasa Indonesia dengan grammar tertutup.
  Dipakai kalau kalimat guru diteruskan apa adanya.
- `torang.mjs` — perintah eksplisit ber-subcommand. Dipakai kalau yang
  memanggil sudah tahu persis aksi apa yang dimaksud (agent yang sudah
  memahami maksud guru, cron, skrip uji).

`torang say "<kalimat>"` memanggil parser itu, jadi grammar-nya tidak
ditulis ulang di dua tempat.

## Untuk agent (Hermes/OpenClaw)

Beri agent hanya perintah non-admin di atas, dan wajibkan ia menyampaikan
keluaran apa adanya — termasuk penolakan. Alasan penolakan (`DITOLAK`,
`DITOLAK CLOUD`) ditulis untuk dibacakan ke guru, bukan untuk dipakai agent
menyusun ulang perintah supaya lolos.
