// Browser storage for cached engine reviews. localStorage holds only about 5 MB,
// which a few hundred reviewed games fill, so reviews live in IndexedDB (far larger).
// If storage still fails (private mode, disk full), reviews are kept in memory for
// the visit and `useStorageProblem` lets the UI say so instead of failing silently.
import { useSyncExternalStore } from "react";

const DB_NAME = "chess-analyzer";
const STORE = "kv";

const memory = new Map<string, unknown>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

let problem: string | null = null;
const listeners = new Set<() => void>();

/** Records that something couldn't be saved, so the UI can tell the user. */
export function reportStorageProblem(message: string): void {
  if (problem === message) return;
  problem = message;
  listeners.forEach((l) => l());
}

/** The current storage problem (null when everything is being saved). */
export function useStorageProblem(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => problem,
  );
}

function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function request<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = run(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function storeGet<T>(key: string): Promise<T | undefined> {
  if (memory.has(key)) return memory.get(key) as T;
  const db = await openDb();
  if (!db) return undefined;
  try {
    return (await request(db, "readonly", (s) => s.get(key))) as T | undefined;
  } catch {
    return undefined;
  }
}

export async function storeSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  if (db) {
    try {
      await request(db, "readwrite", (s) => s.put(value, key));
      memory.delete(key);
      return;
    } catch {
      // fall through to memory
    }
  }
  memory.set(key, value);
  reportStorageProblem("Your browser couldn't save engine reviews (storage is full or unavailable), so they will be lost when you close this page.");
}

/** Removes the old localStorage review cache, which could fill the browser's quota. */
export function purgeLegacyReviews(): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("chess-analyzer:review:")) localStorage.removeItem(k);
  } catch {
    // storage unavailable: nothing to clean
  }
}
