/**
 * v10: Internet ke baghair bhi app khule.
 * - Har dafa data aaye to phone / PC mein (IndexedDB) save hota hai; agli dafa internet na ho to wahi dikhta hai.
 * - Internet na ho to bheja gaya message "outbox" mein rehta hai (WhatsApp ki tarah 🕓),
 *   aur internet aate hi khud chala jata hai.
 */
const DB = 'khr-offline';
const STORE = 'snap';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no idb'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function loadSnapshot<T>(uid: string): Promise<T | null> {
  try {
    const db = await open();
    return await new Promise<T | null>((resolve) => {
      const q = db.transaction(STORE, 'readonly').objectStore(STORE).get(uid);
      q.onsuccess = () => resolve((q.result as T) ?? null);
      q.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveSnapshot(uid: string, data: unknown): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data, uid);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    /* storage band ho to koi baat nahi */
  }
}

/** logout par is device se purana data hata do */
export async function clearSnapshot(uid: string): Promise<void> {
  try {
    const db = await open();
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete(uid);
  } catch {
    /* koi baat nahi */
  }
  try {
    localStorage.removeItem(outboxKey(uid));
  } catch {
    /* koi baat nahi */
  }
}

/* ---------------- outbox (pending messages) ---------------- */
export type OutKind = 'srv' | 'dm' | 'msg';
export interface OutItem {
  lid: string;                 // local id (local-...)
  kind: OutKind;
  created_at: string;
  payload: Record<string, unknown>;   // jo row insert honi hai
  failed?: string;             // internet ke ilawa koi ghalti (misal ijazat nahi)
}

const outboxKey = (uid: string) => 'khr-outbox-' + uid;

export function loadOutbox(uid: string): OutItem[] {
  try {
    return JSON.parse(localStorage.getItem(outboxKey(uid)) || '[]') as OutItem[];
  } catch {
    return [];
  }
}
export function saveOutbox(uid: string, items: OutItem[]) {
  try {
    localStorage.setItem(outboxKey(uid), JSON.stringify(items));
  } catch {
    /* storage band */
  }
}

export const newLocalId = () => 'local-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
export const isLocalId = (id: string | null | undefined) => !!id && id.startsWith('local-');

/** internet / server tak na pahunchne wali ghalti? (aisi ghalti par message queue mein rehta hai) */
export function isNetErr(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = String((e as { message?: string })?.message || e || '');
  return /Failed to fetch|NetworkError|Network request failed|Load failed|fetch failed|ERR_INTERNET|ERR_NETWORK|timed? ?out|aborted/i.test(msg);
}
