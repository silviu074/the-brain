# Installs The Brain (Codex edition) for this Windows user. Run by "Install The Brain.cmd". No admin rights needed.
$src = Join-Path $PSScriptRoot 'app'
$dest = Join-Path $env:LOCALAPPDATA 'TheBrainCodex'

if (-not (Test-Path (Join-Path $src 'index.html'))) { Write-Host 'Unzip the whole folder first, then run the installer from inside it.'; exit 1 }

Write-Host "Installing to $dest ..."
New-Item -ItemType Directory -Force $dest | Out-Null
Copy-Item -Path (Join-Path $src '*') -Destination $dest -Recurse -Force

$shell = New-Object -ComObject WScript.Shell
foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  $l = $shell.CreateShortcut((Join-Path $dir 'The Brain (Codex).lnk'))
  $l.TargetPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $l.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$dest\launch.ps1`""
  $l.WorkingDirectory = $dest
  $l.IconLocation = "$dest\icon.ico,0"
  $l.Description = 'A live 3D map of your Codex setup'
  $l.Save()
}
Write-Host ''
Write-Host 'Done. Open "The Brain (Codex)" from your Desktop or Start menu.'
Write-Host 'To remove it later, run "Uninstall The Brain.cmd".'
