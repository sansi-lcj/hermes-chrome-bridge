import { connectionOf, loadAccounts } from './accounts';
import type { Settings } from './types';

/**
 * The connection the rest of the app should use right now: the active account's
 * base URL / key / model. Account-agnostic callers (background, HermesClient)
 * use this and never need to know about multi-account.
 */
export async function getSettings(): Promise<Settings> {
  return connectionOf(await loadAccounts());
}
