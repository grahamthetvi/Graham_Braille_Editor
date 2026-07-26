import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
      aria-label={t('welcome.ariaLabel')}
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
          <h2 id="welcome-title">{isFirstVisit ? t('welcome.titleFirstVisit') : t('welcome.titleReturning')}</h2>
          <button
            className="welcome-close"
            onClick={onClose}
            aria-label={t('welcome.ariaLabel')}
          >
            {t('welcome.closeIcon')}
          </button>
        </header>

        {/* ── Body — three feature sections ────────────────────────────── */}
        <div className="welcome-body">

          {/* 1. Page Layout */}
          <section className="welcome-section">
            <div>
              <h3>{t('welcome.sections.layout.heading')}</h3>
              <p>{t('welcome.sections.layout.body')}</p>
              <p>{t('welcome.sections.layout.viewPlusNote')}</p>
            </div>
          </section>

          {/* 2. Embossing & Printing */}
          <section className="welcome-section">
            <div className="welcome-bridge-content">
              <h3>{t('welcome.sections.embossing.heading')}</h3>
              <p>{t('welcome.sections.embossing.body')}</p>

              <div className="install-grid">
                <div className="install-card">
                  <h4>{t('welcome.sections.embossing.windows.heading')}</h4>
                  <ol>
                    {(t('welcome.sections.embossing.windows.steps', { returnObjects: true }) as string[]).map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ol>
                </div>
                <div className="install-card">
                  <h4>{t('welcome.sections.embossing.macos.heading')}</h4>
                  <ol>
                    {(t('welcome.sections.embossing.macos.steps', { returnObjects: true }) as string[]).map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ol>
                </div>
                <div className="install-card">
                  <h4>{t('welcome.sections.embossing.linux.heading')}</h4>
                  <ol>
                    {(t('welcome.sections.embossing.linux.steps', { returnObjects: true }) as string[]).map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ol>
                </div>
                <div className="install-card">
                  <h4>{t('welcome.sections.embossing.sharedPi.heading')}</h4>
                  <ol>
                    {(t('welcome.sections.embossing.sharedPi.steps', { returnObjects: true }) as string[]).map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ol>
                  <p style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
                    {t('welcome.sections.embossing.sharedPi.itNote')}
                  </p>
                </div>
              </div>

              <div className="welcome-footer-links">
                <a href="https://github.com/grahamthetvi/Graham_Braille_Editor/releases" target="_blank" rel="noopener noreferrer" className="welcome-btn-secondary">
                  {t('welcome.sections.embossing.downloadButton')}
                </a>
              </div>
            </div>
          </section>

          {/* 3. Math / LaTeX */}
          <section className="welcome-section">
            <div>
              <h3>{t('welcome.sections.math.heading')}</h3>
              <p>{t('welcome.sections.math.body')}</p>
              <p className="welcome-tip">
                {t('welcome.sections.math.tip')}
                <br /><br />
                <em>{t('welcome.sections.math.promptText')}</em>
              </p>
            </div>
          </section>

          {/* 4. Downloading & Autosave */}
          <section className="welcome-section">
            <div>
              <h3>{t('welcome.sections.downloading.heading')}</h3>
              <p>{t('welcome.sections.downloading.body')}</p>
              <p>{t('welcome.sections.downloading.autosave')}</p>
            </div>
          </section>

          {/* 5. Perkins Viewer */}
          <section className="welcome-section">
            <div>
              <h3>{t('welcome.sections.perkins.heading')}</h3>
              <p>{t('welcome.sections.perkins.body')}</p>
            </div>
          </section>

          {/* 6. Large-Print (Jumbo) Braille */}
          <section className="welcome-section">
            <div>
              <h3>{t('welcome.sections.largePrint.heading')}</h3>
              <p>{t('welcome.sections.largePrint.body')}</p>
            </div>
          </section>

          {/* 7. Music Braille */}
          <section className="welcome-section">
            <div>
              <h3>Music Braille</h3>
              <p>
                Graham does not yet convert sheet music into Music Braille automatically.
                For Music Braille, open <strong>Music Braille</strong> under{' '}
                <strong>Teaching Tools</strong> or <strong>Music Braille Guide</strong> under{' '}
                <strong>Help &amp; Support</strong>. We recommend creating or exporting{' '}
                <strong>MusicXML</strong> in <strong>MuseScore</strong>, converting it with{' '}
                <strong>Sao Mai Braille (SMB)</strong>, then optionally importing the{' '}
                <code>.brf</code> here to preview or emboss. You can also{' '}
                <strong>Add to translation page</strong> so the instructions themselves can be
                embossed as braille.
              </p>
            </div>
          </section>

          {/* 8. Tactile Graphics & 3D Printing */}
          <section className="welcome-section">
            <div>
              <h3>{t('welcome.sections.graphics.heading')}</h3>
              <p>{t('welcome.sections.graphics.body')}</p>
              <p style={{ marginTop: '0.5rem', marginBottom: '0.2rem', fontWeight: 'bold' }}>
                {t('welcome.sections.graphics.shapesHeading')}
              </p>
              <ul style={{ paddingLeft: '1.2rem', margin: '0.4rem 0', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <li>{t('welcome.sections.graphics.simpleShapes')}</li>
                <li>{t('welcome.sections.graphics.complexShapes')}</li>
                <li>{t('welcome.sections.graphics.positioningTool')}</li>
                <li>{t('welcome.sections.graphics.customElements')}</li>
                <li>{t('welcome.sections.graphics.dotPatternPreview')}</li>
              </ul>
              <p style={{ marginTop: '0.5rem' }}>
                {t('welcome.sections.graphics.stlNote')}
              </p>
            </div>
          </section>

        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <footer className="welcome-footer">
          <p className="welcome-footer-meta">
            {t('welcome.footer.license')}
            <br />
            {t('welcome.footer.credit')}
          </p>
          <button
            ref={primaryBtnRef}
            className="welcome-btn-primary"
            onClick={onClose}
          >
            {isFirstVisit ? t('welcome.buttons.getStarted') : t('welcome.buttons.closeGuide')}
          </button>
        </footer>
      </div>
    </div>
  );
}
