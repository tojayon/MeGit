param([switch]$PrepareOnly)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$stage = Join-Path $PSScriptRoot '.stage'
$backend = Join-Path $stage 'backend'
$icons = Join-Path $stage 'icons'
$nodeVersion = '24.22.3'
$nodeChecksum = 'e612af99f626ab415ea225af6bce5c971feb448cb5cae250bb1c3fa50c5f7d9f'
$nodeName = "node-v$nodeVersion-win-x64"
$archive = Join-Path $stage "$nodeName.zip"

function Invoke-Step {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable exited with code $LASTEXITCODE" }
}

if ([Environment]::OSVersion.Platform -ne 'Win32NT') { throw 'This build targets Windows x64.' }
Push-Location $root
try {
    foreach ($directory in @($stage, $backend, $icons)) {
        if ((Test-Path -LiteralPath $directory) -and
            ((Get-Item -LiteralPath $directory -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Build directory is a reparse point: $directory"
        }
    }
    if (Test-Path -LiteralPath $backend) {
        $resolvedBackend = (Resolve-Path -LiteralPath $backend).ProviderPath
        $resolvedStage = (Resolve-Path -LiteralPath $stage).ProviderPath
        if ($resolvedBackend -ne (Join-Path $resolvedStage 'backend')) {
            throw "Unexpected staging directory: $resolvedBackend"
        }
        Remove-Item -LiteralPath $resolvedBackend -Recurse -Force
    }
    New-Item -ItemType Directory -Force $backend, $icons | Out-Null

    Invoke-Step 'npm.cmd' @('run', 'build')
    Invoke-Step 'npm.cmd' @('--prefix', $PSScriptRoot, 'ci', '--no-audit', '--no-fund')
    Invoke-Step 'npm.cmd' @('--prefix', $PSScriptRoot, 'run', 'tauri', '--', 'icon', (Join-Path $root 'public/brand/megit-icon.svg'), '--output', $icons)

    if (!(Test-Path -LiteralPath $archive)) {
        $download = "$archive.download"
        Invoke-Step 'curl.exe' @('--fail', '--silent', '--show-error', '--location', '--retry', '2', '--output', $download, "https://nodejs.org/dist/v$nodeVersion/$nodeName.zip")
        if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash -ne $nodeChecksum) {
            throw 'Downloaded Node.js archive does not match its pinned SHA-256.'
        }
        Move-Item -LiteralPath $download -Destination $archive
    }
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $nodeChecksum) {
        throw "Invalid Node.js archive. Remove it and retry: $archive"
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($archive)
    try {
        foreach ($file in @('node.exe', 'LICENSE')) {
            [IO.Compression.ZipFileExtensions]::ExtractToFile($zip.GetEntry("$nodeName/$file"), (Join-Path $backend $file))
        }
    } finally { $zip.Dispose() }

    Copy-Item -LiteralPath 'dist', 'dist-server' -Destination $backend -Recurse
    Copy-Item -LiteralPath 'package.json', 'package-lock.json' -Destination $backend
    Copy-Item -LiteralPath 'LICENSE' -Destination (Join-Path $backend 'MeGit-LICENSE.txt')
    Invoke-Step 'npm.cmd' @('--prefix', $backend, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund')

    if (!$PrepareOnly) {
        Invoke-Step 'npm.cmd' @('--prefix', $PSScriptRoot, 'run', 'tauri', '--', 'build', '--target', 'x86_64-pc-windows-msvc', '--bundles', 'nsis', '--', '--locked')
    }
} finally { Pop-Location }
