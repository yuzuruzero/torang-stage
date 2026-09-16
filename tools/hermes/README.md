# Jembatan Hermes Agent -> Panggung Torang

Isi folder ini menyambungkan **Hermes Agent** di PC guru ke panggung, lewat CLI
`torang` (`tools/cli/`). Tidak ada jalur baru ke panggung: Hermes cuma memanggil
perintah yang sama dengan yang bisa diketik guru sendiri.

| Berkas | Guna |
|---|---|
| `SKILL.template.md` | isi skill. `__TORANG_CMD__` diganti path CLI asli saat dipasang |
| `pasang-skill-hermes.ps1` | pemasang: deteksi Hermes -> deteksi checkout -> config -> tulis SKILL.md -> verifikasi |
| `PASANG-SKILL-HERMES.bat` | pembungkus double-click untuk ps1 di atas |

## Pasang

Double-click `PASANG-SKILL-HERMES.bat`, atau:

```powershell
powershell -ExecutionPolicy Bypass -File pasang-skill-hermes.ps1
powershell -ExecutionPolicy Bypass -File pasang-skill-hermes.ps1 -CekSaja   # lihat dulu
```

Opsi: `-StageDir` · `-SkillsDir` · `-Api` · `-RoomKey`.

Skrip **berhenti tanpa menulis apa pun** kalau Hermes tidak ketemu atau checkout
torang-stage tidak ketemu. Berkas yang sudah ada tidak pernah ditimpa diam-diam
— disalin dulu jadi `<nama>.backup-<tanggal-jam>`.

## Dua hal yang bikin skill tidak terdeteksi

1. **Salah folder — dan dokumentasinya menyesatkan.** Dokumentasi resmi Hermes
   menyebut `~/.hermes/skills/`. Di build Windows yang kami uji (v0.20.3,
   16 Sep 2026) itu **tidak dibaca sama sekali**; yang dibaca adalah

   ```
   %LOCALAPPDATA%\hermes\skills\<kategori>\<nama-skill>\SKILL.md
   ```

   Perhatikan **folder kategori** di tengah (`productivity`, `creative`,
   `github`, …). Nama folder itulah yang muncul di kolom Category
   `hermes skills list` — bukan `category` di frontmatter. Skill yang ditaruh
   langsung di akar folder skills, atau di `~/.hermes/skills/`, tidak pernah
   muncul di daftar dan gagal **diam-diam**.

2. **Tanpa frontmatter.** SKILL.md wajib diawali blok YAML berisi minimal
   `name`, `description`, `version`. Berkas yang langsung mulai dengan judul
   markdown dilewati.

Pemasang di folder ini memilih folder skills berdasarkan yang benar-benar ADA
di mesin (`%LOCALAPPDATA%` dulu, `~/.hermes` sebagai cadangan), menaruhnya di
subfolder kategori (`-Kategori`, default `productivity`), lalu **memastikan
namanya benar-benar muncul di `hermes skills list`** — karena menulis ke folder
yang salah tidak memberi error apa pun.

## Mendaftarkan video baru lewat agent

Skill ini juga mengajari Hermes memakai `tools/cli/torang-modul.cmd`: guru
menaruh video di `video-baru/`, bilang "Torang, daftarkan video baru", dan agent
menjalankan `inbox` → `usul` → (konfirmasi alias ke guru) → `daftar`.

Yang dijaga: agent **tidak pernah** menyunting `manifest.json` sendiri, dan
**wajib menunggu guru menyetujui alias** sebelum mendaftarkan — alias itu kata
yang nanti diucapkan guru, jadi bukan hak agent memutuskannya.

Panduan untuk manusianya: `PANDUAN-TAMBAH-VIDEO.md` di akar repo.

## Menguji

Pakai `hermes chat` **polos**. Jangan `--toolsets skills`: tool `terminal` tidak
ikut dimuat, jadi skill terpicu dan menyusun perintah yang benar tapi tidak
pernah dieksekusi (pelajaran uji 7 Sep 2026).

## Bedanya dengan `tools/openclaw/`

`tools/openclaw/` = jembatan untuk OpenClaw: kalimat guru diteruskan apa adanya
ke parser grammar tertutup (`torang-cue.mjs`). Cocok kalau yang memanggil tidak
menafsirkan.

`tools/hermes/` = Hermes yang menafsirkan maksud guru, lalu memanggil subcommand
eksplisit. Batasnya dijaga CLI (regex target + cek alias ke `/api/vocab`), bukan
oleh larangan "LLM dilarang menafsirkan". Keduanya hidup berdampingan.
