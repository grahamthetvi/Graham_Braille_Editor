#!/bin/bash
# Graham Bridge - Automated Linux Dependency Installer and Setup
set -e

# 1. ChromeOS Check
if [ -f /etc/apt/sources.list.d/cros.list ] || [ -f /usr/bin/sommelier ]; then
    echo "=================================================================="
    echo " ChromeOS Environment Detected"
    echo "=================================================================="
    echo "Graham Braille Editor supports native ChromeOS printing directly"
    echo "from the browser via WebUSB. No background bridge application is"
    echo "needed on ChromeOS."
    echo ""
    echo "Simply connect your embosser to your Chromebook's USB port,"
    echo "open the editor website, and select your embosser model to print."
    echo "=================================================================="
    exit 0
fi

# 2. Linux OS Check
if [ "$(uname)" != "Linux" ]; then
    echo "Error: This installer is only for Linux systems." >&2
    exit 1
fi

# 3. Request root permissions if not already elevated
if [ "$EUID" -ne 0 ]; then
    echo "This installer requires root privileges to install packages and copy binaries."
    echo "Re-running script with sudo..."
    exec sudo "$0" "$@"
fi

# 4. Source distro details
if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO=$ID
else
    DISTRO="unknown"
fi

# 5. Distro-specific Dependency Installation
echo "Detecting package manager for Linux distribution ($DISTRO)..."
if command -v dnf >/dev/null 2>&1; then
    echo "Using DNF package manager..."
    dnf install -y gtk3 libappindicator-gtk3 cups
elif command -v apt-get >/dev/null 2>&1; then
    echo "Using APT package manager..."
    apt-get update
    if apt-cache show libayatana-appindicator3-1 >/dev/null 2>&1; then
        apt-get install -y libgtk-3-0 libayatana-appindicator3-1 cups-client
    else
        apt-get install -y libgtk-3-0 libappindicator3-1 cups-client
    fi
elif command -v pacman >/dev/null 2>&1; then
    echo "Using Pacman package manager..."
    pacman -Sy --needed --noconfirm gtk3 libappindicator-gtk3 cups
else
    echo "Warning: Unsupported package manager."
    echo "Please manually ensure the following dependencies are installed:"
    echo "  - GTK3"
    echo "  - libappindicator (or libayatana-appindicator)"
    echo "  - CUPS client (lp and lpstat commands)"
    echo ""
    read -p "Press Enter to continue installation anyway, or Ctrl+C to abort..."
fi

# 6. Locate Graham Bridge Binary
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_SRC=""
if [ -f "$DIR/bridge/graham-bridge-linux-amd64" ]; then
    BIN_SRC="$DIR/bridge/graham-bridge-linux-amd64"
elif [ -f "$DIR/bridge/bridge-linux-amd64" ]; then
    BIN_SRC="$DIR/bridge/bridge-linux-amd64"
elif [ -f "$DIR/bridge/dist/bridge-linux" ]; then
    BIN_SRC="$DIR/bridge/dist/bridge-linux"
elif [ -f "$DIR/bridge/graham-bridge" ]; then
    BIN_SRC="$DIR/bridge/graham-bridge"
fi

if [ -z "$BIN_SRC" ]; then
    echo "Error: Pre-compiled binary not found." >&2
    echo "Please build the bridge first using: npm run bridge:build:linux" >&2
    exit 1
fi

# 7. Install Files
echo "Installing Graham Bridge binary to /usr/local/bin..."
install -D -p -m 755 "$BIN_SRC" "/usr/local/bin/graham-bridge"

echo "Installing desktop shortcut..."
DESKTOP_SRC="$DIR/bridge/graham-bridge.desktop"
if [ -f "$DESKTOP_SRC" ]; then
    TMP_DESKTOP=$(mktemp)
    cp "$DESKTOP_SRC" "$TMP_DESKTOP"
    sed -i 's|Exec=graham-bridge-linux-amd64|Exec=/usr/local/bin/graham-bridge|' "$TMP_DESKTOP"
    sed -i 's|Icon=printer|Icon=graham-bridge|' "$TMP_DESKTOP"
    install -D -p -m 644 "$TMP_DESKTOP" "/usr/share/applications/graham-bridge.desktop"
    rm -f "$TMP_DESKTOP"
else
    echo "Warning: graham-bridge.desktop not found at $DESKTOP_SRC"
fi

echo "Installing icon..."
ICON_SRC="$DIR/bridge/tray_icon.png"
if [ -f "$ICON_SRC" ]; then
    install -D -p -m 644 "$ICON_SRC" "/usr/share/icons/hicolor/128x128/apps/graham-bridge.png"
else
    echo "Warning: tray_icon.png not found at $ICON_SRC"
fi

# 8. Refresh Desktop Database
if command -v update-desktop-database >/dev/null 2>&1; then
    echo "Updating desktop application database..."
    update-desktop-database /usr/share/applications
fi

echo "=================================================================="
echo " Graham Bridge Installed Successfully!"
echo "=================================================================="
echo "You can now launch 'Graham Bridge' from your applications menu"
echo "or run 'graham-bridge' in your terminal."
echo "=================================================================="
