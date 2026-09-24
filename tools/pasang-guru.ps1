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
  [string]$Tujuan = "$env:USERPROFILE\torang-stage",
  # Jalur suara (ffmpeg + whisper.cpp + model, ~90 MB) dipasang sekalian.
  # Pakai -TanpaVoice kalau mesin ini memang tidak akan dipakai voice command.
  [switch]$TanpaVoice
)

$ErrorActionPreference = "Stop"
function Gagal($pesan) { Write-Host "`n[GAGAL] $pesan" -ForegroundColor Red; Read-Host "Tekan Enter untuk keluar"; exit 1 }

Write-Host "=== Pasang Torang Stage - PC GURU (panggung) ===" -ForegroundColor Cyan

# --- 1. Cek Node.js >= 20 ----------------------------------------------------
$adaWinget = [bool](Get-Command winget -ErrorAction SilentlyContinue)
try { $nodeVer = (node -v) 2>$null } catch { $nodeVer = $null }
if (-not $nodeVer -or -not ($nodeVer -match "^v(\d+)\.")) {
  if ($adaWinget) {
    Write-Host "Node.js belum ada - memasang lewat winget ..." -ForegroundColor Yellow
    & winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
    Gagal "Node.js baru dipasang. PATH baru terbaca di jendela BARU - tutup PowerShell ini, buka yang baru, lalu jalankan perintah yang sama lagi."
  }
  Start-Process "https://nodejs.org/en/download"
  Gagal "Node.js belum terpasang dan winget tidak ada. Halaman unduhan sudah dibuka - install Node LTS, lalu jalankan pemasang ini lagi."
}
if ([int]$Matches[1] -lt 20) { Gagal "Node.js $nodeVer terlalu tua (butuh >= 20)." }
Write-Host "Node.js $nodeVer OK"

# --- 2. Kunci ruangan (dipakai juga oleh semua PC murid) ---------------------
# Kunci ini dipakai bersama SEMUA PC murid. Kunci berubah = seluruh kelas
# tidak bisa masuk, dan gejalanya muncul di mesin murid, bukan di sini - jadi
# orang akan mencari salahnya di tempat yang keliru.
#
# Karena itu kunci yang sudah ada di mesin ini dibaca dulu dan dipakai sebagai
# bawaan. Memasang ulang seharusnya tidak menuntut orang mengingat sesuatu yang
# sudah tersimpan di mesinnya sendiri.
$kunciLama = ""
$voiceLama = $null
$cfgLama = Join-Path $Tujuan "apps\theater\torang-theater.config.json"
if (Test-Path $cfgLama) {
  try {
    $isiLama = [System.IO.File]::ReadAllText($cfgLama).TrimStart([char]0xFEFF)
    $jsonLama = $isiLama | ConvertFrom-Json
    $kunciLama = ([string]($jsonLama.room_key)).Trim()
    # Pengaturan voice yang disetel guru (tombol clicker, nama mic) ikut dibaca -
    # alasannya sama dengan kunci: pemasangan ulang tidak boleh diam-diam
    # mengembalikan clicker ke F8. Gejalanya "clicker tiba-tiba mati", tanpa
    # petunjuk apa pun bahwa pembaruan yang menyebabkannya.
    $voiceLama = $jsonLama.voice
  } catch { $kunciLama = ""; $voiceLama = $null }  # config rusak - jangan gagalkan pemasangan
}

if (-not $RoomKey -and $kunciLama -match "^[A-Za-z0-9_-]+$") {
  $RoomKey = $kunciLama
  Write-Host "Kunci ruangan diambil dari pemasangan lama: $RoomKey" -ForegroundColor Green
  Write-Host "  (pakai -RoomKey <kunci> kalau memang mau menggantinya)"
}

while ($RoomKey -notmatch "^[A-Za-z0-9_-]+$") {
  if ($RoomKey) { Write-Host "kunci hanya boleh huruf/angka/-/_ tanpa spasi" -ForegroundColor Yellow }
  if ($kunciLama) {
    $RoomKey = Read-Host "Kunci ruangan kelas ini [Enter = $kunciLama]"
    if (-not $RoomKey) { $RoomKey = $kunciLama }
  } else {
    Write-Host "PERHATIAN: kunci ini dipakai juga oleh semua PC murid." -ForegroundColor Yellow
    $RoomKey = Read-Host "Kunci ruangan kelas ini [Enter = dev-room-key]"
    if (-not $RoomKey) { $RoomKey = "dev-room-key" }
  }
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

# --- 3b. Pakai ulang whisper dari pemasangan lama ----------------------------
# Tanpa ini, tiap kali kode diperbarui orang harus menunggu unduhan 90 MB lagi
# untuk berkas yang SAMA PERSIS - dan itu membuat orang enggan memperbarui,
# yang jauh lebih mahal daripada ruang disk yang dihemat.
if ($cadangan -and (Test-Path $cadangan)) {
  $binLama   = Join-Path $cadangan "tools\voice\bin"
  $modelLama = Join-Path $cadangan "tools\voice\model"
  $tujuanVoice = Join-Path $Tujuan "tools\voice"
  if ((Test-Path (Join-Path $binLama "whisper-cli.exe")) -and (Test-Path $tujuanVoice)) {
    Copy-Item $binLama -Destination $tujuanVoice -Recurse -Force
    Write-Host "whisper-cli dipakai ulang dari pemasangan lama (tidak diunduh lagi)"
  }
  if ((Test-Path $modelLama) -and @(Get-ChildItem $modelLama -Filter *.bin -ErrorAction SilentlyContinue).Count -gt 0 -and (Test-Path $tujuanVoice)) {
    Copy-Item $modelLama -Destination $tujuanVoice -Recurse -Force
    Write-Host "model whisper dipakai ulang dari pemasangan lama (hemat ~90 MB)"
  }
}

# --- 4. npm install ----------------------------------------------------------
Write-Host "npm install (sekali, beberapa menit - mengunduh Electron)..."
Push-Location $Tujuan
& npm.cmd install
if ($LASTEXITCODE -ne 0) { Pop-Location; Gagal "npm install gagal - cek internet lalu ulangi." }
Pop-Location

# --- 5. Tulis config TEACHER (tanpa BOM - pelajaran insiden 11 Agu) ----------
# Tombol & mic dari pemasangan lama dipakai lagi. berkas_uji SENGAJA tidak:
# kalau ikut terbawa, F8 di kelas akan memutar rekaman uji alih-alih mendengar.
$tombolPtt = "F8"
$tombolYa  = "F9"
$micCfg    = ""
if ($voiceLama) {
  $t = ([string]$voiceLama.tombol).Trim()
  if ($t -match '^[A-Za-z0-9+.,=-]{1,40}$') { $tombolPtt = $t }
  $y = ([string]$voiceLama.tombol_ya).Trim()
  if ($y -match '^[A-Za-z0-9+.,=-]{1,40}$') { $tombolYa = $y }
  $m = ([string]$voiceLama.mic).Trim()
  if ($m.Length -gt 0 -and $m.Length -le 200) { $micCfg = $m }
  if ($tombolPtt -ne "F8" -or $tombolYa -ne "F9" -or $micCfg) {
    Write-Host "Pengaturan voice dipakai ulang: bicara=$tombolPtt, ya=$tombolYa$(if ($micCfg) { ", mic=$micCfg" })" -ForegroundColor Green
  }
}
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
  # Voice dinyalakan di sini, bukan disuruh disunting tangan setelah pasang.
  # Kalau whisper gagal diunduh, app akan bilang sendiri di panel ("whisper-cli.exe
  # belum ada") - itu jauh lebih baik daripada voice yang diam tanpa alasan.
  voice       = @{
    enabled    = (-not $TanpaVoice)
    tombol     = $tombolPtt
    tombol_ya  = $tombolYa
    mode       = "toggle"
    mic        = $micCfg
    berkas_uji = ""
  }
} | ConvertTo-Json -Depth 5
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
# Bawaan (sejak v0.4.1): TANPA jendela terminal - cloud & app jalan tersembunyi,
# log ke folder logs\, tutup panel = cloud ikut berhenti (tools\jalankan-panggung.ps1).
# Versi "dengan terminal" tetap dibuat untuk mencari masalah.
$desktop = [Environment]::GetFolderPath("Desktop")
$bat = Join-Path $desktop "Torang Panggung.bat"
@"
@echo off
start "" wscript.exe "$Tujuan\tools\Torang-Panggung.vbs"
"@ | Set-Content -Path $bat -Encoding ASCII
$batTerminal = Join-Path $desktop "Torang Panggung (dengan terminal).bat"
@"
@echo off
cd /d "$Tujuan"
start "Torang Cloud" cmd /k jalankan-cloud-lan.bat $RoomKey
timeout /t 6 /nobreak >nul
npm run guru
"@ | Set-Content -Path $batTerminal -Encoding ASCII
Write-Host "Shortcut dibuat: $bat (tanpa terminal) + $batTerminal (untuk mencari masalah)"

# --- 8. Deteksi IP LAN (untuk diisikan ke installer PC murid) ----------------
$ipLan = $null
try {
  $ipCfg = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | Select-Object -First 1
  if ($ipCfg) { $ipLan = $ipCfg.IPv4Address.IPAddress }
} catch { }

# --- 8. Jalur suara: ffmpeg + whisper.cpp + model ---------------------------
if ($TanpaVoice) {
  Write-Host "`nJalur suara dilewati (-TanpaVoice). Pasang nanti dengan: tools\voice\PASANG-WHISPER.bat"
} else {
  Write-Host "`n--- Jalur suara (voice command) ---" -ForegroundColor Cyan

  # "ada" tidak cukup: ffmpeg bawaan aplikasi lain (mis. ImageMagick) sering
  # lebih dulu di PATH tapi tidak punya dshow - perangkat masukan untuk mic.
  function Ffmpeg-Bisa-Dshow {
    param([string]$Exe)
    if (-not $Exe) { return $false }
    $simpan = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { $keluar = (& $Exe -hide_banner -devices 2>&1 | Out-String) } catch { $keluar = "" }
    finally { $ErrorActionPreference = $simpan }
    return ($keluar -match "(?m)^\s*D\w*\s+dshow\b")
  }
  $ffmpegSekarang = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
  if ($ffmpegSekarang -and -not (Ffmpeg-Bisa-Dshow $ffmpegSekarang)) {
    Write-Host "ffmpeg di PATH ($ffmpegSekarang) tidak punya dshow - tidak bisa merekam mic." -ForegroundColor Yellow
    Write-Host "Memasang ffmpeg penuh di sampingnya ..." -ForegroundColor Yellow
    $ffmpegSekarang = $null
  }
  if (-not $ffmpegSekarang) {
    if ($adaWinget) {
      Write-Host "ffmpeg belum ada - memasang lewat winget ..." -ForegroundColor Yellow
      try {
        & winget install --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements --silent
      } catch { Write-Host "winget gagal: $_" -ForegroundColor Yellow }
      # winget menaruh ffmpeg di PATH mesin, tapi jendela INI tidak melihatnya.
      # Baca ulang PATH supaya pemasangan whisper di bawah tetap bisa jalan.
      $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                  [Environment]::GetEnvironmentVariable("Path", "User")
    } else {
      Write-Host "winget tidak ada - ffmpeg harus dipasang manual." -ForegroundColor Yellow
    }
  }
  $ffmpegAkhir = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
  if ($ffmpegAkhir -and (Ffmpeg-Bisa-Dshow $ffmpegAkhir)) {
    Write-Host "ffmpeg OK (punya dshow): $ffmpegAkhir"
  } elseif ($ffmpegAkhir) {
    Write-Host "ffmpeg di PATH masih yang tanpa dshow: $ffmpegAkhir" -ForegroundColor Yellow
    Write-Host "  Yang penuh mungkin sudah terpasang tapi kalah urutan PATH." -ForegroundColor Yellow
    Write-Host "  Cek nanti dengan: tools\voice\pasang-whisper.ps1 -CekSaja" -ForegroundColor Yellow
  } else {
    Write-Host "ffmpeg BELUM ada. Voice command belum bisa merekam mic." -ForegroundColor Yellow
    Write-Host "  Pasang: winget install Gyan.FFmpeg   lalu buka PowerShell baru." -ForegroundColor Yellow
  }

  $pasangWhisper = Join-Path $Tujuan "tools\voice\pasang-whisper.ps1"
  if (Test-Path $pasangWhisper) {
    try {
      & powershell -NoProfile -ExecutionPolicy Bypass -File $pasangWhisper
      if ($LASTEXITCODE -ne 0) { Write-Host "Pemasangan whisper belum tuntas - ulangi nanti dengan tools\voice\PASANG-WHISPER.bat" -ForegroundColor Yellow }
    } catch {
      Write-Host "Pemasangan whisper gagal: $_" -ForegroundColor Yellow
      Write-Host "Ulangi nanti dengan: tools\voice\PASANG-WHISPER.bat" -ForegroundColor Yellow
    }
  } else {
    Write-Host "tools\voice belum ada di repo ini - lewati." -ForegroundColor Yellow
  }
}

Write-Host "`n=== SELESAI ===" -ForegroundColor Green
Write-Host "Jalankan lewat 'Torang Panggung.bat' di Desktop (cloud + panggung sekaligus)."
if (-not $TanpaVoice) {
  # Dulu di sini tertulis "buka PowerShell baru, jalankan TORANG-DENGAR.bat".
  # Itu jalur lama - voice kini hidup DI DALAM app panggung. Petunjuk yang
  # menyuruh membuka PowerShell justru mengarahkan guru ke hal yang diminta
  # untuk tidak pernah tampil di depan kelas.
  Write-Host "Voice command sudah menyala di dalam panggung - tanpa PowerShell:" -ForegroundColor Cyan
  Write-Host "    F8 = mulai / selesai bicara"
  Write-Host "    F9 = benarkan usulan kalimat kalau perintahnya ditolak"
  Write-Host "    Status & apa yang terdengar tampil di kartu 'Voice command' di panel."
}
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
