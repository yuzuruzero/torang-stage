# Panduan Pasang — PC Guru & PC Murid

Dua installer, sesuai peran mesin:

| Installer | Untuk | Yang tampil |
|---|---|---|
| `tools/PASANG-GURU.bat` | PC guru/panggung | Cloud + panel operator + 4 window TV |
| `tools/PASANG-MURID.bat` | Tiap PC murid | HANYA window murid (login kecil + overlay saat di-cue) |

Keduanya mengunduh repo dari GitHub sebagai ZIP (**tanpa git di PC target**),
menjalankan `npm install`, menulis config sesuai peran, dan membuat shortcut
di Desktop. Folder lama tidak pernah dihapus — dipindah jadi `-lama-<tanggal>`.

> Catatan jujur: ini jalur UJI/DEV (butuh Node ≥ 20 + internet per PC).
> Target kelas produksi = installer NSIS tanpa Node (keputusan #10, tahap
> packaging menyusul).

---

## A. Sekali saja — naikkan repo ke GitHub (di PC Hadi)

```bash
cd /mnt/d/projects/torang-stage
bash tools/push-ke-github.sh          # ketik "ya"; --kering untuk lihat dulu
```

Biasanya TIDAK ditanya password (kredensial tersimpan). **Jangan pernah
menaruh file di `.github/workflows/`** — push akan ditolak (kredensial tanpa
scope `workflow`); CI diaktifkan lewat web UI memakai isi `tools/ci-test.yml`.

## B. PC GURU — `PASANG-GURU.bat`

1. Bawa `tools/PASANG-GURU.bat` + `tools/pasang-guru.ps1` (flashdisk, dari
   checkout Windows) → double-click bat-nya.
2. Isi **kunci ruangan** (tanpa spasi) — kunci ini juga yang dipakai semua
   PC murid.
3. Installer: cek Node → unduh repo → `npm install` → tulis config `teacher`
   → coba daftarkan firewall port 8787 (kalau bukan admin: cukup klik ALLOW
   saat pertama jalan) → buat **"Torang Panggung.bat"** di Desktop
   (menyalakan cloud terbuka-LAN + app panggung sekaligus) → **menampilkan
   IP LAN + kunci yang harus diisikan ke installer murid**.
4. Jalankan "Torang Panggung.bat": terminal cloud terbuka + panel operator +
   4 window TV muncul.

## C. Tiap PC MURID — `PASANG-MURID.bat`

1. Bawa `tools/PASANG-MURID.bat` + `tools/pasang-murid.ps1` → double-click.
   (Alternatif tanpa flashdisk: PowerShell →
   `irm https://raw.githubusercontent.com/yuzuruzero/torang-stage/main/tools/pasang-murid.ps1 -OutFile "$env:TEMP\pm.ps1"; powershell -ExecutionPolicy Bypass -File "$env:TEMP\pm.ps1"`)
2. Isi tiga hal: **kursi** (mis. `komp3`, satu kursi satu PC), **alamat
   cloud** dan **kunci ruangan** — keduanya persis seperti yang ditampilkan
   installer guru di langkah B.3.
3. Hasil: **"Torang Kelas.bat"** di Desktop. Dijalankan → hanya window kecil
   "Selamat datang di kelas Torang"; murid pilih nama; di panel guru kursi
   itu online + terikat nama. TIDAK ADA panel/TV panggung di PC murid —
   kalau config rusak, app berhenti dengan pesan error, tidak pernah
   menebak mode (pelindung insiden 11 Agu).

## D. Kalau ada masalah

- **Node belum ada** → installer membuka nodejs.org; pasang LTS, ulangi.
- **Kursi tidak muncul online di panel guru** → (1) beda jaringan Wi-Fi/LAN,
  (2) firewall PC guru belum allow 8787, (3) kunci ruangan tidak sama,
  (4) router memblok antar-perangkat (client isolation) — pakai router
  sendiri/kabel.
- **Layar murid menghitam saat glow** → laporkan; fallback bar tepi disiapkan.
- **PC murid pernah salah tampil panggung** (instal ≤ v0.2.2) → pasang ulang
  dengan installer terbaru, atau buka `apps\theater\torang-theater.config.json`
  di Notepad → Save As → Encoding **UTF-8** (tanpa BOM).
- **Unduhan gagal / PC tanpa internet** → belum ada jalur full-offline;
  bilang ke Claude, dibuatkan varian installer offline.
