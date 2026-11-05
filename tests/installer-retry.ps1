$ErrorActionPreference = 'Stop'
$source = Join-Path (Split-Path -Parent $PSScriptRoot) 'install-windows.ps1'
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($source, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Installer parse failed' }
foreach ($name in @('Invoke-FileRetry', 'Copy-ManagedFile')) {
    $function = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
    . ([scriptblock]::Create($function.Extent.Text))
}
$script:attempts = 0
Invoke-FileRetry {
    $script:attempts++
    if ($script:attempts -lt 3) { throw [IO.IOException]::new('Synthetic sharing violation', -2147024864) }
}
if ($script:attempts -ne 3) { throw 'Sharing violation not retried' }
$script:attempts = 0
try { Invoke-FileRetry { $script:attempts++; throw [IO.IOException]::new('Other IO error') } } catch {}
if ($script:attempts -ne 1) { throw 'Unrelated error was retried' }
$root = Join-Path (Split-Path -Parent $PSScriptRoot) ('.test-windows-retry-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$from = Join-Path $root 'source.txt'; $to = Join-Path $root 'target.txt'
[IO.File]::WriteAllText($from, 'same'); [IO.File]::WriteAllText($to, 'same')
[IO.File]::SetLastWriteTimeUtc($to, [datetime]'2000-01-01')
Copy-ManagedFile $from $to
if ([IO.File]::GetLastWriteTimeUtc($to).Year -ne 2000) { throw 'Unchanged file was rewritten' }
[IO.File]::WriteAllText($from, 'new')
Copy-ManagedFile $from $to
if ([IO.File]::ReadAllText($to) -ne 'new') { throw 'Changed file not copied' }
Write-Output 'PASS sharing violation retries, unrelated errors, unchanged-file skip and changed-file copy'
