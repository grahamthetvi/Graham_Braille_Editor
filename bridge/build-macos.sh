#!/bin/bash
set -e

APP_NAME="Graham Bridge.app"
CONTENTS_DIR="$APP_NAME/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"

echo "Creating macOS App Bundle..."
mkdir -p "$MACOS_DIR"

# Write Info.plist (LSUIElement=true hides the dock icon)
cat <<EOF > "$CONTENTS_DIR/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key>
	<string>bridge</string>
	<key>CFBundleIdentifier</key>
	<string>com.grahamthetvi.grahambridge</string>
	<key>CFBundleName</key>
	<string>Graham Bridge</string>
	<key>CFBundleShortVersionString</key>
	<string>3.5.0</string>
	<key>CFBundleVersion</key>
	<string>3.5.0</string>
	<key>LSUIElement</key>
	<true/>
</dict>
</plist>
EOF

echo "Building Universal macOS Binary..."
GO_LDFLAGS="-X main.BuildNumber=${GITHUB_RUN_NUMBER:-dev}"
CGO_ENABLED=1 GOOS=darwin GOARCH=amd64 go build -ldflags="$GO_LDFLAGS" -o graham-bridge-amd64 .
CGO_ENABLED=1 GOOS=darwin GOARCH=arm64 go build -ldflags="$GO_LDFLAGS" -o graham-bridge-arm64 .

# Use lipo to create a universal binary if available, otherwise fallback to arm64
if command -v lipo >/dev/null 2>&1; then
    lipo -create -output "$MACOS_DIR/bridge" graham-bridge-amd64 graham-bridge-arm64
else
    echo "Warning: lipo not found, using arm64 binary"
    cp graham-bridge-arm64 "$MACOS_DIR/bridge"
fi

rm -f graham-bridge-amd64 graham-bridge-arm64

echo "Done! The app bundle is in $APP_NAME"
