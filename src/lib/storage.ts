/**
 * localStorage that never throws (private windows and blocked storage throw on
 * access). Only per-visitor conveniences are stored: theme, hints, progress.
 */
export function readFlag(key: string): string | null {
  try {
    return localStorage.getItem(`mlp:${key}`);
  } catch {
    return null;
  }
}

export function writeFlag(key: string, value: string): void {
  try {
    localStorage.setItem(`mlp:${key}`, value);
  } catch {
    // Storage unavailable: the page still works, it just won't remember.
  }
}
