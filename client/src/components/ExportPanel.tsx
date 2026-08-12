import { useTranslation } from 'react-i18next';

type ExportPanelProps = {
  onDownloadBrf: () => void;
  onEmailBrf: () => void;
  onDownloadPrintLayout: () => void;
  onOpenAudio: () => void;
  canDownloadBrf: boolean;
  canEmailBrf: boolean;
  canDownloadPrintLayout: boolean;
  canExportAudio: boolean;
  mp3Exporting: boolean;
  mp3ExportStatus: string | null;
  /** Shown when Gmail compose popup was blocked; includes fallback URL. */
  emailBrfFallbackUrl: string | null;
  onDismissEmailBrfFallback?: () => void;
  disabled?: boolean;
};

/**
 * Compact export bar under the File toolbar — BRF, email BRF, print layout, and audio.
 * Audio opens a dedicated dialog for engine choice.
 */
export function ExportPanel({
  onDownloadBrf,
  onEmailBrf,
  onDownloadPrintLayout,
  onOpenAudio,
  canDownloadBrf,
  canEmailBrf,
  canDownloadPrintLayout,
  canExportAudio,
  mp3Exporting,
  mp3ExportStatus,
  emailBrfFallbackUrl,
  onDismissEmailBrfFallback,
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
          onClick={onEmailBrf}
          disabled={disabled || !canEmailBrf}
          title={t('exportPanel.email.buttonTitle')}
          aria-label={t('exportPanel.email.buttonAriaLabel')}
        >
          <span className="export-action-label">{t('exportPanel.actions.emailBrf')}</span>
          <span className="export-action-hint">{t('exportPanel.actions.emailBrfHint')}</span>
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

      {emailBrfFallbackUrl && (
        <p className="export-panel-email-fallback" role="status">
          {t('exportPanel.email.popupBlocked')}{' '}
          <a href={emailBrfFallbackUrl} target="_blank" rel="noopener noreferrer">
            {t('exportPanel.email.openGmailLink')}
          </a>
          {onDismissEmailBrfFallback && (
            <>
              {' '}
              <button
                type="button"
                className="export-panel-email-fallback-dismiss"
                onClick={onDismissEmailBrfFallback}
              >
                {t('exportPanel.email.dismissFallback')}
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
