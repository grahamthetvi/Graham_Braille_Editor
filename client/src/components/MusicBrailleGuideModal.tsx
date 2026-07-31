import { useEffect, useRef } from 'react';

interface MusicBrailleGuideModalProps {
  onClose: () => void;
  /** Insert plain-text instructions into the editor for braille translation / embossing. */
  onInsertIntoEditor: (text: string) => void;
}

export const MUSIC_BRAILLE_GUIDE_TEXT = `Music Braille Recommendation
Graham Braille Editor

Graham Braille Editor translates literary text and math into braille. For Music Braille playback, turn on **Music Player Mode** under Teaching Tools, then type or import ASCII Music Braille (BRF). The built-in player highlights each cell as it sounds. Use **Next note** / **Prev note** to step one event at a time; each step plays the pitch and announces the note name and duration (for example, "C 4, quarter note").

To create Music Braille from sheet music, we recommend this free workflow:

1. MuseScore — create or open your score, then export MusicXML.
2. Sao Mai Braille (SMB) — convert that MusicXML into Music Braille (BRF).
3. Open the BRF here with Music Player Mode on to preview, hear, or emboss.

Step-by-step

A. Prepare the score in MuseScore
1. Install or open MuseScore: https://musescore.org/
2. Create your score, or open an existing MuseScore / MusicXML file.
3. Check that notes, parts, key, and time look correct.
4. Export MusicXML: File, then Export, then choose MusicXML (uncompressed .musicxml or .xml is easiest).

B. Convert MusicXML to Music Braille with Sao Mai Braille
Desktop (Windows):
1. Download Sao Mai Braille: https://saomaicenter.org/en/smsoft/smb
2. Create a new document.
3. Insert the MusicXML file (Alt+F11, or Insert then Music score).
4. Translate to braille (Ctrl+T, or Tools then Translate).
5. Review the braille, then save or export a BRF file.

Online (no install; works on many platforms):
1. Open: https://saomaicenter.org/en/smsoft/smb-online
2. Select your MusicXML file.
3. Choose the part(s) to convert if asked.
4. Translate, then download the BRF.

C. Emboss or review in Graham (optional)
1. In Graham Braille Editor, use Import file and choose the .brf.
2. Preview on the right, then Print or emboss as usual.

Tips
- Always review automatic Music Braille. Complex piano, choir, and orchestra scores may need a music braille specialist.
- Clean MusicXML gives better braille. Fix wrong notes and remove hidden playback-only objects in MuseScore before exporting.
- North American practice follows BANA Music Braille Code, 2015.
- Official codebook (PDF and BRF): https://www.brailleauthority.org/music-braille-code

Support: grahamthetvi@icloud.com
`;

/**
 * Recommends MuseScore + Sao Mai Braille for Music Braille production.
 * Users can insert the guide into the editor to translate/emboss as braille.
 */
export function MusicBrailleGuideModal({ onClose, onInsertIntoEditor }: MusicBrailleGuideModalProps) {
  const primaryBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primaryBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function handleInsert() {
    onInsertIntoEditor(MUSIC_BRAILLE_GUIDE_TEXT.trimEnd() + '\n');
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div
      className="welcome-overlay music-braille-guide-overlay"
      onClick={onClose}
      aria-label="Close Music Braille guide"
    >
      <div
        className="welcome-modal music-braille-guide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="music-braille-guide-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="welcome-header">
          <h2 id="music-braille-guide-title">Music Braille Recommendation</h2>
          <button
            className="welcome-close"
            onClick={onClose}
            aria-label="Close Music Braille guide"
          >
            ✕
          </button>
        </header>

        <div className="welcome-body">
          <section className="welcome-section">
            <div>
              <h3>Use MuseScore and Sao Mai Braille</h3>
              <p>
                Graham Braille Editor translates literary text and math into braille.
                It does <strong>not</strong> yet convert sheet music into Music Braille
                automatically. For Music Braille, we recommend this free workflow:
              </p>
              <ol style={{ paddingLeft: '1.25rem', margin: '0.75rem 0', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <li>
                  <strong>MuseScore</strong> — create or open your score, then export{' '}
                  <strong>MusicXML</strong>.
                </li>
                <li>
                  <strong>Sao Mai Braille (SMB)</strong> — convert that MusicXML into
                  Music Braille (<code>.brf</code>).
                </li>
                <li>
                  <strong>Optional:</strong> open the BRF here to preview or emboss.
                </li>
              </ol>
              <p className="welcome-tip">
                Blind or low-vision users: choose <strong>Add to translation page</strong>{' '}
                below to put these instructions in the editor, then download or emboss
                them as braille.
              </p>
            </div>
          </section>

          <section className="welcome-section">
            <div>
              <h3>A. Prepare the score in MuseScore</h3>
              <ol style={{ paddingLeft: '1.25rem', margin: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <li>
                  Install or open MuseScore:{' '}
                  <a href="https://musescore.org/" target="_blank" rel="noopener noreferrer">
                    musescore.org
                  </a>
                </li>
                <li>Create your score, or open an existing MuseScore / MusicXML file.</li>
                <li>Check that notes, parts, key, and time look correct.</li>
                <li>
                  Export MusicXML: <strong>File → Export</strong>, then choose MusicXML
                  (uncompressed <code>.musicxml</code> or <code>.xml</code> is easiest).
                </li>
              </ol>
            </div>
          </section>

          <section className="welcome-section">
            <div>
              <h3>B. Convert with Sao Mai Braille</h3>
              <p style={{ marginBottom: '0.5rem' }}>
                <strong>Desktop (Windows):</strong>{' '}
                <a
                  href="https://saomaicenter.org/en/smsoft/smb"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Download Sao Mai Braille
                </a>
              </p>
              <ol style={{ paddingLeft: '1.25rem', margin: '0.35rem 0 1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <li>Create a new document.</li>
                <li>Insert the MusicXML file (<kbd>Alt+F11</kbd>, or Insert → Music score).</li>
                <li>Translate to braille (<kbd>Ctrl+T</kbd>, or Tools → Translate).</li>
                <li>Review the braille, then save or export a BRF file.</li>
              </ol>
              <p style={{ marginBottom: '0.5rem' }}>
                <strong>Online (no install):</strong>{' '}
                <a
                  href="https://saomaicenter.org/en/smsoft/smb-online"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  SMB Online Music Braille Converter
                </a>
              </p>
              <ol style={{ paddingLeft: '1.25rem', margin: '0.35rem 0', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <li>Select your MusicXML file.</li>
                <li>Choose the part(s) to convert if asked.</li>
                <li>Translate, then download the BRF.</li>
              </ol>
            </div>
          </section>

          <section className="welcome-section">
            <div>
              <h3>C. Emboss or review in Graham (optional)</h3>
              <ol style={{ paddingLeft: '1.25rem', margin: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <li>
                  Use <strong>Import file</strong> and choose the <code>.brf</code>.
                </li>
                <li>Preview on the right, then Print or emboss as usual.</li>
              </ol>
            </div>
          </section>

          <section className="welcome-section">
            <div>
              <h3>Tips</h3>
              <ul style={{ paddingLeft: '1.25rem', margin: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <li>
                  Always review automatic Music Braille. Complex piano, choir, and
                  orchestra scores may need a music braille specialist.
                </li>
                <li>
                  Clean MusicXML gives better braille. Fix wrong notes and remove hidden
                  playback-only objects in MuseScore before exporting.
                </li>
                <li>
                  North American practice follows{' '}
                  <strong>BANA Music Braille Code, 2015</strong>. Codebook:{' '}
                  <a
                    href="https://www.brailleauthority.org/music-braille-code"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    brailleauthority.org/music-braille-code
                  </a>
                </li>
              </ul>
            </div>
          </section>
        </div>

        <footer className="welcome-footer music-braille-guide-footer">
          <p className="welcome-footer-meta">
            Support:{' '}
            <a href="mailto:grahamthetvi@icloud.com">grahamthetvi@icloud.com</a>
          </p>
          <div className="music-braille-guide-actions">
            <button
              className="welcome-btn-secondary"
              type="button"
              onClick={handleInsert}
              title="Insert these instructions into the editor so you can translate and emboss them as braille"
            >
              Add to translation page
            </button>
            <button
              className="welcome-btn-secondary music-braille-print-btn"
              type="button"
              onClick={handlePrint}
              title="Print these instructions on a regular printer"
            >
              Print instructions
            </button>
            <button
              ref={primaryBtnRef}
              className="welcome-btn-primary"
              type="button"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
