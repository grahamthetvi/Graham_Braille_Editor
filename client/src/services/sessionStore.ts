import {
  METADATA_STORE,
  CONTENTS_STORE,
  getFromStore,
  putToStore,
  deleteFromStore,
  getAllFromStore,
  clearStore,
} from './db';

const INDEX_KEY = 'graham-braille-editor-sessions-index';
const LEGACY_AUTOSAVE_KEY = 'graham-braille-editor-text-backup';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionMetadata {
  id: string;
  preview: string;
  updatedAt: number;
  isExported: boolean;
}

export function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export async function cleanupOldSessions(): Promise<void> {
  try {
    const index = await getAllFromStore<SessionMetadata>(METADATA_STORE);
    const now = Date.now();
    
    for (const session of index) {
      const isExpired = (now - session.updatedAt) > THIRTY_DAYS_MS;
      if (isExpired) {
        await discardSession(session.id);
      }
    }
  } catch (err) {
    console.error('Failed to cleanup old sessions', err);
  }
}

export async function getRecoverableSessions(): Promise<SessionMetadata[]> {
  try {
    const index = await getAllFromStore<SessionMetadata>(METADATA_STORE);
    return index
      .filter(s => (s.preview || "").trim() !== "")
      .sort((a, b) => b.updatedAt - a.updatedAt); // Newest first
  } catch (err) {
    console.error('Failed to get recoverable sessions', err);
    return [];
  }
}

export async function getSessionText(id: string): Promise<string | null> {
  try {
    const item = await getFromStore<{ id: string; text: string }>(CONTENTS_STORE, id);
    return item ? item.text : null;
  } catch (err) {
    console.error(`Failed to get session text for ID: ${id}`, err);
    return null;
  }
}

export async function saveSession(id: string, text: string): Promise<void> {
  const trimmed = text.trim();
  
  if (trimmed === "") {
    await discardSession(id);
    return;
  }
  
  // Extract a clean preview (ignore empty lines and markdown headers/bullet markers)
  const lines = trimmed.split(/\r?\n/);
  let firstLine = '';
  for (const line of lines) {
    const cleaned = line.trim();
    if (cleaned !== "") {
      firstLine = cleaned.replace(/^(?:#+\s*|[-*+]\s*)/, '');
      if (firstLine !== "") {
        break;
      }
    }
  }
  
  const preview = firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;
  const updatedAt = Date.now();

  try {
    const existingMetadata = await getFromStore<SessionMetadata>(METADATA_STORE, id);
    const metadata: SessionMetadata = {
      id,
      preview,
      updatedAt,
      isExported: existingMetadata ? existingMetadata.isExported : false,
    };
    
    await putToStore(METADATA_STORE, metadata);
    await putToStore(CONTENTS_STORE, { id, text });
  } catch (err) {
    console.error(`Failed to save session for ID: ${id}`, err);
  }
}

export async function markExported(id: string): Promise<void> {
  try {
    const metadata = await getFromStore<SessionMetadata>(METADATA_STORE, id);
    if (metadata) {
      metadata.isExported = true;
      metadata.updatedAt = Date.now();
      await putToStore(METADATA_STORE, metadata);
    }
  } catch (err) {
    console.error(`Failed to mark session as exported for ID: ${id}`, err);
  }
}

export async function discardSession(id: string): Promise<void> {
  try {
    await deleteFromStore(METADATA_STORE, id);
    await deleteFromStore(CONTENTS_STORE, id);
  } catch (err) {
    console.error(`Failed to discard session for ID: ${id}`, err);
  }
}

export async function discardAllSessions(): Promise<void> {
  try {
    await clearStore(METADATA_STORE);
    await clearStore(CONTENTS_STORE);
  } catch (err) {
    console.error('Failed to discard all sessions', err);
  }
}

export async function migrateLegacyAutosave(): Promise<void> {
  // 1. Migrate sessions index
  try {
    const rawIndex = localStorage.getItem(INDEX_KEY);
    if (rawIndex) {
      const index = JSON.parse(rawIndex) as SessionMetadata[];
      for (const session of index) {
        const text = localStorage.getItem(`graham-braille-editor-session-${session.id}`);
        if (text && text.trim()) {
          await putToStore(METADATA_STORE, session);
          await putToStore(CONTENTS_STORE, { id: session.id, text });
        }
        localStorage.removeItem(`graham-braille-editor-session-${session.id}`);
      }
    }
  } catch (err) {
    console.error('Failed to migrate legacy session index', err);
  }
  localStorage.removeItem(INDEX_KEY);

  // 2. Migrate legacy single backup text
  try {
    const legacyText = localStorage.getItem(LEGACY_AUTOSAVE_KEY);
    if (legacyText && legacyText.trim()) {
      const id = generateSessionId();
      await saveSession(id, legacyText);
    }
  } catch (err) {
    console.error('Failed to migrate legacy single backup', err);
  }
  localStorage.removeItem(LEGACY_AUTOSAVE_KEY);
}
