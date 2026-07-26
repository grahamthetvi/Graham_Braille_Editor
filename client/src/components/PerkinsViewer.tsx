import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    buildDotsSpeech,
    buildFingersSpeech,
    cancelPerkinsSpeech,
    getActiveDotNumbers,
    speakPerkinsHint,
} from '../utils/perkinsSpeech';
import { getStaticDots } from '../utils/staticBraille';
import '../PerkinsViewer.css';

interface PerkinsViewerProps {
    rawText: string;
}

export function PerkinsViewer({ rawText }: PerkinsViewerProps) {
    const { t } = useTranslation();
    const [currentIndex, setCurrentIndex] = useState(0);

    // Filter out any carriage returns or newlines that might be in the raw text
    // for a pure character-by-character view
    const characters = rawText.replace(/[\r\n]+/g, '').split('');

    const totalChars = characters.length;
    const hasContent = totalChars > 0;

    // Keep index in bounds if text shrinks
    if (hasContent && currentIndex >= characters.length) {
        setCurrentIndex(characters.length - 1);
    }

    const currentChar = hasContent ? characters[currentIndex] : '';
    const isSpace = currentChar === ' ';
    const dots = getStaticDots(currentChar);
    const activeDots = getActiveDotNumbers(dots);

    useEffect(() => () => cancelPerkinsSpeech(), []);

    const speakDots = useCallback(() => {
        speakPerkinsHint(buildDotsSpeech(activeDots, isSpace));
    }, [activeDots, isSpace]);

    const speakFingers = useCallback(() => {
        speakPerkinsHint(buildFingersSpeech(activeDots, isSpace));
    }, [activeDots, isSpace]);

    const prevChar = () => {
        if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
    };

    const nextChar = () => {
        if (currentIndex < characters.length - 1) setCurrentIndex(currentIndex + 1);
    };

    if (!hasContent) {
        return (
            <div className="perkins-viewer empty">
                <p>{t('perkins.prompt')}</p>
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
                    <span className="perkins-paper-label">{t('perkins.currentCharacter')}</span>
                    <div className="perkins-paper-display">
                        <div className="perkins-paper-char">
                            {isSpace ? t('perkins.spaceLabel') : currentChar}
                        </div>
                        {/* Visual Braille Cell Reference - Perkins Input Order */}
                        <div className="perkins-visual-cell perkins-visual-input" aria-hidden="true">
                            <div className={`visual-dot ${dots[2] ? 'active' : ''}`}>{t('perkins.dotLabels.d3')}</div>
                            <div className={`visual-dot ${dots[1] ? 'active' : ''}`}>{t('perkins.dotLabels.d2')}</div>
                            <div className={`visual-dot ${dots[0] ? 'active' : ''}`}>{t('perkins.dotLabels.d1')}</div>
                            <div className={`visual-dot space-dot ${isSpace ? 'active' : ''}`}>{t('perkins.dotLabels.space')}</div>
                            <div className={`visual-dot ${dots[3] ? 'active' : ''}`}>{t('perkins.dotLabels.d4')}</div>
                            <div className={`visual-dot ${dots[4] ? 'active' : ''}`}>{t('perkins.dotLabels.d5')}</div>
                            <div className={`visual-dot ${dots[5] ? 'active' : ''}`}>{t('perkins.dotLabels.d6')}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Machine Chassis */}
            <div className="perkins-machine">
                <div className="perkins-machine-branding">
                    <div className="perkins-badge">{t('perkins.title')}</div>
                </div>

                {/* Keyboard Layout */}
                <div className="perkins-keyboard-layout">

                    <div className="perkins-keys-side left-side">
                        <button className={`perkins-key key-dot3 ${dots[2] ? 'active' : ''}`}>
                            <div className="key-cap-indicator"></div>
                            <span>{t('perkins.keyLabels.dot3')}</span>
                        </button>
                        <button className={`perkins-key key-dot2 ${dots[1] ? 'active' : ''}`}>
                            <div className="key-cap-indicator"></div>
                            <span>{t('perkins.keyLabels.dot2')}</span>
                        </button>
                        <button className={`perkins-key key-dot1 ${dots[0] ? 'active' : ''}`}>
                            <div className="key-cap-indicator"></div>
                            <span>{t('perkins.keyLabels.dot1')}</span>
                        </button>
                    </div>

                    <button className={`perkins-spacebar ${isSpace ? 'active' : ''}`}>
                        <div className="spacebar-ridge"></div>
                        <span className="spacebar-label">{t('perkins.keyLabels.space')}</span>
                    </button>

                    <div className="perkins-keys-side right-side">
                        <button className={`perkins-key key-dot4 ${dots[3] ? 'active' : ''}`}>
                            <div className="key-cap-indicator"></div>
                            <span>{t('perkins.keyLabels.dot4')}</span>
                        </button>
                        <button className={`perkins-key key-dot5 ${dots[4] ? 'active' : ''}`}>
                            <div className="key-cap-indicator"></div>
                            <span>{t('perkins.keyLabels.dot5')}</span>
                        </button>
                        <button className={`perkins-key key-dot6 ${dots[5] ? 'active' : ''}`}>
                            <div className="key-cap-indicator"></div>
                            <span>{t('perkins.keyLabels.dot6')}</span>
                        </button>
                    </div>

                </div>
            </div>

            <div
                className="perkins-audio"
                role="group"
                aria-label={t('perkins.speakAriaLabel')}
            >
                <button
                    type="button"
                    className="toolbar-btn"
                    onClick={speakDots}
                    title={t('perkins.speakDots.title')}
                >
                    {t('perkins.speakDots.label')}
                </button>
                <button
                    type="button"
                    className="toolbar-btn"
                    onClick={speakFingers}
                    title={t('perkins.speakFingers.title')}
                >
                    {t('perkins.speakFingers.label')}
                </button>
            </div>

            <div className="perkins-navigation">
                <button
                    className="toolbar-btn"
                    onClick={prevChar}
                    disabled={currentIndex === 0}
                >
                    {t('perkins.prevStep')}
                </button>
                <div className="perkins-progress">
                    {t('perkins.stepOf', { current: currentIndex + 1, total: totalChars })}
                </div>
                <button
                    className="toolbar-btn"
                    onClick={nextChar}
                    disabled={currentIndex === characters.length - 1}
                >
                    {t('perkins.nextStep')}
                </button>
            </div>
        </div>
    );
}
