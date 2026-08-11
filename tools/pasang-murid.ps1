# ============================================================================
# PASANG TORANG STAGE - PC MURID (Windows)
# Mengunduh repo dari GitHub sebagai ZIP (tanpa git), npm install, menulis
# config kursi, dan membuat "Torang Kelas.bat" di Desktop.
#
# Cara pakai (implementor):
#   1) Double-click PASANG-MURID.bat (di flashdisk / hasil download), ATAU
#   2) PowerShell:  powershell -ExecutionPolicy Bypass -File pasang-murid.ps1
#      dengan opsi: -Kursi komp3 -Cloud http://192.168.8.10:8787 -RoomKey kunci
#
# Yang dipasang HANYA aplikasi kelas (mode student). Tidak menyentuh apa pun
# di luar folder tujuan + satu file .bat di Desktop.
# ============================================================================
param(
  [string]$Kursi = "",
  [string]$Cloud = "",
  [string]$RoomKey = "",
  [string]$Repo = "yuzuruzero/torang-stage",
  [string]$Tujuan = "$env:USERPROFILE\torang-stage"
)

$ErrorActionPreference = "Stop"
function Gagal($pesan) { Write-Host "`n[GAGAL] $pesan" -ForegroundColor Red; Read-Host "Tekan Enter untuk keluar"; exit 1 }

Write-Host "=== Pasang Torang Stage - PC murid ===" -ForegroundColor Cyan

# --- 1. Cek Node.js >= 20 -----------------------------------------------------
try { $nodeVer = (node -v) 2>$null } catch { $nodeVer = $null }
if (-not $nodeVer -or -not ($nodeVer -match "^v(\d+)\.")) {
  Start-Process "https://nodejs.org/en/download"
  Gagal "Node.js belum terpasang. Halaman unduhan sudah dibuka - install Node LTS, lalu jalankan pemasang ini lagi."
}
if ([int]$Matches[1] -lt 20) { Gagal "Node.js $nodeVer terlalu tua (butuh >= 20). Update dari nodejs.org dulu." }
Write-Host "Node.js $nodeVer OK"

# --- 2. Tanya isian yang kosong ---------------------------------------------
while ($Kursi -notmatch "^komp([1-9]|1[0-9]|20)$") {
  if ($Kursi) { Write-Host "kursi tidak valid: $Kursi (contoh benar: komp3)" -ForegroundColor Yellow }
  $Kursi = Read-Host "Nomor kursi PC ini (komp1..komp20)"
}
if (-not $Cloud) {
  $Cloud = Read-Host "Alamat cloud/panggung [Enter = http://192.168.8.10:8787]"
  if (-not $Cloud) { $Cloud = "http://192.168.8.10:8787" }
}
try { $uri = [uri]$Cloud } catch { Gagal "alamat cloud tidak valid: $Cloud" }
$ws = "ws://$($uri.Host):$($uri.Port)/ws"
if (-not $RoomKey) {
  $RoomKey = Read-Host "Kunci ruangan (dari guru/implementor) [Enter = dev-room-key]"
  if (-not $RoomKey) { $RoomKey = "dev-room-key" }
}

# --- 3. Unduh repo sebagai ZIP (tanpa git) -----------------------------------
if (Test-Path $Tujuan) {
  $cadangan = "$Tujuan-lama-$(Get-Date -Format yyyyMMdd-HHmmss)"
  Write-Host "Folder lama ditemukan - dipindah ke $cadangan (tidak dihapus)"
  Move-Item $Tujuan $cadangan
}
$zip = Join-Path $env:TEMP "torang-stage-main.zip"
$urlZip = "https://github.com/$Repo/archive/refs/heads/main.zip"
Write-Host "Mengunduh $urlZip ..."
Invoke-WebRequest -Uri $urlZip -OutFile $zip -UseBasicParsing
$tmpEkstrak = Join-Path $env:TEMP "torang-stage-ekstrak"
if (Test-Path $tmpEkstrak) { Remove-Item $tmpEkstrak -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $tmpEkstrak
Move-Item (Join-Path $tmpEkstrak "torang-stage-main") $Tujuan
Write-Host "Terpasang di $Tujuan"

# --- 4. npm install ----------------------------------------------------------
Write-Host "npm install (sekali, beberapa menit - mengunduh Electron)..."
Push-Location $Tujuan
& npm.cmd install
if ($LASTEXITCODE -ne 0) { Pop-Location; Gagal "npm install gagal - cek internet lalu ulangi." }
Pop-Location

# --- 5. Tulis config student -------------------------------------------------
$cfg = @{
  mode      = "student"
  cloud_ws  = $ws
  cloud_api = $Cloud
  room_key  = $RoomKey
  branch    = "dev"
  room      = "r1"
  seat      = $Kursi
  auto_login = $null
} | ConvertTo-Json
Set-Content -Path (Join-Path $Tujuan "apps\theater\torang-theater.config.json") -Value $cfg -Encoding UTF8
Write-Host "Config ditulis: kursi=$Kursi cloud=$Cloud"

# --- 6. Shortcut Desktop -----------------------------------------------------
$bat = Join-Path ([Environment]::GetFolderPath("Desktop")) "Torang Kelas.bat"
@"
@echo off
cd /d "$Tujuan"
npm run murid
"@ | Set-Content -Path $bat -Encoding ASCII
Write-Host "Shortcut dibuat: $bat"

# --- 7. Selesai --------------------------------------------------------------
Write-Host "`n=== SELESAI ===" -ForegroundColor Green
Write-Host "Jalankan lewat 'Torang Kelas.bat' di Desktop."
Write-Host "Verifikasi: window 'Selamat datang di kelas Torang' muncul, murid pilih nama,"
Write-Host "lalu di panel guru kursi $Kursi tampil online."
$jalan = Read-Host "Jalankan sekarang? (y/n)"
if ($jalan -eq "y") {
  Push-Location $Tujuan
  & npm.cmd run murid
  Pop-Location
}
