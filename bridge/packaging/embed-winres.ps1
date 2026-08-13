# Embeds a Windows VERSIONINFO + asInvoker manifest so Explorer shows publisher metadata.
# Authenticode (the "Verified publisher" signature) is a separate step: sign-windows.ps1 / CI.
param(
    [Parameter(Mandatory = $true)][string]$Version,
    [Parameter(Mandatory = $false)][string]$BuildNumber = "0"
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Get-Command go-winres -ErrorAction SilentlyContinue)) {
    go install github.com/tc-hib/go-winres@v0.3.3
}

if ($Version -eq "dev" -or [string]::IsNullOrWhiteSpace($Version)) {
    $fileVersion = "0.0.0.$BuildNumber"
    $productVersion = "dev"
} else {
    $semver = $Version.TrimStart("v")
    $parts = @($semver -split "\.")
    while ($parts.Count -lt 3) { $parts += "0" }
    $nums = @()
    foreach ($p in $parts[0..2]) {
        if ($p -match "^(\d+)") { $nums += $Matches[1] } else { $nums += "0" }
    }
    if ($BuildNumber -notmatch "^\d+$") { $BuildNumber = "0" }
    $fileVersion = "$($nums[0]).$($nums[1]).$($nums[2]).$BuildNumber"
    $productVersion = $semver
}

Write-Host "Embedding Windows VERSIONINFO file=$fileVersion product=$productVersion"
go-winres make --in winres.json --arch amd64 --file-version $fileVersion --product-version $productVersion
if ($LASTEXITCODE -ne 0) {
    throw "go-winres failed with exit code $LASTEXITCODE"
}
