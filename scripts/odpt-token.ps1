param([switch]$Read, [switch]$SaveStdin, [string]$StorageDirectory)
$ErrorActionPreference = 'Stop'
$credentialDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.cache/odpt-credentials'))
if ($StorageDirectory) { $credentialDirectory = [IO.Path]::GetFullPath($StorageDirectory) }
$credentialFile = Join-Path $credentialDirectory 'challenge2026.dpapi'
if ($SaveStdin) {
    $value = [Console]::In.ReadToEnd().Trim()
    if ($value -notmatch '^[a-zA-Z0-9_-]{20,256}$') { exit 3 }
    [IO.Directory]::CreateDirectory($credentialDirectory) | Out-Null
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    Set-Acl -LiteralPath $credentialDirectory -AclObject $acl
    $secure = ConvertTo-SecureString $value -AsPlainText -Force
    [IO.File]::WriteAllText($credentialFile, (ConvertFrom-SecureString $secure), [Text.Encoding]::ASCII)
    $secure.Dispose(); $value = $null
    exit 0
}
if ($Read) {
    if (!(Test-Path -LiteralPath $credentialFile)) { exit 2 }
    $secure = ConvertTo-SecureString ([IO.File]::ReadAllText($credentialFile))
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { [Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secure.Dispose() }
    exit 0
}
Write-Output 'Run npm run odpt:setup to open private browser input.'
