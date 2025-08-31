import { Platform } from 'react-native';

// Simple cross-platform key/value store facade with sync API for this app.
// - Web: uses localStorage
// - Native: in-memory fallback (non-persistent) unless AsyncStorage is available

type Store = {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
};

const mem = new Map<string, string>();

function makeMemoryStore(): Store {
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k, v) => { mem.set(k, v); },
    removeItem: (k) => { mem.delete(k); },
  };
}

let store: Store;

if (Platform.OS === 'web') {
  // Browser localStorage
  try {
    const ls = (globalThis as any).localStorage as Storage | undefined;
    if (ls) {
      store = {
        getItem: (k) => {
          try { return ls.getItem(k); } catch { return null; }
        },
        setItem: (k, v) => { try { ls.setItem(k, v); } catch { /* ignore */ } },
        removeItem: (k) => { try { ls.removeItem(k); } catch { /* ignore */ } },
      };
    } else {
      store = makeMemoryStore();
    }
  } catch {
    store = makeMemoryStore();
  }
} else {
  // Try to use AsyncStorage if present, but expose sync-like behavior using a simple in-memory cache.
  // This avoids adding hard dependency while keeping app functional on native.
  let cache = makeMemoryStore();
  store = cache;
  // Optionally warm cache from AsyncStorage if available (best effort, no await API here)
  try {
    const AS = require('@react-native-async-storage/async-storage');
    const AsyncStorage: any = AS?.default ?? AS;
    if (AsyncStorage && typeof AsyncStorage.getAllKeys === 'function') {
      // Fire and forget hydration
      (async () => {
        try {
          const keys: string[] = await AsyncStorage.getAllKeys();
          const pairs: [string, string | null][] = await AsyncStorage.multiGet(keys);
          for (const [k, v] of pairs) if (typeof v === 'string') cache.setItem(k, v);
          // Bridge writes from our sync facade to AsyncStorage
          store = {
            getItem: (k) => cache.getItem(k),
            setItem: (k, v) => { cache.setItem(k, v); AsyncStorage.setItem(k, v).catch(() => {}); },
            removeItem: (k) => { cache.removeItem(k); AsyncStorage.removeItem(k).catch(() => {}); },
          };
        } catch {
          /* keep memory fallback */
        }
      })();
    }
  } catch {
    // Module not installed; memory fallback only
  }
}

export const storage = store;

