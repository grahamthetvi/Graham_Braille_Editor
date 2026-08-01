/**
 * Secret Music Braille debug panel.
 *
 * Hidden unless enabled via Ctrl+Shift+Alt+M, ?musicDebug=1, or localStorage.
 * Shows live parse/schedule/clock stats and exports a JSON snapshot for support.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  midiToLabel,
  musicDebugLog,
} from '../../services/audio/musicDebugLog';
import './MusicDebugPanel.css';

function downloadJson(json: string, capturedAt: string): void {
  const blob = new Blob([json], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `music-debug-${capturedAt.replace(/[:.]/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyJson(json: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(json);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = json;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export function MusicDebugPanel() {
  const [enabled, setEnabled] = useState(() => musicDebugLog.isEnabled());
  const [stats, setStats] = useState(() => musicDebugLog.getStats());
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    return musicDebugLog.subscribe(() => {
      setEnabled(musicDebugLog.isEnabled());
      setStats(musicDebugLog.getStats());
    });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ctrl+Shift+Alt+M — secret toggle
      if (e.ctrlKey && e.shiftKey && e.altKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        musicDebugLog.toggle();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleCopy = useCallback(async () => {
    const ok = await copyJson(musicDebugLog.getExportJson());
    setCopyMsg(ok ? 'Copied compact snapshot' : 'Copy failed — try Download');
    window.setTimeout(() => setCopyMsg(null), 2500);
  }, []);

  const handleDownload = useCallback(() => {
    const json = musicDebugLog.getExportJson();
    let capturedAt = new Date().toISOString();
    try {
      const parsed = JSON.parse(json) as { at?: string };
      if (parsed.at) capturedAt = parsed.at;
    } catch {
      /* keep fallback */
    }
    downloadJson(json, capturedAt);
    setCopyMsg('Downloaded compact JSON');
    window.setTimeout(() => setCopyMsg(null), 2500);
  }, []);

  if (!enabled) return null;

  const score = stats.score;
  const pb = stats.playback;

  return (
    <aside
      className={`music-debug${minimized ? ' music-debug--min' : ''}`}
      role="complementary"
      aria-label="Music playback debug"
    >
      <header className="music-debug__header">
        <strong className="music-debug__title">Music Debug</strong>
        <span className="music-debug__hint">Ctrl+Shift+Alt+M</span>
        <div className="music-debug__header-actions">
          <button
            type="button"
            className="music-debug__icon-btn"
            onClick={() => setMinimized((v) => !v)}
            aria-label={minimized ? 'Expand music debug' : 'Minimize music debug'}
          >
            {minimized ? '▴' : '▾'}
          </button>
          <button
            type="button"
            className="music-debug__icon-btn"
            onClick={() => musicDebugLog.setEnabled(false)}
            aria-label="Close music debug"
          >
            ✕
          </button>
        </div>
      </header>

      {!minimized && (
        <div className="music-debug__body">
          <section className="music-debug__section">
            <h3>Score</h3>
            {score ? (
              <ul className="music-debug__kv">
                <li>
                  <span>Events</span>
                  <span>
                    {score.eventCount} ({score.noteCount} notes / {score.restCount} rests /{' '}
                    {score.chordCount} chords)
                  </span>
                </li>
                <li>
                  <span>Length</span>
                  <span>
                    {score.totalMeasures} measures · {score.totalBeats} beats ·{' '}
                    {score.timeSignature.beatsPerMeasure}/{score.timeSignature.beatUnit}
                  </span>
                </li>
                <li>
                  <span>Parse</span>
                  <span>
                    pianoSystems={score.pianoSystems} · capacity={score.capacityBeats} ·
                    literarySkip={score.literarySkipCharIndex}
                  </span>
                </li>
                <li>
                  <span>Risks</span>
                  <span>
                    tiny={score.tinyNoteCount} · sub16th={score.subSixteenthCount} · backjumps=
                    {score.highlightBackjumpCount}
                  </span>
                </li>
                <li>
                  <span>Music start</span>
                  <span>cell {score.musicStartCharIndex + 1}</span>
                </li>
              </ul>
            ) : (
              <p className="music-debug__muted">No score loaded</p>
            )}
          </section>

          <section className="music-debug__section">
            <h3>Live</h3>
            <ul className="music-debug__kv">
              <li>
                <span>State</span>
                <span>
                  {pb?.isPlaying ? 'playing' : pb?.isPaused ? 'paused' : 'idle'} · BPM{' '}
                  {pb?.bpm ?? '—'} · beat {pb?.currentBeat?.toFixed(2) ?? '—'} · ch{' '}
                  {pb?.activeCharIndex ?? '—'} · ev {pb?.activeEventIndex ?? '—'}
                </span>
              </li>
              <li>
                <span>Log</span>
                <span>
                  sched={stats.scheduleCount} · clock={stats.clockCount} · transport=
                  {stats.transportCount} · anomalies={stats.anomalyCount}
                </span>
              </li>
            </ul>
          </section>

          <section className="music-debug__section">
            <h3>Recent schedule</h3>
            {stats.recentSchedule.length === 0 ? (
              <p className="music-debug__muted">Press Play / Music start to capture</p>
            ) : (
              <ol className="music-debug__log">
                {stats.recentSchedule.map((row, i) => (
                  <li key={`${row.eventId}-${row.audioTime}-${i}`}>
                    t={row.delayFromOriginSec.toFixed(2)}s beat={row.beat.toFixed(2)} d=
                    {row.durationSec.toFixed(2)}s m{row.measure}{' '}
                    {row.midiPitches.map(midiToLabel).join('+')} ch={row.charIndex}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="music-debug__section">
            <h3>Anomalies</h3>
            {stats.recentAnomalies.length === 0 ? (
              <p className="music-debug__muted">None yet</p>
            ) : (
              <ol className="music-debug__log music-debug__log--warn">
                {stats.recentAnomalies.map((a, i) => (
                  <li key={`${a.kind}-${a.wallMs}-${i}`}>
                    <code>{a.kind}</code> {a.detail}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="music-debug__section">
            <h3>Transport</h3>
            {stats.recentTransport.length === 0 ? (
              <p className="music-debug__muted">—</p>
            ) : (
              <ol className="music-debug__log">
                {stats.recentTransport.map((t, i) => (
                  <li key={`${t.kind}-${t.wallMs}-${i}`}>
                    {t.kind}
                    {t.detail ? ` (${t.detail})` : ''}
                    {t.beat != null ? ` @ beat ${t.beat}` : ''}
                    {t.bpm != null ? ` bpm=${t.bpm}` : ''}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <div className="music-debug__actions">
            <button type="button" className="toolbar-btn" onClick={handleCopy}>
              Copy JSON
            </button>
            <button type="button" className="toolbar-btn" onClick={handleDownload}>
              Download JSON
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => musicDebugLog.clearSession()}
            >
              Clear log
            </button>
          </div>
          {copyMsg ? <p className="music-debug__toast">{copyMsg}</p> : null}
          <p className="music-debug__footer">
            Play the misbehaving passage, then Copy JSON (compact v2) into the chat.
          </p>
        </div>
      )}
    </aside>
  );
}
