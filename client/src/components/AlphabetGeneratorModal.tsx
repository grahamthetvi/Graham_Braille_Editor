import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
    <div className="welcome-overlay" onClick={onClose} aria-label={t('alphabetGenerator.ariaLabel')}>
      <div 
        className="welcome-modal alphabet-gen-modal" 
        onClick={e => e.stopPropagation()} 
        style={{ maxWidth: '800px', width: '100%', display: 'flex', flexDirection: 'column' }}
      >
        <header className="welcome-header">
          <h2>{t('alphabetGenerator.title')}</h2>
          <button className="welcome-close" onClick={onClose} aria-label={t('alphabetGenerator.close')}>✕</button>
        </header>

        <div className="alphabet-gen-content" style={{ display: 'flex', gap: '1.5rem', padding: '1.5rem', flex: 1, minHeight: '380px', overflowY: 'auto' }}>
          {/* Controls section */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.4rem', fontSize: '0.9rem' }}>{t('alphabetGenerator.wordListType.label')}</label>
              <div className="gen-option-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label className="gen-radio-label">
                  <input type="radio" name="listType" checked={listType === 'cvc'} onChange={() => setListType('cvc')} />
                  <span>{t('alphabetGenerator.wordListType.simplestCvc')}</span>
                </label>
                <label className="gen-radio-label">
                  <input type="radio" name="listType" checked={listType === 'standard'} onChange={() => setListType('standard')} />
                  <span>{t('alphabetGenerator.wordListType.standardCommon')}</span>
                </label>
                <label className="gen-radio-label">
                  <input type="radio" name="listType" checked={listType === 'animals'} onChange={() => setListType('animals')} />
                  <span>{t('alphabetGenerator.wordListType.animals')}</span>
                </label>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.4rem', fontSize: '0.9rem' }}>{t('alphabetGenerator.letterCasing.label')}</label>
              <select 
                value={casing} 
                onChange={e => setCasing(e.target.value as CasingType)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
              >
                <option value="lowercase">{t('alphabetGenerator.letterCasing.lowercase')}</option>
                <option value="uppercase">{t('alphabetGenerator.letterCasing.uppercase')}</option>
                <option value="titlecase">{t('alphabetGenerator.letterCasing.capitalized')}</option>
                <option value="both">{t('alphabetGenerator.letterCasing.bothCases')}</option>
                <option value="bothSpaced">{t('alphabetGenerator.letterCasing.spacedBothCases')}</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.4rem', fontSize: '0.9rem' }}>{t('alphabetGenerator.delimiter.label')}</label>
              <select 
                value={separator} 
                onChange={e => setSeparator(e.target.value as SeparatorType)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
              >
                <option value="hyphen">{t('alphabetGenerator.delimiter.hyphen')}</option>
                <option value="colon">{t('alphabetGenerator.delimiter.colon')}</option>
                <option value="equals">{t('alphabetGenerator.delimiter.equals')}</option>
                <option value="arrow">{t('alphabetGenerator.delimiter.arrow')}</option>
                <option value="spaces">{t('alphabetGenerator.delimiter.spaces')}</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.4rem', fontSize: '0.9rem' }}>{t('alphabetGenerator.pageBreaks.label')}</label>
              <select 
                value={pagination} 
                onChange={e => setPagination(e.target.value as PaginationType)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
              >
                <option value="none">{t('alphabetGenerator.pageBreaks.none')}</option>
                <option value="1">{t('alphabetGenerator.pageBreaks.everyLetter')}</option>
                <option value="5">{t('alphabetGenerator.pageBreaks.every5')}</option>
                <option value="10">{t('alphabetGenerator.pageBreaks.every10')}</option>
              </select>
            </div>
          </div>

          {/* Preview section */}
          <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.4rem', fontSize: '0.9rem' }}>{t('alphabetGenerator.livePreview')}</label>
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
                      {t('alphabetGenerator.pageBreakMarker')}
                    </div>
                  );
                }
                return <div key={idx}>{line}</div>;
              })}
            </div>
          </div>
        </div>

        <footer className="welcome-footer" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button className="welcome-btn-secondary" onClick={onClose}>{t('alphabetGenerator.cancel')}</button>
          <button 
            ref={primaryBtnRef}
            className="welcome-btn-primary" 
            onClick={handleInsertText}
          >
            {t('alphabetGenerator.insert')}
          </button>
        </footer>
      </div>
    </div>
  );
}
