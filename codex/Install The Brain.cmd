@echo off
rem Installs The Brain (Codex edition): copies the app to %LOCALAPPDATA%\TheBrainCodex and adds Desktop and Start menu shortcuts.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
pause
