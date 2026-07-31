import { useTranslation } from 'react-i18next';

interface StatusBarProps {
  bridgeConnected: boolean;
  bridgeUpdateAvailable?: boolean;
  useWebUSB?: boolean;
  /** Length of the translated BRF string in bytes. */
  brfLength: number;
  /** Word count of the source text. */
  wordCount: number;
  /** Character count of the source text. */
  charCount: number;
  /** True while a translation job is running. */
  isLoading: boolean;
  /** Translation progress 0–100 (only meaningful when isLoading is true). */
  progress: number;
  /** Optional polite status announcement (e.g. Music Braille auto-load). */
  announcement?: string;
}

/**
 * Displays bridge connection status, document statistics, and translation
 * progress at the bottom of the screen.
 */
export function StatusBar({
  bridgeConnected,
  bridgeUpdateAvailable,
  useWebUSB,
  brfLength,
  wordCount,
  charCount,
  isLoading,
  progress,
  announcement,
}: StatusBarProps) {
  const { t } = useTranslation();

  return (
    <div
      className="status-bar"
      role="status"
      aria-live="polite"
      aria-label={t('statusBar.ariaLabel')}
    >
      {announcement ? (
        <span className="status-stat" title={announcement}>
          {announcement}
        </span>
      ) : null}
      {bridgeUpdateAvailable ? (
        <a
          href="https://github.com/grahamthetvi/Graham_Braille_Editor/releases/latest"
          target="_blank"
          rel="noopener noreferrer"
          className="bridge-indicator update-available"
          title={t('statusBar.bridgeUpdateRequired.title')}
          aria-label={t('statusBar.bridgeUpdateRequired.ariaLabel')}
          style={{ backgroundColor: '#d03f00', color: '#fff', textDecoration: 'none' }}
        >
          {t('statusBar.bridgeUpdateRequired.label')}
        </a>
      ) : (
        <span
          className={`bridge-indicator ${bridgeConnected ? 'connected' : 'disconnected'}`}
          title={useWebUSB ? t('statusBar.webUsbReady.title') : bridgeConnected ? t('statusBar.bridgeConnected.title') : t('statusBar.bridgeOffline.title')}
          aria-label={useWebUSB ? t('statusBar.webUsbReady.ariaLabel') : bridgeConnected ? t('statusBar.bridgeConnected.ariaLabel') : t('statusBar.bridgeOffline.ariaLabel')}
        >
          {useWebUSB ? t('statusBar.webUsbReady.label') : bridgeConnected ? t('statusBar.bridgeConnected.label') : t('statusBar.bridgeOffline.label')}
        </span>
      )}

      {charCount > 0 && (
        <>
          <span className="status-stat" title={t('statusBar.wordCount.title')}>
            {t('statusBar.wordCount.label', { count: wordCount.toLocaleString() })}
          </span>
          <span className="status-stat" title={t('statusBar.charCount.title')}>
            {t('statusBar.charCount.label', { count: charCount.toLocaleString() })}
          </span>
        </>
      )}

      {brfLength > 0 && (
        <span className="status-stat" title={t('statusBar.brfSize.title')}>
          {t('statusBar.brfSize.label', { bytes: brfLength.toLocaleString() })}
        </span>
      )}

      {isLoading && progress > 0 && progress < 100 && (
        <span className="status-progress" title={t('statusBar.translating.title')}>
          {t('statusBar.translating.label', { progress })}
        </span>
      )}
    </div>
  );
}
