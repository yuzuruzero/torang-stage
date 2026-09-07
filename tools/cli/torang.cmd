@echo off
rem Pembungkus Windows untuk pengendali CLI Panggung Torang.
rem   torang.cmd state          torang.cmd sapa komp6
rem   torang.cmd puter tes tv1  torang.cmd stop
rem Tidak menyentuh PATH sistem: panggil dengan path penuh, mis.
rem   D:\projects\torang-stage\tools\cli\torang.cmd sapa komp6
node "%~dp0torang.mjs" %*
