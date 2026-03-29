$ErrorActionPreference = 'Stop'
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()
$root = "http://127.0.0.1:$port"
$tempRoot = Join-Path $env:TEMP ("moemon-smoke-" + [guid]::NewGuid().ToString('N'))
$dbPath = Join-Path $tempRoot 'moemon.sqlite'
$backupPath = Join-Path $tempRoot 'world-backup.json'
$stdoutLog = Join-Path $tempRoot 'server.out.log'
$stderrLog = Join-Path $tempRoot 'server.err.log'
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
$serverCommand = "`$env:PORT='$port'; `$env:APP_ORIGIN='http://127.0.0.1:$port'; `$env:MOEMON_DB_PATH='$dbPath'; `$env:MOEMON_WORLD_BACKUP_PATH='$backupPath'; Set-Location 'c:\Moemon'; node src/server.js"
$process = Start-Process powershell -ArgumentList '-NoProfile', '-Command', $serverCommand -PassThru -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog

try {
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

  $landing = $null
  for ($attempt = 0; $attempt -lt 24; $attempt += 1) {
    if ($process.HasExited) {
      break
    }
    try {
      $landing = Invoke-WebRequest -Uri "$root/" -UseBasicParsing -TimeoutSec 2
      break
    }
    catch {
      Start-Sleep -Milliseconds 500
    }
  }
  if (-not $landing -or $landing.StatusCode -ne 200 -or $landing.Content -notlike '*Moemon Arena*') {
    $stdout = if (Test-Path $stdoutLog) { Get-Content $stdoutLog -Raw } else { '' }
    $stderr = if (Test-Path $stderrLog) { Get-Content $stderrLog -Raw } else { '' }
    throw "Landing page failed.`nSTDOUT:`n$stdout`nSTDERR:`n$stderr"
  }

  $name = 'tester' + [guid]::NewGuid().ToString('N').Substring(0, 8)
  $email = "$name@example.com"

  Invoke-WebRequest -Uri "$root/register" -Method Post -Body @{ username = $name; email = $email; password = 'StrongPass1' } -WebSession $session -UseBasicParsing -MaximumRedirection 0 -ErrorAction SilentlyContinue | Out-Null

  $hub = Invoke-WebRequest -Uri "$root/hub" -WebSession $session -UseBasicParsing
  if ($hub.Content -notlike '*Storage preview*') {
    throw 'Hub page did not render for registered user.'
  }
  if ($hub.Content -notlike '*href="/admin"*') {
    throw 'Admin shortcut did not render for the first admin account.'
  }

  $deviceSaveMatch = [regex]::Match($hub.Content, '<script id="moemon-device-save" type="application/json">(?<payload>.*?)</script>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if (-not $deviceSaveMatch.Success) {
    throw 'Device save payload did not render for the signed-in account.'
  }
  $deviceSavePayload = $deviceSaveMatch.Groups['payload'].Value
  $events = Invoke-WebRequest -Uri "$root/events" -WebSession $session -UseBasicParsing
  if ($events.Content -notlike '*Limited Banner Rotations*') {
    throw 'Events page did not render.'
  }

  $build = Invoke-WebRequest -Uri "$root/builds/yuta-okkotsu" -WebSession $session -UseBasicParsing
  if ($build.Content -notlike '*Yuta Okkotsu*' -or $build.Content -notlike '*Queen of Curses*') {
    throw 'Expanded limited build guide did not render.'
  }

  $playerSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $name2 = 'player' + [guid]::NewGuid().ToString('N').Substring(0, 8)
  $email2 = "$name2@example.com"
  Invoke-WebRequest -Uri "$root/register" -Method Post -Body @{ username = $name2; email = $email2; password = 'StrongPass1' } -WebSession $playerSession -UseBasicParsing -MaximumRedirection 0 -ErrorAction SilentlyContinue | Out-Null
  $playerHub = Invoke-WebRequest -Uri "$root/hub" -WebSession $playerSession -UseBasicParsing
  if ($playerHub.Content -like '*href="/admin"*') {
    throw 'Player hub leaked the admin shortcut.'
  }

  Start-Sleep -Milliseconds 700
  if (-not (Test-Path $backupPath)) {
    throw 'World backup snapshot was not written.'
  }
  $backupContent = Get-Content $backupPath -Raw
  if ($backupContent -notlike "*$email*") {
    throw 'World backup snapshot did not include the registered account.'
  }

  $setup = Invoke-WebRequest -Uri "$root/play/new" -WebSession $session -UseBasicParsing
  $starterMatch = [regex]::Match($setup.Content, 'name="starter" value="(\d+)"')
  if (-not $starterMatch.Success) {
    throw 'Starter selection did not render.'
  }

  $body = "mode=classic&starter=$($starterMatch.Groups[1].Value)"
  Invoke-WebRequest -Uri "$root/play/new" -Method Post -Body $body -ContentType 'application/x-www-form-urlencoded' -WebSession $session -UseBasicParsing -MaximumRedirection 0 -ErrorAction SilentlyContinue | Out-Null

  $play = Invoke-WebRequest -Uri "$root/play" -WebSession $session -UseBasicParsing
  if ($play.Content -notlike '*Choose Your Action*') {
    throw 'Battle screen did not render.'
  }

  Write-Output 'Smoke test passed.'
}
finally {
  if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path $tempRoot) {
    if ($env:MOEMON_KEEP_SMOKE_TEMP) {
      Write-Output "Smoke temp preserved at $tempRoot"
    } else {
      Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}
