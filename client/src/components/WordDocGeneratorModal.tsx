import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  generateWordDocument,
  WordDocCancelled,
  WordDocInfrastructureError,
  WordDocTimeout,
} from '../services/wordDocPythonClient';
import { DocxImportError, importDocxToEditorText } from '../utils/docxImport';
import {
  WORD_DOC_OUTPUT_MAX_BYTES,
  WORD_DOC_SAMPLE_PY,
  WORD_DOC_SOURCE_MAX_CHARS,
  classifyWordDocError,
  prepareWordDocSource,
  type GeneratedWordFile,
  type WordDocPhase,
  type WordDocSourceIssue,
} from '../utils/wordDocPython';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface WordDocGeneratorModalProps {
  onInsertText: (text: string) => void;
  onClose: () => void;
}

function downloadWordFile(file: GeneratedWordFile): void {
  const buffer = file.bytes.buffer.slice(
    file.bytes.byteOffset,
    file.bytes.byteOffset + file.bytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([buffer], { type: DOCX_MIME });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function WordDocGeneratorModal({ onInsertText, onClose }: WordDocGeneratorModalProps) {
  const { t } = useTranslation();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const copiedTimer = useRef<number | null>(null);
  const [code, setCode] = useState(WORD_DOC_SAMPLE_PY);
  const [phase, setPhase] = useState<WordDocPhase | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [errorText, setErrorText] = useState('');
  const [traceback, setTraceback] = useState('');
  const [stdout, setStdout] = useState('');
  const [files, setFiles] = useState<GeneratedWordFile[]>([]);
  const [copied, setCopied] = useState(false);
  const [openingName, setOpeningName] = useState<string | null>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    };
  }, []);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        abortRef.current?.abort();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function phaseMessage(current: WordDocPhase): string {
    switch (current) {
      case 'loading-runtime':
        return t('wordDocGenerator.status.loadingRuntime');
      case 'installing-library':
        return t('wordDocGenerator.status.installingLibrary');
      case 'running':
        return t('wordDocGenerator.status.running');
      default: {
        const unexpected: never = current;
        return unexpected;
      }
    }
  }

  function sourceIssueMessage(issue: WordDocSourceIssue): string {
    switch (issue) {
      case 'empty':
        return t('wordDocGenerator.errors.empty');
      case 'too-long':
        return t('wordDocGenerator.errors.tooLong', { limit: WORD_DOC_SOURCE_MAX_CHARS });
      default: {
        const unexpected: never = issue;
        return unexpected;
      }
    }
  }

  function handleClose() {
    abortRef.current?.abort();
    onClose();
  }

  async function handleCopyPrompt() {
    const prompt = t('wordDocGenerator.geminiPrompt');
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      const area = document.createElement('textarea');
      area.value = prompt;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    setCopied(true);
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
  }

  async function handleGenerate() {
    const prepared = prepareWordDocSource(code);
    if ('issue' in prepared) {
      setErrorText(sourceIssueMessage(prepared.issue));
      setTraceback('');
      setFiles([]);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setErrorText('');
    setTraceback('');
    setStdout('');
    setFiles([]);
    setStatus(phaseMessage('loading-runtime'));
    setPhase('loading-runtime');

    try {
      const result = await generateWordDocument(prepared.source, {
        signal: controller.signal,
        onProgress: (next) => {
          setPhase(next);
          setStatus(phaseMessage(next));
        },
      });
      if (controller.signal.aborted) return;
      setStdout(result.stdout);
      setFiles(result.files);
      const kind = classifyWordDocError(result.error);
      switch (kind) {
        case 'none':
          break;
        case 'no-docx':
          setErrorText(t('wordDocGenerator.errors.noDocx'));
          break;
        case 'traceback':
          setErrorText(t('wordDocGenerator.errors.script'));
          setTraceback(result.error);
          break;
        default: {
          const unexpected: never = kind;
          setErrorText(unexpected);
        }
      }
      if (result.ok && result.files.length === 1) {
        const file = result.files[0];
        if (file) {
          downloadWordFile(file);
          setStatus(t('wordDocGenerator.status.success', { name: file.name }));
        }
      } else if (result.files.length > 1) {
        setStatus(t('wordDocGenerator.status.successMany', { count: result.files.length }));
      } else if (!result.error) {
        setErrorText(t('wordDocGenerator.errors.noDocx'));
        setStatus('');
      } else {
        setStatus('');
      }
    } catch (err) {
      if (err instanceof WordDocCancelled || controller.signal.aborted) return;
      if (err instanceof WordDocTimeout) {
        setErrorText(t('wordDocGenerator.errors.timeout'));
      } else if (err instanceof WordDocInfrastructureError) {
        if (err.message === 'OUTPUT_TOO_LARGE') {
          setErrorText(
            t('wordDocGenerator.errors.outputTooLarge', {
              limitMb: Math.round(WORD_DOC_OUTPUT_MAX_BYTES / (1024 * 1024)),
            }),
          );
        } else if (!err.duringRun) {
          setErrorText(t('wordDocGenerator.errors.loadFailed'));
          setTraceback(err.message);
        } else {
          setErrorText(t('wordDocGenerator.errors.generic'));
          setTraceback(err.message);
        }
      } else {
        setErrorText(t('wordDocGenerator.errors.generic'));
      }
      setStatus('');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
      setPhase(null);
    }
  }

  async function handleOpenInEditor(file: GeneratedWordFile) {
    setOpeningName(file.name);
    setErrorText('');
    try {
      const buffer = file.bytes.buffer.slice(
        file.bytes.byteOffset,
        file.bytes.byteOffset + file.bytes.byteLength,
      ) as ArrayBuffer;
      const { text } = await importDocxToEditorText(buffer);
      onInsertText(text);
    } catch (err) {
      if (err instanceof DocxImportError && err.code === 'empty') {
        setErrorText(t('wordDocGenerator.errors.importEmpty'));
      } else {
        setErrorText(t('wordDocGenerator.errors.importFailed'));
      }
    } finally {
      setOpeningName(null);
    }
  }

  return (
    <div className="welcome-overlay" onClick={handleClose}>
      <div
        className="welcome-modal word-doc-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="word-doc-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="welcome-header">
          <h2 id="word-doc-title" tabIndex={-1} ref={titleRef}>
            {t('wordDocGenerator.title')}
          </h2>
          <button className="welcome-close" onClick={handleClose} aria-label={t('wordDocGenerator.close')}>
            ✕
          </button>
        </header>
        <div className="welcome-body word-doc-body">
          <p className="word-doc-note">{t('wordDocGenerator.intro')}</p>
          <p className="word-doc-note">{t('wordDocGenerator.privacyNote')}</p>
          <label className="word-doc-label" htmlFor="word-doc-python">
            {t('wordDocGenerator.codeLabel')}
          </label>
          <textarea
            id="word-doc-python"
            className="word-doc-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            spellCheck={false}
            disabled={running}
            aria-invalid={errorText ? true : undefined}
          />
          <div className="word-doc-actions">
            <button
              type="button"
              className="toolbar-btn toolbar-btn--primary"
              onClick={() => void handleGenerate()}
              disabled={running}
              aria-busy={running}
            >
              {running ? t('wordDocGenerator.generating') : t('wordDocGenerator.generate')}
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => setCode(WORD_DOC_SAMPLE_PY)}
              disabled={running}
            >
              {t('wordDocGenerator.example')}
            </button>
            <button type="button" className="toolbar-btn" onClick={() => void handleCopyPrompt()} disabled={running}>
              {copied ? t('wordDocGenerator.copied') : t('wordDocGenerator.copyPrompt')}
            </button>
          </div>
          {status && (
            <p className="word-doc-status" role="status">
              {phase ? phaseMessage(phase) : status}
            </p>
          )}
          {errorText && (
            <p className="word-doc-error-lead" role="alert">
              {errorText}
            </p>
          )}
          {traceback && <pre className="word-doc-error">{traceback}</pre>}
          {stdout && (
            <details className="word-doc-output">
              <summary>{t('wordDocGenerator.outputLabel')}</summary>
              <pre className="word-doc-error">{stdout}</pre>
            </details>
          )}
          {files.length > 0 && (
            <ul className="word-doc-files">
              {files.map((file) => (
                <li key={file.name} className="word-doc-file-row">
                  <button type="button" className="toolbar-btn" onClick={() => downloadWordFile(file)}>
                    {t('wordDocGenerator.downloadAgain', { name: file.name })}
                  </button>
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => void handleOpenInEditor(file)}
                    disabled={openingName !== null}
                  >
                    {t('wordDocGenerator.openInEditor')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {files.length > 0 && <p className="word-doc-note">{t('wordDocGenerator.openInEditorHint')}</p>}
        </div>
      </div>
    </div>
  );
}
