' Torang-Panggung.vbs - buka panggung guru TANPA jendela terminal.
' Menjalankan tools\jalankan-panggung.ps1 dengan PowerShell tersembunyi.
' Log ada di folder logs\ di akar repo.
Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & dir & "\jalankan-panggung.ps1""", 0, False
