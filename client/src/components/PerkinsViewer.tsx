import { useState } from 'react';
import { getStaticDots } from '../utils/staticBraille';
import '../PerkinsViewer.css';

interface PerkinsViewerProps {
    rawText: string;
}

export function PerkinsViewer({ rawText }: PerkinsViewerProps) {
    const [currentIndex, setCurrentIndex] = useState(0);

    // Filter out any carriage returns or newlines that might be in the raw text
    // for a pure character-by-character view
    const characters = rawText.replace(/[\r\n]+/g, '').split('');

    const hasContent = characters.length > 0;

    // Keep index in bounds if text shrinks
    if (hasContent && currentIndex >= characters.length) {
        setCurrentIndex(characters.length - 1);
    }

    const currentChar = hasContent ? characters[currentIndex] : '';
    const isSpace = currentChar === ' ';
    const dots = getStaticDots(currentChar);

    const prevChar = () => {
        if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
    };

    const nextChar = () => {
        if (currentIndex < characters.length - 1) setCurrentIndex(currentIndex + 1);
    };

    if (!hasContent) {
        return (
            <div className="perkins-viewer empty">
                <p>Type in the editor or open a file to learn the Perkins Brailler keys.</p>
            </div>
        );
    }

    // Realistic machine aesthetic layout:
    // - Top: "Paper feed" showing the embossed character in high relief
    // - Middle: The machine chassis
    // - Bottom: The mechanical keys curving outward
    return (
        <div className="perkins-viewer">

            {/* Paper Feed Area */}
            <div className="perkins-paper-feed">
                <div className="perkins-paper">
                    <span className="perkins-paper-label">Current Character</span>
                    <div className="perkins-paper-display">
                        <div className="perkins-paper-char">
                            {isSpace ? '[Space]' : currentChar}
                        </div>
                        {/* Visual Braille Cell Reference */}
                        <div className="perkins-visual-cell" aria-hidden="true">
                            <div className={`visual-dot ${dots[0] ? 'active' : ''}`}>1</div>
                            <div className={`visual-dot ${dots[3] ? 'active' : ''}`}>4</div>
                            <div className={`visual-dot ${dots[1] ? 'active' : ''}`}>2</div>
                            <div className={`visual-dot ${dots[4] ? 'active' : ''}`}>5</div>
                            <div className={`visual-dot ${dots[2] ? 'active' : ''}`}>3</div>
                            <div className={`visual-dot ${dots[5] ? 'active' : ''}`}>6</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Machine Chassis */}
            <div className="perkins-machine">
                <div className="perkins-machine-branding">
                    <div className="perkins-badge">Graham Brailler</div>
                </div>

                {/* Keyboard Layout */}
                <div className="perkins-keyboard-layout">

                    <div className="perkins-keys-side left-side">
                        <button className={`perkins-key key-dot3 ${dots[2] ? 'active' : ''}`}>
                            <div className="key-cap-indicator"></div>
                            <span>Dot 3</span>
                        </button>
                        <button className={`perkins-key key-dot2 ${dots[1] ? 'active' : ''}`}>
                            <div className="key-cap-indicator"></div>
                            <span>Dot 2</span>
                        </button>
                        <button className={`perkins-key key-dot1 ${dots[0] ? 'active' : ''}`}>
                            <div className="key-cap-indicator"></div>
                            <span>Dot 1</span>
                        </button>
                    </div>

                    <button className={`perkins-spacebar ${isSpace ? 'active' : ''}`}>
                        <div className="spacebar-ridge"></div>
                        <span className="spacebar-label">Space</span>
                    </button>

                    <div className="perkins-keys-side right-side">
                        <button className={`perkins-key key-dot4 ${dots[3] ? 'active' : ''}`}>
                            <div className="key-cap-indicator"></div>
                            <span>Dot 4</span>
                        </button>
                        <button className={`perkins-key key-dot5 ${dots[4] ? 'active' : ''}`}>
                            <div className="key-cap-indicator"></div>
                            <span>Dot 5</span>
                        </button>
                        <button className={`perkins-key key-dot6 ${dots[5] ? 'active' : ''}`}>
                            <div className="key-cap-indicator"></div>
                            <span>Dot 6</span>
                        </button>
                    </div>

                </div>
            </div>

            <div className="perkins-navigation">
                <button
                    className="toolbar-btn"
                    onClick={prevChar}
                    disabled={currentIndex === 0}
                >
                    &larr; Previous Step
                </button>
                <div className="perkins-progress">
                    Step {currentIndex + 1} of {characters.length}
                </div>
                <button
                    className="toolbar-btn"
                    onClick={nextChar}
                    disabled={currentIndex === characters.length - 1}
                >
                    Next Step &rarr;
                </button>
            </div>
        </div>
    );
}
