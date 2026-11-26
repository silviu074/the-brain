@echo off
rem Installs The Brain (Claude edition): copies the app to %LOCALAPPDATA%\TheBrainClaude and adds Desktop and Start menu shortcuts.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
pause
