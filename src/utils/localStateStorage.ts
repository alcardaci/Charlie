import type { StateStorage } from 'zustand/middleware';

export const TERMINAL_STORAGE_KEY = 'charlie-v1';
const LEGACY_TERMINAL_STORAGE_KEYS = ['bterminal-v1'] as const;
const LOCAL_STATE_API_PREFIX = '/api/local-state/';
const LOCAL_STATE_BOOTSTRAP_TIMEOUT_MS = 5000;
const LOCAL_STATE_LOG_THROTTLE_MS = 30_000;

let lastLocalStateWarningAt = 0;

function localStateUrl(name: string): string {
  return `${LOCAL_STATE_API_PREFIX}${encodeURIComponent(name)}`;
}

function isValidPersistedTerminalState(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as { state?: unknown } | null;
    return parsed !== null && typeof parsed === 'object' && 'state' in parsed;
  } catch {
    return false;
  }
}

function clearInvalidBrowserState(name: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(name);
  void removeStateFromDisk(name);
}

function maybeWarnLocalStatePersistence(action: 'write' | 'delete', name: string, error: unknown): void {
  const now = Date.now();
  if (now - lastLocalStateWarningAt < LOCAL_STATE_LOG_THROTTLE_MS) return;
  lastLocalStateWarningAt = now;

  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[local-state] unable to ${action} persisted state for "${name}": ${message}`);
}

async function mirrorStateToDisk(name: string, value: string): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    await fetch(localStateUrl(name), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
  } catch (error) {
    // Keep localStorage as the primary online cache if the local file endpoint is unavailable.
    maybeWarnLocalStatePersistence('write', name, error);
  }
}

async function removeStateFromDisk(name: string): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    await fetch(localStateUrl(name), {
      method: 'DELETE',
    });
  } catch (error) {
    // No-op: localStorage has already been cleared.
    maybeWarnLocalStatePersistence('delete', name, error);
  }
}

export const terminalStateStorage: StateStorage = {
  getItem: (name) => {
    if (typeof window === 'undefined') return null;
    const current = window.localStorage.getItem(name);
    if (current != null) {
      if (isValidPersistedTerminalState(current)) return current;
      clearInvalidBrowserState(name);
    }

    for (const legacyKey of LEGACY_TERMINAL_STORAGE_KEYS) {
      const legacy = window.localStorage.getItem(legacyKey);
      if (legacy != null) {
        if (!isValidPersistedTerminalState(legacy)) {
          clearInvalidBrowserState(legacyKey);
          continue;
        }
        window.localStorage.setItem(name, legacy);
        void mirrorStateToDisk(name, legacy);
        return legacy;
      }
    }

    return null;
  },
  setItem: (name, value) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(name, value);
    void mirrorStateToDisk(name, value);
  },
  removeItem: (name) => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(name);
    void removeStateFromDisk(name);
  },
};

export async function hydrateLocalStateCache(name = TERMINAL_STORAGE_KEY): Promise<void> {
  if (typeof window === 'undefined') return;

  for (const candidate of [name, ...LEGACY_TERMINAL_STORAGE_KEYS]) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), LOCAL_STATE_BOOTSTRAP_TIMEOUT_MS);

    try {
      const response = await fetch(localStateUrl(candidate), {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) continue;

      const payload = (await response.json()) as { value?: string | null };
      if (typeof payload.value === 'string' && payload.value.length > 0) {
        if (!isValidPersistedTerminalState(payload.value)) {
          await removeStateFromDisk(candidate);
          if (candidate === name) {
            window.localStorage.removeItem(name);
          }
          continue;
        }

        window.localStorage.setItem(name, payload.value);
        if (candidate !== name) {
          void mirrorStateToDisk(name, payload.value);
        }
        return;
      }
    } catch {
      // Try the next candidate key before falling back to local browser storage.
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
}
