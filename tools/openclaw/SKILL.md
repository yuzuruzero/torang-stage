# Skill: panggung-torang

Mengendalikan Panggung Torang (Theater of AI) dari OpenClaw guru — jalur TEKS
(pra-voice). Kamu (agent) TIDAK memutuskan aksi panggung sendiri; skrip
parser-lah yang menerjemahkan kalimat ke perintah whitelist.

## Kapan dipakai

- Pengguna memberi perintah panggung, biasanya berawalan "Torang, ..."
  (contoh: "Torang, puter video tes di TV satu", "Torang, pindah ke TV tiga",
  "Torang, sapa komp lima", "Torang, lanjut", "Torang, stop").
- Pengguna bertanya keadaan panggung ("siapa yang online?", "Torang di layar
  mana?", "rundown sampai mana?").

## Cara pakai (ATURAN KERAS)

1. Perintah panggung → jalankan skrip dengan KALIMAT PERSIS dari pengguna,
   tanpa kamu ubah, tambah, atau "perbaiki":

   ```bash
   node ~/.openclaw/workspace/skills/panggung-torang/torang-cue.mjs "<kalimat persis pengguna>"
   ```

2. Pertanyaan keadaan panggung:

   ```bash
   node ~/.openclaw/workspace/skills/panggung-torang/torang-cue.mjs --state
   ```

3. Sampaikan keluaran skrip apa adanya ke pengguna (termasuk "DITOLAK PARSER"
   beserta alasannya). JANGAN mencoba menyusun ulang kalimat supaya lolos —
   biarkan pengguna yang mengulangi perintahnya.

## Larangan (keamanan panggung)

- JANGAN memanggil API panggung langsung (curl/fetch) — hanya lewat skrip ini.
- JANGAN mengarang nama modul/target. Kosakata sah: `--vocab`.
- JANGAN mengulang-ulang perintah yang ditolak.
- Guru selalu bisa menghentikan panggung tanpa kamu: tombol STOP / hotkey.

## Konfigurasi

`~/.torang-stage/config.json` berisi `api` + `room_key` (ditulis oleh
`pasang-jembatan-openclaw.sh`). Kalau skrip menjawab GAGAL/tidak terjangkau,
minta pengguna menjalankan ulang pemasangnya — jangan menebak alamat sendiri.
