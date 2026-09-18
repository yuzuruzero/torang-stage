<#
  rekam-uji.ps1 - merekam kalimat baku dari mic untuk uji tahap A.

  Hasilnya WAV 16 kHz mono (format yang diminta Whisper) di tools\voice\rekaman\.
  Rekam seperti guru akan bicara di kelas: berdiri sejauh biasanya dari mic,
  volume bicara normal, dan JANGAN terlalu rapi - kalau di kelas nanti ada AC,
  kipas, atau murid bersuara, rekam dengan suara itu ada. Uji yang terlalu
  bersih menghasilkan angka yang menyenangkan dan menyesatkan.

  Pemakaian:
    .\rekam-uji.ps1                    # rekam yang belum ada
    .\rekam-uji.ps1 -DaftarMic         # cuma tampilkan daftar mic
    .\rekam-uji.ps1 -Mic "Microphone (Realtek(R) Audio)"
    .\rekam-uji.ps1 -Ulang             # rekam ulang semuanya
    .\rekam-uji.ps1 -Detik 5
#>
[CmdletBinding()]
param(
  [string]$Mic,
  [int]$Detik = 4,
  [switch]$Ulang,
  [switch]$DaftarMic
)

$ErrorActionPreference = "Stop"

function Ok   ($m) { Write-Host "  OK   $m" -ForegroundColor Green }
function Info ($m) { Write-Host "  ..   $m" -ForegroundColor Gray }
function Awas ($m) { Write-Host "  !!   $m" -ForegroundColor Yellow }
function Mati ($m) { Write-Host "  XX   $m" -ForegroundColor Red }

# Semua pemanggilan program luar lewat sini - lihat berkasnya untuk
# alasannya (dua jebakan Windows PowerShell 5.1).
. (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "lib-jalankan-luar.ps1")

$DirSkrip   = Split-Path -Parent $MyInvocation.MyCommand.Path
$DirRekaman = Join-Path $DirSkrip "rekaman"
$FileKalimat= Join-Path $DirSkrip "kalimat-uji.json"

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Mati "ffmpeg tidak ada di PATH - skrip ini memakainya untuk merekam mic."
  Write-Host "     winget install Gyan.FFmpeg     (lalu buka PowerShell baru)"
  exit 1
}

# --------------------------------------------------------------------------
# Daftar mic lewat DirectShow
# --------------------------------------------------------------------------
$script:KeluaranMentahFfmpeg = ""

function Ambil-DaftarMic {
  $keluaran = (Jalankan-Luar "ffmpeg" @("-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy")).Teks
  $script:KeluaranMentahFfmpeg = $keluaran
  $baris = $keluaran -split "`r?`n"

  # Cara 1: ikuti judul bagian. ffmpeg mencetak daftar video dulu, lalu audio.
  # Kegagalan enumerasi video ("Could not enumerate video devices") itu normal
  # di mesin tanpa webcam dan TIDAK menghalangi daftar audio muncul.
  $mic = @()
  $diBagianAudio = $false
  foreach ($b in $baris) {
    if ($b -match "DirectShow audio devices")  { $diBagianAudio = $true;  continue }
    if ($b -match "DirectShow video devices")  { $diBagianAudio = $false; continue }
    if (-not $diBagianAudio) { continue }
    if ($b -match "Alternative name") { continue }
    if ($b -match '"([^"]+)"') { $mic += $matches[1] }
  }
  if ($mic.Count -gt 0) { return $mic }

  # Cara 2 (cadangan): sebagian versi ffmpeg menandai tiap baris dengan (audio)
  # alih-alih memakai judul bagian. Dipakai hanya kalau cara 1 tidak dapat apa-apa.
  foreach ($b in $baris) {
    if ($b -match "Alternative name") { continue }
    if ($b -match "\(audio\)" -and $b -match '"([^"]+)"') { $mic += $matches[1] }
  }
  return $mic
}

$daftar = Ambil-DaftarMic
if ($DaftarMic -or -not $Mic) {
  Write-Host ""
  Write-Host "Mic yang terdeteksi:" -ForegroundColor Cyan
  if ($daftar.Count -eq 0) {
    Mati "ffmpeg tidak melihat satu pun perangkat rekam."
    Write-Host ""

    # Bedakan dua sebab yang butuh tindakan BERBEDA:
    #   (a) mesin ini memang tidak punya perangkat rekam  -> colok mic
    #   (b) perangkatnya ada tapi ffmpeg tidak boleh/tidak bisa melihatnya
    #       -> izin mikrofon Windows, atau driver
    Write-Host "Menurut Windows sendiri:" -ForegroundColor Cyan
    $rekamWin = @()
    try {
      $rekamWin = @(Get-PnpDevice -Class AudioEndpoint -ErrorAction Stop |
        Where-Object { $_.Status -eq "OK" -and $_.FriendlyName -notmatch "Speakers|Headphones|Realtek Digital Output" })
    } catch {
      Awas "tidak bisa membaca daftar perangkat Windows ($($_.Exception.Message))"
    }

    if ($rekamWin.Count -gt 0) {
      foreach ($d in $rekamWin) { Write-Host "  - $($d.FriendlyName)" }
      Write-Host ""
      Awas "Perangkatnya ADA menurut Windows, tapi ffmpeg tidak bisa membukanya."
      Write-Host "     Yang paling sering: izin mikrofon untuk aplikasi desktop."
      Write-Host "     Settings > Privacy & security > Microphone >"
      Write-Host "       'Microphone access'                     = On"
      Write-Host "       'Let desktop apps access your microphone' = On"
      Write-Host "     Setelah diubah, tutup PowerShell dan buka baru."
    } else {
      Awas "Windows juga tidak melihat perangkat rekam apa pun."
      Write-Host "     Berarti mesin ini memang belum punya mic yang aktif."
      Write-Host "     Colok mic atau headset USB, tunggu Windows mengenalinya,"
      Write-Host "     lalu jalankan lagi skrip ini."
      Write-Host ""
      Write-Host "     PC guru yang dipakai di kelas nanti tetap butuh mic ini juga -"
      Write-Host "     jadi lebih baik ketahuan sekarang daripada saat kelas berjalan."
    }

    Write-Host ""
    Write-Host "Keluaran mentah ffmpeg:" -ForegroundColor DarkGray
    Write-Host $script:KeluaranMentahFfmpeg -ForegroundColor DarkGray
    exit 1
  }
  for ($i = 0; $i -lt $daftar.Count; $i++) { Write-Host ("  [{0}] {1}" -f $i, $daftar[$i]) }
  Write-Host ""
  if ($DaftarMic) { return }

  $pilih = Read-Host "Pilih nomor mic (Enter = 0)"
  if ([string]::IsNullOrWhiteSpace($pilih)) { $pilih = "0" }
  $n = 0
  if (-not [int]::TryParse($pilih, [ref]$n) -or $n -lt 0 -or $n -ge $daftar.Count) {
    Mati "pilihan tidak sah"; exit 1
  }
  $Mic = $daftar[$n]
}
Ok "mic: $Mic"

New-Item -ItemType Directory -Force -Path $DirRekaman | Out-Null
$kalimat = (Get-Content $FileKalimat -Raw -Encoding UTF8 | ConvertFrom-Json).kalimat

Write-Host ""
Write-Host "=== Rekam $($kalimat.Count) kalimat baku ===" -ForegroundColor Cyan
Write-Host "    Tiap rekaman $Detik detik, berhenti sendiri."
Write-Host "    Setelah tiap rekaman:  [Enter] lanjut | u = ulangi | d = dengarkan | l = lewati"
Write-Host ""

$direkam = 0; $dilewati = 0
foreach ($k in $kalimat) {
  $wav = Join-Path $DirRekaman "$($k.id).wav"
  if ((Test-Path $wav) -and -not $Ulang) { Info "$($k.id) sudah ada - dilewati"; continue }

  while ($true) {
    Write-Host ""
    Write-Host ("  [{0}]  " -f $k.id) -NoNewline -ForegroundColor DarkGray
    Write-Host $k.ucap -ForegroundColor White
    if ($k.intent -eq $null) {
      Write-Host "        (kalimat ini SENGAJA salah - ucapkan apa adanya, parser harus menolaknya)" -ForegroundColor DarkYellow
    }
    Read-Host "        Tekan Enter, lalu ucapkan" | Out-Null

    foreach ($c in 3, 2, 1) { Write-Host "        $c..." -NoNewline -ForegroundColor DarkGray; Start-Sleep -Milliseconds 600 }
    Write-Host "  BICARA" -ForegroundColor Yellow

    $argsFf = @(
      "-hide_banner", "-loglevel", "error",
      "-f", "dshow", "-i", "audio=$Mic",
      "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le",
      "-t", "$Detik", "-y", $wav
    )
    $rekam = Jalankan-Luar "ffmpeg" $argsFf
    if ($rekam.Kode -ne 0 -or -not (Test-Path $wav)) {
      Mati "perekaman gagal (ffmpeg keluar dengan kode $($rekam.Kode))"
      Write-Host $rekam.Teks
      Awas "Nama mic mungkin tidak persis. Coba: .\rekam-uji.ps1 -DaftarMic"
      exit 1
    }
    $kb = [math]::Round((Get-Item $wav).Length / 1KB)
    Write-Host "        selesai ($kb KB)" -ForegroundColor DarkGray

    $jawab = Read-Host "        [Enter] lanjut | u ulangi | d dengarkan | l lewati"
    if ($jawab -eq "d") {
      try { (New-Object Media.SoundPlayer $wav).PlaySync() } catch { Awas "tidak bisa memutar: $_" }
      $jawab = Read-Host "        [Enter] lanjut | u ulangi"
    }
    if ($jawab -eq "u") { continue }
    if ($jawab -eq "l") { Remove-Item $wav -Force -ErrorAction SilentlyContinue; $dilewati++; break }
    $direkam++; break
  }
}

Write-Host ""
Ok "$direkam kalimat terekam$(if ($dilewati) { ", $dilewati dilewati" })"
Write-Host "    Berkas di: $DirRekaman"
Write-Host ""
Write-Host "  Langkah berikutnya: .\NILAI-UJI.bat" -ForegroundColor Cyan
Write-Host ""
