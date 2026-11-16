/**
 * Low-level localStorage adapter. Only repositories use this; the UI never touches storage.
 * Safe on the server (returns empty / no-ops) since localStorage only exists in the browser.
 */
const PREFIX = "pattyone:v1:";

export function readCollection<T>(name: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PREFIX + name);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function writeCollection<T>(name: string, items: T[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PREFIX + name, JSON.stringify(items));
}
