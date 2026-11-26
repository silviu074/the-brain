@echo off
rem Removes The Brain (Claude edition): its shortcuts, its status line (if it added one) and its app folder. Your other Claude files are not touched.
setlocal
set "DEST=%LOCALAPPDATA%\TheBrainClaude"
if exist "%DEST%\statusline-setup.mjs" "%DEST%\node\node.exe" "%DEST%\statusline-setup.mjs" off
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*TheBrainClaude*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
powershell -NoProfile -Command "foreach ($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) { Remove-Item -LiteralPath (Join-Path $d 'The Brain (Claude).lnk') -ErrorAction SilentlyContinue }"
if exist "%DEST%" rmdir /s /q "%DEST%"
echo The Brain was removed.
pause
