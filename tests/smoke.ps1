$ErrorActionPreference = 'Stop'
$port = 3123
$root = "http://localhost:$port"
$tempRoot = Join-Path $env:TEMP ("moemon-smoke-" + [guid]::NewGuid().ToString('N'))
$dbPath = Join-Path $tempRoot 'moemon.sqlite'
$backupPath = Join-Path $tempRoot 'world-backup.json'
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
$job = Start-Job -ArgumentList $dbPath, $backupPath -ScriptBlock {
  param($dbPathArg, $backupPathArg)
  Set-Location 'c:\Moemon'
  $env:PORT = '3123'
  $env:APP_ORIGIN = 'http://localhost:3123'
  $env:MOEMON_DB_PATH = $dbPathArg
  $env:MOEMON_WORLD_BACKUP_PATH = $backupPathArg
  node src/server.js
}

try {
  Start-Sleep -Seconds 2
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

  $landing = Invoke-WebRequest -Uri "$root/" -UseBasicParsing
  if ($landing.StatusCode -ne 200 -or $landing.Content -notlike '*Moemon Arena*') {
    throw 'Landing page failed.'
  }

  $name = 'tester' + [guid]::NewGuid().ToString('N').Substring(0, 8)
  $email = "$name@example.com"

  Invoke-WebRequest -Uri "$root/register" -Method Post -Body @{ username = $name; email = $email; password = 'StrongPass1' } -WebSession $session -UseBasicParsing -MaximumRedirection 0 -ErrorAction SilentlyContinue | Out-Null

  $hub = Invoke-WebRequest -Uri "$root/hub" -WebSession $session -UseBasicParsing
  if ($hub.Content -notlike '*Storage preview*') {
    throw 'Hub page did not render for registered user.'
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
  if ($job) {
    Stop-Job $job -ErrorAction SilentlyContinue | Out-Null
    Receive-Job $job -ErrorAction SilentlyContinue | Out-Null
    Remove-Job $job -ErrorAction SilentlyContinue | Out-Null
  }
  if (Test-Path $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
