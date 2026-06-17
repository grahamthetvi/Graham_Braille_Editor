import { useMemo, useState } from 'react';

interface JumboTextModalProps {
  onInsert: (block: string) => void;
  onClose: () => void;
}

const SIZE_PRESETS = [
  { label: 'Medium', size: 36 },
  { label: 'Large', size: 48 },
  { label: 'Extra Large', size: 72 },
  { label: 'Jumbo', size: 96 },
];

const MIN_SIZE = 16;
const MAX_SIZE = 200;

/**
 * Inserts a large-print ("jumbo") text block. The right-hand preview
 * renders this text as big braille — useful for low-vision readers or dual print/braille pages.
 */
export function JumboTextModal({ onInsert, onClose }: JumboTextModalProps) {
  const [text, setText] = useState('');
  const [size, setSize] = useState(48);

  const clampedSize = useMemo(
    () => Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(size) || MIN_SIZE)),
    [size],
  );

  const previewLines = text.length > 0 ? text.split('\n') : [];

  const handleInsert = () => {
    const trimmed = text.replace(/\s+$/, '');
    if (!trimmed) return;
    const block = `:::jumbo size=${clampedSize}\n${trimmed}\n:::\n`;
    onInsert(block);
  };

  return (
    <div className="welcome-overlay" onClick={onClose}>
      <div
        className="welcome-modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '760px', display: 'flex', flexDirection: 'column' }}
      >
        <header className="welcome-header">
          <h2>Insert Large-Print Braille</h2>
          <button className="welcome-close" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
          <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.8 }}>
            This text is translated and shown as large-print braille on the right-hand display — handy for low-vision readers or combined print/braille pages.
          </p>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <span style={{ fontWeight: 'bold' }}>Text</span>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={4}
              autoFocus
              placeholder="Type the words to show in large-print braille…"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 10px',
                fontFamily: 'inherit',
                fontSize: '1rem',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-color)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                resize: 'vertical',
              }}
            />
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 'bold' }}>Size</span>
            {SIZE_PRESETS.map(p => (
              <button
                key={p.size}
                className={`toolbar-btn${clampedSize === p.size ? ' toolbar-btn--active' : ''}`}
                onClick={() => setSize(p.size)}
                type="button"
              >
                {p.label}
              </button>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: 'auto' }}>
              <input
                type="range"
                min={MIN_SIZE}
                max={MAX_SIZE}
                value={clampedSize}
                onChange={e => setSize(Number(e.target.value))}
              />
              <input
                type="number"
                min={MIN_SIZE}
                max={MAX_SIZE}
                value={clampedSize}
                onChange={e => setSize(Number(e.target.value))}
                style={{ width: '64px' }}
                aria-label="Font size in pixels"
              />
              <span style={{ opacity: 0.7 }}>px</span>
            </label>
          </div>

          <div>
            <div style={{ fontWeight: 'bold', marginBottom: '0.4rem', fontSize: '0.9rem' }}>Preview</div>
            <div
              style={{
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                background: '#fff',
                color: '#000',
                padding: '1rem',
                maxHeight: '280px',
                overflow: 'auto',
              }}
            >
              {previewLines.length > 0 ? (
                previewLines.map((line, i) => (
                  <div
                    key={i}
                    style={{
                      fontFamily: "'Open Sans', system-ui, sans-serif",
                      fontWeight: 600,
                      lineHeight: 1.15,
                      fontSize: `${clampedSize}px`,
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {line.length > 0 ? line : '\u00a0'}
                  </div>
                ))
              ) : (
                <span style={{ color: '#888', fontStyle: 'italic' }}>Your large-print text will appear here.</span>
              )}
            </div>
          </div>
        </div>

        <footer className="welcome-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button className="welcome-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="welcome-btn-primary" onClick={handleInsert} disabled={!text.trim()}>
            Insert Large Print Braille
          </button>
        </footer>
      </div>
    </div>
  );
}
