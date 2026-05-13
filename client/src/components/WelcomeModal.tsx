import { useEffect, useRef } from 'react';

interface WelcomeModalProps {
  onClose: () => void;
  isFirstVisit?: boolean;
}

/**
 * First-visit onboarding modal and user guide.
 * Shown once initially, and accessible later via the Help button.
 * Covers: page layout, Bridge app, Math/LaTeX, downloading, perkins, and graphing.
 */
export function WelcomeModal({ onClose, isFirstVisit = true }: WelcomeModalProps) {
  const primaryBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the "Get Started" button as soon as the modal opens.
  useEffect(() => {
    primaryBtnRef.current?.focus();
  }, []);

  // ESC key dismisses the modal.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    /* Clicking the backdrop also closes the modal */
    <div
      className="welcome-overlay"
      onClick={onClose}
      aria-label="Close welcome guide"
    >
      <div
        className="welcome-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        /* Stop clicks inside the card from bubbling to the backdrop */
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ───────────────────────────────────────────────────── */}
        <header className="welcome-header">
          <h2 id="welcome-title">{isFirstVisit ? 'Welcome to Graham Braille Editor' : 'User Guide'}</h2>
          <button
            className="welcome-close"
            onClick={onClose}
            aria-label="Close welcome guide"
          >
            ✕
          </button>
        </header>

        {/* ── Body — three feature sections ────────────────────────────── */}
        <div className="welcome-body">

          {/* 1. Page Layout */}
          <section className="welcome-section">
            <div className="welcome-section-icon" aria-hidden="true">⚙</div>
            <div>
              <h3>Page Layout — Presets, Cells &amp; Lines</h3>
              <p>
                Click <strong>⚙ Layout Settings</strong> under the <strong>View &amp; Layout</strong> tab to open page
                settings. Use quick presets: <strong>8.5×11in</strong> (US Letter,{' '}
                <strong>32 × 25</strong> cells) or <strong>11×11.5in</strong> (wide
                tractor paper, <strong>40 × 25</strong>), or choose <strong>Custom</strong>{' '}
                and set <strong>Cells / row</strong> (10–100) and{' '}
                <strong>Lines / page</strong> (5–50) yourself—for example{' '}
                <strong>28</strong> lines for A4-style pages. These values drive the
                on-screen preview, the downloaded <code>.brf</code>, and are saved for
                your next visit.
              </p>
              <p>
                <strong>ViewPlus embossers:</strong> Under Layout Settings you can tune{' '}
                <strong>left padding</strong> (extra blank cells per line) for US Letter.
                Padding is applied when printing only if your layout is US Letter
                (8.5×11 preset or 32 × 25). Single-sheet alignment varies by model; if you
                dial in a value that works for your paper and want to share it, email{' '}
                <a href="mailto:grahamthetvi@icloud.com">grahamthetvi@icloud.com</a>.
                When you use <strong>🖨 Print</strong> with a ViewPlus driver, a short
                reminder appears there too.
              </p>
            </div>
          </section>

          {/* 2. Embossing & Printing */}
          <section className="welcome-section">
            <div className="welcome-section-icon" aria-hidden="true">🖨</div>
            <div className="welcome-bridge-content">
              <h3>Seamless Embossing (WebUSB &amp; Bridge)</h3>
              <p>
                The app includes <strong>embosser drivers</strong> for Enabling Technologies, Index, ViewPlus, Braillo, and others—pick the model that matches your device when you print.
                <strong> ChromeOS</strong> users can use WebUSB to send braille directly from the browser.
                <strong> Windows/macOS/Linux</strong> users run the small <strong>Graham Bridge</strong> app so print jobs reach the embosser reliably. ViewPlus left-margin tuning stays under <strong>⚙ Layout Settings</strong> (see above).
                The bridge listens only on <strong>127.0.0.1:8080</strong> and accepts browser traffic from official Graham Braille Editor sites (and local dev), so random websites cannot send print jobs to it.
              </p>

              <div className="install-grid">
                <div className="install-card">
                  <h4>🪟 Windows Bridge</h4>
                  <ol>
                    <li>Download &amp; extract the zip</li>
                    <li>Move <code>.exe</code> to a safe folder</li>
                    <li>Add to <strong>Startup</strong> folder</li>
                  </ol>
                </div>
                <div className="install-card">
                  <h4>🍎 macOS Bridge</h4>
                  <ol>
                    <li>Drag <code>.app</code> to Applications</li>
                    <li>Right-click &rarr; <strong>Open</strong> first time</li>
                    <li>Add to <strong>Login Items</strong></li>
                  </ol>
                </div>
                <div className="install-card">
                  <h4>🐧 Linux Bridge</h4>
                  <ol>
                    <li>
                      <strong>ZIP:</strong> move <code>graham-bridge-linux-amd64</code> to{' '}
                      <code>/usr/local/bin/graham-bridge</code>, install the <code>.desktop</code>{' '}
                      file, launch from the app menu
                    </li>
                    <li>
                      <strong>Fedora / RPM:</strong> from Releases, download{' '}
                      <code>{'graham-bridge-<version>-linux-fedora.x86_64.rpm'}</code>, then{' '}
                      <code>sudo dnf install ./that-file.rpm</code>
                    </li>
                  </ol>
                </div>
              </div>

              <div className="welcome-footer-links">
                <a href="https://github.com/grahamthetvi/Graham_Braille_Editor/releases" target="_blank" rel="noopener noreferrer" className="welcome-btn-secondary">
                  📥 Download Desktop Bridge
                </a>
              </div>
            </div>
          </section>

          {/* 3. Math / LaTeX */}
          <section className="welcome-section">
            <div className="welcome-section-icon" aria-hidden="true">∑</div>
            <div>
              <h3>Math Translation — LaTeX to Braille</h3>
              <p>
                The editor auto-detects <strong>LaTeX math</strong> in your text and
                translates it to braille math notation. Wrap display (block) equations
                in <code>{'$$'}…{'$$'}</code> (translated to <strong>Nemeth</strong>) and inline expressions in{' '}
                <code>{`\\(`}…{`\\)`}</code> (translated to <strong>UEB Math</strong>).
              </p>
              <p className="welcome-tip">
                <strong>Tip:</strong> For best results, paste your document into an AI
                assistant (ChatGPT, Claude, Gemini, etc.) with the following request
                before pasting it here:
                <br /><br />
                <em>
                  "Please reformat my text so that every mathematical expression,
                  equation, and arithmetic operation — including plain numbers used in a
                  math context — is wrapped in LaTeX notation: <code>{`\\(`}…{`\\)`}</code>{' '}
                  for inline math and <code>{'$$'}…{'$$'}</code> for display equations.
                  Leave all non-math prose unchanged."
                </em>
              </p>
            </div>
          </section>

          {/* 4. Downloading & Autosave */}
          <section className="welcome-section">
            <div className="welcome-section-icon" aria-hidden="true">💾</div>
            <div>
              <h3>Downloading &amp; Autosave</h3>
              <p>
                When your translation is ready, click <strong>Download BRF</strong> under the <strong>File</strong> tab to output standard <code>.brf</code> files formatted directly to your selected page layout settings. If you need a perfectly matched plain text layout to share visually, click <strong>Download print layout</strong>. This guarantees your print document wraps identically to the braille version.
              </p>
              <p>
                Your work is automatically saved as you type. Click <strong>Drafts</strong> under the <strong>File</strong> tab to view and restore unsaved work from the last 30 days.
              </p>
            </div>
          </section>

          {/* 5. Perkins Viewer */}
          <section className="welcome-section">
            <div className="welcome-section-icon" aria-hidden="true">🎹</div>
            <div>
              <h3>Perkins Viewer</h3>
              <p>
                Click <strong>🎹 Perkins Viewer</strong> under the <strong>View &amp; Layout</strong> tab to practice or demo 6-key Perkins entry directly in your browser. This mode overlays on the right panel, giving a dedicated interactive simulator for standard brailler practice without disrupting your primary document.
              </p>
            </div>
          </section>

          {/* 6. Tactile Graphics & 3D Printing */}
          <section className="welcome-section">
            <div className="welcome-section-icon" aria-hidden="true">📊</div>
            <div>
              <h3>Tactile Graphics &amp; 3D Printing</h3>
              <p>
                Click <strong>Graphics</strong> under the <strong>Tools</strong> tab to open the Tactile Graphics Editor, where you can create and export embossed graphics.
                Additionally, click <strong>Export STL</strong> under the <strong>File</strong> tab to export your paginated braille layout as a 3D-printable STL file with standard BANA midpoint dot spacing.
              </p>
            </div>
          </section>

        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <footer className="welcome-footer">
          <p className="welcome-footer-meta">
            Open source under the{' '}
            <a
              href="https://github.com/grahamthetvi/GrahamBrailleWriter/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
            >
              GNU General Public License v2
            </a>
            . Support:{' '}
            <a href="mailto:grahamthetvi@icloud.com">grahamthetvi@icloud.com</a>
            <br />
            Created by Addison Graham and built off of APH Braille Blaster.
          </p>
          <button
            ref={primaryBtnRef}
            className="welcome-btn-primary"
            onClick={onClose}
          >
            {isFirstVisit ? 'Get Started' : 'Close Guide'}
          </button>
        </footer>
      </div>
    </div>
  );
}
