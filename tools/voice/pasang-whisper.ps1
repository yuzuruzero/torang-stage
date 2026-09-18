<#
  pasang-whisper.ps1 - memasang whisper.cpp (mesin STT lokal) untuk uji tahap A
  Panggung Torang. Tidak memasang apa pun ke sistem: semuanya masuk ke
  tools\voice\bin dan tools\voice\model, dan bisa dihapus dengan menghapus folder.

  Disiplin yang sama dengan pasang-skill-hermes.ps1: PERIKSA DULU, baru pasang.
  Kalau sudah ada, tidak diunduh ulang.

  Pemakaian:
    .\pasang-whisper.ps1              # pasang (model base-q8_0, ~82 MB)
    .\pasang-whisper.ps1 -CekSaja     # laporkan keadaan, jangan tulis apa pun
    .\pasang-whisper.ps1 -Model small-q5_1
    .\pasang-whisper.ps1 -Paksa       # unduh ulang walau sudah ada
#>
[CmdletBinding()]
param(
  [switch]$CekSaja,
  [ValidateSet("tiny-q8_0", "base-q8_0", "base", "small-q5_1", "small")]
  [string]$Model = "base-q8_0",
  [switch]$Paksa
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Ok   ($m) { Write-Host "  OK   $m" -ForegroundColor Green }
function Info ($m) { Write-Host "  ..   $m" -ForegroundColor Gray }
function Awas ($m) { Write-Host "  !!   $m" -ForegroundColor Yellow }
function Mati ($m) { Write-Host "  XX   $m" -ForegroundColor Red }
function Judul($m) { Write-Host ""; Write-Host $m -ForegroundColor Cyan }

# Semua pemanggilan program luar lewat sini - lihat berkasnya untuk
# alasannya (dua jebakan Windows PowerShell 5.1).
. (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "lib-jalankan-luar.ps1")

$DirSkrip  = Split-Path -Parent $MyInvocation.MyCommand.Path
$DirBin    = Join-Path $DirSkrip "bin"
$DirModel  = Join-Path $DirSkrip "model"
$Exe       = Join-Path $DirBin "whisper-cli.exe"
$FileModel = Join-Path $DirModel "ggml-$Model.bin"

# Rilis versi (v1.9.4 dst) HANYA berisi kode sumber - binary Windows ada di
# rilis build bernomor (b5130 dst). Diperiksa 18 Sep 2026. Jadi jangan pakai
# /releases/latest: skrip mencari rilis PERTAMA yang benar-benar punya asetnya.
$RepoApi        = "https://api.github.com/repos/ggml-org/whisper.cpp/releases?per_page=30"
$AsetDicari     = "whisper-bin-x64.zip"
$TagCadangan    = "b5130"
$UrlCadangan    = "https://github.com/ggml-org/whisper.cpp/releases/download/$TagCadangan/$AsetDicari"
$ModelBase      = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main"

Write-Host ""
Write-Host "=== Pasang whisper.cpp untuk Panggung Torang ===" -ForegroundColor Cyan
Write-Host "    Tujuan folder : $DirSkrip"
Write-Host "    Model         : ggml-$Model.bin"

try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }

# --------------------------------------------------------------------------
Judul "1. Periksa apa yang sudah ada"
# --------------------------------------------------------------------------
$adaExe   = Test-Path $Exe
$adaModel = Test-Path $FileModel

if ($adaExe)   { Ok   "whisper-cli.exe sudah ada ($([math]::Round((Get-Item $Exe).Length / 1KB)) KB)" }
else           { Info "whisper-cli.exe belum ada" }
if ($adaModel) { Ok   "model sudah ada ($([math]::Round((Get-Item $FileModel).Length / 1MB, 1)) MB)" }
else           { Info "model ggml-$Model.bin belum ada" }

# Bukan sekadar "ada": yang diperiksa apakah ffmpeg-nya punya dshow, sebab
# itu yang dipakai merekam mic. Build ffmpeg bawaan aplikasi lain (mis.
# ImageMagick) sering ada di PATH lebih dulu tapi tidak punya dshow.
$ffmpegPath = Cari-Ffmpeg
$ffmpegAda = Get-Command ffmpeg -ErrorAction SilentlyContinue
if ($ffmpegPath) {
  Ok "ffmpeg (punya dshow) di $ffmpegPath - perekaman mic bisa jalan"
  if ($ffmpegAda -and $ffmpegAda.Source -ne $ffmpegPath) {
    Awas "Tapi yang lebih dulu di PATH: $($ffmpegAda.Source) - dan itu TIDAK punya dshow."
    Write-Host "       Perbaiki urutan PATH, atau sebut mic dengan path penuh saat merekam." -ForegroundColor Yellow
  }
} elseif ($ffmpegAda) {
  Awas "ffmpeg ditemukan ($($ffmpegAda.Source)) tapi TIDAK punya dshow."
  Write-Host "       Itu build bawaan aplikasi lain, bukan ffmpeg penuh. Perekaman mic tidak akan jalan." -ForegroundColor Yellow
  Write-Host "       Pasang yang penuh:  winget install Gyan.FFmpeg" -ForegroundColor Yellow
} else {
  Awas "ffmpeg TIDAK ditemukan. Diperlukan untuk merekam mic."
  Write-Host "       winget install Gyan.FFmpeg" -ForegroundColor Yellow
}
$ffmpeg = if ($ffmpegPath) { [pscustomobject]@{ Source = $ffmpegPath } } else { $null }

if ($CekSaja) {
  Write-Host ""
  # Sengaja TIDAK bilang "siap dipakai": -CekSaja hanya melihat berkasnya ada,
  # dan ada bukan berarti jalan. Yang membuktikan itu langkah 4.
  if ($adaExe -and $adaModel) {
    Ok "berkasnya lengkap (belum diverifikasi)"
    Info "jalankan tanpa -CekSaja untuk menguji apakah benar-benar jalan"
  }
  else { Info "Belum lengkap. Jalankan skrip ini tanpa -CekSaja untuk memasang." }
  Write-Host ""
  return
}

# CATATAN: "sudah terpasang" TIDAK boleh berarti "lewati verifikasi". Versi
# pertama skrip ini keluar lebih awal di titik ini, sehingga langkah 4 tidak
# pernah dijalankan sekali pun - pemasangan dinyatakan beres tanpa pernah
# dibuktikan. Sekarang yang dilewati hanya UNDUHANNYA (langkah 2 dan 3 punya
# penjaganya sendiri); langkah 4 selalu jalan.
if ($adaExe -and $adaModel -and -not $Paksa) {
  Info "sudah lengkap - unduhan dilewati, langsung ke verifikasi"
}

New-Item -ItemType Directory -Force -Path $DirBin, $DirModel | Out-Null

# --------------------------------------------------------------------------
Judul "2. Binary whisper.cpp (Windows x64, CPU)"
# --------------------------------------------------------------------------
if ($adaExe -and -not $Paksa) {
  Ok "dilewati - sudah ada"
} else {
  $url = $null; $tag = $null
  try {
    Info "mencari rilis GitHub yang punya $AsetDicari ..."
    $rilis = Invoke-RestMethod -Uri $RepoApi -Headers @{ "User-Agent" = "torang-stage" } -TimeoutSec 30
    foreach ($r in $rilis) {
      $aset = @($r.assets | Where-Object { $_.name -eq $AsetDicari })
      if ($aset.Count -gt 0) { $url = $aset[0].browser_download_url; $tag = $r.tag_name; break }
    }
  } catch {
    Awas "gagal membaca daftar rilis: $($_.Exception.Message)"
  }
  if (-not $url) {
    Awas "memakai rilis cadangan yang sudah diperiksa: $TagCadangan"
    $url = $UrlCadangan; $tag = $TagCadangan
  }
  Ok "rilis dipakai: $tag"

  $tmp = Join-Path $env:TEMP "torang-whisper-$(Get-Random)"
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  $zip = Join-Path $tmp $AsetDicari
  try {
    Info "mengunduh $url"
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -TimeoutSec 600
    Ok "terunduh ($([math]::Round((Get-Item $zip).Length / 1MB, 1)) MB)"

    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $cli = Get-ChildItem -Path $tmp -Recurse -Filter "whisper-cli.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $cli) {
      Mati "whisper-cli.exe tidak ada di dalam $AsetDicari. Isi arsip berubah - hentikan dan periksa manual."
      exit 1
    }
    # Salin SATU folder itu utuh: .exe butuh ggml-*.dll di sebelahnya.
    Copy-Item -Path (Join-Path $cli.Directory.FullName "*") -Destination $DirBin -Recurse -Force
    Ok "binary + DLL disalin ke bin\"
    "$tag" | Set-Content -Path (Join-Path $DirBin "VERSI.txt") -Encoding utf8
  } finally {
    Remove-Item -Path $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# --------------------------------------------------------------------------
Judul "3. Model bahasa"
# --------------------------------------------------------------------------
if ($adaModel -and -not $Paksa) {
  Ok "dilewati - sudah ada"
} else {
  $urlModel = "$ModelBase/ggml-$Model.bin"
  Info "mengunduh $urlModel"
  Info "(sekali saja; setelah ini semuanya jalan offline)"
  Invoke-WebRequest -Uri $urlModel -OutFile $FileModel -UseBasicParsing -TimeoutSec 1800
  $mb = [math]::Round((Get-Item $FileModel).Length / 1MB, 1)
  if ($mb -lt 20) {
    Mati "berkas model cuma $mb MB - kemungkinan yang terunduh halaman error, bukan model."
    Remove-Item $FileModel -Force -ErrorAction SilentlyContinue
    exit 1
  }
  Ok "model terunduh ($mb MB)"
}

# --------------------------------------------------------------------------
Judul "4. Verifikasi"
# --------------------------------------------------------------------------
# Verifikasi yang sesungguhnya: transkripsikan satu detik HENING.
# Menanyakan "-h" cuma membuktikan berkasnya bisa dieksekusi. Menjalankan satu
# transkripsi sungguhan membuktikan DLL termuat, model kebaca, dan seluruh
# jalurnya hidup - yang justru itu pertanyaannya.
$adaFfmpeg = [bool](Get-Command ffmpeg -ErrorAction SilentlyContinue)

if ($adaFfmpeg) {
  $wavUji = Join-Path $env:TEMP "torang-uji-hening-$(Get-Random).wav"
  $bikin = Jalankan-Luar "ffmpeg" @(
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono",
    "-t", "1", "-y", $wavUji
  )
  if (-not (Test-Path $wavUji)) {
    Awas "tidak bisa membuat berkas uji dengan ffmpeg; verifikasi diringankan"
    Write-Host $bikin.Teks
    $adaFfmpeg = $false
  } else {
    Info "menjalankan satu transkripsi percobaan ..."
    $uji = Jalankan-Luar $Exe @("-m", $FileModel, "-f", $wavUji, "-l", "id", "-nt")
    Remove-Item $wavUji -Force -ErrorAction SilentlyContinue

    if ($uji.Kode -eq 0) {
      Ok "whisper-cli.exe memuat model dan menyelesaikan transkripsi percobaan"
    } else {
      Mati "whisper-cli.exe gagal (kode keluar $($uji.Kode))."
      Write-Host $uji.Teks
      Awas "Kalau galatnya menyebut DLL yang hilang: pasang 'Microsoft Visual C++"
      Awas "Redistributable x64', lalu jalankan skrip ini lagi."
      exit 1
    }
  }
}

if (-not $adaFfmpeg) {
  # Tanpa ffmpeg kita tidak bisa membuat berkas uji, jadi cukup pastikan
  # programnya benar-benar bisa dijalankan dan mengeluarkan sesuatu.
  $uji = Jalankan-Luar $Exe @("-h")
  if ($uji.Teks.Trim().Length -gt 0) {
    Ok "whisper-cli.exe bisa dijalankan (transkripsi percobaan dilewati: ffmpeg belum ada)"
  } else {
    Mati "whisper-cli.exe tidak mengeluarkan apa pun - kemungkinan gagal dimuat."
    Awas "Pasang 'Microsoft Visual C++ Redistributable x64' lalu jalankan lagi."
    exit 1
  }
}

Write-Host ""
Ok "SELESAI. Mesin STT siap."
Write-Host ""
Write-Host "  Langkah berikutnya:" -ForegroundColor Cyan
Write-Host "    1. .\REKAM-UJI.bat    - rekam 26 kalimat baku dari mic"
Write-Host "    2. .\NILAI-UJI.bat    - jalankan Whisper + parser, cetak angkanya"
Write-Host ""
if (-not $ffmpeg) {
  Awas "Ingat: ffmpeg belum ada, jadi langkah 1 belum bisa jalan."
  Write-Host "       winget install Gyan.FFmpeg     (lalu buka PowerShell baru)"
  Write-Host ""
}
