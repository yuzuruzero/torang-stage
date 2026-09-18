@echo off
rem Penghubung suara ke Panggung Torang - tekan Enter lalu bicara.
cd /d "%~dp0"
node torang-dengar.mjs %*
pause
