interface StatusBarProps {
  bridgeConnected: boolean;
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
      <span
        className={`bridge-indicator ${bridgeConnected ? 'connected' : 'disconnected'}`}
        title={bridgeConnected ? 'Bridge running on localhost:8080' : 'Bridge not detected'}
        aria-label={bridgeConnected ? 'Bridge connected' : 'Bridge offline'}
      >
        {bridgeConnected ? '● Bridge Connected' : '○ Bridge Offline'}
      </span>

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
