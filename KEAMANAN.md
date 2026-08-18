# Keamanan & Privasi — Torang Stage

Sistem ini mengendalikan tampilan di komputer orang lain (murid), jadi batas
keamanannya harus eksplisit. Dokumen ini merangkum: prinsip, pagar yang SUDAH
ditegakkan di kode, risiko yang tersisa + mitigasinya, dan checklist operasional.
(Keputusan teknis detail: `DECISIONS.md`. Prinsip produk: master doc §12, §18.)

## Prinsip desain (tidak boleh dilanggar)

1. **Telemetri satu arah, selamanya.** Tidak pernah ada remote-control atau
   membaca isi komputer murid. Cue hanya memutar konten/efek di dalam app.
2. **Kejujuran** (spine Torang): tidak mengklaim kemampuan yang tidak ada;
   murid diberi tahu apa yang dicatat.
3. **Least privilege**: tiap komponen hanya bisa melakukan yang dibutuhkan
   untuk mengajar.
4. **Kill switch selalu ada**: STOP (panel, hotkey, web) mengembalikan semua
   ke idle; menutup app murid menghentikan semuanya di PC itu.

## Pagar yang SUDAH ditegakkan di kode

- **Validasi dua sisi + whitelist di klien**: cloud memvalidasi semua input;
  endpoint memvalidasi ULANG tiap cue (schema + tipe + target) dan menolak
  yang asing dengan ACK `rejected`. Tidak ada jalur dari cue ke perintah OS,
  file, atau shell.
- **Cue hanya bisa memutar aset dari folder lokal** yang terdaftar di manifest.
- **Overlay murid tidak pernah merebut fokus** (`showInactive`); fullscreen
  hanya terjadi kalau MURID mengklik.
- **Nama murid (input bebas) divalidasi di cloud** (2–24 huruf, karakter aman)
  **dan di-escape** sebelum tampil di panel (anti-XSS).
- **Config rusak → app BERHENTI dengan pesan error** — tidak pernah menebak
  mode (pelindung insiden "PC murid jadi panggung").
- **Jembatan OpenClaw = parser deterministik**: agent hanya meneruskan kalimat;
  grammar tertutup (§5) menentukan intent; kalimat asing DITOLAK. Prompt
  injection ke agent maksimal menghasilkan intent panggung yang sah — bukan
  perintah OS.
- **Auth kunci ruangan** dibandingkan dengan `timingSafeEqual`; cloud default
  hanya loopback (mode LAN = pilihan eksplisit lewat `jalankan-cloud-lan.bat`).
- **Installer tidak pernah menghapus** — folder lama dipindah `-lama-<tanggal>`.

## Risiko yang tersisa + mitigasi

| # | Risiko | Dampak | Mitigasi sekarang | Rencana |
|---|--------|--------|-------------------|---------|
| 1 | Kunci ruangan lemah/bocor (`dev-room-key`) | Orang di LAN bisa kirim overlay/glow/video ke murid (gangguan kelas, bukan remote-exec) | Kunci unik per batch (ditanya installer guru); jaringan router sendiri | Rotasi kunci per sesi (open item tim) |
| 2 | `/api/state` terbuka tanpa kunci | Siapa pun di LAN melihat nama+kursi murid yang login | Jaringan kelas tertutup (SOP router Torang) | Kunci endpoint state |
| 3 | HTTP polos (tanpa TLS) di LAN | Kunci & nama lewat tak terenkripsi | Risiko kecil di LAN tertutup; JANGAN di Wi-Fi publik | TLS via Caddy saat deploy `stage.torang.ai` |
| 4 | Rantai pasok: installer murid menarik repo GitHub + paket npm | Akun GitHub dibobol = kode berbahaya terpasang di semua PC murid | Lockfile mengunci versi paket | **Aktifkan 2FA GitHub (wajib)**; rilis bertanda tangan saat packaging |
| 5 | Nama murid = data pribadi (UU PDP) | Kebocoran daftar nama | Data minimal (nama+kursi saja); tombol Reset per kelas; file binding di `logs/` tidak di-commit | Sampaikan ke murid apa yang dicatat (SOP kelas) |
| 6 | Firewall 8787 terbuka semua profil di PC guru | Perangkat lain di jaringan bisa mencoba API | Kunci kuat + jaringan sendiri; tutup cloud usai kelas | Batasi scope rule ke subnet kelas |
| 7 | Node.js terpasang global di PC murid | Bentrok versi bila PC punya kebutuhan Node lain | Diterima untuk jalur dev | Installer NSIS tanpa Node (keputusan #10) |
| 8 | App belum ditandatangani | Peringatan SmartScreen/antivirus | Instruksi "Allow" di panduan | Code signing saat packaging |
| 9 | Mesin guru = titik tunggal | Cloud mati = panggung berhenti | Desain gagal-dengan-jelas (§12); TV tetap lokal | Hardening + auto-restart saat packaging |

## Checklist operasional

**Setiap kelas:** kunci ruangan unik (jangan `dev-room-key`) · pakai router
Torang, bukan Wi-Fi gedung · Reset semua murid saat ganti kelas · tutup
jendela cloud usai kelas.

**Sebelum kelas berbayar/produksi:** 2FA GitHub aktif · kunci `/api/state` ·
TLS (deploy) · installer bertanda tangan (NSIS) · review ulang dokumen ini.

## Batas produk (jangan dijanjikan ke siapa pun)

Torang Stage BUKAN alat monitoring komputer. Telemetri (fase 2) hanya melihat
aktivitas AI agent yang murid pasang sendiri — bukan file, layar, browser,
atau ketikan murid. Use-case "awasi anak/karyawan" = produk lain, di luar
lingkup dan bertentangan dengan brand-trust Torang.
