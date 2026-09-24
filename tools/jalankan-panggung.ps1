# jalankan-panggung.ps1 - nyalakan cloud + panggung guru TANPA jendela terminal.
#
# Dipanggil oleh tools\Torang-Panggung.vbs (supaya PowerShell-nya sendiri juga
# tidak kelihatan). Yang tampil di layar hanya panel guru dan jendela TV.
#
#   1. Cloud: kalau belum hidup di port config, dinyalakan tersembunyi.
#      Keluarannya ke logs\cloud.log dan logs\cloud-galat.log.
#   2. App panggung (npm run guru) dinyalakan tersembunyi -> logs\app*.log.
#   3. Panel ditutup = app berhenti -> cloud yang DINYALAKAN SKRIP INI ikut
#      dimatikan. Cloud yang sudah hidup sebelumnya tidak disentuh.
#
# Kalau ada yang gagal, muncul kotak pesan beserta letak lognya - kegagalan
# tidak boleh diam hanya karena tidak ada terminal yang bisa dibaca.
#
# Kunci ruangan & port dibaca dari apps\theater\torang-theater.config.json
# (config yang ditulis pemasang) - tidak ada yang perlu diketik.
#
# File ini WAJIB murni ASCII (PowerShell 5.1 membaca .ps1 tanpa BOM sebagai
# cp1252) - dijaga tools\voice\skrip-windows.test.ts.

$ErrorActionPreference = "Stop"
$Akar = Split-Path -Parent $PSScriptRoot
Set-Location $Akar
$DirLog = Join-Path $Akar "logs"
New-Item -ItemType Directory -Force -Path $DirLog | Out-Null

function Tampilkan-Pesan([string]$Teks, [bool]$Galat) {
  Add-Type -AssemblyName PresentationFramework
  $ikon = if ($Galat) { "Error" } else { "Information" }
  [System.Windows.MessageBox]::Show($Teks, "Torang Panggung", "OK", $ikon) | Out-Null
}

# --- config -------------------------------------------------------------------
$FileCfg = Join-Path $Akar "apps\theater\torang-theater.config.json"
$Kunci = "dev-room-key"
$Port = 8787
if (Test-Path $FileCfg) {
  try {
    $cfg = ([IO.File]::ReadAllText($FileCfg).TrimStart([char]0xFEFF)) | ConvertFrom-Json
    if ($cfg.mode -and $cfg.mode -ne "teacher") {
      Tampilkan-Pesan "PC ini dipasang sebagai PC MURID (mode '$($cfg.mode)'), bukan PC guru.`nPeluncur ini hanya untuk PC guru." $true
      exit 1
    }
    if ($cfg.room_key) { $Kunci = [string]$cfg.room_key }
    if ($cfg.cloud_api -and ([string]$cfg.cloud_api -match ":(\d+)")) { $Port = [int]$Matches[1] }
  } catch {
    Tampilkan-Pesan "Config panggung tidak terbaca:`n$FileCfg`n`n$($_.Exception.Message)" $true
    exit 1
  }
}

function Cloud-Hidup {
  try {
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri "http://127.0.0.1:$Port/api/state" | Out-Null
    return $true
  } catch { return $false }
}

function Matikan-Pohon($Proses) {
  if ($Proses -and -not $Proses.HasExited) {
    & taskkill.exe /PID $Proses.Id /T /F 2>&1 | Out-Null
  }
}

# --- 1. cloud -------------------------------------------------------------------
$ProsesCloud = $null
if (-not (Cloud-Hidup)) {
  $env:TORANG_HOST = "0.0.0.0"          # murid di LAN harus bisa menjangkau
  $env:TORANG_ROOM_KEY = $Kunci
  $env:TORANG_PORT = "$Port"
  $ProsesCloud = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run dev:cloud" `
    -WorkingDirectory $Akar -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $DirLog "cloud.log") `
    -RedirectStandardError (Join-Path $DirLog "cloud-galat.log")
  $siap = $false
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    if ($ProsesCloud.HasExited) { break }
    if (Cloud-Hidup) { $siap = $true; break }
  }
  if (-not $siap) {
    Matikan-Pohon $ProsesCloud
    Tampilkan-Pesan ("Cloud gagal menyala dalam 30 detik.`n`nLihat log:`n" +
      (Join-Path $DirLog "cloud.log") + "`n" + (Join-Path $DirLog "cloud-galat.log")) $true
    exit 1
  }
}

# --- 2. app panggung ------------------------------------------------------------
$mulai = Get-Date
$ProsesApp = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run guru" `
  -WorkingDirectory $Akar -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput (Join-Path $DirLog "app.log") `
  -RedirectStandardError (Join-Path $DirLog "app-galat.log")
# PowerShell 5.1: tanpa menyentuh .Handle sekali, ExitCode bisa kosong setelah
# proses selesai - kegagalan app jadi tidak terdeteksi.
$null = $ProsesApp.Handle
$ProsesApp.WaitForExit()

if ($ProsesApp.ExitCode -ne 0 -and ((Get-Date) - $mulai).TotalSeconds -lt 30) {
  Tampilkan-Pesan ("Panggung gagal dibuka.`n`nLihat log:`n" +
    (Join-Path $DirLog "app.log") + "`n" + (Join-Path $DirLog "app-galat.log")) $true
}

# --- 3. tunggu sampai TIDAK ada app panggung dari folder ini -------------------
# App bisa membuka ulang dirinya sendiri (tombol mode video, app.relaunch) atau
# digantikan app guru baru - prosesnya tidak lagi anak dari npm di atas. Cloud
# baru dimatikan setelah tidak ada satu pun electron dari folder repo ini.
$jalurElectron = Join-Path $Akar "node_modules"
while ($true) {
  Start-Sleep -Seconds 3
  $masih = Get-Process -Name "electron" -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and $_.Path.StartsWith($jalurElectron, [StringComparison]::OrdinalIgnoreCase) }
  if (-not $masih) { break }
}

Matikan-Pohon $ProsesCloud
