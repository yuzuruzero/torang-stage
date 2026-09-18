@echo off
rem Memasukkan rekaman dari HP / perekam lain ke uji STT.
rem Seret folder rekamanmu ke atas berkas ini, atau jalankan lewat PowerShell:
rem   .\impor-rekaman.ps1 -Folder D:\rekaman-hp
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0impor-rekaman.ps1" -Folder %1
pause
