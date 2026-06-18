# Graham Braille Editor & Local Print Bridge

Graham Braille Editor is a client-side web application that converts text into any liblouis braille table entirely in your browser. 
It features **Native TypeScript Embosser Drivers** directly inside the browser, allowing it to generate precise physical hardware commands for various Braille Embossers (including Generic Text, Enabling Technologies Romeo/Juliet, Index Braille, and Braillo).

#### 🔌 Connecting to your Embosser
- **ChromeOS / WebUSB:** Because the editor has native driver support, you can print *directly* from your browser to your embosser using WebUSB. Just connect your embosser, select your model, and hit Print. No bridge required!
- **Windows / macOS / Linux:** Desktop web browsers do not always have full hardware USB access. To solve this, the **Graham Braille Editor Bridge** is a small, lightweight companion app that runs in your system tray and securely routes the pre-formatted braille commands from the web app straight to your local print spooler.

This guide is primarily for **School IT Administrators** who are setting up the Graham Braille Editor Bridge on student or staff devices.

## Installation Instructions

The Bridge app is pre-compiled for Windows, macOS, and Linux. You do **not** need to install Go, Node.js, or any developer tools to run it.

### 📥 1. Download the Bridge
Go to the **[Releases](https://github.com/grahamthetvi/Graham_Braille_Editor/releases)** tab on GitHub and download the build for your operating system:
- `graham-bridge-windows.zip` (for Windows)
- `graham-bridge-macos.zip` (for macOS Intel & Apple Silicon)
- `graham-bridge-linux.zip` (generic Linux: extract and run the binary)
- `graham-bridge-<version>-linux-fedora.x86_64.rpm` (Fedora / RPM-based Linux: install with `dnf`; see below — e.g. `graham-bridge-3.3.0-linux-fedora.x86_64.rpm`)

---

### 🪟 Windows Setup (Easiest)

1. Extract the downloaded `graham-bridge-windows.zip` file.
2. Move the extracted `graham-bridge-windows.exe` file to a safe location (e.g., `C:\Program Files\graham\`).
3. Double-click the `.exe` file to run it. A Graham Braille Editor icon will appear in your System Tray (near the clock).
4. **Run on Boot (Recommended):** 
   - Press `Win + R`, type `shell:startup`, and press Enter.
   - Right-click and drag the `graham-bridge-windows.exe` into the Startup folder, and select "Create shortcuts here". The bridge will now silently start in the background when the user logs in.

---

### 🍎 macOS Setup (Intel & Apple Silicon)

1. Extract the downloaded `graham-bridge-macos.zip` file.
2. You will see an application bundle named `Graham Braille Editor Bridge.app`.
3. Drag `Graham Braille Editor Bridge.app` into your `/Applications` folder.
4. **First Time Launch:** Because this app is an open-source tool, you must right-click `Graham Braille Editor Bridge.app` and select **Open**. You may be prompted to confirm opening an app from an "unidentified developer".
5. **Run on Boot (Recommended):**
   - Go to **System Settings > General > Login Items**.
   - Click the `+` button and select the `Graham Braille Editor Bridge.app` from your Applications folder.

---

### 🐧 Linux Setup (Recommended: Automated Installer)

For generic Linux distributions, you can use the automated installer script to check for environment compatibility, install system dependencies (GTK3, libappindicator, and CUPS client), and configure launcher shortcuts automatically:

1. Extract the downloaded `graham-bridge-linux.zip` file (which contains the binary, desktop configuration, and assets).
2. Run the installer script from the extracted directory:
   ```bash
   ./install.sh
   ```
   *(Note: The script will automatically request sudo permissions to install required system packages and copy the binary to `/usr/local/bin`.)*

### 🐧 Linux Manual Setup (Ubuntu/Debian/ChromeOS — ZIP)

If you prefer to set up files manually:

1. Extract the downloaded `graham-bridge-linux.zip` file.
2. The zip contains the executable binary `graham-bridge-linux-amd64` and a desktop shortcut `graham-bridge.desktop`.
3. Move the binary to a global location, for example:
   ```bash
   sudo mv graham-bridge-linux-amd64 /usr/local/bin/graham-bridge
   ```
4. Edit the `Exec=` line in the `graham-bridge.desktop` file to point to `/usr/local/bin/graham-bridge` (or keep `Exec=graham-bridge` if that binary is on your `PATH`).
5. Install the desktop shortcut so it appears in the app launcher:
   ```bash
   mkdir -p ~/.local/share/applications
   mv graham-bridge.desktop ~/.local/share/applications/
   ```
6. You can now launch "Graham Braille Editor Bridge" from your application menu!

### 🎩 Linux Setup (Fedora / RPM)


1. From the same [Releases](https://github.com/grahamthetvi/Graham_Braille_Editor/releases) page, download **`graham-bridge-<version>-linux-fedora.x86_64.rpm`** for the tag you want (built in CI on Ubuntu with `rpmbuild`; suitable for Fedora and other `dnf`-based systems with compatible dependencies).
2. Install (replace the filename with the one you downloaded):
   ```bash
   sudo dnf install ./graham-bridge-3.3.0-linux-fedora.x86_64.rpm
   ```
3. Launch **Graham Braille Editor Bridge** from the application menu, or run `graham-bridge` from a terminal.

---

## ⚙️ How It Works

Once running, the bridge operates silently in the background and places an icon in your system tray. 
- Right-clicking the tray icon allows you to check its status, easily open the Graham Braille Editor in your browser, or cleanly quit the background process.
- The HTTP server listens only on **`127.0.0.1:8080`** (not exposed to the LAN). Web pages in other browsers or on other machines cannot reach it directly over the network.
- **Browser security (CORS):** Cross-origin requests must come from allowed Graham Braille Editor origins (the official GitHub Pages site, **grahambrailleeditor.com**, local dev servers such as Vite on port 5173, and the bridge’s own debug page on port 8080). Other `Origin` values receive **403 Forbidden**. Same-origin and tools without an `Origin` header (such as `curl`) are still allowed for local troubleshooting.
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

## ⚖️ Legal Disclaimer

Any tools, software, drivers, or brands built by APH, ViewPlus, JJB Software, and Beneficent Technology are their respective intellectual property. I do not claim ownership of any of their products, software, or technology, and they are entirely theirs and not mine.
