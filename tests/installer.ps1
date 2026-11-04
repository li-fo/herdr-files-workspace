$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path $repo ('.test-windows-install-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path "$fixture\mods\files-workspace" -Force | Out-Null
New-Item -ItemType Directory -Path "$fixture\data\files-workspace" -Force | Out-Null
Set-Content "$fixture\keys.json" '{}'
Set-Content "$fixture\mods\files-workspace\main.js" 'old main'
Set-Content "$fixture\mods\files-workspace\retired.js" 'old managed file'
Set-Content "$fixture\mods\files-workspace\user.txt" 'keep user file'
Set-Content "$fixture\data\files-workspace\install-manifest.json" '{"files":["mods/files-workspace/retired.js"]}'
$before = Get-Content "$fixture\keys.json" -Raw
$global:filesWorkspaceTestFail = $true
function herdr-app {
    param($command, $target)
    $global:LASTEXITCODE = 0
    if ($global:filesWorkspaceTestFail -and $target -eq "$fixture\mods\files-workspace-header") { $global:LASTEXITCODE = 1 }
}
$failed = $false
try { & "$repo\install-windows.ps1" -AppHome $fixture } catch { $failed = $true }
if (!$failed) { throw 'Expected installed header check failure' }
if ((Get-Content "$fixture\mods\files-workspace\main.js" -Raw).Trim() -ne 'old main') { throw 'Main not restored' }
if (!(Test-Path "$fixture\mods\files-workspace\retired.js")) { throw 'Stale managed file not restored' }
if (Test-Path "$fixture\mods\files-workspace\document.js") { throw 'New file not removed on rollback' }
if ((Get-Content "$fixture\keys.json" -Raw) -ne $before) { throw 'Keys not restored' }
$global:filesWorkspaceTestFail = $false
& "$repo\install-windows.ps1" -AppHome $fixture
if (Test-Path "$fixture\mods\files-workspace\retired.js") { throw 'Stale managed file not removed' }
if ((Get-Content "$fixture\mods\files-workspace\user.txt" -Raw).Trim() -ne 'keep user file') { throw 'Unmanaged file changed' }
if (!(Test-Path "$fixture\mods\files-workspace\preview-session.js")) { throw 'Dependency not installed' }
$manifest = Get-Content "$fixture\data\files-workspace\install-manifest.json" -Raw | ConvertFrom-Json
if ('mods\files-workspace\preview-session.js' -notin $manifest.files) { throw 'Manifest missing dependency' }
Write-Output 'PASS installer rollback, stale managed file removal, dependency manifest and unmanaged file preservation'

