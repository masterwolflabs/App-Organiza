'use client';

/**
 * Voice notes that can't get lost (Emanuel, 2026-10-28: "lo que grabé quedó", like Apple's Notas de voz).
 * Every second of a recording is written to IndexedDB on this device while it records, so a closed tab,
 * a crash, a lost connection or a failed upload never loses the audio. A session is deleted only after its
 * file is safely in Storage. Works offline; everything is wrapped in try/catch (private mode / blocked
 * storage just means "no safety net", never an error for the user).
 */

export type VoiceSession = {
  id: string;
  mime: string;
  startedAt: string;
  seconds: number;
  transcript: string;
  /** true = the recording ended (finished, waiting to upload); false = it was cut mid-recording. */
  finished: boolean;
};

const DB = 'mf-voice-notes';
let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(store: 'sessions' | 'chunks', mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  return open().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const tx = db.transaction(store, mode);
          const req = fn(tx.objectStore(store));
          tx.oncomplete = () => resolve(req ? (req.result as T) : null);
          tx.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );
}

const range = (id: string) => IDBKeyRange.bound(`${id}:`, `${id}:￿`);

export const voiceVault = {
  saveSession: (s: VoiceSession) => run('sessions', 'readwrite', (st) => st.put(s)),
  getSession: (id: string) => run<VoiceSession>('sessions', 'readonly', (st) => st.get(id)),
  listSessions: async () => ((await run<VoiceSession[]>('sessions', 'readonly', (st) => st.getAll())) ?? []).sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
  addChunk: (id: string, n: number, blob: Blob) => run('chunks', 'readwrite', (st) => st.put(blob, `${id}:${String(n).padStart(6, '0')}`)),
  /** The whole recording as one file (chunks in order). */
  async blob(id: string): Promise<Blob | null> {
    const s = await voiceVault.getSession(id);
    const parts = (await run<Blob[]>('chunks', 'readonly', (st) => st.getAll(range(id)))) ?? [];
    if (!parts.length) return null;
    return new Blob(parts, { type: s?.mime || parts[0].type || 'audio/webm' });
  },
  async remove(id: string) {
    await run('sessions', 'readwrite', (st) => st.delete(id));
    await run('chunks', 'readwrite', (st) => st.delete(range(id)));
  },
};

export const extOfMime = (mime: string) => (/mp4|m4a|aac/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : /wav/.test(mime) ? 'wav' : 'webm');

export const clock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
