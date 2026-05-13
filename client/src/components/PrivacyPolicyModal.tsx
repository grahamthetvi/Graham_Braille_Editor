import { useEffect, useRef } from 'react';

interface PrivacyPolicyModalProps {
  onClose: () => void;
}

/**
 * Privacy Policy Modal
 * Displays the TL;DR privacy policy for the application.
 */
export function PrivacyPolicyModal({ onClose }: PrivacyPolicyModalProps) {
  const primaryBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the "Close" button as soon as the modal opens.
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
    <div
      className="welcome-overlay"
      onClick={onClose}
      aria-label="Close privacy policy"
    >
      <div
        className="welcome-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="welcome-header">
          <h2 id="privacy-title">Privacy Policy (TL;DR)</h2>
          <button
            className="welcome-close"
            onClick={onClose}
            aria-label="Close privacy policy"
          >
            ✕
          </button>
        </header>

        <div className="welcome-body">
          <section className="welcome-section">
            <div>
              <p>
                At Graham Braille Editor, your privacy and data security are our top priorities. Because of the sensitive nature of the documents you may be translating, we've designed this app to process everything locally.
              </p>
              <br />
              <p>Here is the TL;DR of how we handle your data:</p>
              <ul style={{ listStyleType: 'none', paddingLeft: 0, marginTop: '1rem' }}>
                <li style={{ marginBottom: '1rem' }}><strong>100% Local Processing:</strong> All braille translation, text processing, and 3D STL generation happens directly inside your web browser. Your documents never leave your device.</li>
                <li style={{ marginBottom: '1rem' }}><strong>No Cloud Servers:</strong> We do not upload your text, braille files, or any personal information to any cloud servers.</li>
                <li style={{ marginBottom: '1rem' }}><strong>Local Storage Only:</strong> Your drafts, application settings, and table preferences are saved securely within your browser's local storage.</li>
                <li style={{ marginBottom: '1rem' }}><strong>Offline Capable:</strong> Once the web page is loaded, the core translation features work completely offline.</li>
                <li style={{ marginBottom: '1rem' }}><strong>Embosser Bridge:</strong> If you use our local printing bridge application, your files are transmitted directly to your local embosser over your own computer/network, not over the internet.</li>
                <li style={{ marginBottom: '1rem' }}><strong>No Tracking:</strong> We do not use analytics, trackers, or advertising cookies. What you do in the editor is entirely your business.</li>
              </ul>

              <hr style={{ margin: '2rem 0', borderColor: 'var(--border-color)', opacity: 0.3 }} />

              <details style={{ cursor: 'pointer' }}>
                <summary className="toolbar-btn guide-btn" style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '1rem', listStyle: 'none' }}>Read Comprehensive Privacy Policy</summary>
                <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '4px', fontSize: '0.9rem', lineHeight: '1.5', cursor: 'text' }}>
                  <p><strong>Effective Date:</strong> May 2026</p>
                  <p style={{ marginTop: '1rem' }}>At Graham Braille Editor, we believe that your data is yours alone. Because our software is used to translate sensitive educational, personal, and professional documents, we have built our architecture around the principle of strict local-first processing. This Privacy Policy details exactly how your information is handled when you use our application.</p>
                  
                  <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>1. Information We Do Not Collect</h4>
                  <p>We do not collect, transmit, or store any personal information, documents, or usage data.</p>
                  <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
                    <li><strong>No Analytics:</strong> We do not use Google Analytics, tracking pixels, or any other telemetry to monitor your behavior.</li>
                    <li><strong>No Accounts:</strong> You are not required to create an account, provide an email address, or log in to use the editor.</li>
                    <li><strong>No Cloud Storage:</strong> We do not upload your text, translated braille, imported files, or exported STLs to any server.</li>
                  </ul>

                  <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>2. How Your Data is Processed (Client-Side Only)</h4>
                  <p>All core functionality of the Graham Braille Editor happens directly inside your web browser. When you type text, translate it to braille, or generate a 3D printable STL file, the computation is performed entirely by your device's processor using web technologies. Because the processing is local, your documents never leave your computer.</p>

                  <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>3. Local Storage</h4>
                  <p>To provide a seamless experience, we save certain data locally on your device using your browser's standard <code>localStorage</code> and <code>IndexedDB</code> capabilities. This includes:</p>
                  <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
                    <li><strong>Application Settings:</strong> Your selected braille tables, theme preferences (dark/light mode), and page layout configurations.</li>
                    <li><strong>Autosaved Drafts:</strong> The text you are currently working on is periodically saved locally so that you do not lose your work if you accidentally close the tab. You can clear this data at any time by clearing your browser's site data or by using the "Discard All" functionality within the editor's Drafts menu.</li>
                  </ul>

                  <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>4. Graham Bridge Application (Optional)</h4>
                  <p>If you choose to use the Graham Bridge desktop application to send print jobs to your local embosser, please note:</p>
                  <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
                    <li>The bridge runs a local server on your machine (binding only to <code>127.0.0.1</code>).</li>
                    <li>It facilitates communication exclusively between your web browser and your local printer.</li>
                    <li>The bridge application does not connect to the internet, does not "phone home," and does not transmit any of your documents outside of your local network.</li>
                  </ul>

                  <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>5. Third-Party Hosting</h4>
                  <p>The Graham Braille Editor is delivered to your browser via standard web hosting (such as GitHub Pages). When you visit the site to load the application, the hosting provider may collect standard server logs (such as your IP address and user agent) as part of their standard operational procedures. However, the Graham Braille Editor application itself injects no third-party tracking scripts.</p>

                  <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>6. Children's Privacy and Educational Use</h4>
                  <p>Because our application does not collect, store, or transmit personal data, it is inherently compliant with children's privacy regulations such as COPPA (Children's Online Privacy Protection Act) and FERPA (Family Educational Rights and Privacy Act). It is safe for use in classrooms and by students of all ages.</p>

                  <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>7. Changes to this Policy</h4>
                  <p>We may update this Privacy Policy from time to time. Any changes will be reflected in this document within the application. Because we do not collect your contact information, we cannot notify you of changes via email.</p>

                  <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>8. Contact Information</h4>
                  <p>If you have any questions or concerns about this Privacy Policy or how your data is handled, please contact us at: <a href="mailto:grahamthetvi@icloud.com">grahamthetvi@icloud.com</a></p>
                </div>
              </details>
            </div>
          </section>
        </div>

        <footer className="welcome-footer">
          <p className="welcome-footer-meta">
            Your privacy is our priority.
          </p>
          <button
            ref={primaryBtnRef}
            className="welcome-btn-primary"
            onClick={onClose}
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
