Write-Host "Building Graham Bridge..."

Write-Host "Building for Windows (amd64)..."
$env:GOOS = "windows"
$env:GOARCH = "amd64"
# -H windowsgui suppresses the console window so only the systray icon appears
go build -ldflags="-H windowsgui" -o graham-bridge-windows-amd64.exe .

Write-Host "Building for Linux (amd64)..."
$env:GOOS = "linux"
$env:GOARCH = "amd64"
go build -o graham-bridge-linux-amd64 .

Write-Host "Building for macOS (amd64)..."
$env:GOOS = "darwin"
$env:GOARCH = "amd64"
go build -o graham-bridge-darwin-amd64 .

Write-Host "Building for macOS (arm64)..."
$env:GOOS = "darwin"
$env:GOARCH = "arm64"
go build -o graham-bridge-darwin-arm64 .

Write-Host "Done!"
# Reset env vars to not pollute
Remove-Item Env:\GOOS -ErrorAction Ignore
Remove-Item Env:\GOARCH -ErrorAction Ignore
