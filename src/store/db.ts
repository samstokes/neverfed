import type { AppData } from '../model/types';
import { migrate } from './migrate';

// The whole store is a few KB, so it's kept as one document under one key.
const DB_NAME = 'neverfed';
const STORE = 'kv';
const KEY = 'data';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbPromise ??= open();
  return dbPromise;
}

export async function load(): Promise<AppData> {
  const conn = await db();
  const raw = await new Promise<unknown>((resolve, reject) => {
    const req = conn.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return migrate(raw);
}

export async function save(data: AppData): Promise<void> {
  const conn = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = conn.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(data, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Ask the browser not to evict our data under storage pressure. Best effort. */
export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // Not supported; export/import is the backup story anyway.
  }
}
