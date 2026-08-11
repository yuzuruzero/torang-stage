# Panduan: GitHub & Pasang di PC Murid

Alur: repo naik ke GitHub SEKALI (oleh Hadi) → tiap PC murid dipasang lewat
satu installer yang mengunduh repo sebagai ZIP (**tanpa git di PC murid**).

> Catatan jujur: ini jalur UJI/DEV (butuh Node + `npm install` per PC).
> Untuk kelas produksi, target akhirnya installer NSIS tanpa Node
> (keputusan #10) — menyusul di tahap packaging.

---

## A. Sekali saja — naikkan repo ke GitHub (di PC Hadi)

1. Buka https://github.com/new → nama repo **`torang-stage`** → **Public**
   (installer murid mengunduh zip tanpa login) → JANGAN centang "Add a README"
   → Create repository.
2. Dari WSL:

   ```bash
   cd /mnt/d/projects/torang-stage
   bash tools/push-ke-github.sh --kering   # lihat dulu apa yang akan terjadi
   bash tools/push-ke-github.sh            # ketik "ya" untuk push
   ```

   Kalau git minta login: username `yuzuruzero`, password = **Personal Access
   Token** (github.com/settings/tokens, scope `repo`).
3. Update berikutnya: commit dulu (atau minta Claude siapkan), lalu jalankan
   skrip yang sama lagi.

## B. Tiap kelas — siapkan PC GURU

1. Jalankan cloud yang terbuka ke LAN: double-click **`jalankan-cloud-lan.bat`**
   (atau `jalankan-cloud-lan.bat kunciBatch` untuk kunci ruangan sendiri).
   Saat Windows Firewall bertanya → **Allow** untuk jaringan **Private**.
2. Catat IP PC guru: `ipconfig` → mis. `192.168.8.10`. (Di venue: IP host
   statik dari router Torang — sudah jadi SOP jaringan kelas.)
3. Jalankan app teacher seperti biasa: `npm run dev:app`.

## C. Tiap PC murid — pasang (implementor)

Bawa 2 file dari folder `tools/` di flashdisk: **`PASANG-MURID.bat`** +
**`pasang-murid.ps1`** (ambil dari checkout Windows, bukan copy-paste web).

1. Double-click `PASANG-MURID.bat`.
2. Jawab tiga pertanyaan: **kursi** (mis. `komp3`), **alamat cloud**
   (mis. `http://192.168.8.10:8787`), **kunci ruangan** (samakan dengan guru).
3. Installer akan: cek Node ≥ 20 (kalau belum ada, halaman unduh terbuka) →
   unduh repo ZIP dari GitHub → `npm install` → tulis config kursi →
   buat **"Torang Kelas.bat"** di Desktop.
4. Jalankan "Torang Kelas.bat" → murid pilih nama → di panel guru kursi itu
   tampil online + terikat nama.

Alternatif satu baris (PowerShell, tanpa flashdisk):

```powershell
irm https://raw.githubusercontent.com/yuzuruzero/torang-stage/main/tools/pasang-murid.ps1 -OutFile "$env:TEMP\pm.ps1"; powershell -ExecutionPolicy Bypass -File "$env:TEMP\pm.ps1"
```

Pasang ulang / update versi: jalankan installer lagi — folder lama TIDAK
dihapus, dipindah jadi `torang-stage-lama-<tanggal>`.

## D. Kalau ada masalah

- **Node belum ada** → installer membuka nodejs.org; pasang LTS, ulangi.
- **Unduhan gagal / PC tanpa internet** → cek internet PC murid dulu. Untuk
  skenario full-offline (zip + node_modules dari flashdisk) belum ada jalurnya —
  bilang ke Claude, dibuatkan varian installer offline.
- **Kursi online tapi sapa/glow tidak sampai** → kunci ruangan beda dengan
  cloud, atau firewall PC guru memblok port 8787 (cek langkah B).
- **Layar murid menghitam saat glow** → laporkan; fallback bar tepi disiapkan.
