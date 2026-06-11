// Shared persistence for the small per-install collections we keep in
// chrome.storage.local (prompt templates, site profiles, scheduled tasks).
// Each was an identical load/save/new-id triplet; this is the one copy.

/** A stable id with a short type prefix, e.g. "sp-<uuid>". */
export const makeId = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;

/** Read an array stored under `key`, tolerating a missing/!array value. */
export async function loadCollection<T>(key: string): Promise<T[]> {
  const res = await chrome.storage.local.get(key);
  const stored = res[key] as T[] | undefined;
  return Array.isArray(stored) ? stored : [];
}

/** Persist an array under `key`. */
export async function saveCollection<T>(key: string, items: T[]): Promise<void> {
  await chrome.storage.local.set({ [key]: items });
}
