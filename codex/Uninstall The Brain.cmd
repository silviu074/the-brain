@echo off
rem Removes The Brain (Codex edition): its shortcuts and its app folder. Your Codex files are not touched.
setlocal
set "DEST=%LOCALAPPDATA%\TheBrainCodex"
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*TheBrainCodex*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
powershell -NoProfile -Command "foreach ($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) { Remove-Item -LiteralPath (Join-Path $d 'The Brain (Codex).lnk') -ErrorAction SilentlyContinue }"
if exist "%DEST%" rmdir /s /q "%DEST%"
echo The Brain was removed.
pause
