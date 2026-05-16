#!/usr/bin/env pwsh
$ErrorActionPreference = "Stop"

# Build the Spent Windows tray app: a tiny WPF NotifyIcon controller for the
# always-on Next.js server. Network access is restricted to 127.0.0.1 only
# (see Constants.cs and StatusModel.cs).

Set-Location -Path $PSScriptRoot

function Fail-MissingSdk {
    Write-Error @"
.NET 8 SDK not found. (The dotnet launcher can be installed without an SDK.)
Install .NET 8 SDK from:
  https://dotnet.microsoft.com/download/dotnet/8.0
Or via winget:
  winget install Microsoft.DotNet.SDK.8
"@
    exit 1
}

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Fail-MissingSdk
}

$sdks = & dotnet --list-sdks 2>$null
if (-not ($sdks | Where-Object { $_ -match '^(8|9|1\d)\.' })) {
    Fail-MissingSdk
}

$outDir = "build"
if (Test-Path $outDir) {
    Remove-Item -Recurse -Force $outDir
}

Write-Host "Building release binary..."
& dotnet publish -c Release -r win-x64 --self-contained true `
    -p:PublishSingleFile=true `
    -p:IncludeNativeLibrariesForSelfExtract=true `
    -p:EnableCompressionInSingleFile=true `
    -o $outDir

if ($LASTEXITCODE -ne 0) {
    Write-Error "dotnet publish failed with exit code $LASTEXITCODE."
    exit 1
}

$exe = Join-Path $outDir "Spent.exe"
if (-not (Test-Path $exe)) {
    Write-Error "Expected $exe but it was not produced."
    exit 1
}

Write-Host ""
Write-Host "Built: $exe"
Write-Host ""
Write-Host "To install:"
Write-Host "  mkdir `$env:LOCALAPPDATA\Programs\Spent"
Write-Host "  Copy-Item $exe `$env:LOCALAPPDATA\Programs\Spent\"
Write-Host ""
Write-Host "First launch: SmartScreen may show 'Windows protected your PC'."
Write-Host "Click 'More info' -> 'Run anyway'. (The binary is unsigned.)"
Write-Host ""
Write-Host "To auto-start at login, drop a shortcut to Spent.exe into:"
Write-Host "  shell:startup  (run from Win+R)"
