import { useEffect, useMemo, useRef, useState } from 'react';
import {
  auditMusicBraille,
  diffBrfLines,
  extractCorrectedBrfFromAiResponse,
  type AuditIssue,
  type DiffLine,
  type MusicBrailleAuditResult,
} from '../utils/musicBrailleAudit';

export type AuditProgressStep =
  | 'idle'
  | 'math'
  | 'octave'
  | 'corruption'
  | 'hands'
  | 'done'
  | 'error';

interface MusicBrailleAuditModalProps {
  brfText: string;
  onClose: () => void;
  /** Write corrected BRF into the active editor buffer. */
  onApplyFixes: (correctedBrf: string) => void;
  /** Reveal a finding at a source character index in the editor. */
  onJumpToChar?: (charIndex: number) => void;
}

const PROGRESS_LABELS: Record<Exclude<AuditProgressStep, 'idle' | 'done' | 'error'>, string> = {
  math: 'Checking measure math against time signature…',
  octave: 'Checking octave marks on leaps of a fourth or larger…',
  corruption: 'Scanning for garbled ASCII artifacts…',
  hands: 'Verifying Right Hand / Left Hand bar-over-bar alignment…',
};

const ISSUE_TYPE_LABEL: Record<AuditIssue['issueType'], string> = {
  measure_imbalance: 'Measure math',
  missing_octave: 'Missing octave',
  corruption: 'Corruption',
  hand_alignment: 'Hand alignment',
  accidental_scope: 'Accidental scope',
  info: 'Info',
};

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textArea);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Review drawer/modal for "Audit Music BRF".
 * Runs a local structural linter with staged progress, builds a copyable AI
 * payload (including local findings), shows a measure-by-measure issue table,
 * and offers Apply Fixes for local or pasted AI corrections.
 */
export function MusicBrailleAuditModal({
  brfText,
  onClose,
  onApplyFixes,
  onJumpToChar,
}: MusicBrailleAuditModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [step, setStep] = useState<AuditProgressStep>('idle');
  const [result, setResult] = useState<MusicBrailleAuditResult | null>(null);
  const [proposedBrf, setProposedBrf] = useState<string | null>(null);
  const [aiPaste, setAiPaste] = useState('');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [applyStatus, setApplyStatus] = useState<'idle' | 'applied'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Staged local audit so the UI shows real-time progress.
  useEffect(() => {
    let cancelled = false;
    const steps: Array<Exclude<AuditProgressStep, 'idle' | 'done' | 'error'>> = [
      'math',
      'octave',
      'corruption',
      'hands',
    ];

    async function run() {
      try {
        if (!brfText.trim()) {
          setErrorMessage('No Music Braille BRF is loaded in the editor.');
          setStep('error');
          return;
        }
        for (const s of steps) {
          if (cancelled) return;
          setStep(s);
          await new Promise((r) => setTimeout(r, 180));
        }
        if (cancelled) return;
        const audit = auditMusicBraille(brfText);
        setResult(audit);
        setProposedBrf(audit.correctedBrf);
        setStep('done');
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : 'Audit failed.');
        setStep('error');
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [brfText]);

  const diffLines: DiffLine[] = useMemo(() => {
    if (!result || !proposedBrf) return [];
    if (proposedBrf === result.asciiBrf) return [];
    return diffBrfLines(result.asciiBrf, proposedBrf);
  }, [result, proposedBrf]);

  const tableIssues = useMemo(() => {
    if (!result) return [];
    return result.issues.filter((i) => i.severity !== 'info' || i.issueType === 'accidental_scope');
  }, [result]);

  async function handleCopyPayload() {
    if (!result) return;
    const ok = await copyText(result.aiPayload);
    setCopyStatus(ok ? 'copied' : 'failed');
    setTimeout(() => setCopyStatus('idle'), 2000);
  }

  function handleParseAiPaste() {
    const extracted = extractCorrectedBrfFromAiResponse(aiPaste);
    if (extracted) {
      setProposedBrf(extracted);
      setApplyStatus('idle');
    } else {
      setErrorMessage(
        'Could not find a corrected BRF block in the pasted response. Use --- BEGIN BRF --- fences or a ```brf code block.',
      );
    }
  }

  function handleApply() {
    if (!proposedBrf?.trim()) return;
    onApplyFixes(proposedBrf);
    setApplyStatus('applied');
  }

  function handleJumpToIssue(issue: AuditIssue) {
    if (issue.charIndex == null || !onJumpToChar) return;
    onJumpToChar(issue.charIndex);
  }

  const progressPct =
    step === 'done' || step === 'error'
      ? 100
      : step === 'idle'
        ? 0
        : ({ math: 25, octave: 50, corruption: 75, hands: 90 } as const)[step];

  return (
    <div
      className="welcome-overlay music-braille-audit-overlay"
      onClick={onClose}
      aria-label="Close Music BRF audit"
    >
      <div
        className="welcome-modal music-braille-audit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="music-braille-audit-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="welcome-header">
          <h2 id="music-braille-audit-title">Audit Music BRF</h2>
          <button
            ref={closeBtnRef}
            className="welcome-close"
            onClick={onClose}
            aria-label="Close Music BRF audit"
            type="button"
          >
            ✕
          </button>
        </header>

        <div className="welcome-body music-braille-audit-body">
          <section className="music-braille-audit-progress" aria-live="polite">
            <div className="music-braille-audit-progress-label">
              {step === 'done'
                ? 'Local audit complete. Review findings or send the AI payload for a specialist pass.'
                : step === 'error'
                  ? errorMessage ?? 'Audit error'
                  : step === 'idle'
                    ? 'Starting audit…'
                    : PROGRESS_LABELS[step]}
            </div>
            <div
              className="music-braille-audit-progress-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPct}
            >
              <div
                className="music-braille-audit-progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </section>

          {result && step === 'done' && (
            <>
              <section className="music-braille-audit-summary">
                <p>
                  <strong>{result.criticalCount}</strong> critical ·{' '}
                  <strong>{result.warningCount}</strong> warning ·{' '}
                  {result.score.totalMeasures} measures · meter{' '}
                  {result.score.timeSignature.beatsPerMeasure}/
                  {result.score.timeSignature.beatUnit}
                </p>
                <div className="music-braille-audit-actions">
                  <button
                    type="button"
                    className="toolbar-btn toolbar-btn--primary"
                    onClick={() => void handleCopyPayload()}
                  >
                    {copyStatus === 'copied'
                      ? 'Copied AI payload'
                      : copyStatus === 'failed'
                        ? 'Copy failed'
                        : 'Copy AI audit payload'}
                  </button>
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={handleApply}
                    disabled={!proposedBrf?.trim() || proposedBrf === result.asciiBrf}
                  >
                    {applyStatus === 'applied' ? 'Applied' : 'Apply Fixes'}
                  </button>
                </div>
              </section>

              <section aria-labelledby="audit-issues-heading">
                <h3 id="audit-issues-heading">Measure-by-measure findings</h3>
                {tableIssues.length === 0 ? (
                  <p className="music-braille-audit-empty">
                    No critical structural issues detected by the local linter.
                    Copy the AI payload for a deeper specialist review.
                  </p>
                ) : (
                  <>
                    <p className="music-braille-audit-hint">
                      Click a finding with a known location to jump to that cell in the editor.
                    </p>
                    <div className="music-braille-audit-table-wrap">
                      <table className="music-braille-audit-table">
                        <thead>
                          <tr>
                            <th scope="col">Measure</th>
                            <th scope="col">Error type</th>
                            <th scope="col">Severity</th>
                            <th scope="col">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tableIssues.map((issue) => {
                            const canJump =
                              issue.charIndex != null && typeof onJumpToChar === 'function';
                            return (
                              <tr
                                key={issue.id}
                                className={`music-braille-audit-row music-braille-audit-row--${issue.severity}${
                                  canJump ? ' music-braille-audit-row--jumpable' : ''
                                }`}
                                tabIndex={canJump ? 0 : undefined}
                                role={canJump ? 'button' : undefined}
                                aria-label={
                                  canJump
                                    ? `Jump to ${ISSUE_TYPE_LABEL[issue.issueType]} in measure ${
                                        issue.measure ?? 'unknown'
                                      }`
                                    : undefined
                                }
                                onClick={() => handleJumpToIssue(issue)}
                                onKeyDown={(e) => {
                                  if (!canJump) return;
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleJumpToIssue(issue);
                                  }
                                }}
                              >
                                <td>{issue.measure ?? '—'}</td>
                                <td>{ISSUE_TYPE_LABEL[issue.issueType]}</td>
                                <td>{issue.severity}</td>
                                <td>{issue.description}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>

              <section aria-labelledby="audit-diff-heading">
                <h3 id="audit-diff-heading">Proposed BRF corrections</h3>
                {diffLines.length === 0 ? (
                  <p className="music-braille-audit-empty">
                    No local auto-fixes available yet. Paste an AI response below
                    to preview a corrected BRF diff.
                  </p>
                ) : (
                  <pre
                    className="music-braille-audit-diff"
                    tabIndex={0}
                    aria-label="BRF visual diff"
                  >
                    {diffLines.map((line, idx) => (
                      <div
                        key={`${line.type}-${idx}`}
                        className={`music-braille-audit-diff-line music-braille-audit-diff-line--${line.type}`}
                      >
                        <span className="music-braille-audit-diff-gutter" aria-hidden="true">
                          {line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '}
                        </span>
                        <span className="music-braille-audit-diff-text">
                          {line.text || ' '}
                        </span>
                      </div>
                    ))}
                  </pre>
                )}
              </section>

              <section aria-labelledby="audit-paste-heading">
                <h3 id="audit-paste-heading">Paste AI response</h3>
                <p className="music-braille-audit-hint">
                  After running the copied payload in an external AI chat, paste
                  the reply here. Corrected BRF should be inside{' '}
                  <code>--- BEGIN BRF ---</code> fences or a{' '}
                  <code>```brf</code> block.
                </p>
                <textarea
                  className="music-braille-audit-paste"
                  value={aiPaste}
                  onChange={(e) => {
                    setAiPaste(e.target.value);
                    setErrorMessage(null);
                  }}
                  rows={6}
                  spellCheck={false}
                  aria-label="Paste AI audit response"
                  placeholder="Paste the AI auditor response…"
                />
                <div className="music-braille-audit-actions">
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={handleParseAiPaste}
                    disabled={!aiPaste.trim()}
                  >
                    Load corrected BRF from paste
                  </button>
                </div>
                {errorMessage && step === 'done' ? (
                  <p className="status-err" role="alert">
                    {errorMessage}
                  </p>
                ) : null}
              </section>
            </>
          )}
        </div>

        <footer className="welcome-footer music-braille-audit-footer">
          <button type="button" className="toolbar-btn" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
