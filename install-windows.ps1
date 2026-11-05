param(
    [string]$AppHome = $(if ($env:HERDR_APP_HOME) { $env:HERDR_APP_HOME } else { "$env:USERPROFILE\.config\herdr-app" }),
    [switch]$NoActivate
)
$ErrorActionPreference = 'Stop'
$AppHome = [IO.Path]::GetFullPath($AppHome)
function Invoke-FileRetry([scriptblock]$Action) {
    for ($attempt = 0; ; $attempt++) {
        try { return (& $Action) }
        catch {
            $errorCode = $_.Exception.HResult -band 65535
            if ($_.Exception.InnerException) { $errorCode = $_.Exception.InnerException.HResult -band 65535 }
            if ($errorCode -notin @(32, 33) -or $attempt -ge 49) { throw }
            Start-Sleep -Milliseconds 100
        }
    }
}
function Copy-ManagedFile([string]$From, [string]$To) {
    if ((Test-Path -LiteralPath $To -PathType Leaf) -and (Get-FileHash -LiteralPath $From).Hash -eq (Get-FileHash -LiteralPath $To).Hash) { return }
    $bytes = [IO.File]::ReadAllBytes($From)
    Invoke-FileRetry { [IO.File]::WriteAllBytes($To, $bytes) }
}
$versionText = (herdr-app --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $versionText -notmatch 'herdr-app (\d+\.\d+\.\d+)') { throw 'Cannot determine the Herdr version.' }
$herdrVersion = $Matches[1]
if ([version]$herdrVersion -lt [version]'0.1.13') { throw 'Herdr 0.1.13 or later is required.' }
$source = Join-Path $PSScriptRoot 'mods\files-workspace'
$keysPath = Join-Path $AppHome 'keys.json'
if (!(Test-Path -LiteralPath $keysPath)) { throw 'Start Herdr once before installing.' }
$keys = Get-Content -LiteralPath $keysPath -Raw | ConvertFrom-Json
$section = $keys.'mod:files-workspace'
if (!$section) { $section = [pscustomobject]@{}; $keys | Add-Member -NotePropertyName 'mod:files-workspace' -NotePropertyValue $section }
foreach ($key in @('ctrl-s', 'cmd-s')) {
    if ($section.$key -and $section.$key -ne 'files-workspace.save') { throw "Existing $key binding conflicts; merge keys.json manually." }
    $section | Add-Member -NotePropertyName $key -NotePropertyValue 'files-workspace.save' -Force
}
foreach ($binding in @(@('ctrl-f', 'find'), @('cmd-f', 'find'), @('ctrl-h', 'replace'), @('cmd-alt-f', 'replace'))) {
    $key = $binding[0]; $command = 'files-workspace.' + $binding[1]
    if ($section.$key -and $section.$key -ne $command) { throw "Existing $key binding conflicts; merge keys.json manually." }
    $section | Add-Member -NotePropertyName $key -NotePropertyValue $command -Force
}
# Validate both modules before changing the installed files.
$headerSource = Join-Path $PSScriptRoot 'mods\files-workspace-header'
foreach ($modSource in @($source, $headerSource)) {
    herdr-app check $modSource | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Source mod check failed: $modSource" }
}
$layoutPath = Join-Path $AppHome 'layouts\files-workspace.json'
# Build the new layout in memory. Never edit the shipped main layout.
if (Test-Path -LiteralPath $layoutPath) {
    $layout = Get-Content -LiteralPath $layoutPath -Raw | ConvertFrom-Json
} else {
    $basePath = Join-Path $AppHome 'layouts\main.json'
    if (!(Test-Path -LiteralPath $basePath)) { throw 'Start Herdr once to create the main layout.' }
    $layout = Get-Content -LiteralPath $basePath -Raw | ConvertFrom-Json
    $layout | Add-Member -NotePropertyName cloned_from -NotePropertyValue ([pscustomobject]@{name='main';version=$herdrVersion}) -Force
}
$script:filesBlocks = 0
$script:headerBlocks = 0
function Connect-Workspace($node) {
    if ($node.content.mod -in @('files', 'files-workspace')) {
        $node.content.mod = 'files-workspace'; $script:filesBlocks++
    }
    if ($node.content.pane.header.content.mod -in @('pane', 'files-workspace-header')) {
        $node.content.pane.header.content.mod = 'files-workspace-header'; $script:headerBlocks++
    }
    foreach ($child in $node.children) { Connect-Workspace $child }
}
Connect-Workspace $layout
if (!$script:filesBlocks -or !$script:headerBlocks) { throw 'Layout lacks a Files block or pane header. No files changed; connect these in your custom layout first.' }
# Retire only our old selection workaround; preserve user colors.
if ($layout.colors.selection -eq '#6699cc55') { $layout.colors.PSObject.Properties.Remove('selection') }

$manifestPath = Join-Path $AppHome 'data\files-workspace\install-manifest.json'
$oldFiles = @()
if (Test-Path -LiteralPath $manifestPath) { $oldFiles = @((Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json).files) }
# Only previous managed files inside these two mod folders may be removed.
function Resolve-ManagedPath([string]$relative) {
    if ($relative -notmatch '^mods[\\/]files-workspace(?:-header)?[\\/]' -or $relative -match '(^|[\\/])\.\.([\\/]|$)' -or [IO.Path]::IsPathRooted($relative)) { throw "Invalid managed file path: $relative" }
    $resolved = [IO.Path]::GetFullPath((Join-Path $AppHome $relative))
    if (!$resolved.StartsWith($AppHome.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Managed file escapes app home: $relative" }
    return $resolved
}
$copies = @()
foreach ($name in @('files-workspace', 'files-workspace-header')) {
    $modSource = Join-Path $PSScriptRoot "mods\$name"
    foreach ($file in Get-ChildItem -LiteralPath $modSource -File -Recurse) {
        $relative = "mods\$name\" + $file.FullName.Substring($modSource.Length + 1)
        $copies += [pscustomobject]@{ Source = $file.FullName; Relative = $relative; Target = (Resolve-ManagedPath $relative) }
    }
}
$newFiles = @($copies.Relative)
$stale = @($oldFiles | ForEach-Object { Resolve-ManagedPath $_ } | Where-Object { $_ -notin $copies.Target })
$touched = @($copies.Target) + $stale + @($keysPath, $manifestPath)
if ($layout) { $touched += $layoutPath }
$touched = @($touched | Select-Object -Unique)
$backup = Join-Path $AppHome ('backups\files-workspace-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $backup | Out-Null
$records = @()
foreach ($target in $touched) {
    $saved = Join-Path $backup $records.Count
    $exists = Test-Path -LiteralPath $target -PathType Leaf
    if ($exists) { Copy-Item -LiteralPath $target -Destination $saved }
    $records += [pscustomobject]@{ Target = $target; Backup = $saved; Existed = $exists }
}
$records | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $backup 'restore.json') -Encoding UTF8
try {
    # Publish dependencies before entry points to reduce hot-reload failures.
    foreach ($copy in $copies | Sort-Object { [IO.Path]::GetFileName($_.Target) -eq 'main.js' }) {
        New-Item -ItemType Directory -Path (Split-Path -Parent $copy.Target) -Force | Out-Null
        Copy-ManagedFile $copy.Source $copy.Target
    }
    foreach ($target in $stale) { if (Test-Path -LiteralPath $target -PathType Leaf) { Invoke-FileRetry { Remove-Item -LiteralPath $target -Force } } }
    Invoke-FileRetry { [IO.File]::WriteAllText($keysPath, ($keys | ConvertTo-Json -Depth 50), [Text.UTF8Encoding]::new($false)) }
    Invoke-FileRetry { [IO.File]::WriteAllText($layoutPath, ($layout | ConvertTo-Json -Depth 50), [Text.UTF8Encoding]::new($false)) }
    foreach ($name in @('files-workspace', 'files-workspace-header')) {
        herdr-app check (Join-Path $AppHome "mods\$name") | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "Installed mod check failed: $name" }
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $manifestPath) -Force | Out-Null
    [IO.File]::WriteAllText($manifestPath, (@{files=$newFiles} | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
} catch {
    $failure = $_
    $restoreErrors = @()
    foreach ($record in $records | Sort-Object { [IO.Path]::GetFileName($_.Target) -eq 'main.js' }) {
        try {
            if ($record.Existed) { Copy-ManagedFile $record.Backup $record.Target }
            elseif (Test-Path -LiteralPath $record.Target -PathType Leaf) { Invoke-FileRetry { Remove-Item -LiteralPath $record.Target -Force } }
        } catch { $restoreErrors += $_.Exception.Message }
    }
    if ($restoreErrors.Count) { throw "Install failed: $failure. Restore errors: $($restoreErrors -join '; '). Backup: $backup" }
    throw "Install failed; previous files restored. $failure Backup: $backup"
}
Write-Output "Herdr Files Workspace installed. Backup: $backup"
if (!$NoActivate) {
    $oldAppHome = $env:HERDR_APP_HOME
    try {
        $env:HERDR_APP_HOME = $AppHome
        herdr-app do layout.switch --name files-workspace | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'Files are installed, but layout activation failed. Start Herdr and run: herdr-app do layout.switch --name files-workspace' }
    } finally { $env:HERDR_APP_HOME = $oldAppHome }
}
Write-Output 'Layout: files-workspace. Modules: files-workspace, files-workspace-header. Shortcuts: Save, Find, Replace.'
