@echo off
rem Jalankan cloud di PC GURU agar bisa diakses PC murid lewat LAN.
rem Pemakaian:  jalankan-cloud-lan.bat [kunci-ruangan]
rem   tanpa argumen = kunci dev "dev-room-key" (JANGAN untuk kelas sungguhan)
cd /d "%~dp0"
set TORANG_HOST=0.0.0.0
if not "%~1"=="" set TORANG_ROOM_KEY=%~1
echo.
echo Cloud akan terbuka di semua alamat jaringan PC ini (port 8787).
echo Kalau Windows Firewall bertanya, pilih ALLOW untuk jaringan Private.
echo Cek IP PC guru dengan:  ipconfig  (bagikan IP itu ke installer murid)
echo.
npm run dev:cloud
