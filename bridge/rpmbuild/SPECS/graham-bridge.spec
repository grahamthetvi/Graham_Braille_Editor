Name:           graham-bridge
Version:        3.4.0
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
* Wed Apr 08 2026 Graham The TVI - 3.4.0-1
- Update to version 3.4.0
