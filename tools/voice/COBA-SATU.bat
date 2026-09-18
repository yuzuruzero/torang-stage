@echo off
rem Uji SATU rekaman: suara -> Whisper -> parser -> intent.
rem Seret berkas suaramu ke atas file ini.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0coba-satu.ps1" -Berkas %1
pause
