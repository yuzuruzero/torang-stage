<#
  pisah-rekaman.ps1 - memotong SATU rekaman panjang (26 kalimat dalam sekali
  rekam) menjadi 26 berkas WAV, dipotong di jeda hening antar kalimat.

  Dipakai kalau merekam dengan HP: jauh lebih enteng mengucapkan 26 kalimat
  berturut-turut dengan jeda, daripada membuat 26 berkas terpisah.

  CARA MEREKAM supaya pemotongannya benar:
    - jeda DIAM minimal 1 detik di antara tiap kalimat
    - jangan berdehem, menghela napas keras, atau bilang "eee" di jeda itu
    - ucapkan tiap kalimat mengalir, tanpa berhenti di tengah kalimat
    - urutannya harus sama persis dengan kalimat-uji.json (01 sampai T4)

  Skrip TIDAK akan menulis apa pun kalau jumlah potongan tidak pas. Ia
  menampilkan yang ia temukan dan berhenti - sebab potongan yang meleset satu
  akan menggeser SEMUA pasangan sesudahnya, dan hasil ujinya jadi bohong.

  Pemakaian:
    .\pisah-rekaman.ps1 -Berkas D:\rekaman-hp.mp4
    .\pisah-rekaman.ps1 -Berkas D:\rekaman-hp.mp4 -Hening 0.8 -Ambang -40
    .\pisah-rekaman.ps1 -Berkas D:\rekaman-hp.mp4 -LihatSaja
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Berkas,
  [double]$Hening = 0.7,
  [int]$Ambang = -35,
  [double]$Bantalan = 0.15,
  [double]$MinKalimat = 0.4,
  [switch]$LihatSaja,
  [switch]$Inti,
  [switch]$Timpa
)

$ErrorActionPreference = "Stop"

function Ok   ($m) { Write-Host "  OK   $m" -ForegroundColor Green }
function Info ($m) { Write-Host "  ..   $m" -ForegroundColor Gray }
function Awas ($m) { Write-Host "  !!   $m" -ForegroundColor Yellow }
function Mati ($m) { Write-Host "  XX   $m" -ForegroundColor Red }

# Semua pemanggilan program luar lewat sini - lihat berkasnya untuk
# alasannya (dua jebakan Windows PowerShell 5.1).
. (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "lib-jalankan-luar.ps1")

$DirSkrip    = Split-Path -Parent $MyInvocation.MyCommand.Path
$DirRekaman  = Join-Path $DirSkrip "rekaman"
$FileKalimat = Join-Path $DirSkrip "kalimat-uji.json"

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Mati "ffmpeg tidak ada di PATH."; exit 1
}
if (-not (Test-Path $Berkas)) { Mati "berkas tidak ada: $Berkas"; exit 1 }

$kalimat = (Get-Content $FileKalimat -Raw -Encoding UTF8 | ConvertFrom-Json).kalimat
# -Inti: rekaman cuma berisi 8 kalimat inti, bukan 29. Pemotong harus tahu,
# kalau tidak ia akan mengira potongannya kurang 21 dan menolak menulis.
if ($Inti) { $kalimat = @($kalimat | Where-Object { $_.inti }) }
Write-Host ""
Write-Host "=== Memotong rekaman jadi $($kalimat.Count) kalimat ===" -ForegroundColor Cyan
Write-Host "    Sumber  : $Berkas"
Write-Host "    Hening  : minimal $Hening detik, di bawah $Ambang dB"
Write-Host ""

# --- durasi total ---------------------------------------------------------
$probe = Jalankan-Luar "ffprobe" @(
  "-v", "error", "-show_entries", "format=duration",
  "-of", "default=noprint_wrappers=1:nokey=1", $Berkas
)
$durasi = 0.0
if (-not [double]::TryParse(($probe.Keluaran.Trim()), [ref]$durasi) -or $durasi -le 0) {
  Mati "tidak bisa membaca durasi berkas."
  Write-Host $probe.Teks
  exit 1
}
Info ("durasi total {0:N1} detik" -f $durasi)

# --- deteksi hening -------------------------------------------------------
$deteksi = Jalankan-Luar "ffmpeg" @(
  "-hide_banner", "-nostats", "-i", $Berkas,
  "-af", "silencedetect=noise=${Ambang}dB:d=$Hening",
  "-f", "null", "-"
)

$mulaiHening = @(); $selesaiHening = @()
foreach ($b in ($deteksi.Teks -split "`r?`n")) {
  if ($b -match "silence_start:\s*([-\d.]+)") { $mulaiHening += [double]$matches[1] }
  elseif ($b -match "silence_end:\s*([-\d.]+)") { $selesaiHening += [double]$matches[1] }
}
Info "$($mulaiHening.Count) jeda hening terdeteksi"

# --- ubah jadi rentang BICARA --------------------------------------------
# Bicara = sela di antara hening. Kalau rekaman dimulai dengan hening, potongan
# pertama dimulai setelah hening itu selesai.
$segmen = @()
$kursor = 0.0
if ($selesaiHening.Count -gt 0 -and $mulaiHening.Count -gt 0 -and $mulaiHening[0] -lt 0.2) {
  $kursor = $selesaiHening[0]
  $mulaiHening = $mulaiHening[1..($mulaiHening.Count - 1)]
  $selesaiHening = $selesaiHening[1..($selesaiHening.Count - 1)]
}
for ($i = 0; $i -lt $mulaiHening.Count; $i++) {
  $segmen += [pscustomobject]@{ Mulai = $kursor; Selesai = $mulaiHening[$i] }
  $kursor = if ($i -lt $selesaiHening.Count) { $selesaiHening[$i] } else { $durasi }
}
if ($kursor -lt ($durasi - 0.1)) { $segmen += [pscustomobject]@{ Mulai = $kursor; Selesai = $durasi } }

# buang potongan terlalu pendek (dehem, ketukan meja, klik tombol rekam)
$dibuang = @($segmen | Where-Object { ($_.Selesai - $_.Mulai) -lt $MinKalimat })
$segmen  = @($segmen | Where-Object { ($_.Selesai - $_.Mulai) -ge $MinKalimat })
if ($dibuang.Count -gt 0) { Info "$($dibuang.Count) potongan terlalu pendek (< $MinKalimat dtk) diabaikan" }

Write-Host ""
Write-Host "Potongan yang ditemukan: $($segmen.Count) (dibutuhkan $($kalimat.Count))" -ForegroundColor Cyan
Write-Host ""
for ($i = 0; $i -lt $segmen.Count; $i++) {
  $s = $segmen[$i]
  $label = if ($i -lt $kalimat.Count) { "[$($kalimat[$i].id)] $($kalimat[$i].ucap)" } else { "(kelebihan - tidak ada pasangannya)" }
  Write-Host ("  {0,2}. {1,6:N1}s - {2,6:N1}s  ({3,4:N1}s)  {4}" -f ($i + 1), $s.Mulai, $s.Selesai, ($s.Selesai - $s.Mulai), $label)
}
Write-Host ""

if ($segmen.Count -ne $kalimat.Count) {
  Mati "jumlah potongan TIDAK COCOK - tidak ada yang ditulis."
  Write-Host ""
  if ($segmen.Count -gt $kalimat.Count) {
    Awas "Kebanyakan potongan. Biasanya karena ada jeda di TENGAH kalimat,"
    Write-Host "     atau ada suara lain (dehem, napas) di antara kalimat."
    Write-Host "     Coba naikkan jeda minimal:   -Hening 1.0"
    Write-Host "     atau turunkan kepekaan:      -Ambang -40"
  } else {
    Awas "Kurang potongan. Biasanya karena jeda antar kalimat terlalu singkat"
    Write-Host "     atau ruangannya berisik sehingga jeda tidak terbaca hening."
    Write-Host "     Coba perpendek jeda minimal: -Hening 0.4"
    Write-Host "     atau naikkan kepekaan:       -Ambang -30"
  }
  Write-Host ""
  Write-Host "     Cocokkan angkanya dengan rekamanmu dulu sebelum menulis." -ForegroundColor DarkGray
  Write-Host "     Kalau tetap tidak pas, rekam ulang dengan jeda diam yang lebih tegas." -ForegroundColor DarkGray
  exit 1
}

Ok "jumlah potongan pas"
if ($LihatSaja) { Write-Host ""; Info "-LihatSaja: tidak ada yang ditulis."; Write-Host ""; return }

Write-Host ""
$jawab = Read-Host "Tulis $($segmen.Count) berkas ke rekaman\ ? (y untuk lanjut)"
if ($jawab -ne "y") { Info "dibatalkan"; exit 0 }

New-Item -ItemType Directory -Force -Path $DirRekaman | Out-Null
$ditulis = 0
for ($i = 0; $i -lt $segmen.Count; $i++) {
  $id = $kalimat[$i].id
  $tujuan = Join-Path $DirRekaman "$id.wav"
  if ((Test-Path $tujuan) -and -not $Timpa) { Info "$id sudah ada - dilewati (pakai -Timpa)"; continue }

  $mulai = [Math]::Max(0, $segmen[$i].Mulai - $Bantalan)
  $akhir = [Math]::Min($durasi, $segmen[$i].Selesai + $Bantalan)
  $hasil = Jalankan-Luar "ffmpeg" @(
    "-hide_banner", "-loglevel", "error",
    "-i", $Berkas,
    "-ss", ("{0:F3}" -f $mulai), "-to", ("{0:F3}" -f $akhir),
    "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le",
    "-y", $tujuan
  )
  if ($hasil.Kode -ne 0 -or -not (Test-Path $tujuan)) {
    Mati "gagal memotong bagian $id"
    Write-Host $hasil.Teks
    exit 1
  }
  $ditulis++
}

Write-Host ""
Ok "$ditulis berkas ditulis ke $DirRekaman"
Write-Host ""
Awas "DENGARKAN dulu beberapa berkas sebelum percaya angkanya."
Write-Host "       Kalau isi 05.wav ternyata kalimat nomor 6, seluruh laporan jadi bohong"
Write-Host "       dengan cara yang tidak kelihatan dari angkanya."
Write-Host ""
Write-Host "  Langkah berikutnya: .\NILAI-UJI.bat" -ForegroundColor Cyan
Write-Host ""
