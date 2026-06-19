import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  saveSession,
  getSessionText,
  getRecoverableSessions,
  markExported,
  cleanupOldSessions,
  migrateLegacyAutosave,
} from './sessionStore';

const mockDbStore: Record<string, Map<string, any>> = {
  'session-metadata': new Map(),
  'session-contents': new Map(),
};

vi.mock('./db', () => {
  return {
    METADATA_STORE: 'session-metadata',
    CONTENTS_STORE: 'session-contents',
    getFromStore: vi.fn(async (storeName: string, id: string) => {
      return mockDbStore[storeName]?.get(id) || null;
    }),
    putToStore: vi.fn(async (storeName: string, item: any) => {
      mockDbStore[storeName]?.set(item.id, item);
    }),
    deleteFromStore: vi.fn(async (storeName: string, id: string) => {
      mockDbStore[storeName]?.delete(id);
    }),
    getAllFromStore: vi.fn(async (storeName: string) => {
      return Array.from(mockDbStore[storeName]?.values() || []);
    }),
    clearStore: vi.fn(async (storeName: string) => {
      mockDbStore[storeName]?.clear();
    }),
  };
});

describe('sessionStore with IndexedDB', () => {
  beforeEach(() => {
    mockDbStore['session-metadata'].clear();
    mockDbStore['session-contents'].clear();

    const store: Record<string, string> = {};
    global.localStorage = {
      getItem: vi.fn((key: string) => store[key] || null),
      setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
      removeItem: vi.fn((key: string) => { delete store[key]; }),
      clear: vi.fn(() => { for (const key in store) delete store[key]; }),
      length: 0,
      key: vi.fn((index: number) => Object.keys(store)[index] || null),
    };
  });

  it('saves session and extracts a clean preview', async () => {
    const text = '\n   \n # My Title \nSome more content';
    await saveSession('session-1', text);

    const metadata = mockDbStore['session-metadata'].get('session-1');
    expect(metadata).toBeDefined();
    expect(metadata.preview).toBe('My Title');

    const content = await getSessionText('session-1');
    expect(content).toBe(text);
  });

  it('marks a session as exported but retains text content', async () => {
    await saveSession('session-1', 'hello world');
    await markExported('session-1');

    const metadata = mockDbStore['session-metadata'].get('session-1');
    expect(metadata.isExported).toBe(true);

    const content = await getSessionText('session-1');
    expect(content).toBe('hello world');
  });

  it('orders sessions newest first', async () => {
    await saveSession('session-1', 'content 1');
    // fake time difference
    const meta1 = mockDbStore['session-metadata'].get('session-1');
    meta1.updatedAt = Date.now() - 5000;

    await saveSession('session-2', 'content 2');

    const list = await getRecoverableSessions();
    expect(list[0].id).toBe('session-2');
    expect(list[1].id).toBe('session-1');
  });

  it('cleans up sessions older than 30 days', async () => {
    await saveSession('session-1', 'content 1');
    await saveSession('session-2', 'content 2');

    const meta1 = mockDbStore['session-metadata'].get('session-1');
    meta1.updatedAt = Date.now() - (31 * 24 * 60 * 60 * 1000); // 31 days ago

    await cleanupOldSessions();

    const list = await getRecoverableSessions();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('session-2');
  });

  it('migrates legacy autosaves from localStorage', async () => {
    localStorage.setItem('graham-braille-editor-sessions-index', JSON.stringify([
      { id: 'legacy-1', preview: 'legacy preview', updatedAt: Date.now(), isExported: false }
    ]));
    localStorage.setItem('graham-braille-editor-session-legacy-1', 'legacy text');
    localStorage.setItem('graham-braille-editor-text-backup', 'legacy single backup text');

    await migrateLegacyAutosave();

    const text1 = await getSessionText('legacy-1');
    expect(text1).toBe('legacy text');

    const list = await getRecoverableSessions();
    // Should have migrated legacy-1 and the legacy single backup
    expect(list.length).toBe(2);

    expect(localStorage.getItem('graham-braille-editor-sessions-index')).toBeNull();
    expect(localStorage.getItem('graham-braille-editor-session-legacy-1')).toBeNull();
    expect(localStorage.getItem('graham-braille-editor-text-backup')).toBeNull();
  });
});
