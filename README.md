# Graham Braille Editor & Local Print Bridge

Graham Braille Editor is a client-side web application that converts text into any liblouis braille table entirely in your browser. 
It features **Native TypeScript Embosser Drivers** directly inside the browser, allowing it to generate precise physical hardware commands for various Braille Embossers (including Generic Text, Enabling Technologies Romeo/Juliet, Index Braille, and Braillo).

#### 🔌 Connecting to your Embosser
- **ChromeOS / WebUSB:** Print directly from the browser — no Bridge. The ViewPlus Max is a USB printer (class 7), so ChromeOS may claim it even when Settings → Print → Printers looks empty. Graham keeps the USB port open after a successful grab. If you see **Access Denied**, leave this tab open, unplug the Max for 10+ seconds, check **chrome://os-settings/cupsPrinters** for hidden automatic printers and remove them while unplugged, then plug it back in with Graham already focused. Print bar **Debug** (or `?usbDebug=1` / Ctrl+Shift+Alt+U) shows whether the port is held. After it works, do not unplug and do not close the tab.
- **Windows / macOS / Linux:** Desktop web browsers do not always have full hardware USB access. To solve this, the **Graham Braille Editor Bridge** is a small, lightweight companion app that runs in your system tray and securely routes the pre-formatted braille commands from the web app straight to your local print spooler.

This guide is primarily for **School IT Administrators** who are setting up the Graham Braille Editor Bridge on student or staff devices.

## Installation Instructions

The Bridge app is pre-compiled for Windows, macOS, and Linux. You do **not** need to install Go, Node.js, or any developer tools to run it.

### 📥 1. Download the Bridge
Go to the **[Releases](https://github.com/grahamthetvi/Graham_Braille_Editor/releases)** tab on GitHub and download the build for your operating system:
- `graham-bridge-windows-setup.exe` (**recommended** for Windows — no admin)
- `graham-bridge-windows.zip` (bare Windows exe for IT who prefer a portable binary)
- `graham-bridge-macos.zip` (for macOS Intel & Apple Silicon)
- `graham-bridge-linux.zip` (Linux amd64: includes `install.sh`)
- `graham-bridge-linux-arm64.zip` (Raspberry Pi / aarch64: includes `install.sh`)
- `graham-bridge-<version>-linux-fedora.x86_64.rpm` (Fedora / RPM-based Linux — e.g. `graham-bridge-3.5.0-linux-fedora.x86_64.rpm`)

ChromeOS users should **not** install Bridge — print with WebUSB from the editor.

---

### 🪟 Windows Setup (Recommended)

1. Download **`graham-bridge-windows-setup.exe`** from [Releases](https://github.com/grahamthetvi/Graham_Braille_Editor/releases).
2. Run the installer (no administrator password required). It installs under `%LOCALAPPDATA%\Programs\GrahamBridge\` and can start Graham Bridge when you log in.
3. A Graham Bridge icon appears in the system tray (near the clock).

**SmartScreen / “Unknown publisher”:** Windows shows this when the installer is not Authenticode-signed (or the signed file has not built SmartScreen reputation yet). Click **More info** → **Run anyway**. School IT can allowlist the publisher once releases are signed (see [Windows Authenticode signing](#windows-authenticode-signing-releases)).

**Updates:** tray → **Check for updates** / **Update available — install now** downloads the new build, replaces the install, and restarts Bridge.

**ZIP alternative:** extract `graham-bridge-windows.zip` and run `graham-bridge-windows.exe`. Prefer the setup installer so auto-update can replace the file without admin rights (avoid `C:\Program Files` unless IT manages upgrades).

---

### 🍎 macOS Setup (Intel & Apple Silicon)

1. Extract the downloaded `graham-bridge-macos.zip` file.
2. You will see an application bundle named `Graham Bridge.app`.
3. Drag `Graham Bridge.app` into your `/Applications` folder.
4. **First Time Launch:** Because this app is an open-source tool, you must right-click `Graham Bridge.app` and select **Open**. You may be prompted to confirm opening an app from an "unidentified developer".
5. **Run on Boot (Recommended):**
   - Go to **System Settings > General > Login Items**.
   - Click the `+` button and select the `Graham Bridge.app` from your Applications folder.

---

### 🐧 Linux Setup (ZIP — recommended for auto-update)

Release ZIPs include the binary, `.desktop` file, `tray_icon.png`, and **`install.sh`**.

1. Extract `graham-bridge-linux.zip` or `graham-bridge-linux-arm64.zip`.
2. From the extracted directory:
   ```bash
   ./install.sh
   ```
   This installs to **`~/.local/bin/graham-bridge`** and a user applications shortcut (**no root**). That path is writable so tray auto-update can replace the binary.
3. Optional system-wide install (requires root; updates may need elevation):
   ```bash
   ./install.sh --system
   ```
4. Launch **Graham Bridge** from the application menu, or run `graham-bridge`.

**Updates:** tray → **Check for updates** / **Update available — install now**.

Ensure GTK3, a tray indicator library, and CUPS client tools are available on the system (the `--system` installer can install those packages).

### 🎩 Linux Setup (Fedora / RPM)

1. From [Releases](https://github.com/grahamthetvi/Graham_Braille_Editor/releases), download **`graham-bridge-<version>-linux-fedora.x86_64.rpm`**.
2. Install:
   ```bash
   sudo dnf install ./graham-bridge-3.5.0-linux-fedora.x86_64.rpm
   ```
3. Launch **Graham Bridge** from the application menu, or run `graham-bridge`.

**Updates:** tray auto-update downloads the new RPM and runs an elevated `dnf install` (polkit/`pkexec`), then restarts Bridge. You can also upgrade manually with `dnf install` on a newer RPM.

### Shared Bridge (dedicated Pi or existing embosser PC)

Share mode lets one Bridge host an embosser on the LAN so teachers print from their own machines. The hosted HTTPS editor only talks to a **local** Bridge on `127.0.0.1:8080`; that Bridge can relay to a share host on **TCP 8081**.

**Option A: Dedicated Raspberry Pi**
- Raspberry Pi OS **Desktop** (systray needs a desktop session), including **Pi Zero 2W**
- USB (or OS-recognized) embosser set up in CUPS / system printers
- Download **`graham-bridge-linux-arm64.zip`** from [Releases](https://github.com/grahamthetvi/Graham_Braille_Editor/releases) (also works on other aarch64 Linux boards)
1. Install and launch Graham Bridge on the Pi.
2. Tray → **Open Settings** → **Share on this network** → set a display name → **Save share settings**.
3. Note the **6-digit share code** and the Pi’s IP address (or DNS name).

**Option B: Existing Windows / macOS / Linux embosser PC**
Use any desktop that already has the embosser connected and recognized by the OS print spooler — same Share flow as on a Pi.
1. Install and launch Graham Bridge on that PC (Windows / macOS / Linux build from Releases).
2. Tray → **Open Settings** → **Share on this network** → set a display name → **Save share settings**.
3. Note the **6-digit share code** and that PC’s IP address (or DNS name).
4. **Windows:** if pairing fails, allow inbound **TCP 8081** in Windows Defender Firewall (or ask IT).

**On each teacher PC**
1. Install Graham Bridge locally (still required — the editor only reaches `127.0.0.1:8080`).
2. Tray → **Open Settings** → **Connect to a shared Bridge** → enter the share host’s IP/DNS and share code → **Pair**.
3. In the editor Print panel, choose the shared embosser (shown as `Name / printer`).

**IT / network**
- Reserve a static IP or DNS name for the share host.
- Allow device-to-device traffic (disable client isolation or use a print VLAN).
- Allow **TCP 8081** from teacher machines to the share host.

**Troubleshooting**
- Cannot pair: ping the share host; confirm Share is on; confirm TCP 8081 is open; verify the code. On Windows hosts, check the firewall rule above.
- Wrong code: regenerate the code on the share host (teachers must pair again).
- Printer missing: ensure the OS/CUPS lists the embosser on the share host; refresh printers in the editor after pairing.

### Inbox folder (rclone) — print jobs from anywhere

Keep **Email BRF** in the editor (Export → Email BRF). On the **embosser computer**, Graham Bridge can watch a local folder and print every new `.brf`.

**Typical flow:** sender emails or uploads a `.brf` into a school Google Drive folder → **rclone** (Linux/Pi, also Windows/macOS) or **Google Drive for desktop** (Windows/macOS) copies it onto disk → Bridge prints it and moves it to `printed/`.

1. Create a Drive folder such as `Graham Embosser Inbox` (school account).
2. On the embosser PC, create `GrahamInbox` in the home directory.
3. Install [rclone](https://rclone.org/downloads/), run `rclone config`, add a Google Drive remote named `gdrive`.
4. Pull files with **`rclone move`** on a timer (**do not use `rclone sync`**):

```bash
# Linux / macOS
mkdir -p ~/GrahamInbox
while true; do
  rclone move "gdrive:Graham Embosser Inbox" "$HOME/GrahamInbox" --include "*.brf"
  sleep 30
done
```

```bat
REM Windows
mkdir %USERPROFILE%\GrahamInbox
:loop
rclone move "gdrive:Graham Embosser Inbox" "%USERPROFILE%\GrahamInbox" --include "*.brf"
timeout /t 30
goto loop
```

5. Bridge tray → **Open Settings** → **Inbox folder** → set the local path, choose the OS printer, set **cells per row**, **lines per page**, and **left padding**, then **Save inbox settings**.

This computer (the receiver) re-wraps and re-paginates inbox `.brf` files with those values before sending them to the OS printer. That overrides wrapping already in the file (for example from the sender’s Download BRF). **Email BRF** and **Download BRF** in the editor are unchanged.

Graham never logs into Drive. Failed jobs (including empty `.brf` files and files larger than 5 MB) go to `failed/` in that folder. Changing cells per row, lines per page, or left padding can reprint a file already printed with the old layout.

---

## ⚙️ How It Works

Once running, the bridge operates silently in the background and places an icon in your system tray. 
- Right-clicking the tray icon allows you to check its status, open **Settings** (Share / Inbox folder / Connect), **Check for updates**, open the Graham Braille Editor, open the debug page, or quit.
- **Updates (Windows & Linux):** tray → **Check for updates** / **Update available — install now** downloads the matching GitHub Release asset, replaces the install, and restarts Bridge. Prefer the Windows setup.exe or Linux `./install.sh` (user) so updates do not need admin.
- The editor-facing HTTP server listens only on **`127.0.0.1:8080`**. Web pages cannot reach LAN addresses directly from the hosted HTTPS site; local Bridge relays to a shared Bridge when configured.
- **Optional Share mode:** when enabled, a second listener on **`0.0.0.0:8081`** accepts Bridge-to-Bridge pairing and print jobs authenticated with the share token (obtained via the share code). This is not the browser CORS API.
- **Browser security (CORS):** Cross-origin requests on port 8080 must come from allowed Graham Braille Editor origins (the official GitHub Pages site, **grahambrailleeditor.com**, local dev servers such as Vite on port 5173, and the bridge’s own pages on port 8080). Other `Origin` values receive **403 Forbidden**. Same-origin and tools without an `Origin` header (such as `curl`) are still allowed for local troubleshooting.
- **Print payload limits:** `POST /print` accepts at most **5 MB** of JSON body to reduce abuse and accidental huge uploads.
- Make sure your Braille embosser is physically connected (USB/Network) and recognized by your operating system's printer settings!

## 🖨️ Supported Embossers

The Graham Braille Editor natively supports generating hardware-specific commands for the following embosser families:

1. **Generic Text Embossers** (Standard CR/LF and Form Feed support)
2. **Enabling Technologies** (Romeo, Juliet, Basic models)
3. **Index Braille** (Basic-D, Everest)
4. **Braillo** (200, 270)

*(Note regarding ViewPlus embossers: ViewPlus relies heavily on proprietary graphical drivers.*
*- If using ChromeOS or Linux, ViewPlus generic text support is **experimental** and may not work.*
## 🎨 Editor Features & Tools

Beyond standard text translation, the Graham Braille Editor provides advanced layout and multi-sensory learning utilities:

### UI language & braille table pairing
Under the **Languages & Codes** tab you can:
1. Choose a **braille translation table** (liblouis).
2. Choose the **website language**: English, Arabic, French, German, Spanish, Portuguese, Chinese (Simplified), Russian, or Urdu. Arabic and Urdu use right-to-left layout.
3. Toggle **Auto-pair**: when on, changing the website language also selects that language’s default braille table; when off, language and table stay independent.

All chrome, dialogs, and help text are translated for those locales. Braille table display names stay in English for technical clarity.

### Updating liblouis (developers)

Braille translation uses a **real WebAssembly** build of liblouis (pinned in
[`client/scripts/build-liblouis/VERSION`](client/scripts/build-liblouis/VERSION);
currently **3.38.0**). Artifacts live in `client/public/wasm/` and tables in
`client/public/tables/` (math tables `nemeth`/`marburg`/`ukmaths`/`wiskunde`
are pulled from [liblouisutdml](https://github.com/liblouis/liblouisutdml)).

To bump the engine:

1. Edit `client/scripts/build-liblouis/VERSION` to the new liblouis release tag (e.g. `3.39.0`).
2. Rebuild and install into `public/`:
   ```bash
   ./client/scripts/build-liblouis/build.sh --install
   # or: cd client && npm run build:liblouis
   ```
3. Update [`client/src/utils/tableRegistry.ts`](client/src/utils/tableRegistry.ts) for any new/renamed/removed tables (and `TABLE_RENAMES` for localStorage migration).
4. Run smoke tests: `cd client && npm test -- src/utils/tableRegistry.test.ts src/utils/liblouisVersion.smoke.test.ts`
5. Commit `public/wasm/*`, `public/tables/*`, registry, and VERSION together.

Requires **podman** or **docker** (pulls `emscripten/emsdk`). CI workflow
`.github/workflows/liblouis-wasm.yml` rebuilds and fails if committed WASM drifts.

### Windows Authenticode signing (releases)

Windows will not show **Verified publisher** for a homemade or self-signed certificate. The signature has to come from an identity in the Microsoft Trusted Root Program (Azure Artifact Signing, or an OV/EV code-signing certificate from a public CA). Self-signed files still trigger SmartScreen.

Release CI (`.github/workflows/build-bridge.yml`) signs `graham-bridge-windows.exe` and `graham-bridge-windows-setup.exe` when credentials are present. Until then, builds stay unsigned and SmartScreen’s “Unknown publisher” warning is expected.

**Recommended: Azure Artifact Signing** (formerly Trusted Signing)

1. Create an [Artifact Signing](https://learn.microsoft.com/azure/artifact-signing/quickstart) account and complete **identity validation** so the certificate subject is the publisher name you want Windows to show (for example **Graham The TVI**).
2. Create a **Public Trust** certificate profile and an Entra app registration. Grant the app the **Artifact Signing Certificate Profile Signer** role.
3. Add GitHub **Actions variables**:
   - `AZURE_CODESIGN_ENDPOINT` — regional endpoint, e.g. `https://eus.codesigning.azure.net/`
   - `AZURE_CODESIGN_ACCOUNT` — Artifact Signing account name
   - `AZURE_CODESIGN_PROFILE` — certificate profile name
4. Add GitHub **Actions secrets**:
   - `AZURE_TENANT_ID`
   - `AZURE_CLIENT_ID`
   - `AZURE_CLIENT_SECRET`
5. Tag a release (`v*`) or run **Build Bridge**. Right-click the downloaded `setup.exe` → **Properties** → **Digital Signatures** should list the validated publisher.

**Alternative: existing PFX** (only if your CA still issued an exportable cert; most new certs require a hardware token or cloud HSM instead)

1. Secrets: `WINDOWS_CERT_PFX_BASE64` (base64 of the `.pfx`) and `WINDOWS_CERT_PASSWORD`.
2. Used only when `AZURE_CODESIGN_ACCOUNT` is not set.
3. Locally (Windows SDK `signtool`): `.\bridge\packaging\sign-windows.ps1 -Files path\to\file.exe`

Even after a valid signature, SmartScreen may warn until the file builds reputation. Signed releases still let IT allowlist the publisher in AppLocker / SmartScreen.

### 1. Large-Print (Jumbo) Braille
For combined print/braille production or low-vision readers, you can insert large-print sections in your document. 
- Use the **Large Print** tool under the **Tools** tab to insert blocks like `:::jumbo size=48\nText\n:::`.
- The on-screen **BRF Preview** renders these jumbo blocks in BRF format (as physical Braille cells) scaled to your target font size, ensuring absolute consistency with standard Braille cells.

### 2. Tactile Graphics Editor
Access the full-featured canvas editor by clicking **Graphics** under the **Tools** tab. It allows teachers and transcribers to design tactile diagrams that can be printed alongside Braille text:
- **Shape Inventory**:
  - **Simple Shapes**: Lines, rectangles, and adjustable polygons.
  - **Complex Shapes**: Custom pre-built shapes including Cloud, Crescent Moon, Lightning Bolt, 5-Pointed Star, Apple, and Cross.
- **Adjustable Parameters**: Select shapes like the Cross and configure custom horizontal/vertical bar sizes directly.
- **Positioning Tool**: Switch to the selection tool in the Canvas Tools tab to move text elements and shapes around the canvas without resizing or mutating them.
- **Custom Designs & Drawing**:
  - **Paintbrush**: Create brush stroke details featuring handle, ferrule, and bristle components.
  - **Daisies & Flowers**: Draw flowers with filled centers to preserve high tactile contrast even in outline modes.
  - **Vampire Fangs**: Emboss fangs featuring detailed gum lines and blood drips.
  - **Real-Time Braille Preview**: The graphics editor modal uses actual `<BrailleCell>` components for rendering, giving you an exact real-time look of the physical embossed output.

### 3. MP3 Audio Export
Under the **File** tab, click **Export** to open the export bar (same pattern as Print). Choose **BRF**, **Email BRF**, **Print layout**, or **Audio (MP3)**. **Email BRF** downloads the same `.brf` as **BRF**, then opens Gmail compose with attach-and-send instructions; Graham does not send mail or attach the file for you. For audio, a dialog explains each browser TTS engine—the practical differences are export speed and first-download model size:

| Engine | Notes |
|--------|--------|
| **Kitten** (default) | Lightweight neural voice; first use downloads ~25–60 MB from Hugging Face. Uses **WebGPU** when the browser provides it, otherwise WASM. |
| **eSpeak NG** | Very small robotic voice; loads quickly. Best fallback if neural-model downloads are blocked. |
| **Piper** | Higher-quality neural voice (`en_US-lessac-medium`, ~60 MB). `en_US-lessac-low` is the same download size in Piper’s voice list, so medium is kept for quality. |

Models are cached in the browser after the first download. Works on Windows, macOS, Linux, and ChromeOS.

**If a model download fails:** school and workplace networks often block Hugging Face. The export dialog explains this and suggests eSpeak NG or a less-restricted network. Private browsing / storage quota can also prevent caching.

**Speed:** local Vite `dev`/`preview` sends `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` so ONNX Runtime can use multi-threaded WASM (`SharedArrayBuffer`). **GitHub Pages cannot set those headers**, so production Pages stays single-threaded unless you put the site behind a CDN that adds them (Cloudflare Pages reads `public/_headers`). Piper phonemize WASM is served from the app origin; the large Piper/Kitten **voice models** still come from Hugging Face (too large to vendor).

## ⚖️ Legal Disclaimer

Any tools, software, drivers, or brands built by APH, ViewPlus, JJB Software, and Beneficent Technology are their respective intellectual property. I do not claim ownership of any of their products, software, or technology, and they are entirely theirs and not mine.
