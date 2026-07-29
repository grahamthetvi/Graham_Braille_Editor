import { useTranslation } from 'react-i18next';
import type { MusicScoreAST, PlaybackState } from '../../types/musicBraille';
import { MAX_BPM, MIN_BPM } from '../../hooks/useMusicPlayback';
import './MusicPlayerControls.css';

export interface MusicPlayerControlsProps {
  playbackState: PlaybackState;
  score: MusicScoreAST;
  onPlay: () => void;
  /** Jump to the first detected music notes (skips literary front matter). */
  onPlayFromMusicStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onBpmChange: (bpm: number) => void;
  /** When true (default), Play starts at the editor caret. */
  playFromCursor: boolean;
  onPlayFromCursorChange: (enabled: boolean) => void;
  /** Character index where music is estimated to begin (for status). */
  musicStartCharIndex?: number;
  disabled?: boolean;
}

/**
 * Compact playback bar for Music Braille — Play / Pause / Stop + tempo.
 * Includes a default-on "From cursor" toggle and a "Music start" jump button.
 */
export function MusicPlayerControls({
  playbackState,
  score,
  onPlay,
  onPlayFromMusicStart,
  onPause,
  onStop,
  onBpmChange,
  playFromCursor,
  onPlayFromCursorChange,
  musicStartCharIndex = 0,
  disabled = false,
}: MusicPlayerControlsProps) {
  const { t } = useTranslation();
  const { isPlaying, isPaused, bpm, currentBeat, activeCharIndex, error } = playbackState;

  const currentMeasure =
    score.events.find(
      (e) =>
        currentBeat >= e.timeOffsetBeats - 1e-6 &&
        currentBeat < e.timeOffsetBeats + e.durationBeats,
    )?.measure ?? (score.totalMeasures > 0 ? 1 : 0);

  const noteLabel =
    activeCharIndex != null
      ? t('app.musicPlayer.noteCell', { index: activeCharIndex + 1 })
      : t('app.musicPlayer.noteIdle');

  const keyCount = score.keySignature.sharpsFlatsCount;
  const keyLabel =
    keyCount === 0
      ? t('app.musicPlayer.keySignature.none')
      : keyCount > 0
        ? t('app.musicPlayer.keySignature.sharps', { count: keyCount })
        : t('app.musicPlayer.keySignature.flats', { count: -keyCount });

  const canPlay = !disabled && score.events.length > 0;

  return (
    <div
      className="music-player"
      role="region"
      aria-label={t('app.musicPlayer.ariaLabel')}
    >
      <div className="music-player__transport">
        {!isPlaying ? (
          <button
            type="button"
            className="toolbar-btn toolbar-btn--primary music-player__btn"
            onClick={onPlay}
            disabled={!canPlay}
            title={
              playFromCursor
                ? t('app.musicPlayer.play.titleCursor')
                : t('app.musicPlayer.play.titleDocument')
            }
            aria-label={
              playFromCursor
                ? t('app.musicPlayer.play.ariaLabelCursor')
                : t('app.musicPlayer.play.ariaLabelDocument')
            }
          >
            {isPaused ? t('app.musicPlayer.resume.label') : t('app.musicPlayer.play.label')}
          </button>
        ) : (
          <button
            type="button"
            className="toolbar-btn music-player__btn"
            onClick={onPause}
            disabled={disabled}
            title={t('app.musicPlayer.pause.title')}
            aria-label={t('app.musicPlayer.pause.ariaLabel')}
          >
            {t('app.musicPlayer.pause.label')}
          </button>
        )}

        <button
          type="button"
          className="toolbar-btn music-player__btn"
          onClick={onStop}
          disabled={disabled || (!isPlaying && !isPaused)}
          title={t('app.musicPlayer.stop.title')}
          aria-label={t('app.musicPlayer.stop.ariaLabel')}
        >
          {t('app.musicPlayer.stop.label')}
        </button>

        <button
          type="button"
          className="toolbar-btn music-player__btn"
          onClick={onPlayFromMusicStart}
          disabled={!canPlay}
          title={t('app.musicPlayer.musicStart.title')}
          aria-label={t('app.musicPlayer.musicStart.ariaLabel')}
        >
          {t('app.musicPlayer.musicStart.label')}
        </button>

        <button
          type="button"
          className={`toolbar-btn music-player__btn${playFromCursor ? ' toolbar-btn--active' : ''}`}
          onClick={() => onPlayFromCursorChange(!playFromCursor)}
          disabled={disabled}
          aria-pressed={playFromCursor}
          title={t('app.musicPlayer.fromCursor.title')}
          aria-label={t('app.musicPlayer.fromCursor.ariaLabel')}
        >
          {t('app.musicPlayer.fromCursor.label')}
        </button>
      </div>

      <label className="music-player__tempo">
        <span className="music-player__tempo-label">
          {t('app.musicPlayer.tempo.label', { bpm })}
        </span>
        <input
          type="range"
          min={MIN_BPM}
          max={MAX_BPM}
          step={1}
          value={bpm}
          disabled={disabled}
          onChange={(e) => onBpmChange(Number(e.target.value))}
          aria-label={t('app.musicPlayer.tempo.ariaLabel')}
        />
      </label>

      <div className="music-player__status" aria-live="polite">
        <span>
          {t('app.musicPlayer.measure', {
            current: currentMeasure,
            total: score.totalMeasures,
          })}
        </span>
        <span className="music-player__status-sep" aria-hidden="true">
          ·
        </span>
        <span>
          {t('app.musicPlayer.timeSignature', {
            beats: score.timeSignature.beatsPerMeasure,
            unit: score.timeSignature.beatUnit,
          })}
        </span>
        <span className="music-player__status-sep" aria-hidden="true">
          ·
        </span>
        <span>{keyLabel}</span>
        <span className="music-player__status-sep" aria-hidden="true">
          ·
        </span>
        <span>{noteLabel}</span>
        <span className="music-player__status-sep" aria-hidden="true">
          ·
        </span>
        <span>
          {t('app.musicPlayer.events', { count: score.events.length })}
        </span>
        <span className="music-player__status-sep" aria-hidden="true">
          ·
        </span>
        <span>
          {t('app.musicPlayer.musicStartCell', { index: musicStartCharIndex + 1 })}
        </span>
      </div>

      {error ? (
        <div className="music-player__error" role="alert">
          {t(`app.musicPlayer.errors.${error}`)}
        </div>
      ) : null}
    </div>
  );
}
