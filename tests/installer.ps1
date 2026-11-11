$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path $repo ('.test-windows-install-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path "$fixture\mods\files-workspace" -Force | Out-Null
New-Item -ItemType Directory -Path "$fixture\data\files-workspace" -Force | Out-Null
New-Item -ItemType Directory -Path "$fixture\layouts" -Force | Out-Null
$baseLayout = '{"id":"root","colors":{"selection":"#6699cc55","accent":"#123456"},"children":[{"content":{"mod":"files"}},{"content":{"pane":{"header":{"content":{"mod":"pane"}}}}}]}'
Set-Content "$fixture\layouts\main.json" $baseLayout
Set-Content "$fixture\layouts\files-workspace.json" $baseLayout
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
    if ($command -eq '--version') { return 'herdr-app 0.1.13' }
    if ($command -eq 'do') { $global:filesWorkspaceActivated = $true }
    if ($global:filesWorkspaceTestFail -and $target -eq "$fixture\mods\files-workspace-header") { $global:LASTEXITCODE = 1 }
}
$failed = $false
try { & "$repo\install-windows.ps1" -AppHome $fixture -NoActivate } catch { $failed = $true }
if (!$failed) { throw 'Expected installed header check failure' }
if ((Get-Content "$fixture\mods\files-workspace\main.js" -Raw).Trim() -ne 'old main') { throw 'Main not restored' }
if (!(Test-Path "$fixture\mods\files-workspace\retired.js")) { throw 'Stale managed file not restored' }
if (Test-Path "$fixture\mods\files-workspace\document.js") { throw 'New file not removed on rollback' }
if ((Get-Content "$fixture\keys.json" -Raw) -ne $before) { throw 'Keys not restored' }
if ((Get-Content "$fixture\layouts\files-workspace.json" -Raw | ConvertFrom-Json).colors.selection -ne '#6699cc55') { throw 'Layout not restored' }
$global:filesWorkspaceTestFail = $false
& "$repo\install-windows.ps1" -AppHome $fixture -NoActivate
if (Test-Path "$fixture\mods\files-workspace\retired.js") { throw 'Stale managed file not removed' }
if ((Get-Content "$fixture\mods\files-workspace\user.txt" -Raw).Trim() -ne 'keep user file') { throw 'Unmanaged file changed' }
if (!(Test-Path "$fixture\mods\files-workspace\preview-session.js")) { throw 'Dependency not installed' }
$manifest = Get-Content "$fixture\data\files-workspace\install-manifest.json" -Raw | ConvertFrom-Json
if ('mods\files-workspace\preview-session.js' -notin $manifest.files) { throw 'Manifest missing dependency' }
$colors = (Get-Content "$fixture\layouts\files-workspace.json" -Raw | ConvertFrom-Json).colors
if ($colors.PSObject.Properties.Name -contains 'selection' -or $colors.accent -ne '#123456') { throw 'Selection migration changed the wrong colors' }
$custom = Get-Content "$fixture\layouts\files-workspace.json" -Raw | ConvertFrom-Json
$custom.colors | Add-Member -NotePropertyName selection -NotePropertyValue '#abcdef'
$custom | ConvertTo-Json -Depth 50 | Set-Content "$fixture\layouts\files-workspace.json"
& "$repo\install-windows.ps1" -AppHome $fixture -NoActivate
if ((Get-Content "$fixture\layouts\files-workspace.json" -Raw | ConvertFrom-Json).colors.selection -ne '#abcdef') { throw 'Custom selection color changed' }
Write-Output 'PASS old selection workaround migration and custom color preservation'
Write-Output 'PASS installer rollback, stale managed file removal, dependency manifest and unmanaged file preservation'


$installed = Get-Content "$fixture\layouts\files-workspace.json" -Raw | ConvertFrom-Json
if ($installed.children[0].content.mod -ne 'files-workspace' -or $installed.children[1].content.pane.header.content.mod -ne 'files-workspace-header') { throw 'Layout not connected' }
if ((Get-Content "$fixture\layouts\main.json" -Raw).Trim() -ne $baseLayout) { throw 'Shipped layout changed' }
Remove-Item -LiteralPath "$fixture\layouts\files-workspace.json"
$global:filesWorkspaceTestFail = $true
try { & "$repo\install-windows.ps1" -AppHome $fixture -NoActivate; throw 'Expected failure' } catch { if (Test-Path "$fixture\layouts\files-workspace.json") { throw 'New layout survived rollback' } }
$global:filesWorkspaceTestFail = $false
$global:filesWorkspaceActivated = $false
& "$repo\install-windows.ps1" -AppHome $fixture
$fresh = Get-Content "$fixture\layouts\files-workspace.json" -Raw | ConvertFrom-Json
if ($fresh.cloned_from.name -ne 'main' -or !$global:filesWorkspaceActivated) { throw 'Fresh layout not created and activated' }
Write-Output 'PASS fresh layout, header connection, shipped layout preservation, activation and fresh-install rollback'

# Standard layouts acquire one shared-view stack; reinstall preserves split content.
$standard = '{"id":"root","children":[{"id":"tabs","content":{"mod":"tabs"}},{"id":"body","children":[{"id":"main","type":"block","content":{"tab":"active","pane":{"header":{"content":{"mod":"pane"}}}}},{"id":"files","content":{"mod":"files"}}]}]}'
Set-Content "$fixture\layouts\files-workspace.json" $standard
& "$repo\install-windows.ps1" -AppHome $fixture -NoActivate
$connected = Get-Content "$fixture\layouts\files-workspace.json" -Raw | ConvertFrom-Json
if ($connected.children[0].content.mod -ne 'files-workspace-agents') { throw 'Agent tab bar not connected' }
$stack = $connected.children[1].children[0]
if ($stack.id -ne 'files-workspace-views' -or $stack.children[0].id -ne 'main') { throw 'Original tab view not wrapped' }
if ($connected.children[1].children[1].id -ne 'files') { throw 'File panel was moved' }
& "$repo\install-windows.ps1" -AppHome $fixture -NoActivate
$again = Get-Content "$fixture\layouts\files-workspace.json" -Raw | ConvertFrom-Json
if ($again.children[1].children[0].children[0].id -ne 'main') { throw 'View stack nested on reinstall' }
if (!(Test-Path "$fixture\mods\files-workspace-agents\split.js")) { throw 'Agent dependencies missing' }
Write-Output 'PASS shared-view installation, independent Files panel and idempotent reinstall'
