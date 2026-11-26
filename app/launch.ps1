# Opens The Brain (Claude edition) as its own app window. Used by the "The Brain (Claude)" shortcut.
# Rescans the Claude setup, starts the local server hidden if it isn't running, then opens an Edge app window.
$dir = $PSScriptRoot
$url = 'http://localhost:8767/'
# A plain port check: Invoke-WebRequest can stall for seconds on proxy detection.
function Test-Brain {
  $c = New-Object Net.Sockets.TcpClient
  try { $c.ConnectAsync('127.0.0.1', 8767).Wait(300) -and $c.Connected } catch { $false } finally { $c.Close() }
}

# Node ships inside the app (node\node.exe), so nothing has to be installed.
$node = Join-Path $dir 'node\node.exe'
Start-Process $node -ArgumentList "`"$dir\scan.mjs`"" -WorkingDirectory $dir -WindowStyle Hidden -Wait
if (-not (Test-Brain)) {
  Start-Process $node -ArgumentList "`"$dir\server.mjs`" --auto-exit" -WorkingDirectory $dir -WindowStyle Hidden
  for ($i = 0; $i -lt 120 -and -not (Test-Brain); $i++) { Start-Sleep -Milliseconds 250 }
}
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (Test-Path $edge) { Start-Process $edge "--app=$url --autoplay-policy=no-user-gesture-required" }
else { Start-Process $url }
