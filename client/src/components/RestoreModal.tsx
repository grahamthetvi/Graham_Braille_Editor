import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { SessionMetadata } from '../services/sessionStore';

interface RestoreModalProps {
  sessions: SessionMetadata[];
  onRestore: (id: string) => void;
  onDiscardItem: (id: string) => void;
  onDiscardAll: () => void;
  onClose: () => void;
}

export function RestoreModal({ sessions, onRestore, onDiscardItem, onDiscardAll, onClose }: RestoreModalProps) {
  const { t } = useTranslation();
  const primaryBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the primary button when opened
  useEffect(() => {
    primaryBtnRef.current?.focus();
  }, []);

  return (
    <div
      className="welcome-overlay"
      aria-label={t('restore.ariaLabel')}
      onClick={onClose}
    >
      <div
        className="welcome-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="restore-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '600px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        <header className="welcome-header">
          <h2 id="restore-title">{t('restore.title')}</h2>
          <button
            className="welcome-close"
            onClick={onClose}
            aria-label={t('restore.closeAriaLabel')}
          >
            ✕
          </button>
        </header>

        <div className="welcome-body" style={{ padding: '1rem 2rem', overflowY: 'auto' }}>
          {sessions.length === 0 ? (
            <p>{t('restore.empty')}</p>
          ) : (
            <>
              <p>{t('restore.description')}</p>
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {sessions.map(session => (
                  <div
                    key={session.id}
                    style={{
                      background: 'rgba(0,0,0,0.05)',
                      padding: '1rem',
                      borderRadius: '4px',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {t('restore.lastEditedPrefix')}{new Date(session.updatedAt).toLocaleString()}
                        </span>
                        {session.isExported ? (
                          <span style={{
                            fontSize: '0.65rem',
                            padding: '0.1rem 0.4rem',
                            background: 'color-mix(in srgb, var(--success) 15%, transparent)',
                            color: 'var(--success)',
                            border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)',
                            borderRadius: '3px',
                            fontWeight: 'bold',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                          }}>
                            {t('restore.exported')}
                          </span>
                        ) : (
                          <span style={{
                            fontSize: '0.65rem',
                            padding: '0.1rem 0.4rem',
                            background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                            color: 'var(--accent)',
                            border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                            borderRadius: '3px',
                            fontWeight: 'bold',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                          }}>
                            {t('restore.activeDraft')}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button 
                          className="welcome-btn-secondary" 
                          onClick={() => onDiscardItem(session.id)}
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', background: 'transparent' }}
                        >
                          {t('restore.discard')}
                        </button>
                        <button 
                          className="welcome-btn-primary" 
                          onClick={() => { onRestore(session.id); onClose(); }}
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                        >
                          {t('restore.restoreButton')}
                        </button>
                      </div>
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {session.preview || <em>{t('restore.emptyDocument')}</em>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <footer className="welcome-footer" style={{ gap: '1rem', padding: '1rem 2rem' }}>
          {sessions.length > 0 && (
            <button
              className="welcome-btn-secondary"
              onClick={() => {
                if (window.confirm(t('restore.confirmDiscardAll'))) {
                  onDiscardAll();
                }
              }}
              style={{
                background: 'transparent',
                color: 'var(--text-primary)',
              }}
            >
              {t('restore.discardAll')}
            </button>
          )}
          <button
            ref={primaryBtnRef}
            className="welcome-btn-primary"
            onClick={onClose}
          >
            {t('restore.closeButton')}
          </button>
        </footer>
      </div>
    </div>
  );
}
