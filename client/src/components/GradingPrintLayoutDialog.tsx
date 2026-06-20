import { useEffect, useId, useRef } from 'react';

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
      aria-label="Close grading print layout options"
    >
      <div
        className="stl-export-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={e => e.stopPropagation()}
      >
        <header className="stl-export-header">
          <h2 id={titleId}>Grading Print Layout</h2>
          <button type="button" className="stl-export-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="stl-export-body">
          <p className="stl-export-hint">
            Download print layout (.rtf) matching the braille wrapping with grading metrics prepended.
          </p>

          <label className="stl-export-radio settings-field" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={gradingSheetOnAllPages}
              onChange={e => onGradingSheetOnAllPagesChange(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>On all pages</span>
          </label>
          <p className="stl-export-hint" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
            When enabled, the grading header is repeated at the top of every page. Otherwise it appears only on the first page.
          </p>

          <div className="stl-export-actions">
            <button type="button" className="toolbar-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              ref={downloadBtnRef}
              type="button"
              className="toolbar-btn toolbar-btn--primary"
              disabled={disabled}
              onClick={handleDownload}
            >
              Download
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
