import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';

type GradingPrintLayoutDialogProps = {
  onClose: () => void;
  onDownload: () => void;
  gradingSheetOnAllPages: boolean;
  onGradingSheetOnAllPagesChange: (value: boolean) => void;
  disabled?: boolean;
};

export function GradingPrintLayoutDialog({
  onClose,
  onDownload,
  gradingSheetOnAllPages,
  onGradingSheetOnAllPagesChange,
  disabled,
}: GradingPrintLayoutDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const downloadBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    downloadBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function handleDownload() {
    onDownload();
    onClose();
  }

  return (
    <div
      className="stl-export-overlay"
      onClick={onClose}
      aria-label={t('gradingPrint.closeAriaLabel')}
    >
      <div
        className="stl-export-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={e => e.stopPropagation()}
      >
        <header className="stl-export-header">
          <h2 id={titleId}>{t('gradingPrint.title')}</h2>
          <button type="button" className="stl-export-close" onClick={onClose} aria-label={t('gradingPrint.close')}>
            ✕
          </button>
        </header>

        <div className="stl-export-body">
          <p className="stl-export-hint">
            {t('gradingPrint.description')}
          </p>

          <label className="stl-export-radio settings-field" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={gradingSheetOnAllPages}
              onChange={e => onGradingSheetOnAllPagesChange(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>{t('gradingPrint.onAllPages.label')}</span>
          </label>
          <p className="stl-export-hint" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
            {t('gradingPrint.onAllPages.hint')}
          </p>

          <div className="stl-export-actions">
            <button type="button" className="toolbar-btn" onClick={onClose}>
              {t('gradingPrint.cancel')}
            </button>
            <button
              ref={downloadBtnRef}
              type="button"
              className="toolbar-btn toolbar-btn--primary"
              disabled={disabled}
              onClick={handleDownload}
            >
              {t('gradingPrint.download')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
