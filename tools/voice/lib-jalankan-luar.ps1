# --------------------------------------------------------------------------
# lib-jalankan-luar.ps1 - satu-satunya cara skrip di folder ini memanggil
# program luar (ffmpeg, ffprobe, whisper-cli). Di-dot-source oleh yang lain:
#
#     . (Join-Path $DirSkrip "lib-jalankan-luar.ps1")
#
# DUA MASALAH yang ditangani di sini, dua-duanya khas Windows PowerShell 5.1
# dan dua-duanya sudah pernah menjatuhkan skrip di folder ini:
#
# 1. 5.1 memperlakukan tiap baris stderr program luar sebagai error record.
#    Dengan $ErrorActionPreference = "Stop", satu baris keterangan biasa
#    menghentikan skrip. Di sini preferensinya diturunkan ke "Continue" HANYA
#    selama panggilan, lalu dikembalikan di blok finally.
#
# 2. Menggabung stderr ke stdout (2>&1) MERUSAK keluaran yang perlu dibaca.
#    whisper-cli menulis transkrip ke stdout dan seluruh lognya ke stderr;
#    kalau digabung, log ikut terbaca sebagai transkrip. Jadi stderr
#    dialihkan ke berkas sementara, dan stdout dikembalikan bersih.
#
# Yang dikembalikan:
#     .Keluaran  stdout saja - bersih, ini yang dipakai untuk hasil
#     .Galat     stderr saja - log, timing, pesan kesalahan
#     .Teks      keduanya - untuk ditampilkan saat sesuatu gagal
#     .Kode      kode keluar program
# --------------------------------------------------------------------------
function Jalankan-Luar {
  param(
    [Parameter(Mandatory = $true)][string]$Program,
    [Parameter(Mandatory = $true)][string[]]$Argumen
  )
  $fGalat = [System.IO.Path]::GetTempFileName()
  $simpan = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $keluaran = ""
  $kode = -1
  try {
    # `&` dipakai (bukan Start-Process) karena PowerShell mengutip argumen
    # berspasi dengan benar - penting untuk --prompt yang panjang.
    $keluaran = (& $Program @Argumen 2> $fGalat | Out-String)
    $kode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $simpan
  }
  $galat = ""
  try { $galat = [string](Get-Content $fGalat -Raw -ErrorAction SilentlyContinue) } catch { }
  Remove-Item $fGalat -Force -ErrorAction SilentlyContinue
  if ($null -eq $keluaran) { $keluaran = "" }
  if ($null -eq $galat) { $galat = "" }
  return [pscustomobject]@{
    Keluaran = $keluaran
    Galat    = $galat
    Teks     = ($keluaran + "`n" + $galat)
    Kode     = $kode
  }
}

# --------------------------------------------------------------------------
# Cari-Ffmpeg - mengembalikan path ffmpeg yang BENAR-BENAR bisa merekam mic.
#
# Pelajaran 18 Sep 2026: di PC Hadi, `Get-Command ffmpeg` menemukan
# C:\Program Files\ImageMagick-...\ffmpeg.exe - ffmpeg bawaan ImageMagick,
# yang ada di PATH lebih dulu. Build seperti itu umumnya tidak punya perangkat
# masukan `dshow`, dan dshow persis yang dipakai merekam mic di Windows.
#
# Jadi yang diperiksa BUKAN "apakah ffmpeg ada", melainkan "apakah ffmpeg ini
# punya dshow". Kesalahan memperlakukan ADA sebagai BISA sudah beberapa kali
# menipu kami hari ini; ini penutupnya untuk ffmpeg.
#
# Mengembalikan $null kalau tidak ada satu pun yang memenuhi.
# --------------------------------------------------------------------------
function Ffmpeg-PunyaDshow {
  param([Parameter(Mandatory = $true)][string]$Path)
  try {
    $r = Jalankan-Luar $Path @("-hide_banner", "-devices")
    return (($r.Keluaran + $r.Galat) -match "(?m)^\s*D\w*\s+dshow\b")
  } catch { return $false }
}

function Cari-Ffmpeg {
  $calon = @()
  # 1. semua ffmpeg di PATH, berurutan
  $calon += @(Get-Command ffmpeg -All -ErrorAction SilentlyContinue | ForEach-Object { $_.Source })
  # 2. lokasi bawaan winget Gyan.FFmpeg (belum tentu masuk PATH jendela ini)
  $calon += @(Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages") `
                -Filter "ffmpeg.exe" -Recurse -ErrorAction SilentlyContinue |
                ForEach-Object { $_.FullName })

  foreach ($c in ($calon | Where-Object { $_ } | Select-Object -Unique)) {
    if (Ffmpeg-PunyaDshow $c) { return $c }
  }
  return $null
}
