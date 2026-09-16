# ============================================================================
# PASANG SKILL "panggung-torang" KE HERMES AGENT (Windows)
#
# Skrip ini TIDAK memasang apa pun sebelum Hermes benar-benar ditemukan.
# Urutannya: deteksi Hermes -> deteksi checkout torang-stage -> config CLI ->
# tulis SKILL.md -> verifikasi. Gagal di langkah mana pun = berhenti, tidak
# ada berkas yang ditulis setengah jalan.
#
# Cara pakai:
#   powershell -ExecutionPolicy Bypass -File pasang-skill-hermes.ps1
#   powershell -ExecutionPolicy Bypass -File pasang-skill-hermes.ps1 -CekSaja
#
# Berkas lama TIDAK PERNAH ditimpa diam-diam: kalau sudah ada, disalin dulu
# jadi <nama>.backup-<tanggal-jam> baru ditulis ulang.
# ============================================================================
param(
  [string]$StageDir  = "",    # folder checkout torang-stage
  [string]$SkillsDir = "",    # timpa lokasi folder skills Hermes
  [string]$Api       = "",    # alamat cloud panggung untuk config CLI
  [string]$RoomKey   = "",    # kunci ruangan untuk config CLI
  [switch]$CekSaja            # hanya laporkan temuan, jangan tulis apa pun
)

$ErrorActionPreference = "Stop"
$stempel = Get-Date -Format yyyyMMdd-HHmmss

function Gagal($pesan) {
  Write-Host ""
  Write-Host "[GAGAL] $pesan" -ForegroundColor Red
  Write-Host "Tidak ada berkas yang ditulis." -ForegroundColor Red
  Read-Host "Tekan Enter untuk keluar"
  exit 1
}
function Info($pesan) { Write-Host $pesan }
function Ok($pesan)   { Write-Host "  OK  $pesan" -ForegroundColor Green }
function Awas($pesan) { Write-Host "  !   $pesan" -ForegroundColor Yellow }

function TulisTanpaBOM($path, $isi) {
  $dir = Split-Path $path -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  if (Test-Path $path) {
    $cadangan = "$path.backup-$stempel"
    Copy-Item $path $cadangan
    Awas "berkas lama disalin ke $cadangan (tidak dihapus)"
  }
  [System.IO.File]::WriteAllText($path, $isi, (New-Object System.Text.UTF8Encoding($false)))
}

Write-Host "=== Pasang skill panggung-torang ke Hermes ===" -ForegroundColor Cyan
if ($CekSaja) { Write-Host "MODE CEK SAJA - tidak ada yang akan ditulis." -ForegroundColor Yellow }

# Skrip ini menulis ke folder profil Windows. Tanpa USERPROFILE tidak ada yang
# bisa ditebak dengan aman - lebih baik berhenti.
if (-not $env:USERPROFILE) { Gagal "USERPROFILE tidak ada - skrip ini untuk Windows." }

# --- 1. Deteksi Hermes -------------------------------------------------------
Info "`n[1/5] Mencari Hermes Agent..."
$hermesExe = $null
$cmd = Get-Command hermes -ErrorAction SilentlyContinue
if ($cmd) { $hermesExe = $cmd.Source }
if (-not $hermesExe) {
  # Dibangun bertahap: env var yang kosong dilewati, bukan bikin skrip mati.
  $kandidat = @()
  if ($env:LOCALAPPDATA) {
    $kandidat += (Join-Path $env:LOCALAPPDATA "hermes\hermes.exe")
    $kandidat += (Join-Path $env:LOCALAPPDATA "Programs\hermes\hermes.exe")
  }
  $kandidat += (Join-Path $env:USERPROFILE ".hermes\bin\hermes.exe")
  $kandidat += (Join-Path $env:USERPROFILE ".local\bin\hermes.exe")
  foreach ($k in $kandidat) { if (Test-Path $k) { $hermesExe = $k; break } }
}
if (-not $hermesExe) {
  Gagal @"
Hermes Agent tidak ditemukan - di PATH maupun di lokasi pemasangan yang biasa.
Skrip ini sengaja berhenti daripada memasang skill ke folder yang belum tentu
dibaca siapa pun.

Yang bisa kamu lakukan:
  - pasang Hermes dulu (https://hermes-agent.nousresearch.com/), lalu ulangi; atau
  - kalau Hermes sudah ada tapi di tempat tak biasa, jalankan lagi dengan:
      -SkillsDir "C:\path\ke\.hermes\skills"
"@
}
Ok "hermes: $hermesExe"
try { $ver = & $hermesExe --version 2>&1 | Select-Object -First 1; Ok "versi : $ver" } catch { Awas "versi tidak terbaca (bukan penghalang)" }

# --- 2. Tentukan folder skills ----------------------------------------------
Info "`n[2/5] Menentukan folder skills..."
if (-not $SkillsDir) { $SkillsDir = Join-Path $env:USERPROFILE ".hermes\skills" }
Ok "folder skills: $SkillsDir"
if (-not (Test-Path $SkillsDir)) { Awas "folder belum ada - akan dibuat" }

$cfgHermes = Join-Path $env:USERPROFILE ".hermes\config.yaml"
if (Test-Path $cfgHermes) {
  if ((Get-Content $cfgHermes -Raw) -match "external_dirs") {
    Awas "config.yaml punya 'external_dirs' - kalau skill tetap tak terbaca, cek daftar itu"
  }
}

# Jejak pemasangan lama di tempat yang SALAH (jangan dihapus, cuma dilaporkan)
$salahTempat = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "hermes\skills\panggung-torang" } else { $null }
if ($salahTempat -and (Test-Path $salahTempat)) {
  Awas "ada salinan lama di $salahTempat"
  Awas "itu folder PROGRAM Hermes, bukan folder skills - Hermes tidak membacanya."
  Awas "Skrip ini tidak menghapusnya. Hapus sendiri kalau sudah yakin."
}

# --- 3. Deteksi checkout torang-stage ---------------------------------------
Info "`n[3/5] Mencari checkout torang-stage..."
# Test-Path MELEMPAR error kalau huruf drive-nya tidak ada (mis. tebakan D:\ di
# PC yang cuma punya C:), jadi tebakan dibungkus SilentlyContinue - bukan
# dibiarkan menghentikan skrip.
function PunyaCli($dir) {
  if (-not $dir) { return $false }
  try { return [bool](Test-Path (Join-Path $dir "tools\cli\torang.cmd") -ErrorAction SilentlyContinue) }
  catch { return $false }
}
if (-not (PunyaCli $StageDir)) {
  $tebakan = @(
    (Resolve-Path (Join-Path $PSScriptRoot "..\..") -ErrorAction SilentlyContinue | ForEach-Object { $_.Path }),
    (Join-Path $env:USERPROFILE "torang-stage"),
    "D:\projects\torang-stage"
  )
  $StageDir = $null
  foreach ($t in $tebakan) { if (PunyaCli $t) { $StageDir = $t; break } }
}
if (-not (PunyaCli $StageDir)) {
  Gagal @"
Checkout torang-stage tidak ditemukan (yang dicari: tools\cli\torang.cmd).
Jalankan installer PC guru dulu, atau ulangi dengan:
  -StageDir "C:\Users\<nama>\torang-stage"
"@
}
$torangCmd = Join-Path $StageDir "tools\cli\torang.cmd"
Ok "torang-stage: $StageDir"
Ok "CLI         : $torangCmd"

# --- 4. Config CLI (~/.torang-stage/config.json) -----------------------------
Info "`n[4/5] Memeriksa config CLI..."
$cfgFile = Join-Path $env:USERPROFILE ".torang-stage\config.json"
$perluTulisCfg = $true
if (Test-Path $cfgFile) {
  try {
    $cfgLama = Get-Content $cfgFile -Raw | ConvertFrom-Json
    Ok "sudah ada: api=$($cfgLama.api) room_key=$($cfgLama.room_key)"
    if (-not $Api -and -not $RoomKey) { $perluTulisCfg = $false }
    else { Awas "-Api/-RoomKey diberikan - config akan ditulis ulang (yang lama dicadangkan)" }
  } catch { Awas "config ada tapi tidak terbaca sebagai JSON - akan ditulis ulang" }
} else {
  Awas "belum ada: $cfgFile"
}
if ($perluTulisCfg -and -not $CekSaja) {
  if (-not $Api) {
    $Api = Read-Host "Alamat cloud panggung [Enter = http://127.0.0.1:8787]"
    if (-not $Api) { $Api = "http://127.0.0.1:8787" }
  }
  while ($RoomKey -notmatch "^[A-Za-z0-9_-]+$") {
    if ($RoomKey) { Write-Host "kunci hanya huruf/angka/-/_ tanpa spasi" -ForegroundColor Yellow }
    $RoomKey = Read-Host "Kunci ruangan (sama dengan yang dipakai installer guru)"
  }
  TulisTanpaBOM $cfgFile (@{ api = $Api; room_key = $RoomKey } | ConvertTo-Json)
  Ok "config ditulis: $cfgFile"
}

# --- 5. Tulis SKILL.md -------------------------------------------------------
Info "`n[5/5] Menyiapkan SKILL.md..."
$template = Join-Path $PSScriptRoot "SKILL.template.md"
if (-not (Test-Path $template)) { Gagal "SKILL.template.md tidak ada di sebelah skrip ini ($PSScriptRoot)." }
$torangModulCmd = Join-Path $StageDir "tools\cli\torang-modul.cmd"
if (-not (Test-Path $torangModulCmd)) {
  Awas "torang-modul.cmd belum ada di checkout ini - bagian 'daftarkan video baru' di skill tidak akan jalan sampai repo diperbarui."
}
$isi = (Get-Content $template -Raw).
  Replace("__TORANG_CMD__", $torangCmd).
  Replace("__TORANG_MODUL_CMD__", $torangModulCmd)
$tujuanSkill = Join-Path $SkillsDir "panggung-torang\SKILL.md"

if ($CekSaja) {
  Write-Host ""
  Write-Host "=== CEK SAJA - yang AKAN dilakukan ===" -ForegroundColor Yellow
  Write-Host "  tulis : $tujuanSkill"
  if ($perluTulisCfg) { Write-Host "  tulis : $cfgFile" }
  Write-Host "  isi SKILL.md memakai CLI: $torangCmd"
  exit 0
}
TulisTanpaBOM $tujuanSkill $isi
Ok "skill ditulis: $tujuanSkill"

# --- Verifikasi --------------------------------------------------------------
Write-Host "`n=== Verifikasi ===" -ForegroundColor Cyan
Write-Host "1) CLI bicara ke panggung:"
& $torangCmd state
if ($LASTEXITCODE -ne 0) {
  Awas "CLI belum bisa menjangkau panggung (exit $LASTEXITCODE)."
  Awas "Nyalakan 'Torang Panggung.bat' dulu, lalu ulangi perintah di atas."
} else { Ok "panggung terjangkau" }

Write-Host "`n2) Hermes melihat skill-nya:"
try { & $hermesExe skills list } catch { Awas "'hermes skills list' gagal dijalankan - cek manual." }

Write-Host "`n=== SELESAI ===" -ForegroundColor Green
Write-Host "Uji dengan 'hermes chat' POLOS (jangan --toolsets skills - tool"
Write-Host "terminal tidak ikut dimuat, jadi skill terpicu tapi tidak pernah"
Write-Host "dieksekusi). Lalu ucapkan: Torang, tolong sapa komputer satu."
Read-Host "`nTekan Enter untuk keluar"
