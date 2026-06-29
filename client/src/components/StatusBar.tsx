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
}: StatusBarProps) {
  return (
    <div
      className="status-bar"
      role="status"
      aria-live="polite"
      aria-label="Application status"
    >
      {bridgeUpdateAvailable ? (
        <a
          href="https://github.com/grahamthetvi/Graham_Braille_Editor/releases/latest"
          target="_blank"
          rel="noopener noreferrer"
          className="bridge-indicator update-available"
          title="Security Update Available for Graham Bridge"
          aria-label="Bridge update available"
          style={{ backgroundColor: '#d03f00', color: '#fff', textDecoration: 'none' }}
        >
          Bridge Update Required
        </a>
      ) : (
        <span
          className={`bridge-indicator ${bridgeConnected ? 'connected' : 'disconnected'}`}
          title={useWebUSB ? 'WebUSB Embossing Available' : bridgeConnected ? 'Bridge running on localhost:8080' : 'Bridge not detected'}
          aria-label={useWebUSB ? 'WebUSB ready' : bridgeConnected ? 'Bridge connected' : 'Bridge offline'}
        >
          {useWebUSB ? '● WebUSB Ready' : bridgeConnected ? '● Bridge Connected' : '○ Bridge Offline'}
        </span>
      )}

      {charCount > 0 && (
        <>
          <span className="status-stat" title="Source word count">
            {wordCount.toLocaleString()} words
          </span>
          <span className="status-stat" title="Source character count">
            {charCount.toLocaleString()} chars
          </span>
        </>
      )}

      {brfLength > 0 && (
        <span className="status-stat" title="BRF output size">
          BRF: {brfLength.toLocaleString()} bytes
        </span>
      )}

      {isLoading && progress > 0 && progress < 100 && (
        <span className="status-progress" title="Translation progress">
          Translating… {progress}%
        </span>
      )}
    </div>
  );
}
