param([string]$AppHome = "$env:USERPROFILE\.config\herdr-app")
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'mods\files-transfer'
$destination = Join-Path $AppHome 'mods\files-transfer'
$keysPath = Join-Path $AppHome 'keys.json'
if (!(Test-Path -LiteralPath $keysPath)) { throw 'Start Herdr once before installing.' }
$keys = Get-Content -LiteralPath $keysPath -Raw | ConvertFrom-Json
$section = $keys.'mod:files-transfer'
if (!$section) { $section = [pscustomobject]@{}; $keys | Add-Member -NotePropertyName 'mod:files-transfer' -NotePropertyValue $section }
foreach ($key in @('ctrl-s', 'cmd-s')) {
    if ($section.$key -and $section.$key -ne 'files-transfer.save') { throw "Existing $key binding conflicts; merge keys.json manually." }
    $section | Add-Member -NotePropertyName $key -NotePropertyValue 'files-transfer.save' -Force
}
herdr-app check $source | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'Source mod check failed.' }
$backup = Join-Path $AppHome ('backups\files-transfer-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item -LiteralPath $keysPath -Destination $backup
if (Test-Path -LiteralPath $destination) { Copy-Item -LiteralPath $destination -Destination $backup -Recurse }
New-Item -ItemType Directory -Path $destination -Force | Out-Null
# Copy dependencies before main.js to reduce transient hot-reload failures.
Get-ChildItem -LiteralPath $source | Where-Object Name -ne 'main.js' | Copy-Item -Destination $destination -Recurse -Force
Copy-Item -LiteralPath (Join-Path $source 'main.js') -Destination $destination -Force
[IO.File]::WriteAllText($keysPath, ($keys | ConvertTo-Json -Depth 50), [Text.UTF8Encoding]::new($false))
herdr-app check $destination | Out-Host
if ($LASTEXITCODE -ne 0) { throw "Installed mod check failed. Backup: $backup" }
Write-Output "Installed. Backup: $backup"
Write-Output 'Keep your existing custom layout. For first installation, clone main and point its Files block at files-transfer (see WINDOWS.md).'
