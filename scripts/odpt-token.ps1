param([switch]$Read, [switch]$SaveStdin, [string]$StorageDirectory, [ValidateSet('challenge2026','standard')][string]$CredentialName='challenge2026')
$ErrorActionPreference = 'Stop'
$credentialDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.cache/odpt-credentials'))
if ($StorageDirectory) { $credentialDirectory = [IO.Path]::GetFullPath($StorageDirectory) }
$credentialFile = Join-Path $credentialDirectory ($CredentialName + '.dpapi')
if ($SaveStdin) {
    $value = [Console]::In.ReadToEnd().Trim()
    if ($value -notmatch '^[a-zA-Z0-9_-]{20,256}$') { exit 3 }
    try {
    [IO.Directory]::CreateDirectory($credentialDirectory) | Out-Null
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $existingAcl = Get-Acl -LiteralPath $credentialDirectory
    $allowedRules = @($existingAcl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]) | Where-Object { $_.AccessControlType -eq 'Allow' })
    $foreignRules = @($allowedRules | Where-Object { $_.IdentityReference.Value -ne $identity.Value })
    $ownRules = @($allowedRules | Where-Object {
        $_.IdentityReference.Value -eq $identity.Value -and
        ($_.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl -and
        ($_.InheritanceFlags -band [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit') -eq [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit' -and
        $_.PropagationFlags -eq [Security.AccessControl.PropagationFlags]::None
    })
    # Applying a new DirectorySecurity object to an already protected directory can
    # require SeSecurityPrivilege. Reuse the existing user-only DACL when it matches.
    $alreadyPrivate = $existingAcl.AreAccessRulesProtected -and $foreignRules.Count -eq 0 -and $ownRules.Count -gt 0
    if (!$alreadyPrivate) {
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    Set-Acl -LiteralPath $credentialDirectory -AclObject $acl
    }
    } catch { exit 31 }
    try {
    $secure = ConvertTo-SecureString $value -AsPlainText -Force
    $encrypted = ConvertFrom-SecureString $secure
    } catch { exit 32 }
    try { [IO.File]::WriteAllText($credentialFile, $encrypted, [Text.Encoding]::ASCII) }
    catch { exit 33 }
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
