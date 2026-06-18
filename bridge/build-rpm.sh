#!/bin/bash
set -e

# Define paths
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "Setting up RPM build environment..."
RPM_ROOT="$DIR/rpmbuild"
rm -rf "$RPM_ROOT"  # Clean up old build environment and stale RPMs
mkdir -p "$RPM_ROOT"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}

VERSION="3.4.1"
SOURCE_DIR="graham-bridge-$VERSION"
# Distinct asset name per release (GitHub + dnf); NVR inside the RPM stays graham-bridge-<version>.
RPM_FINAL_NAME="graham-bridge-${VERSION}-linux-fedora.x86_64.rpm"

# Create source tarball containing the pre-compiled binary
echo "Creating source tarball..."
mkdir -p "/tmp/$SOURCE_DIR"
cp -r "$DIR"/* "/tmp/$SOURCE_DIR/"
rm -rf "/tmp/$SOURCE_DIR/rpmbuild"
cd "/tmp"
tar -czf "$RPM_ROOT/SOURCES/graham-bridge-$VERSION.tar.gz" "$SOURCE_DIR"
rm -rf "/tmp/$SOURCE_DIR"
cd "$DIR"

# Generate spec file (quoted heredoc keeps $RPM_BUILD_ROOT etc. literal for rpmbuild)
cat << 'EOF' > "$RPM_ROOT/SPECS/graham-bridge.spec"
Name:           graham-bridge
Version:        PLACEHOLDER_VERSION
Release:        1%{?dist}
Summary:        Graham Braille Editor Bridge
License:        MIT
URL:            https://github.com/grahamthetvi/Graham_Braille_Editor
Source0:        %{name}-%{version}.tar.gz

Requires:       gtk3
Requires:       libappindicator-gtk3

# Disable debug package generation since we use a pre-compiled binary
%global debug_package %{nil}

%description
Bridge server for printing BRF files to local embossers from Graham Braille Editor.

%prep
%setup -q

# Update desktop file to point to correct binary name and icon
sed -i 's/Exec=graham-bridge-linux-amd64/Exec=graham-bridge/' graham-bridge.desktop
sed -i 's/Icon=printer/Icon=graham-bridge/' graham-bridge.desktop

%build
# Nothing to build, using pre-compiled binary

%install
rm -rf $RPM_BUILD_ROOT
if [ -f graham-bridge-linux-amd64 ]; then
    BIN_NAME="graham-bridge-linux-amd64"
elif [ -f bridge-linux-amd64 ]; then
    BIN_NAME="bridge-linux-amd64"
else
    echo "Could not find linux binary"
    exit 1
fi
install -D -p -m 755 $BIN_NAME $RPM_BUILD_ROOT/%{_bindir}/graham-bridge
install -D -p -m 644 graham-bridge.desktop $RPM_BUILD_ROOT/%{_datadir}/applications/graham-bridge.desktop
install -D -p -m 644 tray_icon.png $RPM_BUILD_ROOT/%{_datadir}/icons/hicolor/128x128/apps/graham-bridge.png

%files
%{_bindir}/graham-bridge
%{_datadir}/applications/graham-bridge.desktop
%{_datadir}/icons/hicolor/128x128/apps/graham-bridge.png

%changelog
* Wed Apr 08 2026 Graham The TVI - PLACEHOLDER_VERSION-1
- Update to version PLACEHOLDER_VERSION
EOF
sed -i "s/PLACEHOLDER_VERSION/${VERSION}/g" "$RPM_ROOT/SPECS/graham-bridge.spec"

# Build the RPM
echo "Building RPM..."
rpmbuild -bb --define "_topdir $RPM_ROOT" "$RPM_ROOT/SPECS/graham-bridge.spec"

ARCH_DIR="$RPM_ROOT/RPMS/x86_64"
shopt -s nullglob
rpms=("$ARCH_DIR"/*.rpm)
if [ "${#rpms[@]}" -ne 1 ]; then
  echo "Expected exactly one RPM in $ARCH_DIR, found ${#rpms[@]}"
  exit 1
fi
mv -f "${rpms[0]}" "$ARCH_DIR/$RPM_FINAL_NAME"

echo "RPM built successfully: $ARCH_DIR/$RPM_FINAL_NAME"
