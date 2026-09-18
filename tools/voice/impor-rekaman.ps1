<#
  impor-rekaman.ps1 - memasukkan rekaman dari LUAR (HP, perekam suara, berkas
  yang dikirim orang lain) ke uji tahap A, tanpa mic di mesin ini.

  Dipakai saat mesin tempat menilai tidak punya mic, tapi suara manusia
  sungguhan tetap dibutuhkan. Rekam di HP, salin foldernya ke PC, arahkan
  skrip ini ke sana.

  BATAS YANG HARUS DIINGAT: rekaman HP BUKAN pengganti uji di PC guru.
  Mic-nya beda, jaraknya beda, berisik ruangannya beda. Yang bisa dijawab
  rekaman HP: "apakah Whisper bisa mengenali kalimat baku dalam bahasa
  Indonesia sama sekali?" Yang TIDAK bisa dijawab: "apakah cukup tepat di
  ruang kelas?" Pertanyaan kedua tetap menunggu mic di PC guru.

  Pemakaian:
    .\impor-rekaman.ps1 -Folder D:\rekaman-hp
    .\impor-rekaman.ps1 -Folder D:\rekaman-hp -Urut waktu
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Folder,
  [ValidateSet("nama", "waktu")][string]$Urut = "nama",
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
  Mati "ffmpeg tidak ada di PATH - dipakai untuk mengubah rekaman jadi WAV 16 kHz mono."
  Write-Host "     winget install Gyan.FFmpeg     (lalu buka PowerShell baru)"
  exit 1
}
if (-not (Test-Path $Folder)) { Mati "folder tidak ada: $Folder"; exit 1 }

$kalimat = (Get-Content $FileKalimat -Raw -Encoding UTF8 | ConvertFrom-Json).kalimat
$idSah = @{}
foreach ($k in $kalimat) { $idSah[$k.id] = $k }

$ext = @(".m4a", ".mp3", ".wav", ".ogg", ".opus", ".aac", ".3gp", ".amr", ".flac", ".wma")
$berkas = @(Get-ChildItem -Path $Folder -File | Where-Object { $ext -contains $_.Extension.ToLower() })
if ($berkas.Count -eq 0) { Mati "tidak ada berkas audio di $Folder"; exit 1 }

$berkas = if ($Urut -eq "waktu") { $berkas | Sort-Object LastWriteTime } else { $berkas | Sort-Object Name }

# --------------------------------------------------------------------------
# Cara 1: cocokkan dari NAMA berkas. Kalau tiap berkas mengandung id yang sah
# (01, 02, ... T1), pakai itu - jauh lebih aman daripada mengandalkan urutan,
# sebab satu rekaman yang terlewat akan menggeser SEMUA sisanya.
# --------------------------------------------------------------------------
$peta = @()
$semuaCocok = $true
foreach ($b in $berkas) {
  $ketemu = $null
  foreach ($id in $idSah.Keys) {
    if ($b.BaseName -match "(^|[^A-Za-z0-9])$([regex]::Escape($id))([^A-Za-z0-9]|$)") { $ketemu = $id; break }
  }
  if ($ketemu) { $peta += [pscustomobject]@{ Berkas = $b; Id = $ketemu } }
  else { $semuaCocok = $false; break }
}

if ($semuaCocok -and $peta.Count -eq $berkas.Count) {
  Ok "id dikenali dari nama berkas - urutan tidak dipakai"
} else {
  Awas "nama berkas tidak memuat id. Dipakai URUTAN ($Urut)."
  Awas "Satu rekaman yang terlewat akan menggeser semua sisanya - periksa tabel di bawah."
  $peta = @()
  for ($i = 0; $i -lt [Math]::Min($berkas.Count, $kalimat.Count); $i++) {
    $peta += [pscustomobject]@{ Berkas = $berkas[$i]; Id = $kalimat[$i].id }
  }
}

if ($berkas.Count -ne $kalimat.Count) {
  Awas "$($berkas.Count) berkas audio untuk $($kalimat.Count) kalimat - yang tidak kebagian dilaporkan 'belum direkam'."
}

Write-Host ""
Write-Host "Rencana impor:" -ForegroundColor Cyan
foreach ($p in $peta) {
  $k = $idSah[$p.Id]
  Write-Host ("  {0,-28} -> [{1}] {2}" -f $p.Berkas.Name, $p.Id, $k.ucap)
}
Write-Host ""
$jawab = Read-Host "Sudah benar pasangannya? (y untuk lanjut)"
if ($jawab -ne "y") { Info "dibatalkan - tidak ada yang ditulis"; exit 0 }

New-Item -ItemType Directory -Force -Path $DirRekaman | Out-Null
$masuk = 0; $lewat = 0
foreach ($p in $peta) {
  $tujuan = Join-Path $DirRekaman "$($p.Id).wav"
  if ((Test-Path $tujuan) -and -not $Timpa) { Info "$($p.Id) sudah ada - dilewati (pakai -Timpa untuk menimpa)"; $lewat++; continue }
  $hasil = Jalankan-Luar "ffmpeg" @(
    "-hide_banner", "-loglevel", "error",
    "-i", $p.Berkas.FullName,
    "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le",
    "-y", $tujuan
  )
  if ($hasil.Kode -ne 0 -or -not (Test-Path $tujuan)) {
    Mati "gagal mengubah $($p.Berkas.Name)"
    Write-Host $hasil.Teks
    exit 1
  }
  $masuk++
}

Write-Host ""
Ok "$masuk rekaman masuk$(if ($lewat) { ", $lewat dilewati" })"
Write-Host "    Berkas di: $DirRekaman"
Write-Host ""
Awas "Ingat: ini rekaman dari perangkat lain, bukan dari mic PC guru."
Write-Host "       Angkanya menjawab 'apakah Whisper mengenali bahasa Indonesia sama sekali',"
Write-Host "       BUKAN 'apakah cukup tepat di ruang kelas'. Yang kedua tetap butuh PC guru."
Write-Host ""
Write-Host "  Langkah berikutnya: .\NILAI-UJI.bat" -ForegroundColor Cyan
Write-Host ""
