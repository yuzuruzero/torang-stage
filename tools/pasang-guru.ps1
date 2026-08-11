# ============================================================================
# PASANG TORANG STAGE - PC GURU (Windows)
# Memasang mode PANGGUNG: cloud + panel operator + 4 window TV.
# Mengunduh repo dari GitHub sebagai ZIP (tanpa git), npm install, menulis
# config teacher, dan membuat "Torang Panggung.bat" di Desktop yang
# menyalakan cloud (terbuka ke LAN) + app panggung sekaligus.
#
# Cara pakai: double-click PASANG-GURU.bat, atau:
#   powershell -ExecutionPolicy Bypass -File pasang-guru.ps1 -RoomKey kunciku
# ============================================================================
param(
  [string]$RoomKey = "",
  [string]$Repo = "yuzuruzero/torang-stage",
  [string]$Tujuan = "$env:USERPROFILE\torang-stage"
)

$ErrorActionPreference = "Stop"
function Gagal($pesan) { Write-Host "`n[GAGAL] $pesan" -ForegroundColor Red; Read-Host "Tekan Enter untuk keluar"; exit 1 }

Write-Host "=== Pasang Torang Stage - PC GURU (panggung) ===" -ForegroundColor Cyan

# --- 1. Cek Node.js >= 20 ----------------------------------------------------
try { $nodeVer = (node -v) 2>$null } catch { $nodeVer = $null }
if (-not $nodeVer -or -not ($nodeVer -match "^v(\d+)\.")) {
  Start-Process "https://nodejs.org/en/download"
  Gagal "Node.js belum terpasang. Halaman unduhan sudah dibuka - install Node LTS, lalu jalankan pemasang ini lagi."
}
if ([int]$Matches[1] -lt 20) { Gagal "Node.js $nodeVer terlalu tua (butuh >= 20)." }
Write-Host "Node.js $nodeVer OK"

# --- 2. Kunci ruangan (dipakai juga oleh semua PC murid) ---------------------
while ($RoomKey -notmatch "^[A-Za-z0-9_-]+$") {
  if ($RoomKey) { Write-Host "kunci hanya boleh huruf/angka/-/_ tanpa spasi" -ForegroundColor Yellow }
  $RoomKey = Read-Host "Kunci ruangan kelas ini [Enter = dev-room-key]"
  if (-not $RoomKey) { $RoomKey = "dev-room-key" }
}

# --- 3. Unduh repo sebagai ZIP (tanpa git) -----------------------------------
if (Test-Path $Tujuan) {
  $cadangan = "$Tujuan-lama-$(Get-Date -Format yyyyMMdd-HHmmss)"
  Write-Host "Folder lama ditemukan - dipindah ke $cadangan (tidak dihapus)"
  Move-Item $Tujuan $cadangan
}
$zip = Join-Path $env:TEMP "torang-stage-main.zip"
Write-Host "Mengunduh https://github.com/$Repo/archive/refs/heads/main.zip ..."
Invoke-WebRequest -Uri "https://github.com/$Repo/archive/refs/heads/main.zip" -OutFile $zip -UseBasicParsing
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

# --- 5. Tulis config TEACHER (tanpa BOM - pelajaran insiden 11 Agu) ----------
$cfg = @{
  mode        = "teacher"
  endpoint_id = "teacher-1"
  cloud_ws    = "ws://127.0.0.1:8787/ws"
  cloud_api   = "http://127.0.0.1:8787"
  room_key    = $RoomKey
  branch      = "dev"
  room        = "r1"
  dev_layout  = $true
  kiosk       = $false
} | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path $Tujuan "apps\theater\torang-theater.config.json"), $cfg)
Write-Host "Config panggung ditulis (mode teacher, kunci=$RoomKey)"

# --- 6. Firewall port 8787 (perlu admin; kalau bukan admin cukup Allow saat jalan)
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($admin) {
  netsh advfirewall firewall delete rule name="Torang Stage 8787" | Out-Null
  netsh advfirewall firewall add rule name="Torang Stage 8787" dir=in action=allow protocol=TCP localport=8787 | Out-Null
  Write-Host "Aturan firewall port 8787 ditambahkan"
} else {
  Write-Host "Bukan admin - lewati firewall. Saat pertama jalan, pilih ALLOW ketika Windows bertanya." -ForegroundColor Yellow
}

# --- 7. Shortcut Desktop: nyalakan cloud (LAN) + panggung sekaligus ----------
$bat = Join-Path ([Environment]::GetFolderPath("Desktop")) "Torang Panggung.bat"
@"
@echo off
cd /d "$Tujuan"
start "Torang Cloud" cmd /k jalankan-cloud-lan.bat $RoomKey
timeout /t 6 /nobreak >nul
npm run guru
"@ | Set-Content -Path $bat -Encoding ASCII
Write-Host "Shortcut dibuat: $bat"

# --- 8. Deteksi IP LAN (untuk diisikan ke installer PC murid) ----------------
$ipLan = $null
try {
  $ipCfg = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | Select-Object -First 1
  if ($ipCfg) { $ipLan = $ipCfg.IPv4Address.IPAddress }
} catch { }

Write-Host "`n=== SELESAI ===" -ForegroundColor Green
Write-Host "Jalankan lewat 'Torang Panggung.bat' di Desktop (cloud + panggung sekaligus)."
if ($ipLan) {
  Write-Host ""
  Write-Host ">>> Untuk installer PC MURID, isikan: <<<" -ForegroundColor Cyan
  Write-Host "    Alamat cloud : http://${ipLan}:8787" -ForegroundColor Cyan
  Write-Host "    Kunci ruangan: $RoomKey" -ForegroundColor Cyan
} else {
  Write-Host "IP LAN tidak terdeteksi otomatis - cek dengan: ipconfig (adapter yang punya Default Gateway)."
}
$jalan = Read-Host "`nJalankan panggung sekarang? (y/n)"
if ($jalan -eq "y") { Start-Process -FilePath $bat }
