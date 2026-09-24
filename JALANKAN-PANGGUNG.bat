@echo off
rem Buka panggung guru (cloud + panel + TV) TANPA jendela terminal.
rem Kunci ruangan & port dibaca dari apps\theater\torang-theater.config.json.
rem Log: folder logs\  (cloud.log, app.log). Tutup panel = semuanya berhenti.
rem Butuh terminal untuk mencari masalah? Pakai jalankan-cloud-lan.bat + npm run guru.
start "" wscript.exe "%~dp0tools\Torang-Panggung.vbs"
