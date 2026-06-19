import { useEffect, useRef, useState } from 'react';
import {
  cleanupOldSessions,
  getRecoverableSessions,
  saveSession,
  migrateLegacyAutosave,
  type SessionMetadata,
} from '../services/sessionStore';

const AUTOSAVE_DEBOUNCE_MS = 1000;

export function useAutosave(
  sessionId: string,
  currentText: string,
  enabled: boolean,
  isSecondaryInstance: boolean,
  isChecking: boolean,
  onBackupsFound: (sessions: SessionMetadata[]) => void
) {
  const [hasChecked, setHasChecked] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial Load: Migrate, Cleanup, and check for backups sequentially
  useEffect(() => {
    if (isChecking || hasChecked) return;
    
    let isMounted = true;
    
    async function initAutosave() {
      try {
        await migrateLegacyAutosave();
        await cleanupOldSessions();
        
        if (!isSecondaryInstance) {
          const backups = await getRecoverableSessions();
          if (isMounted && backups.length > 0) {
            onBackupsFound(backups);
          }
        }
      } catch (err) {
        console.error('Error during autosave initialization', err);
      } finally {
        if (isMounted) {
          setHasChecked(true);
        }
      }
    }

    initAutosave();

    return () => {
      isMounted = false;
    };
  }, [hasChecked, isChecking, isSecondaryInstance, onBackupsFound]);

  // Debounced save
  useEffect(() => {
    if (!hasChecked || isChecking || !enabled) return;

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      saveSession(sessionId, currentText).catch(err => {
        console.error('Failed to autosave session', err);
      });
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [currentText, sessionId, hasChecked, isChecking, enabled]);
}
