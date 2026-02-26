#!/bin/bash
set -e

echo "Building Graham Bridge..."

# Build for Windows
echo "Building for Windows (amd64)..."
GOOS=windows GOARCH=amd64 go build -ldflags -H=windowsgui -o graham-bridge-windows-amd64.exe .

# Build for Linux
echo "Building for Linux (amd64)..."
GOOS=linux GOARCH=amd64 go build -o graham-bridge-linux-amd64 .

# Build for macOS (Intel and Apple Silicon)
echo "Building for macOS (amd64)..."
GOOS=darwin GOARCH=amd64 go build -o graham-bridge-darwin-amd64 .

echo "Building for macOS (arm64)..."
GOOS=darwin GOARCH=arm64 go build -o graham-bridge-darwin-arm64 .

echo "Done!"
