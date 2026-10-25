/** Per-device mute flag. Read only inside effects / useSyncExternalStore — never during SSR render paths that hit localStorage unsafely. */

export const MUTE_STORAGE_KEY = "shoreline-audio-muted";
export const MUTE_EVENT = "shoreline-audio-mute";

export function readMuted(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeMuted(muted: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(MUTE_STORAGE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
  try {
    window.dispatchEvent(new Event(MUTE_EVENT));
  } catch {
    /* ignore */
  }
}

export function subscribeMuted(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (e: StorageEvent) => {
    if (e.key === MUTE_STORAGE_KEY || e.key === null) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(MUTE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(MUTE_EVENT, onStoreChange);
  };
}
