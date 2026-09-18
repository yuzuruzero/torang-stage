<#
  coba-satu.ps1 - uji SATU rekaman, dari berkas suara sampai intent.

  Jalur yang sama persis dengan yang nanti dipakai voice command:
      berkas suara -> whisper-cli -> transkrip -> normalisasi -> parser -> intent

  Dipakai untuk mencoba cepat tanpa harus menyiapkan 26 kalimat. Ini juga uji
  pertama yang paling murah untuk pertanyaan yang belum pernah terjawab:
  apakah Whisper mengenali bahasa Indonesia di mesin ini, dan seberapa cepat.

  Pemakaian:
    .\coba-satu.ps1 -Berkas rekaman-mentah\rekaman-hp.mp4
    .\coba-satu.ps1 -Berkas rekaman-mentah\rekaman-hp.mp4 -TanpaBias
    .\coba-satu.ps1 -Berkas x.wav -Model model\ggml-small-q5_1.bin
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Berkas,
  [string]$Model,
  [switch]$TanpaBias,
  [switch]$Cepat,
  [switch]$Grammar,
  [double]$DendaGrammar = 100.0,
  [int]$Threads = 8
)

$ErrorActionPreference = "Stop"

function Ok   ($m) { Write-Host "  OK   $m" -ForegroundColor Green }
function Info ($m) { Write-Host "  ..   $m" -ForegroundColor Gray }
function Awas ($m) { Write-Host "  !!   $m" -ForegroundColor Yellow }
function Mati ($m) { Write-Host "  XX   $m" -ForegroundColor Red }

# Semua pemanggilan program luar lewat sini - lihat berkasnya untuk
# alasannya (dua jebakan Windows PowerShell 5.1).
. (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "lib-jalankan-luar.ps1")

$DirSkrip = Split-Path -Parent $MyInvocation.MyCommand.Path
$Exe      = Join-Path $DirSkrip "bin\whisper-cli.exe"
if (-not $Model) { $Model = Join-Path $DirSkrip "model\ggml-base-q8_0.bin" }
elseif (-not [System.IO.Path]::IsPathRooted($Model)) { $Model = Join-Path $DirSkrip $Model }
if (-not [System.IO.Path]::IsPathRooted($Berkas)) { $Berkas = Join-Path $DirSkrip $Berkas }

foreach ($p in @($Exe, $Model, $Berkas)) {
  if (-not (Test-Path $p)) { Mati "tidak ada: $p"; exit 1 }
}
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { Mati "ffmpeg tidak ada di PATH."; exit 1 }

$BIAS = "Torang. Perintah panggung: puter, pindah, buka, tutup, lanjut, ulang, stop, sapa, glow. " +
        "Sasaran: layar satu, layar dua, layar tiga, layar empat, " +
        "TV satu, TV dua, TV tiga, TV empat, komp, semua layar, semua komp. " +
        "Angka: satu, dua, tiga, empat, lima, enam, tujuh, delapan, sembilan, sepuluh, " +
        "sebelas, dua belas, tiga belas, empat belas, lima belas, enam belas, tujuh belas, " +
        "delapan belas, sembilan belas, dua puluh."

Write-Host ""
Write-Host "=== Coba satu rekaman ===" -ForegroundColor Cyan
Write-Host "    Berkas : $(Split-Path -Leaf $Berkas)"
Write-Host "    Model  : $(Split-Path -Leaf $Model)"
Write-Host "    Bias   : $(if ($TanpaBias) { 'mati' } else { 'aktif' })"
Write-Host "    Grammar: $(if ($Grammar) { "AKTIF (denda $DendaGrammar)" } else { 'mati' })"
Write-Host ""

# --- 1. jadikan WAV 16 kHz mono ------------------------------------------
$wav = Join-Path $env:TEMP "torang-coba-$(Get-Random).wav"
$ubah = Jalankan-Luar "ffmpeg" @(
  "-hide_banner", "-loglevel", "error", "-i", $Berkas,
  "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le", "-y", $wav
)
if ($ubah.Kode -ne 0 -or -not (Test-Path $wav)) {
  Mati "gagal mengubah berkas jadi WAV"; Write-Host $ubah.Teks; exit 1
}
Ok "diubah jadi WAV 16 kHz mono"

$probe = Jalankan-Luar "ffprobe" @(
  "-v", "error", "-show_entries", "format=duration",
  "-of", "default=noprint_wrappers=1:nokey=1", $wav
)
$durasi = 0.0
[void][double]::TryParse($probe.Keluaran.Trim(), [ref]$durasi)
if ($durasi -gt 0) { Info ("panjang ucapan {0:N1} detik" -f $durasi) }

# --- 2. transkripsi -------------------------------------------------------
$argsW = @("-m", $Model, "-f", $wav, "-l", "id", "-nt", "-t", "$Threads")
if (-not $TanpaBias) { $argsW += @("--prompt", $BIAS) }
# Bawaan whisper-cli: 5 beams + best-of 5. Untuk kosakata tertutup sependek
# punya kita, pencarian selebar itu jarang mengubah hasil tapi jelas menambah
# waktu. -Cepat memakai greedy (1 beam) sebagai pembanding.
if ($Cepat) { $argsW += @("-bs", "1", "-bo", "1") }

# JEBAKAN: whisper.cpp hanya mengaktifkan grammar kalau --grammar DAN
# --grammar-rule dua-duanya diberikan. Kalau salah satu lupa, grammar
# DILEWATI DIAM-DIAM dan hasilnya terlihat seperti jalan biasa. Karena itu
# keduanya selalu dikirim bersama, dan stderr diperiksa setelahnya.
$fileGrammar = Join-Path $DirSkrip "torang.gbnf"
if ($Grammar) {
  if (-not (Test-Path $fileGrammar)) { Mati "tidak ada: $fileGrammar"; exit 1 }
  $argsW += @("--grammar", $fileGrammar, "--grammar-rule", "root",
              "--grammar-penalty", ("{0:F1}" -f $DendaGrammar))
}

Info "menjalankan Whisper ..."
$hasil = Jalankan-Luar $Exe $argsW
Remove-Item $wav -Force -ErrorAction SilentlyContinue

if ($hasil.Kode -ne 0) {
  Mati "whisper-cli gagal (kode $($hasil.Kode))"
  Write-Host $hasil.Teks
  exit 1
}

# Transkrip ada di STDOUT; seluruh log dan timing di STDERR. Keduanya sudah
# dipisah oleh Jalankan-Luar - jangan digabung lagi, itu justru yang dulu
# membuat log terbaca sebagai transkrip.
$teks = ($hasil.Keluaran -split "`r?`n" | ForEach-Object { $_.Trim() } |
         Where-Object { $_.Length -gt 0 }) -join " "
$teks = $teks.Trim()

# Pastikan grammar tidak dilewati diam-diam.
if ($Grammar) {
  if ($hasil.Galat -match "skipping grammar sampling") {
    Mati "grammar DILEWATI whisper - aturan 'root' tidak ditemukan di torang.gbnf"
    Write-Host ($hasil.Galat -split "`r?`n" | Where-Object { $_ -match "grammar" }) -ForegroundColor DarkGray
    exit 1
  }
  Ok "grammar aktif (keluaran dibatasi kalimat yang sah saja)"
}

$msMuat = $null; $msTotal = $null
if ($hasil.Galat -match "load time\s*=\s*([\d.]+)\s*ms")  { $msMuat  = [int][double]$matches[1] }
if ($hasil.Galat -match "total time\s*=\s*([\d.]+)\s*ms") { $msTotal = [int][double]$matches[1] }

Write-Host ""
Write-Host "  Whisper mendengar:" -ForegroundColor Cyan
Write-Host "    `"$teks`"" -ForegroundColor White
if ($null -ne $msMuat -and $null -ne $msTotal) {
  $produksi = $msTotal - $msMuat
  Write-Host ""
  Write-Host "  Latensi: $produksi ms" -NoNewline
  Write-Host "   (muat model $msMuat ms, sekali saat app nyala - tidak dihitung)" -ForegroundColor DarkGray

  # Anggaran 700 ms itu untuk ucapan ~2 detik. Membandingkan rekaman 7 detik
  # dengan angka itu mentah-mentah akan menyesatkan, jadi diskalakan.
  if ($durasi -gt 0) {
    $perDetik = $produksi / $durasi
    $ramalan2 = [int]($perDetik * 2)
    Write-Host ("           {0:N0} ms per detik audio -> perkiraan {1} ms untuk perintah 2 detik" -f $perDetik, $ramalan2)
    if ($ramalan2 -le 700) { Ok "perintah 2 detik diperkirakan MASUK anggaran 700 ms" }
    else { Awas "perintah 2 detik diperkirakan MELEWATI anggaran 700 ms - coba -Cepat" }
    Write-Host "           (perkiraan, bukan ukuran. Yang menentukan tetap uji 26 kalimat.)" -ForegroundColor DarkGray
  } elseif ($produksi -gt 700) { Awas "melewati anggaran 700 ms" }
}

if ($teks.Length -eq 0) {
  Write-Host ""
  Mati "Whisper tidak mengeluarkan teks apa pun di stdout."
  Write-Host $hasil.Galat -ForegroundColor DarkGray
  exit 1
}

# --- 3. normalisasi + parser ---------------------------------------------
Write-Host ""
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Awas "node tidak ada di PATH - bagian parser dilewati"; exit 0 }

$skrip = @'
import { parseKalimat } from "../openclaw/torang-cue.mjs";
import { rapikanTranskrip } from "./normalisasi-stt.mjs";
const teks = process.argv[2] ?? "";
const mentah = parseKalimat(teks);
const rapi = rapikanTranskrip(teks);
const sesudah = rapi.ok ? parseKalimat(rapi.teks) : { ok: false, error: rapi.alasanTolak };
const tampil = (nama, hasil) =>
  console.log(`  ${nama.padEnd(22)} ${hasil.ok ? JSON.stringify(hasil.intent) : "DITOLAK: " + hasil.error}`);
tampil("Parser (mentah)", mentah);
if (rapi.perubahan?.length) {
  console.log(`  Dirapikan jadi        "${rapi.teks}"`);
  console.log(`    ubah: ${rapi.perubahan.map((p) => `${p.dari} -> ${p.jadi}`).join(", ")}`);
}
tampil("Parser (dirapikan)", sesudah);
'@
$fileSkrip = Join-Path $DirSkrip "_coba-satu.mjs"
Set-Content -Path $fileSkrip -Value $skrip -Encoding utf8
try {
  $keluar = Jalankan-Luar "node" @($fileSkrip, $teks)
  Write-Host "  Hasil parser:" -ForegroundColor Cyan
  Write-Host $keluar.Teks
} finally {
  Remove-Item $fileSkrip -Force -ErrorAction SilentlyContinue
}
