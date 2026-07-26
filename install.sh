#!/bin/bash
# Graham Bridge - Linux installer (release ZIP or repo checkout)
# Default: user install under ~/.local (no root) for easy auto-updates.
# System-wide: ./install.sh --system
set -e

SYSTEM_INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --system) SYSTEM_INSTALL=1 ;;
    -h|--help)
      echo "Usage: $0 [--system]"
      echo "  (default) Install to ~/.local/bin (no root; recommended for auto-update)"
      echo "  --system  Install to /usr/local (requires root)"
      exit 0
      ;;
  esac
done

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

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 3. Locate Graham Bridge Binary (release ZIP layout or repo checkout)
BIN_SRC=""
for candidate in \
  "$DIR/graham-bridge-linux-amd64" \
  "$DIR/graham-bridge-linux-arm64" \
  "$DIR/graham-bridge" \
  "$DIR/bridge/graham-bridge-linux-amd64" \
  "$DIR/bridge/graham-bridge-linux-arm64" \
  "$DIR/bridge/graham-bridge" \
  "$DIR/bridge/dist/bridge-linux"
do
  if [ -f "$candidate" ]; then
    BIN_SRC="$candidate"
    break
  fi
done

if [ -z "$BIN_SRC" ]; then
    echo "Error: Pre-compiled binary not found next to this script." >&2
    echo "Expected graham-bridge-linux-amd64 or graham-bridge-linux-arm64 in the release ZIP," >&2
    echo "or a built binary under bridge/ in a repo checkout." >&2
    exit 1
fi

ARCH="$(uname -m)"
case "$BIN_SRC" in
  *arm64*)
    if [ "$ARCH" != "aarch64" ] && [ "$ARCH" != "arm64" ]; then
      echo "Warning: installing arm64 binary on $ARCH" >&2
    fi
    ;;
  *amd64*)
    if [ "$ARCH" != "x86_64" ] && [ "$ARCH" != "amd64" ]; then
      echo "Warning: installing amd64 binary on $ARCH" >&2
    fi
    ;;
esac

DESKTOP_SRC=""
for d in "$DIR/graham-bridge.desktop" "$DIR/bridge/graham-bridge.desktop"; do
  [ -f "$d" ] && DESKTOP_SRC="$d" && break
done
ICON_SRC=""
for i in "$DIR/tray_icon.png" "$DIR/bridge/tray_icon.png"; do
  [ -f "$i" ] && ICON_SRC="$i" && break
done

install_deps_system() {
  if [ -f /etc/os-release ]; then
    # shellcheck source=/dev/null
    . /etc/os-release
    DISTRO=$ID
  else
    DISTRO="unknown"
  fi
  echo "Detecting package manager for Linux distribution ($DISTRO)..."
  if command -v dnf >/dev/null 2>&1; then
    dnf install -y gtk3 libappindicator-gtk3 cups
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update
    if apt-cache show libayatana-appindicator3-1 >/dev/null 2>&1; then
      apt-get install -y libgtk-3-0 libayatana-appindicator3-1 cups-client
    else
      apt-get install -y libgtk-3-0 libappindicator3-1 cups-client
    fi
  elif command -v pacman >/dev/null 2>&1; then
    pacman -Sy --needed --noconfirm gtk3 libappindicator-gtk3 cups
  else
    echo "Warning: Unsupported package manager. Ensure GTK3, libappindicator, and CUPS client are installed."
  fi
}

if [ "$SYSTEM_INSTALL" -eq 1 ]; then
  if [ "$EUID" -ne 0 ]; then
    echo "System install requires root. Re-running with sudo..."
    exec sudo "$0" --system
  fi
  install_deps_system

  echo "Installing Graham Bridge binary to /usr/local/bin..."
  install -D -p -m 755 "$BIN_SRC" "/usr/local/bin/graham-bridge"
  BIN_DEST="/usr/local/bin/graham-bridge"

  if [ -n "$DESKTOP_SRC" ]; then
    TMP_DESKTOP=$(mktemp)
    cp "$DESKTOP_SRC" "$TMP_DESKTOP"
    sed -i "s|Exec=graham-bridge-linux-amd64|Exec=${BIN_DEST}|" "$TMP_DESKTOP"
    sed -i "s|Exec=graham-bridge-linux-arm64|Exec=${BIN_DEST}|" "$TMP_DESKTOP"
    sed -i 's|Icon=printer|Icon=graham-bridge|' "$TMP_DESKTOP"
    install -D -p -m 644 "$TMP_DESKTOP" "/usr/share/applications/graham-bridge.desktop"
    rm -f "$TMP_DESKTOP"
  fi
  if [ -n "$ICON_SRC" ]; then
    install -D -p -m 644 "$ICON_SRC" "/usr/share/icons/hicolor/128x128/apps/graham-bridge.png"
  fi
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database /usr/share/applications || true
  fi
else
  # User install — no root. Remind about deps if missing.
  if ! command -v lpstat >/dev/null 2>&1; then
    echo "Note: CUPS client (lpstat/lp) not found. Install cups-client / cups for printing."
  fi

  HOME_BIN="${HOME}/.local/bin"
  HOME_APP="${HOME}/.local/share/applications"
  HOME_ICON="${HOME}/.local/share/icons/hicolor/128x128/apps"
  mkdir -p "$HOME_BIN" "$HOME_APP" "$HOME_ICON"

  echo "Installing Graham Bridge binary to ${HOME_BIN}..."
  install -D -p -m 755 "$BIN_SRC" "${HOME_BIN}/graham-bridge"
  BIN_DEST="${HOME_BIN}/graham-bridge"

  if [ -n "$DESKTOP_SRC" ]; then
    TMP_DESKTOP=$(mktemp)
    cp "$DESKTOP_SRC" "$TMP_DESKTOP"
    sed -i "s|Exec=graham-bridge-linux-amd64|Exec=${BIN_DEST}|" "$TMP_DESKTOP"
    sed -i "s|Exec=graham-bridge-linux-arm64|Exec=${BIN_DEST}|" "$TMP_DESKTOP"
    if [ -n "$ICON_SRC" ]; then
      sed -i "s|Icon=printer|Icon=${HOME_ICON}/graham-bridge.png|" "$TMP_DESKTOP"
    fi
    install -D -p -m 644 "$TMP_DESKTOP" "${HOME_APP}/graham-bridge.desktop"
    rm -f "$TMP_DESKTOP"
  fi
  if [ -n "$ICON_SRC" ]; then
    install -D -p -m 644 "$ICON_SRC" "${HOME_ICON}/graham-bridge.png"
  fi
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$HOME_APP" || true
  fi

  case ":$PATH:" in
    *":${HOME_BIN}:"*) ;;
    *)
      echo "Note: add ${HOME_BIN} to your PATH if 'graham-bridge' is not found in the terminal."
      ;;
  esac
fi

echo "=================================================================="
echo " Graham Bridge Installed Successfully!"
echo "=================================================================="
echo "Binary: ${BIN_DEST}"
echo "Launch from the applications menu, or run: graham-bridge"
echo "Updates: tray → Check for updates / Update available — install now"
echo "=================================================================="
