$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

try {
    $root = Split-Path -Parent $PSScriptRoot
    Set-Location -LiteralPath $root

    $node = (Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
    $versionText = & $node --version
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to determine the Node.js version.'
    }
    $nodeVersion = [version] (($versionText | Out-String).Trim().TrimStart('v'))
    if ($nodeVersion -lt [version] '22.12.0') {
        throw 'Node.js 22.12.0 or newer is required. Update Node.js and restart MeGit so it receives the updated PATH.'
    }

    foreach ($dependency in @('tsx', 'vite', 'express')) {
        $manifest = Join-Path $root "node_modules/$dependency/package.json"
        if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) {
            throw "Missing dependency: $dependency. Install the project dependencies, including development dependencies, with npm ci in a separate terminal, then retry. This script does not download dependencies."
        }
    }

    $entry = Join-Path $root 'server/index.ts'
    if (-not (Test-Path -LiteralPath $entry -PathType Leaf)) {
        throw 'Application entry server/index.ts was not found in this worktree.'
    }

    Write-Host 'Starting MeGit in foreground development mode on loopback.'
    Write-Host 'The application uses MEGIT_PORT when set, otherwise port 4317.'
    Write-Host 'If the port is occupied, stop the existing service through its owner; this script will not terminate it.'

    & $node --import tsx $entry
    $applicationExitCode = $LASTEXITCODE
    if ($applicationExitCode -ne 0) {
        [Console]::Error.WriteLine("MeGit exited with code $applicationExitCode. Review the application output above.")
    }
    exit $applicationExitCode
} catch {
    [Console]::Error.WriteLine(('MeGit startup failed: ' + $_.Exception.Message))
    exit 1
}
