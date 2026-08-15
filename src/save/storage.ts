/**
 * The only module in the game that names localStorage.
 *
 * Everything above this is a four-method interface, so IndexedDB or cloud sync
 * later is a new implementation rather than a rewrite.
 */

export const KEY_PREFIX = 'headcount.';

/**
 * localhost:5173 is shared with every other Vite project on the machine, so dev
 * builds keep their own key. Resolved here rather than in the pure schema module,
 * which must stay free of environment globals so it can be unit-tested in node.
 */
export const SAVE_KEY = `${KEY_PREFIX}save.main${import.meta.env.DEV ? '.dev' : ''}`;

export type StorageKind = 'local' | 'memory';

export interface StorageBackend {
  readonly kind: StorageKind;
  read(key: string): string | null;
  /** False on refusal. Never throws — a failed save is a notice, not a crash. */
  write(key: string, value: string): boolean;
  remove(key: string): void;
  wipeNamespace(): void;
}

/** Quota errors arrive under three different names across browsers and eras. */
export function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  const code = (error as unknown as { code?: number }).code;
  return code === 22 || code === 1014;
}

export function memoryBackend(): StorageBackend {
  const map = new Map<string, string>();
  return {
    kind: 'memory',
    read: (key) => map.get(key) ?? null,
    write: (key, value) => {
      map.set(key, value);
      return true;
    },
    remove: (key) => void map.delete(key),
    wipeNamespace: () => {
      for (const key of Array.from(map.keys())) {
        if (key.startsWith(KEY_PREFIX)) map.delete(key);
      }
    },
  };
}

function localBackend(store: Storage): StorageBackend {
  return {
    kind: 'local',
    read: (key) => {
      try {
        return store.getItem(key);
      } catch {
        return null;
      }
    },
    write: (key, value) => {
      try {
        store.setItem(key, value);
        return true;
      } catch {
        // Quota, or Safari private browsing, which gives a working-but-tiny store
        // that passes the boot probe and then throws on a real write.
        return false;
      }
    },
    remove: (key) => {
      try {
        store.removeItem(key);
      } catch {
        /* nothing useful to do */
      }
    },
    wipeNamespace: () => {
      try {
        const doomed: string[] = [];
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i);
          if (key !== null && key.startsWith(KEY_PREFIX)) doomed.push(key);
        }
        for (const key of doomed) store.removeItem(key);
      } catch {
        /* nothing useful to do */
      }
    },
  };
}

/**
 * Note what is inside the try: the `globalThis.localStorage` PROPERTY ACCESS, not
 * just the setItem. A sandboxed iframe with site data blocked throws SecurityError
 * on the getter itself, and a probe that only guards setItem crashes at boot,
 * before a single texture is drawn.
 */
export function detectBackend(): StorageBackend {
  try {
    const store = globalThis.localStorage;
    if (!store) return memoryBackend();
    const probe = `${KEY_PREFIX}probe`;
    store.setItem(probe, '1');
    store.removeItem(probe);
    return localBackend(store);
  } catch {
    return memoryBackend();
  }
}
