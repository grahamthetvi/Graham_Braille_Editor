# Authenticode-sign PE files with a code-signing PFX (SHA-256 + RFC3161 timestamp).
# A self-signed certificate will NOT make Windows show a verified publisher.
param(
    [Parameter(Mandatory = $true)][string[]]$Files
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($env:WINDOWS_CERT_PFX_BASE64)) {
    Write-Host "WINDOWS_CERT_PFX_BASE64 is not set; skipping Authenticode signing."
    exit 0
}

function Find-SignTool {
    $kitRoot = "${env:ProgramFiles(x86)}\Windows Kits\10\bin"
    if (Test-Path $kitRoot) {
        $tool = Get-ChildItem -Path $kitRoot -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
            Where-Object { $_.DirectoryName -match '\\x64$' } |
            Sort-Object FullName -Descending |
            Select-Object -First 1
        if ($tool) { return $tool.FullName }
    }
    $cmd = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    throw "signtool.exe not found. Install the Windows SDK Signing Tools."
}

function Protect-Delete([string]$Path) {
    if (-not (Test-Path $Path)) { return }
    try {
        $len = (Get-Item $Path).Length
        if ($len -gt 0) {
            $zeros = New-Object byte[] $len
            [IO.File]::WriteAllBytes($Path, $zeros)
        }
    } catch {
        # Best-effort wipe; still remove the file below.
    }
    Remove-Item -Force $Path -ErrorAction SilentlyContinue
}

$signtool = Find-SignTool
$pfx = Join-Path ([IO.Path]::GetTempPath()) ("graham-codesign-" + [guid]::NewGuid().ToString("N") + ".pfx")
[IO.File]::WriteAllBytes($pfx, [Convert]::FromBase64String($env:WINDOWS_CERT_PFX_BASE64))

$timestampServers = @(
    "http://timestamp.digicert.com",
    "http://timestamp.acs.microsoft.com",
    "http://timestamp.sectigo.com"
)

try {
    foreach ($file in $Files) {
        if (-not (Test-Path $file)) {
            throw "File not found: $file"
        }
        $signed = $false
        foreach ($ts in $timestampServers) {
            & $signtool sign /fd SHA256 /td SHA256 /tr $ts /f $pfx /p $env:WINDOWS_CERT_PASSWORD /d "Graham Bridge" /du "https://grahambrailleeditor.com/" $file
            if ($LASTEXITCODE -eq 0) {
                $signed = $true
                break
            }
            Write-Warning "Timestamp server $ts failed for $(Split-Path $file -Leaf); trying next."
        }
        if (-not $signed) {
            throw "Failed to Authenticode-sign $file"
        }
        & $signtool verify /pa $file
        if ($LASTEXITCODE -ne 0) {
            throw "Signature verification failed: $file"
        }
        Write-Host "Signed $(Split-Path $file -Leaf)"
    }
} finally {
    Protect-Delete $pfx
}
