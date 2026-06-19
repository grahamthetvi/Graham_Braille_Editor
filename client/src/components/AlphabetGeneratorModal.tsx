import { useState, useMemo, useEffect, useRef } from 'react';

interface AlphabetGeneratorModalProps {
  onInsert: (text: string) => void;
  onClose: () => void;
}

type WordListType = 'cvc' | 'standard' | 'animals';
type CasingType = 'lowercase' | 'uppercase' | 'titlecase' | 'both' | 'bothSpaced';
type SeparatorType = 'hyphen' | 'colon' | 'equals' | 'arrow' | 'spaces';
type PaginationType = 'none' | '1' | '5' | '10';

const CVC_WORDS: Record<string, string> = {
  A: 'ant', B: 'bat', C: 'cat', D: 'dog', E: 'egg', F: 'fan', G: 'gum', H: 'hat',
  I: 'ink', J: 'jam', K: 'kid', L: 'log', M: 'man', N: 'net', O: 'owl', P: 'pig',
  Q: 'quiz', R: 'rat', S: 'sun', T: 'toy', U: 'up', V: 'van', W: 'wet', X: 'box',
  Y: 'yak', Z: 'zip'
};

const STANDARD_WORDS: Record<string, string> = {
  A: 'apple', B: 'ball', C: 'cup', D: 'door', E: 'elbow', F: 'fish', G: 'girl', H: 'hand',
  I: 'igloo', J: 'jam', K: 'kite', L: 'leaf', M: 'milk', N: 'nest', O: 'owl', P: 'pig',
  Q: 'queen', R: 'ring', S: 'sun', T: 'tree', U: 'umbrella', V: 'van', W: 'water', X: 'x-ray',
  Y: 'yarn', Z: 'zebra'
};

const ANIMAL_WORDS: Record<string, string> = {
  A: 'alligator', B: 'bear', C: 'cat', D: 'dog', E: 'elephant', F: 'fox', G: 'goat', H: 'horse',
  I: 'iguana', J: 'jellyfish', K: 'kangaroo', L: 'lion', M: 'monkey', N: 'newt', O: 'owl', P: 'pig',
  Q: 'quail', R: 'rabbit', S: 'snake', T: 'tiger', U: 'unicorn', V: 'vulture', W: 'whale', X: 'x-ray fish',
  Y: 'yak', Z: 'zebra'
};

const SEPARATORS: Record<SeparatorType, string> = {
  hyphen: ' - ',
  colon: ': ',
  equals: ' = ',
  arrow: ' → ',
  spaces: '   '
};

export function AlphabetGeneratorModal({ onInsert, onClose }: AlphabetGeneratorModalProps) {
  const [listType, setListType] = useState<WordListType>('cvc');
  const [casing, setCasing] = useState<CasingType>('lowercase');
  const [separator, setSeparator] = useState<SeparatorType>('hyphen');
  const [pagination, setPagination] = useState<PaginationType>('none');
  const primaryBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primaryBtnRef.current?.focus();
  }, []);

  const generatedText = useMemo(() => {
    const wordsMap = listType === 'cvc' ? CVC_WORDS : listType === 'standard' ? STANDARD_WORDS : ANIMAL_WORDS;
    const sepStr = SEPARATORS[separator];
    const lines: string[] = [];

    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

    letters.forEach((letter, index) => {
      let word = wordsMap[letter] || '';
      let formattedLetter = letter;

      // Apply casing
      if (casing === 'lowercase') {
        formattedLetter = letter.toLowerCase();
        word = word.toLowerCase();
      } else if (casing === 'uppercase') {
        formattedLetter = letter.toUpperCase();
        word = word.toUpperCase();
      } else if (casing === 'titlecase') {
        formattedLetter = letter.toUpperCase();
        word = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      } else if (casing === 'both') {
        formattedLetter = letter.toUpperCase() + letter.toLowerCase();
        word = word.toLowerCase();
      } else if (casing === 'bothSpaced') {
        formattedLetter = letter.toUpperCase() + ' ' + letter.toLowerCase();
        word = word.toLowerCase();
      }

      lines.push(`${formattedLetter}${sepStr}${word}`);

      // Add page break if required
      if (pagination !== 'none') {
        const interval = parseInt(pagination, 10);
        if ((index + 1) % interval === 0 && index < letters.length - 1) {
          lines.push('\f');
        }
      }
    });

    return lines.join('\n');
  }, [listType, casing, separator, pagination]);

  const handleInsertText = () => {
    onInsert(generatedText);
  };

  return (
    <div className="welcome-overlay" onClick={onClose} aria-label="Alphabet Generator">
      <div 
        className="welcome-modal alphabet-gen-modal" 
        onClick={e => e.stopPropagation()} 
        style={{ maxWidth: '800px', width: '100%', display: 'flex', flexDirection: 'column' }}
      >
        <header className="welcome-header">
          <h2>Alphabet & Words Generator</h2>
          <button className="welcome-close" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="alphabet-gen-content" style={{ display: 'flex', gap: '1.5rem', padding: '1.5rem', flex: 1, minHeight: '380px', overflowY: 'auto' }}>
          {/* Controls section */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.4rem', fontSize: '0.9rem' }}>Word List Type</label>
              <div className="gen-option-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label className="gen-radio-label">
                  <input type="radio" name="listType" checked={listType === 'cvc'} onChange={() => setListType('cvc')} />
                  <span>Simplest CVC Words (e.g. <code>a - ant</code>)</span>
                </label>
                <label className="gen-radio-label">
                  <input type="radio" name="listType" checked={listType === 'standard'} onChange={() => setListType('standard')} />
                  <span>Standard Common Nouns (e.g. <code>a - apple</code>)</span>
                </label>
                <label className="gen-radio-label">
                  <input type="radio" name="listType" checked={listType === 'animals'} onChange={() => setListType('animals')} />
                  <span>Animals (e.g. <code>a - alligator</code>)</span>
                </label>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.4rem', fontSize: '0.9rem' }}>Letter Casing</label>
              <select 
                value={casing} 
                onChange={e => setCasing(e.target.value as CasingType)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
              >
                <option value="lowercase">Lowercase (a - apple)</option>
                <option value="uppercase">Uppercase (A - APPLE)</option>
                <option value="titlecase">Capitalized (A - Apple)</option>
                <option value="both">Both Cases (Aa - apple)</option>
                <option value="bothSpaced">Spaced Both Cases (A a - apple)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.4rem', fontSize: '0.9rem' }}>Delimiter Separator</label>
              <select 
                value={separator} 
                onChange={e => setSeparator(e.target.value as SeparatorType)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
              >
                <option value="hyphen">Hyphen ( - )</option>
                <option value="colon">Colon (: )</option>
                <option value="equals">Equals ( = )</option>
                <option value="arrow">Arrow ( → )</option>
                <option value="spaces">Spaces (   )</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.4rem', fontSize: '0.9rem' }}>Downwards Page Breaks</label>
              <select 
                value={pagination} 
                onChange={e => setPagination(e.target.value as PaginationType)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
              >
                <option value="none">Continuous list (no page breaks)</option>
                <option value="1">Page break after every letter (1 per page)</option>
                <option value="5">Page break every 5 letters</option>
                <option value="10">Page break every 10 letters</option>
              </select>
            </div>
          </div>

          {/* Preview section */}
          <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.4rem', fontSize: '0.9rem' }}>Live Preview</label>
            <div 
              style={{ 
                flex: 1, 
                border: '1px solid var(--border)', 
                borderRadius: '4px', 
                background: 'rgba(0,0,0,0.03)',
                padding: '0.75rem', 
                overflowY: 'auto',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                lineHeight: '1.4',
                whiteSpace: 'pre-wrap',
                maxHeight: '320px',
                color: 'var(--text-primary)'
              }}
            >
              {generatedText.split('\n').map((line, idx) => {
                if (line === '\f') {
                  return (
                    <div 
                      key={idx} 
                      style={{ 
                        margin: '0.5rem 0', 
                        padding: '0.2rem 0',
                        borderTop: '1px dashed var(--accent)', 
                        borderBottom: '1px dashed var(--accent)', 
                        textAlign: 'center', 
                        fontSize: '0.7rem', 
                        color: 'var(--accent)',
                        opacity: 0.8,
                        userSelect: 'none'
                      }}
                    >
                      --- PAGE BREAK ---
                    </div>
                  );
                }
                return <div key={idx}>{line}</div>;
              })}
            </div>
          </div>
        </div>

        <footer className="welcome-footer" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button className="welcome-btn-secondary" onClick={onClose}>Cancel</button>
          <button 
            ref={primaryBtnRef}
            className="welcome-btn-primary" 
            onClick={handleInsertText}
          >
            Insert Exercises
          </button>
        </footer>
      </div>
    </div>
  );
}
