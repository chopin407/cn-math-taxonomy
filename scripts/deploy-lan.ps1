[CmdletBinding(DefaultParameterSetName = 'BuildAndDeploy')]
param(
    [Parameter(Mandatory, ParameterSetName = 'BuildOnly')]
    [switch]$BuildOnly,
    [Parameter(Mandatory, ParameterSetName = 'DeployOnly')]
    [switch]$DeployOnly,
    [ValidateRange(1024, 65535)]
    [int]$Port = 8090
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$SshTarget = 'kjg@192.168.1.74'
$RemoteDir = '/home/kjg/work/kid-learn'
$BuildScript = Join-Path $PSScriptRoot 'build-lan.py'
$SavedArchive = Join-Path $Root 'dist/kid-learn.tar.gz'

function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Program exited with code $LASTEXITCODE."
    }
}

if ($BuildOnly) {
    Invoke-Checked python @($BuildScript, $SavedArchive)
    return
}
if ($DeployOnly) {
    $Package = Get-Item -LiteralPath $SavedArchive -ErrorAction SilentlyContinue
    if ($Package -isnot [System.IO.FileInfo] -or $Package.Length -eq 0) {
        throw "No deployment package at '$SavedArchive'. Run .\scripts\deploy-lan.ps1 -BuildOnly first."
    }
}

$Release = [DateTime]::UtcNow.ToString('yyyyMMddHHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$Archive = Join-Path $Root "dist/kid-learn-$Release.tar.gz"
$Incoming = "$RemoteDir/.incoming/$Release"
$Helper = Join-Path $PSScriptRoot 'deploy-lan-remote.sh'
try {
    if ($DeployOnly) {
        # The remote helper expects an archive named for this release.
        Copy-Item -LiteralPath $SavedArchive -Destination $Archive
    } else {
        Invoke-Checked python @($BuildScript, $Archive)
    }
    Invoke-Checked ssh @($SshTarget, "umask 077; mkdir -p -- '$Incoming'")
    Invoke-Checked scp @($Archive, $Helper, "${SshTarget}:${Incoming}/")
    $RemoteHelper = "$Incoming/deploy-lan-remote.lf.sh"
    $RemoteCommand = "tr -d '\r' < '$Incoming/deploy-lan-remote.sh' > '$RemoteHelper' && bash '$RemoteHelper' '$RemoteDir' '$Release' '$Port'"
    Invoke-Checked ssh @($SshTarget, $RemoteCommand)
    Write-Host "Deployed kid-learn to http://192.168.1.74:${Port}/"
} finally {
    Remove-Item -LiteralPath $Archive -ErrorAction SilentlyContinue
}
