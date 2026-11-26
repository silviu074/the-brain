# Installs The Brain (Claude edition) for this Windows user. Run by "Install The Brain.cmd". No admin rights needed.
$src = Join-Path $PSScriptRoot 'app'
$dest = Join-Path $env:LOCALAPPDATA 'TheBrainClaude'

if (-not (Test-Path (Join-Path $src 'index.html'))) { Write-Host 'Unzip the whole folder first, then run the installer from inside it.'; exit 1 }

Write-Host "Installing to $dest ..."
New-Item -ItemType Directory -Force $dest | Out-Null
Copy-Item -Path (Join-Path $src '*') -Destination $dest -Recurse -Force

# Node.js is not in the zip (it is too big to share): download the official build once and check its SHA-256.
$nodeDir = Join-Path $dest 'node'
if (-not (Test-Path (Join-Path $nodeDir 'node.exe'))) {
  $ver = 'v24.22.0'
  $sha = 'f9683a19877e12a9b167305c8db71040d812876359de21f0d2e97c3f321f80c3'
  $zip = Join-Path $env:TEMP "node-$ver-win-x64.zip"
  $tmp = Join-Path $env:TEMP "brain-node-$ver"
  Write-Host "Downloading Node.js $ver from nodejs.org (about 36 MB) ..."
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $ProgressPreference = 'SilentlyContinue'
  try { Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$ver/node-$ver-win-x64.zip" -OutFile $zip }
  catch { Write-Host 'Download failed. Check your internet connection and run the installer again.'; exit 1 }
  if ((Get-FileHash $zip -Algorithm SHA256).Hash -ne $sha) { Remove-Item $zip; Write-Host 'The Node.js download did not match its checksum. Run the installer again.'; exit 1 }
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  Expand-Archive $zip $tmp
  New-Item -ItemType Directory -Force $nodeDir | Out-Null
  Copy-Item (Join-Path $tmp "node-$ver-win-x64\node.exe"), (Join-Path $tmp "node-$ver-win-x64\LICENSE") $nodeDir
  Remove-Item $zip, $tmp -Recurse -Force
}

$shell = New-Object -ComObject WScript.Shell
foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  $l = $shell.CreateShortcut((Join-Path $dir 'The Brain (Claude).lnk'))
  $l.TargetPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $l.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$dest\launch.ps1`""
  $l.WorkingDirectory = $dest
  $l.IconLocation = "$dest\icon.ico,0"
  $l.Description = 'A live 3D map of your Claude Code setup'
  $l.Save()
}

Write-Host ''
Write-Host 'Optional: show your Claude plan limits (5-hour and weekly) in the Brain.'
Write-Host 'This adds a small status line to Claude Code (only if you do not have one yet).'
if ((Read-Host 'Turn it on? (y/n)') -match '^y') { & "$dest\node\node.exe" "$dest\statusline-setup.mjs" on }
Write-Host ''
Write-Host 'Done. Open "The Brain (Claude)" from your Desktop or Start menu.'
Write-Host 'To remove it later, run "Uninstall The Brain.cmd".'
