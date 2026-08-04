import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface WelcomeModalProps {
  onClose: () => void;
  isFirstVisit?: boolean;
}

const SLIDE_COUNT = 8;

/**
 * First-visit onboarding modal and user guide as a step slideshow.
 * Shown once initially, and accessible later via the Help button.
 */
export function WelcomeModal({ onClose, isFirstVisit = true }: WelcomeModalProps) {
  const { t } = useTranslation();
  const [slideIndex, setSlideIndex] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);
  const primaryBtnRef = useRef<HTMLButtonElement>(null);
  const isLastSlide = slideIndex === SLIDE_COUNT - 1;
  const isFirstSlide = slideIndex === 0;

  useEffect(() => {
    headingRef.current?.focus();
  }, [slideIndex]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSlideIndex((i) => Math.min(SLIDE_COUNT - 1, i + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSlideIndex((i) => Math.max(0, i - 1));
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function goPrev() {
    setSlideIndex((i) => Math.max(0, i - 1));
  }

  function goNext() {
    setSlideIndex((i) => Math.min(SLIDE_COUNT - 1, i + 1));
  }

  return (
    <div
      className="welcome-overlay"
      onClick={onClose}
      aria-label={t('welcome.ariaLabel')}
    >
      <div
        className="welcome-modal welcome-modal--slideshow"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="welcome-header">
          <h2 id="welcome-title">
            {isFirstVisit ? t('welcome.titleFirstVisit') : t('welcome.titleReturning')}
          </h2>
          <button
            className="welcome-close"
            onClick={onClose}
            aria-label={t('welcome.ariaLabel')}
          >
            {t('welcome.closeIcon')}
          </button>
        </header>

        <div className="welcome-body welcome-body--slideshow" aria-live="polite">
          {slideIndex === 0 && (
            <section className="welcome-section welcome-slide">
              <div>
                <h3 ref={headingRef} tabIndex={-1}>
                  {t('welcome.sections.layout.heading')}
                </h3>
                <p>{t('welcome.sections.layout.body')}</p>
                <p>{t('welcome.sections.layout.viewPlusNote')}</p>
              </div>
            </section>
          )}

          {slideIndex === 1 && (
            <section className="welcome-section welcome-slide">
              <div className="welcome-bridge-content">
                <h3 ref={headingRef} tabIndex={-1}>
                  {t('welcome.sections.embossing.heading')}
                </h3>
                <p>{t('welcome.sections.embossing.body')}</p>

                <div className="install-grid">
                  <div className="install-card">
                    <h4>{t('welcome.sections.embossing.windows.heading')}</h4>
                    <ol>
                      {(t('welcome.sections.embossing.windows.steps', { returnObjects: true }) as string[]).map(
                        (step, idx) => (
                          <li key={idx}>{step}</li>
                        ),
                      )}
                    </ol>
                  </div>
                  <div className="install-card">
                    <h4>{t('welcome.sections.embossing.macos.heading')}</h4>
                    <ol>
                      {(t('welcome.sections.embossing.macos.steps', { returnObjects: true }) as string[]).map(
                        (step, idx) => (
                          <li key={idx}>{step}</li>
                        ),
                      )}
                    </ol>
                  </div>
                  <div className="install-card">
                    <h4>{t('welcome.sections.embossing.linux.heading')}</h4>
                    <ol>
                      {(t('welcome.sections.embossing.linux.steps', { returnObjects: true }) as string[]).map(
                        (step, idx) => (
                          <li key={idx}>{step}</li>
                        ),
                      )}
                    </ol>
                  </div>
                  <div className="install-card">
                    <h4>{t('welcome.sections.embossing.sharedPi.heading')}</h4>
                    <ol>
                      {(t('welcome.sections.embossing.sharedPi.steps', { returnObjects: true }) as string[]).map(
                        (step, idx) => (
                          <li key={idx}>{step}</li>
                        ),
                      )}
                    </ol>
                    <p style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
                      {t('welcome.sections.embossing.sharedPi.itNote')}
                    </p>
                  </div>
                </div>

                <div className="welcome-footer-links">
                  <a
                    href="https://github.com/grahamthetvi/Graham_Braille_Editor/releases"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="welcome-btn-secondary"
                  >
                    {t('welcome.sections.embossing.downloadButton')}
                  </a>
                </div>
              </div>
            </section>
          )}

          {slideIndex === 2 && (
            <section className="welcome-section welcome-slide">
              <div>
                <h3 ref={headingRef} tabIndex={-1}>
                  {t('welcome.sections.math.heading')}
                </h3>
                <p>{t('welcome.sections.math.body')}</p>
                <p className="welcome-tip">
                  {t('welcome.sections.math.tip')}
                  <br />
                  <br />
                  <em>{t('welcome.sections.math.promptText')}</em>
                </p>
              </div>
            </section>
          )}

          {slideIndex === 3 && (
            <section className="welcome-section welcome-slide">
              <div>
                <h3 ref={headingRef} tabIndex={-1}>
                  {t('welcome.sections.downloading.heading')}
                </h3>
                <p>{t('welcome.sections.downloading.body')}</p>
                <p>{t('welcome.sections.downloading.autosave')}</p>
              </div>
            </section>
          )}

          {slideIndex === 4 && (
            <section className="welcome-section welcome-slide">
              <div>
                <h3 ref={headingRef} tabIndex={-1}>
                  {t('welcome.sections.perkins.heading')}
                </h3>
                <p>{t('welcome.sections.perkins.body')}</p>
              </div>
            </section>
          )}

          {slideIndex === 5 && (
            <section className="welcome-section welcome-slide">
              <div>
                <h3 ref={headingRef} tabIndex={-1}>
                  {t('welcome.sections.largePrint.heading')}
                </h3>
                <p>{t('welcome.sections.largePrint.body')}</p>
              </div>
            </section>
          )}

          {slideIndex === 6 && (
            <section className="welcome-section welcome-slide">
              <div>
                <h3 ref={headingRef} tabIndex={-1}>
                  {t('welcome.sections.music.heading')}
                </h3>
                <p>{t('welcome.sections.music.body')}</p>
              </div>
            </section>
          )}

          {slideIndex === 7 && (
            <section className="welcome-section welcome-slide">
              <div>
                <h3 ref={headingRef} tabIndex={-1}>
                  {t('welcome.sections.graphics.heading')}
                </h3>
                <p>{t('welcome.sections.graphics.body')}</p>
                <p style={{ marginTop: '0.5rem', marginBottom: '0.2rem', fontWeight: 'bold' }}>
                  {t('welcome.sections.graphics.shapesHeading')}
                </p>
                <ul
                  style={{
                    paddingLeft: '1.2rem',
                    margin: '0.4rem 0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.2rem',
                  }}
                >
                  <li>{t('welcome.sections.graphics.simpleShapes')}</li>
                  <li>{t('welcome.sections.graphics.complexShapes')}</li>
                  <li>{t('welcome.sections.graphics.positioningTool')}</li>
                  <li>{t('welcome.sections.graphics.customElements')}</li>
                  <li>{t('welcome.sections.graphics.dotPatternPreview')}</li>
                </ul>
                <p style={{ marginTop: '0.5rem' }}>{t('welcome.sections.graphics.stlNote')}</p>
              </div>
            </section>
          )}
        </div>

        <footer className="welcome-footer welcome-footer--slideshow">
          <p className="welcome-footer-meta">
            {t('welcome.footer.license')}
            <br />
            {t('welcome.footer.credit')}
          </p>

          <div className="welcome-slide-nav">
            <button
              type="button"
              className="welcome-btn-nav"
              onClick={goPrev}
              disabled={isFirstSlide}
              aria-label={t('welcome.buttons.previous')}
            >
              {t('welcome.buttons.previous')}
            </button>

            <div className="welcome-step-dots" role="tablist" aria-label={t('welcome.stepIndicator', { current: slideIndex + 1, total: SLIDE_COUNT })}>
              {Array.from({ length: SLIDE_COUNT }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  className={`welcome-step-dot${i === slideIndex ? ' welcome-step-dot--active' : ''}`}
                  aria-selected={i === slideIndex}
                  aria-label={t('welcome.goToSlide', { n: i + 1 })}
                  onClick={() => setSlideIndex(i)}
                />
              ))}
            </div>

            <span className="welcome-step-count" aria-hidden="true">
              {slideIndex + 1} / {SLIDE_COUNT}
            </span>

            {!isLastSlide ? (
              <button
                ref={nextBtnRef}
                type="button"
                className="welcome-btn-primary"
                onClick={goNext}
              >
                {t('welcome.buttons.next')}
              </button>
            ) : (
              <button
                ref={primaryBtnRef}
                type="button"
                className="welcome-btn-primary"
                onClick={onClose}
              >
                {isFirstVisit ? t('welcome.buttons.getStarted') : t('welcome.buttons.closeGuide')}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
