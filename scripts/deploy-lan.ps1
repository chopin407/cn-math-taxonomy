[CmdletBinding()]
param(
    [switch]$BuildOnly,
    [ValidateRange(1024, 65535)]
    [int]$Port = 8080
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$SshTarget = 'kjg@192.168.1.74'
$RemoteDir = '/home/kjg/work/kid-learn'
$Release = [DateTime]::UtcNow.ToString('yyyyMMddHHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$Archive = Join-Path $Root "dist/kid-learn-$Release.tar.gz"
if ($BuildOnly) { $Archive = Join-Path $Root 'dist/kid-learn.tar.gz' }

function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Program exited with code $LASTEXITCODE."
    }
}

Invoke-Checked python @((Join-Path $PSScriptRoot 'build-lan.py'), $Archive)
if ($BuildOnly) { return }

$Incoming = "$RemoteDir/.incoming/$Release"
$Helper = Join-Path $PSScriptRoot 'deploy-lan-remote.sh'
try {
    Invoke-Checked ssh @($SshTarget, "umask 077; mkdir -p -- '$Incoming'")
    Invoke-Checked scp @($Archive, $Helper, "${SshTarget}:${Incoming}/")
    $RemoteCommand = "tr -d '\r' < '$Incoming/deploy-lan-remote.sh' | bash -s -- '$RemoteDir' '$Release' '$Port'"
    Invoke-Checked ssh @($SshTarget, $RemoteCommand)
    Write-Host "Deployed kid-learn to http://192.168.1.74:${Port}/"
} finally {
    Remove-Item -LiteralPath $Archive -ErrorAction SilentlyContinue
}
