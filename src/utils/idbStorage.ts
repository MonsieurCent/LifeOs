/**
 * High-Performance Durable IndexedDB Storage Engine for LifeOS
 * Eliminates localStorage 5MB quota restrictions and main-thread synchronous blocking.
 * Serves as the authoritative canonical local data store for workouts, plans, programs, and measurements.
 */

const DB_NAME = "LifeOS_Durable_Store";
const DB_VERSION = 1;
const STORE_NAME = "keyval";

// In-memory fallback for SSR or test environments lacking window.indexedDB
const memoryStore = new Map<string, any>();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      return reject(new Error("IndexedDB is not supported in this environment"));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error("Failed to open IndexedDB"));
    };
  });
}

/**
 * Set an item in IndexedDB with fallback to memory and localStorage
 */
export async function idbSet<T = any>(key: string, value: T): Promise<void> {
  memoryStore.set(key, value);
  try {
    const db = await openDatabase();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    // Graceful fallback for non-IndexedDB environments
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      }
    } catch (e) {
      // Memory store already holds the value
    }
  }
}

/**
 * Get an item from IndexedDB with fallback
 */
export async function idbGet<T = any>(key: string): Promise<T | null> {
  try {
    const db = await openDatabase();
    return new Promise<T | null>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        if (request.result !== undefined) {
          memoryStore.set(key, request.result);
          resolve(request.result as T);
        } else {
          // Check memory fallback
          if (memoryStore.has(key)) {
            resolve(memoryStore.get(key) as T);
            return;
          }
          // Check fallback in localStorage
          if (typeof localStorage !== "undefined") {
            const raw = localStorage.getItem(key);
            if (raw) {
              try {
                const parsed = JSON.parse(raw) as T;
                memoryStore.set(key, parsed);
                resolve(parsed);
                return;
              } catch {
                resolve(raw as unknown as T);
                return;
              }
            }
          }
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    if (memoryStore.has(key)) {
      return memoryStore.get(key) as T;
    }
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          return JSON.parse(raw) as T;
        } catch {
          return raw as unknown as T;
        }
      }
    }
    return null;
  }
}

/**
 * Delete an item from IndexedDB and local memory
 */
export async function idbDel(key: string): Promise<void> {
  memoryStore.delete(key);
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {}

  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
    }
  } catch {}
}

/**
 * Query all key-value pairs matching a given key prefix
 */
export async function idbGetByPrefix<T = any>(prefix: string): Promise<{ key: string; value: T }[]> {
  const results: { key: string; value: T }[] = [];
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const keyStr = String(cursor.key);
          if (keyStr.startsWith(prefix)) {
            results.push({ key: keyStr, value: cursor.value as T });
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
    return results;
  } catch {
    // Memory store fallback
    for (const [k, v] of memoryStore.entries()) {
      if (k.startsWith(prefix)) {
        results.push({ key: k, value: v as T });
      }
    }
    return results;
  }
}

/**
 * Clears all items in the database
 */
export async function idbClearAll(): Promise<void> {
  memoryStore.clear();
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {}
}

