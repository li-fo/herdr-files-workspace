# Windows port of Files Transfer. Requests are JSON data, never evaluated as code.
param([Parameter(Mandatory=$true)][string]$Request)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$utf8 = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
$r = ConvertFrom-Json -InputObject $Request
$a = @($r.args)
$dataRoot = [IO.Path]::GetFullPath((Join-Path $r.appHome 'data/files-transfer'))

function Full([string]$p) { [IO.Path]::GetFullPath($p) }
function Under([string]$p, [string]$base) {
    (Full $p).StartsWith((Full $base).TrimEnd('\','/') + '\', [StringComparison]::OrdinalIgnoreCase)
}
function WriteUtf8([string]$p, [string]$s) { [IO.File]::WriteAllText($p, $s, $utf8) }
function Quote([string]$s) { "'" + $s.Replace("'", "''") + "'" }
function ValidName([string]$n) {
    if ([string]::IsNullOrWhiteSpace($n) -or $n -match '[<>:"/\\|?*\x00-\x1f]' -or $n -match '[. ]$' -or $n -match '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)') {
        throw 'Invalid Windows file name.'
    }
}
function SafeEntry([string]$p) {
    $p = Full $p
    if ($p.TrimEnd('\') -eq [IO.Path]::GetPathRoot($p).TrimEnd('\') -or $p.TrimEnd('\') -eq $env:USERPROFILE.TrimEnd('\')) { throw 'Refusing a root or home folder.' }
    return $p
}
function AssertNoLinks([string]$p) {
    $item = Get-Item -LiteralPath $p -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Copying links/junctions is not supported; select their contents instead.' }
    if ($item.PSIsContainer) { foreach ($child in Get-ChildItem -LiteralPath $p -Force) { AssertNoLinks $child.FullName } }
}
function CopyTree([string]$src, [string]$dest) {
    $item = Get-Item -LiteralPath $src -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Cannot copy a symbolic link or junction.' }
    if ($item.PSIsContainer) {
        if (Test-Path -LiteralPath $dest) { throw 'Destination already exists.' }
        [void][IO.Directory]::CreateDirectory($dest)
        foreach ($child in Get-ChildItem -LiteralPath $src -Force) { CopyTree $child.FullName (Join-Path $dest $child.Name) }
    } else { [IO.File]::Copy($src, $dest, $false) }
    if ($item.PSIsContainer) { [IO.Directory]::SetLastWriteTimeUtc($dest, $item.LastWriteTimeUtc) }
    else { [IO.File]::SetLastWriteTimeUtc($dest, $item.LastWriteTimeUtc) }
}
function MoveFresh([string]$src, [string]$dest) {
    if ([IO.Directory]::Exists($src)) { [IO.Directory]::Move($src, $dest) }
    else { [IO.File]::Move($src, $dest) }
}
function Publish([string]$src, [string]$dir, [string]$name) {
    ValidName $name
    $base = $name; $ext = ''
    if (-not [IO.Directory]::Exists($src) -and $name.LastIndexOf('.') -gt 0) {
        $base = $name.Substring(0, $name.LastIndexOf('.')); $ext = $name.Substring($name.LastIndexOf('.'))
    }
    for ($i = 0; $i -lt 10000; $i++) {
        $leaf = if ($i -eq 0) { $name } else { "$base ($i)$ext" }
        $dest = Join-Path $dir $leaf
        try { MoveFresh $src $dest; return $dest }
        catch { if (-not (Test-Path -LiteralPath $dest)) { throw } }
    }
    throw 'Too many duplicate file names.'
}
function RemoveTemp([string]$p) {
    $p = SafeEntry $p
    # Only private preview/job files or an explicitly named upload/download staging directory.
    $leaf = [IO.Path]::GetFileName($p.TrimEnd('\'))
    if (-not (Under $p $dataRoot) -and $leaf -notmatch '^\.herdr-(upload|download)\.[a-f0-9]{32}$') { throw 'Refusing cleanup outside mod temporary storage.' }
    if (Test-Path -LiteralPath $p) {
        $item = Get-Item -LiteralPath $p -Force
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing recursive cleanup of a link.' }
        Remove-Item -LiteralPath $p -Recurse -Force
    }
}
function NewTemp([string]$dir, [string]$kind) {
    $p = Join-Path (Full $dir) ('.herdr-' + $kind + '.' + [Guid]::NewGuid().ToString('N'))
    [void][IO.Directory]::CreateDirectory($p)
    return $p
}
function StatusPath([string]$p) {
    $p = Full $p
    if (-not (Under $p $dataRoot)) { throw 'Invalid job status path.' }
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($p))
    return $p
}
function LaunchWorker([string]$action, [object[]]$values) {
    $payload = @{action=$action;args=$values;appHome=$r.appHome} | ConvertTo-Json -Compress -Depth 8
    $code = '& ' + (Quote $PSCommandPath) + ' -Request ' + (Quote $payload)
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($code))
    Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList @('-NoLogo','-NoProfile','-NonInteractive','-STA','-EncodedCommand',$encoded) -WindowStyle Hidden | Out-Null
}
function Scp([string[]]$values, [string]$log) {
    # Native argument arrays: filenames are not shell code. SFTP is the OpenSSH default.
    $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try {
        & scp.exe -r -p -o BatchMode=yes -o ConnectTimeout=15 @values 2>&1 | ForEach-Object { [IO.File]::AppendAllText($log, "$_`n", $utf8) }
        if ($LASTEXITCODE -ne 0) { throw "scp failed (exit $LASTEXITCODE)." }
    } finally { $ErrorActionPreference = $old }
}
function Downloads {
    $key = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders'
    $p = $key.'{374DE290-123F-4565-9164-39C4925E467B}'
    if (-not $p) { $p = Join-Path $env:USERPROFILE 'Downloads' }
    [Environment]::ExpandEnvironmentVariables($p)
}
function DownloadDirectory([string]$selected) {
    if ([string]::IsNullOrWhiteSpace($selected)) { return (Full (Downloads)) }
    if ($selected -notmatch '^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)') { throw 'Choose an absolute download folder.' }
    return (Full $selected)
}

try {
    switch ($r.action) {
        'list' {
            $items = @(Get-ChildItem -LiteralPath $a[0] -Force | Where-Object { $_.Name -ne '.git' -and $_.Name -notmatch '^\.herdr-(upload|download)\.' } | Select-Object -First 501 | ForEach-Object {
                @{name=$_.Name;dir=[bool]$_.PSIsContainer}
            })
            ConvertTo-Json -InputObject $items -Compress
        }
        'language' { [Globalization.CultureInfo]::CurrentUICulture.TwoLetterISOLanguageName }
        'clipboard-files' {
            Add-Type -AssemblyName System.Windows.Forms
            ConvertTo-Json -InputObject @([Windows.Forms.Clipboard]::GetFileDropList() | ForEach-Object { [string]$_ }) -Compress
        }
        'copy-path' { Set-Clipboard -Value ([string]$a[0]) }
        'reveal' {
            $p = Full $a[0]
            Start-Process explorer.exe -ArgumentList ('/select,"' + $p + '"')
        }
        'open' { Start-Process -FilePath (Full $a[0]) }
        'trash' {
            $p = SafeEntry $a[0]
            Add-Type -AssemblyName Microsoft.VisualBasic
            if ([IO.Directory]::Exists($p)) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p, 'OnlyErrorDialogs', 'SendToRecycleBin', 'ThrowException') }
            else { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p, 'OnlyErrorDialogs', 'SendToRecycleBin', 'ThrowException') }
        }
        'size' { (Get-Item -LiteralPath $a[0] -Force).Length }
        'mkdir' { [void][IO.Directory]::CreateDirectory((Full $a[0])) }
        'temp' {
            $dir = [IO.Path]::GetDirectoryName((Full $a[0]))
            NewTemp $dir 'upload'
        }
        'cleanup' { foreach ($p in $a) { RemoveTemp $p } }
        'clean-preview' {
            $p = Full $a[0]
            if ($p -ne (Join-Path $dataRoot 'preview')) { throw 'Invalid preview folder.' }
            [void][IO.Directory]::CreateDirectory($p)
            # Stale preview cleanup is intentionally left to an explicit user cleanup:
            # another visible panel may still be rendering an old preview.
        }
        'copy' { CopyTree (Full $a[0]) (Full $a[1]) }
        'move' {
            $src = SafeEntry $a[0]; $dest = Full $a[1]; ValidName ([IO.Path]::GetFileName($dest))
            if (Test-Path -LiteralPath $dest) { exit 17 }
            try { MoveFresh $src $dest } catch { if (Test-Path -LiteralPath $dest) { exit 17 }; throw }
        }
        'create-file' {
            $p = Full $a[0]; ValidName ([IO.Path]::GetFileName($p))
            try { $f = [IO.File]::Open($p, [IO.FileMode]::CreateNew); $f.Dispose() }
            catch { if (Test-Path -LiteralPath $p) { exit 17 }; throw }
        }
        'create-folder' {
            $p = Full $a[0]; ValidName ([IO.Path]::GetFileName($p))
            if (Test-Path -LiteralPath $p) { exit 17 }
            # New-Item without Force fails on a collision.
            try { New-Item -ItemType Directory -Path $p | Out-Null }
            catch { if (Test-Path -LiteralPath $p) { exit 17 }; throw }
        }
        'place' {
            $tmp = Full $a[0]; $dir = Full $a[1]
            if ([IO.Path]::GetDirectoryName($tmp) -ne $dir.TrimEnd('\') -or [IO.Path]::GetFileName($tmp) -notmatch '^\.herdr-upload\.[a-f0-9]{32}$') { throw 'Invalid upload staging folder.' }
            foreach ($item in Get-ChildItem -LiteralPath $tmp -Force) { [IO.Path]::GetFileName((Publish $item.FullName $dir $item.Name)) }
            RemoveTemp $tmp
        }
        'download' {
            [void](StatusPath $a[3]); ValidName $a[2]
            $a[1] = DownloadDirectory $a[1]
            LaunchWorker 'download-worker' $a
        }
        'send' {
            [void](StatusPath $a[0])
            if ($a.Count -lt 4) { throw 'No files to transfer.' }
            $names = @{}
            foreach ($p in $a[3..($a.Count-1)]) {
                $name = [IO.Path]::GetFileName((Full $p).TrimEnd('\'))
                if ($names.ContainsKey($name)) { throw 'Select files with distinct names in one upload.' }
                $names[$name] = $true
            }
            LaunchWorker 'send-worker' $a
        }
        'download-worker' {
            $st = StatusPath $a[3]; $tmp = $null; $result = '1'
            try {
                $dir = DownloadDirectory $a[1]
                if ($a[4] -ne 'scp') {
                    $src = Full $a[0]
                    if ([IO.Directory]::Exists($src) -and ($dir.TrimEnd('\') -eq $src.TrimEnd('\') -or (Under $dir $src))) {
                        throw 'Choose a download folder outside the source folder.'
                    }
                }
                [void][IO.Directory]::CreateDirectory($dir)
                $tmp = NewTemp $dir 'download'; $name = [string]$a[2]; ValidName $name
                $target = Join-Path $tmp $name
                if ($a[4] -eq 'scp') { Scp @([string]$a[0],$target) "$st.log" }
                else { CopyTree (Full $a[0]) $target }
                $dest = Publish $target $dir $name
                WriteUtf8 "$st.dest" $dest
                $result = '0'
            } catch { WriteUtf8 "$st.log" ((Get-Content -LiteralPath "$st.log" -Raw -ErrorAction SilentlyContinue) + "`n" + $_.Exception.Message) }
            finally {
                if ($tmp) { try { RemoveTemp $tmp } catch {} }
                WriteUtf8 "$st.pending" $result
                [IO.File]::Move("$st.pending", $st)
            }
        }
        'send-worker' {
            $st = StatusPath $a[0]; $result = '1'
            try {
                $files = @($a[3..($a.Count-1)] | ForEach-Object { Full $_ })
                if ($a[1] -ne 'scp') {
                    foreach ($p in $files) { if (Under (Full $a[2]) $p) { throw 'Cannot paste a folder inside itself.' } }
                }
                foreach ($p in $files) { AssertNoLinks $p }
                if ($a[1] -eq 'scp') { Scp ($files + @([string]$a[2])) "$st.log" }
                else {
                    $dest = Full $a[2]
                    foreach ($p in $files) {
                        if (Under $dest $p) { throw 'Cannot paste a folder inside itself.' }
                        CopyTree $p (Join-Path $dest ([IO.Path]::GetFileName($p.TrimEnd('\'))))
                    }
                }
                $result = '0'
            } catch { WriteUtf8 "$st.log" ((Get-Content -LiteralPath "$st.log" -Raw -ErrorAction SilentlyContinue) + "`n" + $_.Exception.Message) }
            finally {
                WriteUtf8 "$st.pending" $result
                [IO.File]::Move("$st.pending", $st)
            }
        }
        { $_ -in 'convert-image','image-size' } {
            Add-Type -AssemblyName PresentationCore
            $stream = [IO.File]::OpenRead((Full $a[0]))
            try {
                $decoder = [Windows.Media.Imaging.BitmapDecoder]::Create($stream, 'PreservePixelFormat', 'OnLoad')
                $frame = $decoder.Frames[0]
                if ($r.action -eq 'image-size') { "pixelWidth: $($frame.PixelWidth)"; "pixelHeight: $($frame.PixelHeight)" }
                else {
                    $encoder = [Windows.Media.Imaging.PngBitmapEncoder]::new(); $encoder.Frames.Add($frame)
                    $dest = [IO.File]::Open((Full $a[1]), 'CreateNew')
                    try { $encoder.Save($dest) } finally { $dest.Dispose() }
                }
            } catch { throw ('Windows cannot decode this image format: ' + $_.Exception.Message) }
            finally { $stream.Dispose() }
        }
        default { throw "Unknown Windows operation: $($r.action)" }
    }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
exit 0
