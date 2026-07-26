import { useTranslation } from 'react-i18next';

type ExportPanelProps = {
  onDownloadBrf: () => void;
  onDownloadPrintLayout: () => void;
  onOpenAudio: () => void;
  canDownloadBrf: boolean;
  canDownloadPrintLayout: boolean;
  canExportAudio: boolean;
  mp3Exporting: boolean;
  mp3ExportStatus: string | null;
  disabled?: boolean;
};

/**
 * Compact export bar under the File toolbar — BRF, print layout, and audio.
 * Audio opens a dedicated dialog for engine choice.
 */
export function ExportPanel({
  onDownloadBrf,
  onDownloadPrintLayout,
  onOpenAudio,
  canDownloadBrf,
  canDownloadPrintLayout,
  canExportAudio,
  mp3Exporting,
  mp3ExportStatus,
  disabled = false,
}: ExportPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="export-panel" role="region" aria-label={t('exportPanel.regionAriaLabel')}>
      <div className="export-panel-intro">
        <span className="export-panel-heading">{t('exportPanel.heading')}</span>
        <span className="export-panel-sub">{t('exportPanel.subheading')}</span>
      </div>

      <div className="export-panel-actions">
        <button
          type="button"
          className="toolbar-btn toolbar-btn--primary export-action-btn"
          onClick={onDownloadBrf}
          disabled={disabled || !canDownloadBrf}
          title={t('app.file.downloadBrf.title')}
          aria-label={t('app.file.downloadBrf.ariaLabel')}
        >
          <span className="export-action-label">{t('exportPanel.actions.brf')}</span>
          <span className="export-action-hint">{t('exportPanel.actions.brfHint')}</span>
        </button>

        <button
          type="button"
          className="toolbar-btn export-action-btn"
          onClick={onDownloadPrintLayout}
          disabled={disabled || !canDownloadPrintLayout}
          title={t('app.file.downloadPrintLayout.title')}
          aria-label={t('app.file.downloadPrintLayout.ariaLabel')}
        >
          <span className="export-action-label">{t('exportPanel.actions.printLayout')}</span>
          <span className="export-action-hint">{t('exportPanel.actions.printLayoutHint')}</span>
        </button>

        <button
          type="button"
          className={`toolbar-btn export-action-btn${mp3Exporting ? ' toolbar-btn--active' : ''}`}
          onClick={onOpenAudio}
          disabled={disabled || (!canExportAudio && !mp3Exporting)}
          title={t('app.file.downloadMp3.title')}
          aria-label={t('app.file.downloadMp3.ariaLabel')}
          aria-busy={mp3Exporting}
        >
          <span className="export-action-label">
            {mp3Exporting
              ? (mp3ExportStatus || t('app.file.downloadMp3.exportingLabel'))
              : t('exportPanel.actions.audio')}
          </span>
          <span className="export-action-hint">{t('exportPanel.actions.audioHint')}</span>
        </button>
      </div>
    </div>
  );
}
