import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export interface BackTranslatedEditModalProps {
  onEditPrint: () => void;
  onEditBraille: () => void;
  onClose: () => void;
}

/**
 * Shown when the user tries to edit a document that was back-translated from
 * imported/pasted braille. Lets them unlock print editing (regenerates braille)
 * or switch to editing the imported braille with 6-key input.
 */
export function BackTranslatedEditModal({
  onEditPrint,
  onEditBraille,
  onClose,
}: BackTranslatedEditModalProps) {
  const { t } = useTranslation();
  const primaryBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primaryBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="welcome-overlay" aria-label={t('backTranslatedEdit.ariaLabel')} onClick={onClose}>
      <div
        className="welcome-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="back-translated-edit-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '560px', width: '100%' }}
      >
        <header className="welcome-header">
          <h2 id="back-translated-edit-title">{t('backTranslatedEdit.title')}</h2>
          <button
            className="welcome-close"
            onClick={onClose}
            aria-label={t('backTranslatedEdit.closeAriaLabel')}
          >
            ✕
          </button>
        </header>

        <div className="welcome-body" style={{ padding: '1rem 2rem' }}>
          <p>{t('backTranslatedEdit.body')}</p>
          <p style={{ marginTop: '0.75rem' }}>{t('backTranslatedEdit.refreshableNote')}</p>
          <p style={{ marginTop: '0.75rem', fontSize: '0.9rem', opacity: 0.85 }}>
            {t('backTranslatedEdit.sixKeyHint')}
          </p>
        </div>

        <footer className="welcome-footer" style={{ gap: '0.75rem', padding: '1rem 2rem', flexWrap: 'wrap' }}>
          <button type="button" className="welcome-btn-secondary" onClick={onClose}>
            {t('backTranslatedEdit.cancel')}
          </button>
          <button type="button" className="welcome-btn-secondary" onClick={onEditBraille}>
            {t('backTranslatedEdit.editBraille')}
          </button>
          <button
            ref={primaryBtnRef}
            type="button"
            className="welcome-btn-primary"
            onClick={onEditPrint}
          >
            {t('backTranslatedEdit.editPrint')}
          </button>
        </footer>
      </div>
    </div>
  );
}
