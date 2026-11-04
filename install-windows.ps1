param([string]$AppHome = "$env:USERPROFILE\.config\herdr-app")
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'mods\files-workspace'
$destination = Join-Path $AppHome 'mods\files-workspace'
$keysPath = Join-Path $AppHome 'keys.json'
if (!(Test-Path -LiteralPath $keysPath)) { throw 'Start Herdr once before installing.' }
$keys = Get-Content -LiteralPath $keysPath -Raw | ConvertFrom-Json
$section = $keys.'mod:files-workspace'
if (!$section) { $section = [pscustomobject]@{}; $keys | Add-Member -NotePropertyName 'mod:files-workspace' -NotePropertyValue $section }
foreach ($key in @('ctrl-s', 'cmd-s')) {
    if ($section.$key -and $section.$key -ne 'files-workspace.save') { throw "Existing $key binding conflicts; merge keys.json manually." }
    $section | Add-Member -NotePropertyName $key -NotePropertyValue 'files-workspace.save' -Force
}
herdr-app check $source | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'Source mod check failed.' }
$backup = Join-Path $AppHome ('backups\files-workspace-' + [Guid]::NewGuid().ToString('N'))
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
Write-Output "Herdr Files Workspace installed. Backup: $backup"
Write-Output 'Keep your existing custom layout. For first installation, clone main and point its Files block at files-workspace (see WINDOWS.md).'

# Optional companion header for the custom Windows layout only.
$headerSource = Join-Path $PSScriptRoot 'mods\files-workspace-header'
$headerTarget = Join-Path $AppHome 'mods\files-workspace-header'
herdr-app check $headerSource | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'Header check failed.' }
if (Test-Path -LiteralPath $headerTarget) { Copy-Item -LiteralPath $headerTarget -Destination $backup -Recurse }
New-Item -ItemType Directory -Path $headerTarget -Force | Out-Null
Get-ChildItem -LiteralPath $headerSource | Copy-Item -Destination $headerTarget -Recurse -Force
$layoutPath = Join-Path $AppHome 'layouts\main-files-workspace-windows.json'
if (Test-Path -LiteralPath $layoutPath) {
    Copy-Item -LiteralPath $layoutPath -Destination $backup
    $layout = Get-Content -LiteralPath $layoutPath -Raw | ConvertFrom-Json
    function Update-FileHeader($node) {
        if ($node.content.pane.header.content.mod -eq 'pane') {
            $node.content.pane.header.content.mod = 'files-workspace-header'
        }
        foreach ($child in $node.children) { Update-FileHeader $child }
    }
    Update-FileHeader $layout
    [IO.File]::WriteAllText($layoutPath, ($layout | ConvertTo-Json -Depth 50), [Text.UTF8Encoding]::new($false))
}
