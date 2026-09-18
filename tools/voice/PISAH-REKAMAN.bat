@echo off
rem Memotong satu rekaman panjang jadi 26 berkas, dipotong di jeda hening.
rem Seret berkas rekamanmu ke atas file ini.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pisah-rekaman.ps1" -Berkas %1
pause
