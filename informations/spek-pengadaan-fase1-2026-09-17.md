# Spek Pengadaan Fase 1 — Panggung Torang

**Tanggal:** 17 Sep 2026 · **Disusun:** tim programmer (dokumen 04 §F: "bukan tugas
coding, tapi programmer mendefinisikan spek") · **Untuk:** Hadi → pengadaan (Friesca)
**Ruangan:** Central Park, Jakarta Barat · **Target debut:** Sep–Okt 2026

> **Kenapa ini mendesak.** Mode kiosk 4 TV **belum pernah sekali pun dijalankan
> pada konfigurasi aslinya** — kode baru mengaktifkan kiosk kalau mesin guru
> melihat ≥5 display, dan yang teruji sampai hari ini baru grid dev 2×2 di satu
> monitor. Ini satu-satunya item di seluruh proyek yang **tidak bisa dikejar
> dengan menulis kode lebih cepat.** Kalau barang datang akhir Oktober, premis
> empat layar masih belum teruji saat kelas berbayar dimulai.

Dokumen ini menulis **kriteria**, bukan merek/model — harga dan ketersediaan di
Jakarta berubah cepat, jadi pemilihan barang final sebaiknya dicek ke vendor
dengan kriteria di bawah sebagai patokan.

---

## 1. Mesin guru — kemampuan display (PALING KRITIS)

**Kebutuhan: 5 display aktif serentak** — 1 monitor panel operator + 4 TV.

⚠ **Jebakan yang harus disampaikan ke vendor:** sebagian besar kartu grafis
konsumen (GeForce maupun Radeon kelas umum) hanya mendukung **4 display
serentak**, berapa pun jumlah port fisiknya. Membeli kartu ber-4 port lalu
menambah monitor operator **tidak otomatis jalan**.

Tiga jalan keluar, urut dari yang kami sarankan:

| Opsi | Cara | Catatan |
|---|---|---|
| **A (disarankan)** | Monitor panel operator dicolok ke **grafis onboard CPU (iGPU)**; 4 TV semuanya ke kartu grafis | Paling murah. Syarat: CPU punya iGPU, motherboard punya port video, dan di BIOS iGPU diaktifkan berdampingan dengan kartu grafis (sering namanya *iGPU Multi-Monitor*). **Mohon dipastikan ke vendor sebelum beli.** |
| **B** | Kartu grafis kelas workstation yang memang mendukung >4 display | Lebih mahal, lebih sedikit kejutan |
| **C** | Dua kartu grafis | Hindari kecuali terpaksa — menambah titik gagal saat kelas |

**Kriteria kartu grafis:**

- **4 output video** yang bisa aktif bersamaan (HDMI/DisplayPort; campuran tidak
  masalah, adapter DP→HDMI **aktif** dipakai kalau port TV-nya HDMI semua).
- Sanggup **4× pemutaran video 1080p H.264 serentak** — ini beban ringan untuk
  GPU mana pun yang punya decoder perangkat keras; yang menentukan justru jumlah
  display, bukan tenaga grafisnya.
- Sisakan tenaga untuk yang berjalan bersamaan di mesin yang sama: pixel office
  telemetri, STT lokal, agent Hermes, dan cloud (selama `stage.torang.ai` belum
  di-deploy, cloud juga hidup di mesin ini).

**Yang perlu dicek di mesin guru yang sekarang sebelum membeli apa pun:** CPU-nya
apa, ada iGPU atau tidak, PSU berapa watt, dan slot PCIe-nya masih kosong atau
tidak. Kalau mesin gurunya ternyata tidak memadai, ini berubah dari "beli kartu"
jadi "beli PC" — dan itu keputusan dengan harga sangat berbeda, lebih baik
ketahuan sekarang.

## 2. Kabel ke TV3 & TV4

Ruangan memanjang; TV3 dan TV4 ada di **belakang**, jaraknya **>10 m** dari mesin
guru di depan.

- Kabel HDMI pasif biasa **tidak bisa diandalkan** di jarak itu — gejalanya
  bukan mati total, tapi layar berkedip atau mati-hidup sendiri di tengah kelas.
  Justru itu yang paling buruk untuk pertunjukan.
- **Disarankan: HDMI aktif optik (AOC)** — satu kabel utuh, tanpa alat tambahan
  di dua ujung. Perhatikan kabel jenis ini **berarah**: ujungnya ditandai
  SOURCE (ke komputer) dan DISPLAY (ke TV), jangan tertukar.
- Alternatif: extender HDBaseT (sepasang pemancar+penerima + kabel Cat6). Lebih
  fleksibel untuk instalasi permanen, tapi lebih banyak alat yang bisa gagal.
- **Ukur dulu jarak tarikan kabel sebenarnya** (lewat plafon/dinding, bukan garis
  lurus) lalu tambahkan kelonggaran. Beli kurang panjang = beli dua kali.

Untuk TV1 dan TV2 di depan: HDMI biasa yang bagus sudah cukup.

## 3. Mic push-to-talk

⚠ **Jebakan kedua, dan ini yang paling sering terlewat:** tombol mute/PTT di mic
wireless umumnya hanya **membisukan audio di mic itu sendiri**. Komputer tidak
menerima sinyal apa pun bahwa tombol sedang ditekan — jadi perangkat lunak
**tidak bisa tahu** kapan guru mulai dan berhenti bicara. Padahal justru itu
guna PTT di rancangan kita: STT hanya memproses audio saat tombol ditekan.

**Yang dibutuhkan sebenarnya dua hal terpisah:**

| Fungsi | Alat | Kriteria |
|---|---|---|
| **Suara** | Mic wireless (handheld atau headset/lavalier) | Penerima punya output yang bisa masuk ke mesin guru. Kualitas cukup "jelas untuk dikenali mesin", bukan kualitas rekaman studio |
| **Sinyal tombol** | **Presenter/clicker wireless** yang tombolnya terbaca sebagai tombol keyboard | Ini yang dipegang guru dan ditekan saat bicara. Perangkat lunak membacanya sebagai PTT |

Presenter wireless murah dan sudah umum dipakai untuk presentasi — kita hanya
memakai ulang tombolnya. Kalau guru lebih suka tangannya bebas, alternatifnya
**footswitch USB** yang juga mengirim tombol keyboard.

**Jalur audio yang perlu dipastikan ada:**

- Penerima mic → **masuk** ke mesin guru. Banyak PC desktop sekarang **tidak
  punya line-in yang layak** — kalau begitu perlu **audio interface USB** kecil.
  Cek dulu port audio mesin gurunya.
- Mesin guru → **keluar** ke PA ruangan. Semua audio pertunjukan lewat sini
  (keputusan #5: satu PA sentral, video di TV & komputer murid muted).

**Catatan:** kalau ternyata Hermes punya input suara sendiri, bentuk PTT-nya bisa
berubah — tapi **mic dan tombolnya tetap dibutuhkan**, jadi pengadaan ini tidak
perlu menunggu jawaban soal itu.

## 4. Yang TIDAK perlu dibeli sekarang

- **Webcam ruangan** — fase 3 (mode ahli-live), sesudah debut.
- **Router/AP Torang** — sudah ada dan memang harus dipakai (Wi-Fi gedung rawan
  client isolation).
- **Apa pun untuk 20 komputer murid** — komputer murid sengaja **tidak diberi
  speaker** (keputusan #5) dan tidak butuh perangkat keras tambahan.

## 5. Yang kami minta

1. **Cek spesifikasi mesin guru yang ada sekarang** (CPU/iGPU, PSU, slot PCIe,
   port audio) — ini menentukan apakah pengadaannya kecil atau besar, dan lebih
   baik ketahuan minggu ini.
2. Ajukan barang di bagian 1–3.
3. **Beri tahu kami perkiraan tanggal barang datang.** Kalau lewat pertengahan
   Oktober, urutan kerja perlu disusun ulang: kami harus menyiapkan rencana
   cadangan pertunjukan dengan jumlah TV lebih sedikit, dan itu keputusan yang
   harus diambil lebih awal, bukan seminggu sebelum kelas.
