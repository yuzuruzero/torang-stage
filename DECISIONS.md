# Log Keputusan Teknis (wewenang programmer — master §15)

Format ringkas: keputusan → alasan → catatan. Keputusan PRODUK tidak diulang di
sini (lihat master doc; itu terkunci).

## D1 · TypeScript di semua paket, monorepo npm workspaces
`packages/shared` (protokol) + `apps/cloud` + `apps/theater`. Alasan: satu
bahasa untuk cloud & Electron; kontrak pesan dibagi sebagai **source TS**
(tanpa build step terpisah) — cloud memakai `tsx`, theater dibundel esbuild.
Catatan: saat packaging NSIS nanti tambah langkah build resmi.

## D2 · HTTP = Fastify, WS = `ws`, validasi = zod (v4)
Alasan: ringan, matang, TS-friendly. **Validasi DUA SISI**: cloud memvalidasi
semua input; endpoint memvalidasi ulang cue + whitelist type/target dan menolak
yang asing (ACK `rejected`) — prinsip "jangan percaya perintah mentah".

## D3 · Penyimpanan fase 1 = in-memory + log JSONL
Show-state, registry, ACK = ephemeral (memang state pertunjukan); jejak ke
`apps/cloud/logs/cue-log.jsonl`. **Postgres masuk saat login sederhana &
binding (§8)** — skema tabel sudah ditetapkan master doc. Alasan: jangan bawa
DB sebelum ada data yang benar-benar butuh tahan lama.

## D4 · Geometri arah = RING searah jarum jam `[tv1, tv2, tv3, tv4]`
`pindah` memilih jalur ring terpendek; seri (layar berseberangan) → searah
jarum jam. Searah jarum jam = `exit_r` disambut `enter_l` (HUKUM §6 dijaga
`resolveDirection` + test). **ASUMSI yang perlu kalibrasi di ruangan asli
bersama tim video**; kelak jadi data registry per-ruangan, bukan konstanta.

## D5 · MOVE_CHARACTER di wire diurai jadi 2 cue PLAY_VIDEO
Exit di layar asal (T) + enter di tujuan (T + durasi_exit − overlap 300 ms);
enter membawa `payload.then_asset` (idle loop). Alasan: satu cue = satu
target+aset+waktu — sederhana & sinkron; sesuai §3.3 ("kombinasi otomatis").
Durasi dari manifest (diukur ffprobe saat generate aset).

## D6 · REPLAY ("ulang") = cue terakhir ber-role materi/enter, transisi di-CUT
Enter di-replay sebagai keadaan akhirnya (idle di layar tujuan) tanpa transisi.
Simplifikasi fase 1 — tinjau ulang saat rundown modul asli ada.

## D7 · Electron: esbuild, tanpa framework UI, jembatan IPC sempit
main+preload = CJS node, renderer = IIFE browser. `contextIsolation` aktif,
renderer tanpa Node; preload hanya mengekspos kanal yang didefinisikan
(`global.d.ts`). Panel operator masih vanilla TS — React dipertimbangkan saat
panel membesar (rundown pohon, antrean unbound, dsb).

## D8 · Hotkey global menembak API cloud, BUKAN playback lokal
`Ctrl+Alt+G/S/R` → `POST /api/intent` → cue kembali via WS. Alasan: menguji
jalur cue yang SAMA dengan voice nanti (§14 "hotkey GO manual DULUAN — jalur
cue teruji tanpa STT"); hotkey tetap backup senyap saat voice gagal.

## D9 · Audio dari window panel (mesin guru) → PA; video TV muted
Elemen `<audio>` tersembunyi di panel operator, dijadwalkan pada `start_at`
yang sama dengan video (keputusan #5: satu PA sentral). Sinkron TV↔PA trivial
karena satu mesin (keputusan #9).

## D10 · Auth fase 1 = `room_key` (REST + WS hello), SHA-256 + timingSafeEqual
Default dev `dev-room-key` (cloud memperingatkan). TLS urusan Caddy saat deploy.
Kebijakan join_key per-batch (statik vs rotasi) = open item tim — slot sudah ada.
Cloud bind `127.0.0.1` secara default; `TORANG_HOST=0.0.0.0` eksplisit bila perlu.

## D11 · Aset placeholder DI-COMMIT (total ~140 KB)
Supaya `npm install && npm run dev` langsung jalan tanpa ffmpeg di Windows.
Regenerasi: `npm run assets` (ffmpeg; di Windows bisa lewat WSL). Penamaan file
mengikuti kontrak §6 (`m99_{jenis}_tes.*` + `_audio.m4a`) + `manifest.json`
dengan durasi terukur.

## D12 · Waktu: `start_at` absolut jam server; offset klien via ping/pong
Offset = `server_now + rtt/2 − now`, dikirim balik ke cloud (tanda merah panel
bila >250 ms, §7). STOP tanpa lead (langsung). Ketepatan terukur di smoke test:
telat 0–1 ms (satu mesin).

## D13 · EOL & git
`.gitattributes`: `*.sh` LF, `*.bat`/`*.ps1` CRLF (pelajaran repo torang-murid);
aset biner ditandai `binary`. Skrip `.sh` di-`chmod +x` sebelum commit.

## D14 · (v0.2.0, amandemen D3) Roster/binding fase 1 = file JSON, bukan DB
Login sederhana §8 disimpan `apps/cloud/logs/bindings-{cohort}.json` (tahan
restart); daftar murid = `config/cohort-dev.json` (diinput admin/implementor).
Alasan: dev di Windows Hadi tanpa Docker/DB; datanya kecil; BENTUKNYA mengikuti
tabel §8 (`students`, `seats`, `bindings`) supaya migrasi ke Postgres di
torang-sg-1 mekanis. Field `client_id` sudah ada (diisi fase 2 file-watcher).

## D15 · (v0.2.0) Keputusan mode student
- **room_key hanya di proses main** — renderer login memanggil API lewat IPC,
  tidak pernah memegang kunci (least privilege).
- Overlay tampil dengan `showInactive()` — sopan, TIDAK merebut fokus (#6).
- Ketukan (PLAY_VIDEO ke komp) **click-gated**: ACK berhenti di `scheduled`
  sampai murid mengklik → `played` setelah materi selesai. Status jujur:
  panel melihat siapa yang belum membuka.
- Cue yang terpotong STOP tetap berstatus `scheduled` tanpa `played` (dikenal;
  kandidat status `stopped` di protokol menyusul bila mengganggu di gladi).
- GLOW = satu window fullscreen transparan click-through. **Verifikasi
  transparansi di Windows asli wajib** (di Xvfb headless jatuh ke hitam —
  artefak compositing). Fallback yang sudah dirancang bila bermasalah:
  4 window bar tepi (menghitam pun hanya menutup 14 px pinggir).
- Multi-instance satu mesin dev: `userData` dipisah per peran/kursi.

## D16 · (v0.3.0) Jembatan OpenClaw = TEKS dulu, parser deterministik di skrip
Alur voice §2.1 dicicil dari belakang: skill OpenClaw guru meneruskan kalimat
APA ADANYA ke `torang-cue.mjs`; parser grammar §5 (kosakata tertutup, angka
kata satu–dua puluh) yang menentukan intent — LLM tidak pernah memutuskan
aksi; kalimat asing DITOLAK dengan pesan jelas. Kosakata alias dari
`GET /api/vocab` (manifest = sumber kosakata §6), cloud tetap memvalidasi
ulang. Konfirmasi-toast 1 dtk (§5) DITUNDA ke tahap PTT/Whisper — ketikan
sudah tindakan sadar, mic yang rawan salah dengar. "glow" ditambahkan sebagai
aksi EKSTENSI di luar 8 kata resmi (praktis untuk uji; tim kurikulum boleh
mencoret). "buka" (scene/pixel office) ditolak jujur: fase 2.

## D17 · (v0.2.6) JANGAN globalShortcut `Ctrl+Alt+HURUF` di Windows
Setara AltGr+huruf → mengganggu pengetikan aplikasi lain selama app hidup
(insiden Claude desktop 11 Agu, terkonfirmasi hilang setelah pindah).
Hotkey = tombol F: `Ctrl+Alt+F9/F10/F11`; `hotkeys:false` mematikan total.

## D18 · (16 Sep 2026) Scene non-video di TV dirujuk lewat NAMA, bukan URL
`SWITCH_SCENE` hanya membawa nama scene (`^[a-z0-9][a-z0-9_-]{0,31}$`); URL-nya
dipetakan LOKAL di mesin endpoint (`scenes: { office: "http://127.0.0.1:19000" }`
di `torang-theater.config.json`). Nama yang tidak ada di peta itu ditolak dengan
ACK error. Alasan: disiplin yang sama dengan aset video — **cue dari jaringan
tidak pernah bisa menyuruh TV membuka alamat sembarangan**, bahkan kalau cloud
disusupi. Dijaga test otomatis "cue tidak boleh mengandung http".
Konsekuensi: `pixel-office` dan `web-app` (master §F) jadi satu mekanisme, bukan
dua scene terpisah — bedanya cuma isi peta di config mesin.

## D19 · (16 Sep 2026) TV yang sedang ber-scene KELUAR dari cincin arah
`ShowState.scenes` mencatat tv → nama scene. Selama scene terbuka, Torang tidak
pernah dipindahkan ke layar itu: `puter`/`pindah`/`buka` ke TV tersebut ditolak
dengan pesan untuk GURU ("tutup dulu"), bukan pesan programmer. Alasan: layar
monitoring telemetri tidak boleh tertimpa video di tengah kelas (keputusan Hadi).
`STOP` = saklar darurat, jadi ikut menutup semua scene. Kalau kelak layar
monitoring dimaui BERTAHAN melewati STOP, satu-satunya yang perlu disentuh
adalah baris `scenes: {}` di `planStop()`.

## D20 · (16 Sep 2026) Klip transisi & idle boleh DIPINJAM (`transisi_default`)
Hanya klip `materi` yang wajib milik modul sendiri. `enter_*`/`exit_*`/`idle`
boleh dipinjam dari modul yang ditunjuk `transisi_default` di manifest (klip
milik sendiri selalu menang). Alasan: video materi baru yang didaftarkan guru
lewat `torang-modul` cuma punya satu berkas — tanpa peminjaman ini memutarnya
mengunci Torang di satu layar. Nama aset yang dikirim adalah nama aset milik
modul **PEMBERI**, karena berkas itulah yang ada di cache lokal tiap mesin.
Catatan turunan (bug 16 Sep): `puter` ke TV lain kini juga **meninggalkan layar
lama** dengan klip exit — dulu layar lama terus mengulang idle dan Torang tampak
ada di tiga tempat sekaligus (melanggar HUKUM ilusi kontinu §6). Modul yang tak
punya klip exit: layar lama dibersihkan ke idle kosong lewat `SWITCH_SCENE`
`scene: null` — lebih baik hilang rapi daripada menggandakan Torang.

## D21 · (22 Sep 2026, dipasang ke repo 24 Sep) Decoder video selalu software
**Keputusan.** App theater menjalankan Chromium dengan
`--disable-accelerated-video-decode`. Semua klip panggung didekode di CPU
(FFmpeg), bukan lewat decoder hardware GPU.
**Alasan.** Di PC guru baru (Ryzen 7 8700F, RTX 5070, Windows 11 build 26200,
Electron 43/Chromium 150) decoder hardware D3D11 hanya menghasilkan ~10 fps:
klip 2 dtk selesai 3,5–14 dtk, `electron-log.txt` penuh `DecoderStatus` error.
Klip panggung 720p/1080p H.264 — decoder software di CPU mana pun sanggup
ratusan fps. Dengan software decode, perilaku pemutaran jadi SERAGAM di semua
PC dan tidak lagi bergantung driver GPU masing-masing mesin. Terukur 2.001–2.006
ms untuk klip 2.000 ms, 0 frame jatuh, dalam kondisi kelas.
**Konsekuensi.** (1) Klip di atas 1080p atau codec berat (HEVC/AV1) tidak
disarankan — tetap H.264 ≤1080p sesuai kontrak aset. (2) PC murid ikut kena
setelan ini; kalau ada PC yang justru tersendat setelah ini, geser tombol
**"Video patah-patah? mode video cadangan"** (panel guru / jendela login murid) —
lihat D28.
**Ditolak.** Throttling renderer latar (dugaan pertama) — terbukti bukan
penyebabnya (raf tetap 60/dtk); switch anti-throttling + `backgroundThrottling:false`
dipertahankan hanya karena benar untuk kiosk. Memaksa jalur ANGLE/blocklist —
tidak berpengaruh, dicabut.
**Cara dipasang ke repo (24 Sep).** Kode asli PC guru baru belum di-commit dan
tidak terjangkau dari PC utama; obatnya dipasang ULANG dari deskripsi
`HANDOFF-2026-09-22-pc-guru-baru.md`: switch di `main.ts` (bisa dimatikan per PC
lewat tombol, D28), `backgroundThrottling:false` di `windows.ts`. Telemetri frame
(raf/frame/drop di ACK `played`) dan `gpu-diagnostik.json` — alat diagnosa, bukan
obat — TIDAK ikut.

## D22 · (24 Sep 2026) `puter` ke layar lain = exit → enter → BARU materi
Dulu `puter X di tvB` saat Torang di tvA mengirim exit di tvA dan **materi di
tvB pada detik yang sama**, tanpa klip enter — Torang muncul sebelum sempat pergi
(dilihat Hadi saat uji). Kini urutannya sama dengan `pindah`: exit di tvA (T),
enter di tvB (T + exit − overlap), materi setelah enter selesai.
**Cara materi menyusul:** menumpang sebagai `then_asset` klip enter (jalur idle
yang sudah ada), BUKAN cue kedua ke TV yang sama — `tv.ts runCue` membatalkan
cue terjadwal dan langsung memuat berkas begitu cue baru datang, jadi enter akan
terpotong. Suara materi dijadwalkan lewat cue **audio-saja** (`targets:["teacher"]`,
tanpa `asset`) pada detik materi mulai. Enter membawa `materi_audio` supaya
`ulang` bisa memasangkan suaranya lagi.
**Keterbatasan dikenal:** materi dimuat saat enter selesai (tanpa pre-load),
jadi gambar bisa telat puluhan ms dari suara. Obat yang benar = pre-load di
`tv.ts` (elemen video kedua) — ditunda sampai perubahan `tv.ts` dari PC guru
baru (22 Sep) sudah digabung, supaya tidak ada dua versi `tv.ts` yang bentrok.

## D23 · (24 Sep 2026) `puter` tanpa sasaran = layar tempat Torang berada
`target` pada `PLAY_MODULE` jadi opsional. Kosong → `show.screen`, atau TV
pertama di cincin kalau Torang belum muncul. Diselesaikan di CLOUD (yang tahu
Torang di mana), bukan di parser. Pada kalimat berurutan, sasaran kosong
diselesaikan dengan keadaan SETELAH langkah sebelumnya ("pindah ke TV4 lalu
puter tes" → tes di TV4).

## D24 · (24 Sep 2026) Kalimat majemuk: `dan` = serentak, `lalu` = berurutan
Intent baru `MAJEMUK { tahap: IntentTunggal[][] }` — tahap berurutan, isi tahap
serentak; paling banyak **3 perintah** (`MAKS_BAGIAN_MAJEMUK`). Aturan:
semua tahap disimulasikan dulu — satu gagal, seluruh kalimat 422, tidak ada cue
terkirim; tahap berikutnya dikirim cloud saat tayangan tahap sebelumnya
**selesai** (keputusan Hadi: tunggu video, bukan tunggu Torang sampai) dan
direncanakan ULANG dengan keadaan saat itu; satu layar maksimal disebut sekali
per tahap; maksimal satu pemindah Torang per tahap, direncanakan duluan;
perintah lain di layar yang sedang ditinggalkan Torang menunggu klip exit.
stop/lanjut/ulang/buka window/tata harus sendiri. Antrean hanya satu; kalimat
majemuk/tata baru menggantikannya; STOP dan `BATAL_ANTREAN` mengosongkannya;
perintah tunggal biasa tidak. Parser dan GBNF memakai aturan yang sama (diuji:
grammar menghasilkan ⇔ parser menerima).
**Ditolak:** mengirim semua tahap sekaligus dengan `start_at` jauh di depan —
renderer membatalkan cue terjadwal saat cue baru datang, show-state akan
melompat ke keadaan akhir, dan STOP tidak bisa membatalkan cue yang sudah
terkirim ke endpoint.

## D25 · (24 Sep 2026) Tata layar = preset 4 TV, disimpan cloud, disunting panel
`apps/cloud/config/tata-layar.json` (env `TORANG_TATA`). Isi per TV: `biarkan` /
`kosong` / `modul:<alias>` / `scene:<nama>`. Dijalankan sebagai SATU tahap
majemuk (aturan D24 berlaku). Disimpan lewat `POST /api/tata` (room_key) — cloud
menolak modul yang tidak ada, scene yang tidak dikenal (`TORANG_SCENES`, bawaan
`office`), lebih dari satu modul ber-presenter Torang, dan nama yang memakai
kata perintah/penghubung. `kosong` di layar tempat Torang berada = Torang pamit
(perilaku baru `tutup`).

## D26 · (24 Sep 2026) `presenter` menentukan apakah modul memindahkan Torang
Modul ber-`presenter: "torang"` di TV = Torang pindah ke sana (dengan transisi).
Presenter lain (slide, ahli) tayang di tempat tanpa menggeser Torang, sehingga
empat TV bisa menampilkan empat hal berbeda tanpa melanggar HUKUM §6 (Torang
satu). Memutar modul non-Torang di layar tempat Torang berada ditolak ("pindahkan
dulu"). `torang-modul` saat ini selalu mendaftarkan `presenter: "torang"` —
opsi presenter lain belum ada di CLI.

## D27 · (24 Sep 2026) Jeda konfirmasi 1 dtk sebelum perintah suara dikirim
`voice.konfirmasi_ms` (bawaan 1000; 0 = mati). Menunaikan komitmen surat amandemen
#3 ("toast konfirmasi WAJIB"). Batal = tombol bicara ditekan lagi, atau tombol
BATAL di panel (IPC `panel:voice-batal`, didaftarkan di `voice.ts`); tombol ya =
kirim sekarang. Jeda ditaruh di mesin guru SEBELUM intent dikirim, jadi total
latensi = jeda + lead 1,5 dtk.
**Ditolak (untuk sekarang):** jeda menumpang lead 1,5 dtk seperti rancangan surat
amandemen — itu menuntut cloud membatalkan cue yang SUDAH terkirim ke endpoint,
dan endpoint belum punya pembatalan per-cue (hanya STOP total).

## D28 · (24 Sep 2026) Mode video diganti lewat TOMBOL, bukan config
Tombol geser "Video patah-patah? mode video cadangan" di panel guru DAN jendela
login murid. Nyala = decoder kartu grafis; mati (bawaan) = decoder software (D21).
Alasan (Hadi): orang yang memakai PC murid tidak akan menyunting config JSON.
Pilihan disimpan di `userData\mode-video.json` PC itu sendiri — soal perangkat
keras mesin itu, jadi bertahan saat repo di-update / panel dipasang ulang, dan
tidak ikut ter-commit. Switch Chromium hanya berlaku sebelum app siap, jadi
mengganti mode = simpan lalu `app.relaunch()` (argumen `--config=` ikut dibawa);
murid perlu mengetik nama lagi setelahnya — tertulis di dialog konfirmasi.
**Ditolak:** opsi `video_decoder_hardware` di config (versi pertama sore ini) —
dicabut sebelum dipakai siapa pun.

## D29 · (24 Sep 2026) Panel guru mengikuti deck (layar 1), bukan tumpukan kartu
Tata letak tetap: bilah atas (batch · Cloud · Jam · Konten · voice · ⚙ Alat · STOP),
tiga kolom (rundown klik-untuk-lompat · posisi Torang & peta ruangan TV + 20
kursi · riwayat cue + efek otomatis + klip reaksi), bilah bawah suara (PTT ·
transkrip Whisper · konfirmasi 1 detik · GO/ULANG/STOP). Aksi per layar dan per
kursi lewat MENU saat kotaknya diklik — peta ruangan tetap bersih. Fitur yang
tidak ada di mockup (penyunting tata layar, video baru, mode video, pemulihan)
di laci "⚙ Alat"; chip tata layar & antrean tetap di peta ruangan.
**Kejujuran tampilan:** efek otomatis & klip reaksi ditampilkan non-aktif dengan
label "fase 2" / "aset belum ada" — belum ada di sistem, tidak dipura-purakan.
"Kantor terisi" (telemetri) diganti "Murid masuk kelas" (login + online).
**Keamanan klik:** langkah rundown dipilih dulu, baru ▶ dijalankan (intent baru
`LOMPAT_RUNDOWN`) — satu klik salah tidak boleh menayangkan apa pun. Papan ketik
saat panel fokus: Spasi = GO, R = ULANG, Esc = BATAL selama konfirmasi, selain
itu STOP; tidak aktif saat mengetik di kotak isian.
