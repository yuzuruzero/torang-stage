# STATUS PROYEK — Torang Stage (baca ini dulu di sesi baru)

**Terakhir diperbarui:** 11 Agu 2026 · versi repo **v0.3.3** · GitHub:
`github.com/yuzuruzero/torang-stage`
**Guna dokumen:** satu file untuk memahami apa yang SUDAH jadi, apa yang
TERVERIFIKASI di dunia nyata, dan apa langkah berikutnya — tanpa Hadi harus
menjelaskan ulang. Dokumen ini DIPERBARUI setiap rilis.

## Konteks 1 menit

Torang Stage = implementasi fase 1 "Panggung Torang" (Theater of AI): kelas
2 hari yang dipentaskan — guru jadi dalang (voice → OpenClaw), video Torang
pre-rendered berpindah antar 4 TV + 20 komp murid, telemetri pixel office
menyusul di fase 2. **Sumber kebenaran produk:** `panggung-torang-MASTER-programmer.md`
di folder `torangapp` (semua keputusan TERKUNCI; kalau ragu, file itu menang).
Keputusan teknis repo ini: `DECISIONS.md` (D1–D17). Keamanan: `KEAMANAN.md`.

## Apa yang sudah jadi (v0.1.0 → v0.3.2)

- ✅ **Cloud** (calon stage.torang.ai, sekarang jalan lokal): registry endpoint,
  show-state (arah exit/enter OTOMATIS, ring tv1→tv2→tv3→tv4), cue router WS
  (`start_at` T+1.5s, ACK per cue, timeout jelas), panel guru web `/panel`,
  login murid ketik-nama + lepas kursi + reset kelas, `/api/vocab`.
- ✅ **App teacher** (Electron): panel operator (dropdown kursi live, murid
  online, sapa/ketuk/glow, reset murid) + 4 window TV (idle/show-video;
  `dev_tv_count` utk PC lemah) + audio→PA + hotkey global **Ctrl+Alt+F9/F10/F11**
  (GO/STOP/ULANG — menembak cloud, jalur sama dgn voice) + reconnect otomatis.
- ✅ **App student**: login ketik nama (kursi preset per PC), overlay "jendela
  sopan" (greet bernama, ketukan click-gated → murid yang buka fullscreen),
  GLOW pinggir layar, STOP membersihkan semua. TIDAK PERNAH menampilkan panggung.
- ✅ **Installer**: `tools/PASANG-GURU.bat` (panggung: kunci ruangan, firewall,
  deteksi IP LAN, shortcut "Torang Panggung") · `tools/PASANG-MURID.bat`
  (hanya tampilan murid; unduh zip GitHub, tanpa git). Panduan:
  `PANDUAN-PASANG-MURID.md`.
- ✅ **Jembatan OpenClaw (teks, awal langkah voice)**: skill `panggung-torang`
  + parser grammar §5 deterministik (`tools/openclaw/`) + `--state` (agent bisa
  baca dashboard). Pemasang: `tools/openclaw/pasang-jembatan-openclaw.sh` (WSL).
- ✅ **Uji**: 79 unit/e2e test (`npm test`) + smoke headless (`tools/smoke-headless.sh`).
- ✅ Modul dummy `m99` alias **"tes"** (aset placeholder di-commit).

## Terverifikasi di DUNIA NYATA (bukan cuma sandbox)

- ✅ Guru↔murid **lintas mesin**: komp2 konek, **sapa + glow sampai di PC murid**.
- ✅ Fix keyboard v0.2.6 dikonfirmasi (hotkey lama Ctrl+Alt+huruf sempat
  merusak pengetikan app lain — jangan diulang, lihat DECISIONS D17).
- ⏳ **Jembatan OpenClaw BELUM terpasang di WSL Hadi** — percobaan pertama
  gagal: firewall (lihat "Langkah berikutnya" #1).
- ⏳ **Belum dilaporkan:** GLOW di PC murid transparan atau menghitamkan layar
  (kalau hitam → fallback 4 bar tepi sudah dirancang, DECISIONS D15).

## Langkah berikutnya (urut)

1. **Selesaikan jembatan OpenClaw** (macet di firewall — adapter vEthernet WSL
   dihitung profil PUBLIC):
   - PowerShell **admin**: `netsh advfirewall firewall add rule name="Torang Stage 8787" dir=in action=allow protocol=TCP localport=8787`
   - Cloud hidup (`jalankan-cloud-lan.bat`), lalu di WSL:
     `cd /mnt/d/projects/torang-stage && bash tools/openclaw/pasang-jembatan-openclaw.sh`
   - Restart sesi OpenClaw → uji ketik ke agent: *"Torang, sapa komp dua"*.
2. **Voice penuh**: mic PTT + Whisper lokal menggantikan keyboard di jalur yang
   sama + toast konfirmasi 1 dtk (§5). Target akseptasi fase 1 = §14.1 master.
3. **Deploy `stage.torang.ai`** di VPS torang-sg-1 (Docker+Caddy+TLS) — belum
   ada SSH; roster pindah Postgres (DECISIONS D14).
4. **Packaging**: installer NSIS tanpa Node + student-only ramping + code
   signing (keputusan #10).
5. **Fase 2**: telemetri pixel office (fork Star-Office; spec v2 di torangapp)
   → X1 hatch → X2 milestone. Slot `client_id` di binding sudah disiapkan.

Open item menunggu tim: kalibrasi geometri arah (D4) di ruangan asli · art
Hadi (bg + sprite) · kebijakan join_key per batch · pengadaan GPU ≥4 output +
mic PTT · provision stage.torang.ai.

## Cara menjalankan (ringkas)

- **PC guru (dev/kelas):** `jalankan-cloud-lan.bat` (terima kunci sbg argumen)
  → `npm run dev:app`. Panel web: `http://127.0.0.1:8787/panel`.
- **PC murid:** `tools/PASANG-MURID.bat` (sekali) → "Torang Kelas.bat" di
  Desktop → murid ketik nama.
- **Uji cepat di satu mesin:** 3 terminal — `npm run dev:cloud` ·
  `npm run dev:app` · `npm run dev:student`.

## Cara kerja dengan Claude (Cowork) — pola yang terbukti

- Claude membangun di sandbox → **zip (isi flat + .git)** → kirim ke
  `D:\projects\torang-stage` → ekstrak → **verifikasi md5 dua sisi** → commit
  sudah termasuk → **Hadi yang push** (`bash tools/push-ke-github.sh`; Claude
  TIDAK BISA push — token read-only).
- **JANGAN pernah menaruh file di `.github/workflows/`** untuk di-push —
  kredensial Hadi tanpa scope `workflow`; CI diaktifkan via web UI memakai
  `tools/ci-test.yml`.
- Jebakan yang sudah dibayar mahal (jangan diulang): BOM dari PowerShell 5.1
  (D15/insiden mode teacher) · globalShortcut Ctrl+Alt+huruf (D17) · profil
  firewall vEthernet WSL = Public · `unzip -o` gagal di mount Cowork (delete
  dilarang) — pola ekstraksi ada di memori proyek Claude.
- Update PC murid = push lalu jalankan installer lagi di PC-nya.
- Setiap rilis: perbarui `STATUS-PROYEK.md` ini + `DECISIONS.md` bila ada
  keputusan baru.
