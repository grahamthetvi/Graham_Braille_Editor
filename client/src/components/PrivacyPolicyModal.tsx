import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface PrivacyPolicyModalProps {
  onClose: () => void;
}

/**
 * Privacy Policy Modal
 * Displays the TL;DR privacy policy for the application.
 */
export function PrivacyPolicyModal({ onClose }: PrivacyPolicyModalProps) {
  const { t } = useTranslation();
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
      aria-label={t('privacy.ariaLabel')}
    >
      <div
        className="welcome-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="welcome-header">
          <h2 id="privacy-title">{t('privacy.title')}</h2>
          <button
            className="welcome-close"
            onClick={onClose}
            aria-label={t('privacy.ariaLabel')}
          >
            {t('privacy.closeIcon')}
          </button>
        </header>

        <div className="welcome-body">
          <section className="welcome-section">
            <div>
              <p>
                {t('privacy.intro')}
              </p>
              <br />
              <p>{t('privacy.tldrLead')}</p>
              <ul style={{ listStyleType: 'none', paddingLeft: 0, marginTop: '1rem' }}>
                <li style={{ marginBottom: '1rem' }}>{t('privacy.tldr.localProcessing')}</li>
                <li style={{ marginBottom: '1rem' }}>{t('privacy.tldr.noCloudServers')}</li>
                <li style={{ marginBottom: '1rem' }}>{t('privacy.tldr.localStorageOnly')}</li>
                <li style={{ marginBottom: '1rem' }}>{t('privacy.tldr.offlineCapable')}</li>
                <li style={{ marginBottom: '1rem' }}>{t('privacy.tldr.embosserBridge')}</li>
                <li style={{ marginBottom: '1rem' }}>{t('privacy.tldr.emailBrf')}</li>
                <li style={{ marginBottom: '1rem' }}>{t('privacy.tldr.noTracking')}</li>
              </ul>

              <hr style={{ margin: '2rem 0', borderColor: 'var(--border-color)', opacity: 0.3 }} />

              <details style={{ cursor: 'pointer' }}>
                <summary className="toolbar-btn guide-btn" style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '1rem', listStyle: 'none' }}>{t('privacy.readFullPolicy')}</summary>
                <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '4px', fontSize: '0.9rem', lineHeight: '1.5', cursor: 'text' }}>
                  <p><strong>{t('privacy.effectiveDate')}</strong></p>
                  <p style={{ marginTop: '1rem' }}>{t('privacy.fullPolicy.intro')}</p>

                  <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>{t('privacy.fullPolicy.section1.heading')}</h4>
                  <p>{t('privacy.fullPolicy.section1.lead')}</p>
                  <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
                    <li>{t('privacy.fullPolicy.section1.noAnalytics')}</li>
                    <li>{t('privacy.fullPolicy.section1.noAccounts')}</li>
                    <li>{t('privacy.fullPolicy.section1.noCloudStorage')}</li>
                    <li>{t('privacy.fullPolicy.section1.emailBrf')}</li>
                  </ul>

                  <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>{t('privacy.fullPolicy.section2.heading')}</h4>
                  <p>{t('privacy.fullPolicy.section2.body')}</p>

                  <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>{t('privacy.fullPolicy.section3.heading')}</h4>
                  <p>{t('privacy.fullPolicy.section3.lead')}</p>
                  <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
                    <li>{t('privacy.fullPolicy.section3.appSettings')}</li>
                    <li>{t('privacy.fullPolicy.section3.autosavedDrafts')}</li>
                  </ul>

                  <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>{t('privacy.fullPolicy.section4.heading')}</h4>
                  <p>{t('privacy.fullPolicy.section4.lead')}</p>
                  <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
                    <li>{t('privacy.fullPolicy.section4.localServer')}</li>
                    <li>{t('privacy.fullPolicy.section4.facilitates')}</li>
                    <li>{t('privacy.fullPolicy.section4.noInternet')}</li>
                    <li>{t('privacy.fullPolicy.section4.shareMode')}</li>
                  </ul>

                  <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>{t('privacy.fullPolicy.section5.heading')}</h4>
                  <p>{t('privacy.fullPolicy.section5.body')}</p>

                  <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>{t('privacy.fullPolicy.section6.heading')}</h4>
                  <p>{t('privacy.fullPolicy.section6.body')}</p>

                  <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>{t('privacy.fullPolicy.section7.heading')}</h4>
                  <p>{t('privacy.fullPolicy.section7.body')}</p>

                  <h4 style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>{t('privacy.fullPolicy.section8.heading')}</h4>
                  <p>{t('privacy.fullPolicy.section8.body')}</p>
                </div>
              </details>
            </div>
          </section>
        </div>

        <footer className="welcome-footer">
          <p className="welcome-footer-meta">
            {t('privacy.closingLine')}
          </p>
          <button
            ref={primaryBtnRef}
            className="welcome-btn-primary"
            onClick={onClose}
          >
            {t('privacy.closeButton')}
          </button>
        </footer>
      </div>
    </div>
  );
}
