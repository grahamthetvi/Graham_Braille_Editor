import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { TTS_ENGINE_IDS, type TtsEngineId } from '../services/tts';

type AudioExportDialogProps = {
  open: boolean;
  onClose: () => void;
  engine: TtsEngineId;
  onEngineChange: (engine: TtsEngineId) => void;
  onExport: () => void;
  exporting: boolean;
  exportStatus: string | null;
  exportError: string | null;
  canExport: boolean;
};

/**
 * Modal for choosing a browser TTS engine and exporting MP3.
 * Engines differ mainly by first-download size and synthesis speed.
 */
export function AudioExportDialog({
  open,
  onClose,
  engine,
  onEngineChange,
  onExport,
  exporting,
  exportStatus,
  exportError,
  canExport,
}: AudioExportDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const descId = useId();
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !exporting) onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, exporting, onClose]);

  if (!open) return null;

  return (
    <div
      className="audio-export-overlay"
      role="presentation"
      onClick={() => {
        if (!exporting) onClose();
      }}
    >
      <div
        className="audio-export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={e => e.stopPropagation()}
      >
        <header className="audio-export-header">
          <div>
            <h2 id={titleId}>{t('exportPanel.audio.title')}</h2>
            <p id={descId} className="audio-export-lead">
              {t('exportPanel.audio.lead')}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="audio-export-close"
            onClick={onClose}
            disabled={exporting}
            aria-label={t('exportPanel.audio.closeAriaLabel')}
          >
            ✕
          </button>
        </header>

        <fieldset className="audio-export-engines" disabled={exporting}>
          <legend className="visually-hidden">{t('exportPanel.audio.engineLegend')}</legend>
          {TTS_ENGINE_IDS.map(id => {
            const selected = engine === id;
            return (
              <label
                key={id}
                className={`audio-engine-card${selected ? ' audio-engine-card--selected' : ''}`}
              >
                <input
                  type="radio"
                  name="tts-engine"
                  value={id}
                  checked={selected}
                  onChange={() => onEngineChange(id)}
                />
                <span className="audio-engine-card-body">
                  <span className="audio-engine-card-top">
                    <span className="audio-engine-name">{t(`tts.${id}.label`)}</span>
                    <span className="audio-engine-size">{t(`tts.${id}.size`)}</span>
                  </span>
                  <span className="audio-engine-speed">{t(`tts.${id}.speed`)}</span>
                  <span className="audio-engine-desc">{t(`tts.${id}.description`)}</span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <p className="audio-export-note">{t('exportPanel.audio.note')}</p>

        {exportError && (
          <p className="audio-export-error" role="alert">
            {t('app.file.downloadMp3.errorPrefix', { error: exportError })}
          </p>
        )}

        <div className="audio-export-actions">
          <button type="button" className="toolbar-btn" onClick={onClose} disabled={exporting}>
            {t('exportPanel.audio.cancel')}
          </button>
          <button
            type="button"
            className="toolbar-btn toolbar-btn--primary"
            onClick={onExport}
            disabled={!canExport || exporting}
            aria-busy={exporting}
          >
            {exporting
              ? (exportStatus || t('app.file.downloadMp3.exportingLabel'))
              : t('exportPanel.audio.exportButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
